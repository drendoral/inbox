/**
 * Phrase Inbox — Google Apps Script backend.
 *
 * Paste this into the Apps Script editor of the doc "daily in doc 001"
 * (Extensions > Apps Script), then run `setup` once. See SETUP.md.
 *
 * Every entry is ONE paragraph:
 *   <text> [<tag>] [<context or empty>] [YYYY-MM-DD HH:MM] ⟨<id>⟩
 */

var CONFIG = {
  DOC_NAME: 'daily in doc 001',
  FOLDER_NAME: 'daily in doc',
  ANKI_FOLDER_NAME: 'Anki',
  USED_FILE_PREFIX: 'inbox-used-',
  USED_FILE_SUFFIX: '.txt',
  LOG_SHEET_NAME: 'Phrase Inbox log',
  TIMEZONE: 'America/Vancouver',
  TAGS: ["Couldn't say", 'Overheard', 'Word for a thing', 'Work'],
  MAX_TEXT: 5000
};

// ---------------------------------------------------------------- setup

/** Run this ONCE from the editor. Creates the token and the hourly trigger. */
function setup() {
  var props = PropertiesService.getScriptProperties();

  // Remember which doc to write to (works because this script is bound to it).
  var active = DocumentApp.getActiveDocument();
  if (active) props.setProperty('DOC_ID', active.getId());
  var doc = getDoc_();

  var token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('TOKEN', token);
  }

  // Exactly one hourly cleanup trigger.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cleanupUsedEntries') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupUsedEntries').timeBased().everyHours(1).create();

  getAnkiFolder_(); // make sure the folder can be found

  Logger.log('Setup done. Writing to doc: "%s"', doc.getName());
  Logger.log('Hourly cleanup trigger: created.');
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
  var p = (e && e.parameter) || {};
  return handle_(p);
}

function doPost(e) {
  var body = {};
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
  var tag = oneLine_(req.tag) || CONFIG.TAGS[0];
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
    if (last && last.getType() === DocumentApp.ElementType.PARAGRAPH &&
        norm_(last.asParagraph().getText()) === '') {
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
    var removed = [];
    findParagraphsWithId_(body, id).forEach(function (p) {
      removed.push(p.getText());
      removeParagraph_(body, p);
    });
    if (removed.length) logDeletions_('app delete', removed);
    return { ok: true, removed: removed.length };
  });
}

function countEntries_() {
  var paras = getDoc_().getBody().getParagraphs();
  var count = 0;
  for (var i = 0; i < paras.length; i++) if (norm_(paras[i].getText())) count++;
  return count;
}

// ---------------------------------------------------------------- cleanup

/**
 * Hourly trigger. Reads "daily in doc/Anki/inbox-used-*.txt"; each line is
 * an entry id (with or without ⟨ ⟩) or, for old entries, the exact
 * paragraph text. Deletes only the listed paragraphs, then trashes the file.
 */
function cleanupUsedEntries() {
  var folder = getAnkiFolder_();
  var files = folder.getFiles();
  var report = { files: 0, removed: 0, unmatched: 0 };

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    if (name.indexOf(CONFIG.USED_FILE_PREFIX) !== 0 ||
        name.slice(-CONFIG.USED_FILE_SUFFIX.length).toLowerCase() !== CONFIG.USED_FILE_SUFFIX) continue;

    var lines = file.getBlob().getDataAsString('UTF-8').split(/\r?\n/);
    var result = withLock_(function () { return removeListed_(lines); });

    logDeletions_('cleanup ' + name, result.removed);
    if (result.unmatched.length) {
      logDeletions_('cleanup ' + name + ' (NOT FOUND, nothing deleted)', result.unmatched);
    }
    file.setTrashed(true);
    report.files++;
    report.removed += result.removed.length;
    report.unmatched += result.unmatched.length;
  }
  Logger.log('Cleanup: %s file(s), %s paragraph(s) removed, %s line(s) not found.',
             report.files, report.removed, report.unmatched);
  return report;
}

/** Core of the cleanup: deletes paragraphs matching the listed lines only. */
function removeListed_(lines) {
  var body = getDoc_().getBody();
  var removed = [], unmatched = [];
  lines.forEach(function (raw) {
    var line = norm_(raw);
    if (!line) return;
    // "abc123", "⟨abc123⟩" or a whole entry line ending in ⟨abc123⟩.
    var idMatch = line.match(/⟨\s*([^⟨⟩\s]+)\s*⟩$/);
    var id = idMatch ? idMatch[1] : line;

    var hits = findParagraphsWithId_(body, id);
    if (!hits.length && !idMatch) {
      // Older line without id: exact paragraph text (ignoring invisible
      // characters and surrounding spaces).
      hits = body.getParagraphs().filter(function (p) { return norm_(p.getText()) === line; });
    }
    if (!hits.length) { unmatched.push(line); return; }
    hits.forEach(function (p) {
      removed.push(p.getText());
      removeParagraph_(body, p);
    });
  });
  return { removed: removed, unmatched: unmatched };
}

