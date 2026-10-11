/**
 * Inbox — Google Apps Script backend.
 *
 * Paste this into the Apps Script editor of the doc "daily in doc 001"
 * (Extensions > Apps Script), then run `setup` once. See SETUP.md.
 *
 * It does only three things for the app:
 *   add    — append ONE paragraph:  <text> [<tag>] [<context>] [YYYY-MM-DD HH:MM] ⟨<id>⟩
 *   delete — remove the paragraph with that ⟨id⟩ (when you delete it in the app)
 *   count  — how many non-empty lines are in the doc (shown in the app's ☰ menu)
 */

var CONFIG = {
  TIMEZONE: 'America/Vancouver',
  DEFAULT_TAG: "Couldn't say",
  MAX_TEXT: 5000
};

// ---------------------------------------------------------------- setup

/** Run this ONCE from the editor. Remembers the doc and creates your token. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('DOC_ID', DocumentApp.getActiveDocument().getId());

  var token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('TOKEN', token);
  }

  Logger.log('Setup done. Writing to doc: "%s"', getDoc_().getName());
  Logger.log('YOUR TOKEN (copy this into the app):  %s', token);
}

/** Run if you ever need to see the token again. */
function showToken() {
  Logger.log('YOUR TOKEN:  %s', PropertiesService.getScriptProperties().getProperty('TOKEN'));
}

/** Run if you think the token leaked. You must then update it in the app. */
function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  setup();
}

// ---------------------------------------------------------------- web app

function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  return handle_(body);
}

function handle_(req) {
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || !req || String(req.token || '') !== token) {
    return json_({ ok: false, error: 'unauthorized' });
  }
  try {
    switch (req.action) {
      case 'count':  return json_({ ok: true, count: countEntries_() });
      case 'add':    return json_(addEntry_(req));
      case 'delete': return json_(deleteById_(req.id));
      case 'ping':   return json_({ ok: true, doc: getDoc_().getName() });
      default:       return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- entries

function addEntry_(req) {
  var id = cleanId_(req.id);
  if (!id) return { ok: false, error: 'missing_id' };
  var text = oneLine_(req.text).slice(0, CONFIG.MAX_TEXT);
  if (!text) return { ok: false, error: 'empty_text' };
  var tag = oneLine_(req.tag) || CONFIG.DEFAULT_TAG;
  var context = oneLine_(req.context);
  var when = req.ts ? new Date(Number(req.ts)) : new Date();
  if (isNaN(when.getTime())) when = new Date();
  var stamp = Utilities.formatDate(when, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');

  var line = text + ' [' + tag + '] [' + context + '] [' + stamp + '] ⟨' + id + '⟩';

  return withLock_(function () {
    var body = getDoc_().getBody();
    // Idempotent: the app may retry after a lost response.
    if (findParagraphsWithId_(body, id).length) return { ok: true, id: id, duplicate: true };

    var n = body.getNumChildren();
    var last = n ? body.getChild(n - 1) : null;
    var para;
    if (last && last.getType() === DocumentApp.ElementType.PARAGRAPH && isBlank_(last.asParagraph())) {
      para = last.asParagraph().setText(line); // reuse the empty last line
    } else {
      para = body.appendParagraph(line);
    }
    para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    return { ok: true, id: id };
  });
}

function deleteById_(rawId) {
  var id = cleanId_(rawId);
  if (!id) return { ok: false, error: 'missing_id' };
  return withLock_(function () {
    var body = getDoc_().getBody();
    var hits = findParagraphsWithId_(body, id);
    hits.forEach(function (p) {
      // Google Docs refuses to remove the last paragraph, so leave an empty one.
      if (body.getChildIndex(p) === body.getNumChildren() - 1) body.appendParagraph('');
      p.removeFromParent();
    });
    return { ok: true, removed: hits.length };
  });
}

function countEntries_() {
  var paras = getDoc_().getBody().getParagraphs();
  var count = 0;
  for (var i = 0; i < paras.length; i++) if (norm_(paras[i].getText())) count++;
  return count;
}

// ---------------------------------------------------------------- helpers

var docCache_ = null;

function getDoc_() {
  if (!docCache_) {
    var id = PropertiesService.getScriptProperties().getProperty('DOC_ID');
    if (!id) throw new Error('Run setup() once from the doc\'s Apps Script editor.');
    docCache_ = DocumentApp.openById(id);
  }
  return docCache_;
}

function findParagraphsWithId_(body, id) {
  var marker = '⟨' + id + '⟩';
  return body.getParagraphs().filter(function (p) { return p.getText().indexOf(marker) !== -1; });
}

/** True for a paragraph with no visible text and nothing else in it (no image, drawing…). */
function isBlank_(p) {
  if (norm_(p.getText()) !== '') return false;
  for (var i = 0; i < p.getNumChildren(); i++) {
    if (p.getChild(i).getType() !== DocumentApp.ElementType.TEXT) return false;
  }
  return true;
}

/** Strip invisible characters, collapse spaces, trim. */
function norm_(s) {
  return String(s == null ? '' : s)
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[\s ]+/g, ' ')
    .trim();
}

function oneLine_(s) { return norm_(String(s == null ? '' : s).replace(/[\r\n]+/g, ' ')); }

function cleanId_(s) {
  var id = String(s == null ? '' : s).replace(/[⟨⟩\s]/g, '');
  return /^[A-Za-z0-9_-]{4,40}$/.test(id) ? id : '';
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}