// ---------------------------------------------------------------- self test

/**
 * End-to-end test you can run from the editor. It:
 *  1. adds a test entry via the same code the app uses,
 *  2. adds an old-style test line without id,
 *  3. writes an inbox-used-selftest-*.txt file listing both,
 *  4. runs the cleanup,
 *  5. checks exactly those two paragraphs are gone, everything else is
 *     unchanged and the file is in the trash.
 */
function selfTest() {
  var body = getDoc_().getBody();
  var before = body.getParagraphs().map(function (p) { return p.getText(); });
  var id = 'test' + Math.random().toString(36).slice(2, 8);
  var oldStyle = 'Phrase Inbox self-test old-style line ' + id;

  var add = addEntry_({ id: id, text: 'Phrase Inbox self-test', tag: 'Work', context: 'تست', ts: Date.now() });
  assert_(add.ok, 'add failed: ' + JSON.stringify(add));
  body.appendParagraph(oldStyle);
  assert_(findParagraphsWithId_(body, id).length === 1, 'test entry not found in doc');
  Logger.log('1) Test entry appended: %s', findParagraphsWithId_(body, id)[0].getText());

  var file = getAnkiFolder_().createFile(
      CONFIG.USED_FILE_PREFIX + 'selftest-' + id + CONFIG.USED_FILE_SUFFIX,
      id + '\n' + oldStyle + '\n', MimeType.PLAIN_TEXT);
  Logger.log('2) Created %s', file.getName());

  cleanupUsedEntries();

  var after = getDoc_().getBody().getParagraphs().map(function (p) { return p.getText(); });
  assert_(DriveApp.getFileById(file.getId()).isTrashed(), 'used file was not trashed');
  assert_(withoutTrailingEmpty_(after).join('\n') === withoutTrailingEmpty_(before).join('\n'),
          'document changed beyond the two test lines');
  Logger.log('3) PASS — cleanup removed exactly the two listed lines; nothing else changed; file trashed.');
}

function assert_(cond, msg) { if (!cond) throw new Error('SELF-TEST FAILED: ' + msg); }

// ---------------------------------------------------------------- helpers

var docCache_ = null;

function getDoc_() {
  if (!docCache_) docCache_ = openDoc_();
  return docCache_;
}

function openDoc_() {
  var id = PropertiesService.getScriptProperties().getProperty('DOC_ID');
  if (id) return DocumentApp.openById(id);
  var folders = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
  while (folders.hasNext()) {
    var files = folders.next().getFilesByName(CONFIG.DOC_NAME);
    if (files.hasNext()) {
      var docId = files.next().getId();
      PropertiesService.getScriptProperties().setProperty('DOC_ID', docId);
      return DocumentApp.openById(docId);
    }
  }
  throw new Error('Doc "' + CONFIG.DOC_NAME + '" not found. Run setup() from the doc\'s Apps Script editor.');
}

function getMainFolder_() {
  var folders = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
  if (!folders.hasNext()) throw new Error('Folder "' + CONFIG.FOLDER_NAME + '" not found in Drive.');
  return folders.next();
}

function getAnkiFolder_() {
  var main = getMainFolder_();
  var sub = main.getFoldersByName(CONFIG.ANKI_FOLDER_NAME);
  return sub.hasNext() ? sub.next() : main.createFolder(CONFIG.ANKI_FOLDER_NAME);
}

function findParagraphsWithId_(body, id) {
  var marker = '⟨' + id + '⟩';
  return body.getParagraphs().filter(function (p) { return p.getText().indexOf(marker) !== -1; });
}

function removeParagraph_(body, para) {
  // Google Docs refuses to remove the last paragraph of the body, so leave
  // an empty one behind (the next entry will reuse it).
  if (body.getChildIndex(para) === body.getNumChildren() - 1) body.appendParagraph('');
  para.removeFromParent();
}

function withoutTrailingEmpty_(texts) {
  var out = texts.slice();
  while (out.length && norm_(out[out.length - 1]) === '') out.pop();
  return out;
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

/** Appends rows to the "Phrase Inbox log" sheet in the "daily in doc" folder. */
function logDeletions_(source, texts) {
  if (!texts || !texts.length) return;
  texts.forEach(function (t) { Logger.log('[%s] deleted: %s', source, t); });
  try {
    var props = PropertiesService.getScriptProperties();
    var ss = null, id = props.getProperty('LOG_SHEET_ID');
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
    if (!ss) {
      ss = SpreadsheetApp.create(CONFIG.LOG_SHEET_NAME);
      ss.getSheets()[0].appendRow(['When', 'Source', 'Text']);
      DriveApp.getFileById(ss.getId()).moveTo(getMainFolder_());
      props.setProperty('LOG_SHEET_ID', ss.getId());
    }
    var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var sheet = ss.getSheets()[0];
    texts.forEach(function (t) { sheet.appendRow([now, source, t]); });
  } catch (err) {
    console.error('Log sheet failed: ' + err);
  }
}
