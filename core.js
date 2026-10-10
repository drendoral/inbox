/* Phrase Inbox — storage + sync. Shared by the page and the service worker. */
/* eslint-disable no-unused-vars */
var PI = (function () {
  var DB_NAME = 'phrase-inbox';
  var DB_VERSION = 1;
  var KEEP_SENT = 500; // how many sent entries to keep on the device
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('entries')) {
          db.createObjectStore('entries', { keyPath: 'id' }).createIndex('ts', 'ts');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var result;
        Promise.resolve(fn(t.objectStore(store))).then(function (r) { result = r; });
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function req2p(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  // ---- settings
  function getSettings() {
    return tx('settings', 'readonly', function (s) { return req2p(s.get('config')); })
      .then(function (c) { return c || { url: '', token: '' }; });
  }
  function saveSettings(c) {
    return tx('settings', 'readwrite', function (s) {
      s.put({ url: String(c.url || '').trim(), token: String(c.token || '').trim() }, 'config');
    });
  }

  // ---- entries  (status: 'waiting' | 'sending' | 'sent' | 'delete')
  function newId() {
    var a = 'abcdefghijkmnpqrstuvwxyz23456789', out = '';
    var bytes = crypto.getRandomValues(new Uint8Array(8));
    for (var i = 0; i < 8; i++) out += a[bytes[i] % a.length];
    return out;
  }
  function putEntry(e) { return tx('entries', 'readwrite', function (s) { s.put(e); }); }
  function getEntry(id) { return tx('entries', 'readonly', function (s) { return req2p(s.get(id)); }); }
  function removeEntry(id) { return tx('entries', 'readwrite', function (s) { s.delete(id); }); }
  function allEntries() {
    return tx('entries', 'readonly', function (s) { return req2p(s.getAll()); })
      .then(function (list) { return list.sort(function (a, b) { return b.ts - a.ts; }); });
  }
  function updateEntry(id, fn) {
    return tx('entries', 'readwrite', function (s) {
      return req2p(s.get(id)).then(function (e) {
        var next = e ? fn(e) : null;
        if (next) s.put(next);
        return next;
      });
    });
  }

  function addEntry(data) {
    var e = {
      id: newId(),
      text: data.text,
      tag: data.tag,
      context: data.context || '',
      ts: Date.now(),
      status: 'waiting'
    };
    return putEntry(e).then(function () { return e; });
  }

  /** Marks an entry for deletion; it is hidden and removed from the doc on next sync. */
  function deleteEntry(id) {
    return updateEntry(id, function (e) { e.status = 'delete'; return e; });
  }

  // ---- network
  function call(settings, payload) {
    if (!settings.url || !settings.token) return Promise.reject(new Error('not_configured'));
    payload.token = settings.token;
    // text/plain avoids a CORS preflight, which Apps Script cannot answer.
    return fetch(settings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      cache: 'no-store'
    }).then(function (r) {
      return r.text().then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (err) { throw new Error('bad_response'); }
        if (!j.ok) throw new Error(j.error || 'failed');
        return j;
      });
    });
  }

  var flushing = null;
  /** Sends every waiting entry and pending delete. Safe to call often. */
  function flush() {
    if (flushing) return flushing;
    flushing = doFlush().then(function (r) { flushing = null; return r; },
                              function (err) { flushing = null; throw err; });
    return flushing;
  }

  function doFlush() {
    return getSettings().then(function (settings) {
      if (!settings.url || !settings.token) return { sent: 0, pending: -1 };
      return allEntries().then(function (list) {
        var todo = list.filter(function (e) {
          return e.status === 'waiting' || e.status === 'sending' || e.status === 'delete';
        }).reverse(); // oldest first, so the doc stays in capture order
        var sent = 0, failed = null;

        return todo.reduce(function (p, e) {
          return p.then(function () {
            if (failed) return;
            if (e.status === 'delete') {
              return call(settings, { action: 'delete', id: e.id })
                .then(function () { sent++; return removeEntry(e.id); })
                .catch(function (err) { failed = err; });
            }
            return updateEntry(e.id, function (x) {
              if (x.status === 'delete') return null;
              x.status = 'sending'; return x;
            }).then(function (x) {
              if (!x) return;
              return call(settings, { action: 'add', id: e.id, text: e.text, tag: e.tag, context: e.context, ts: e.ts })
                .then(function () {
                  sent++;
                  // If it was deleted while in flight, keep 'delete' so the delete is sent next.
                  return updateEntry(e.id, function (y) {
                    if (y.status === 'delete') return null;
                    y.status = 'sent'; return y;
                  });
                }, function (err) {
                  failed = err;
                  return updateEntry(e.id, function (y) {
                    if (y.status !== 'sending') return null;
                    y.status = 'waiting'; return y;
                  });
                });
            });
          });
        }, Promise.resolve()).then(function () {
          return allEntries().then(function (after) {
            var pending = after.filter(function (e) { return e.status !== 'sent'; }).length;
            prune(after);
            if (failed) { var err = failed; err.sent = sent; throw err; }
            return { sent: sent, pending: pending };
          });
        });
      });
    });
  }

  function prune(list) {
    var sent = list.filter(function (e) { return e.status === 'sent'; });
    if (sent.length <= KEEP_SENT) return;
    sent.slice(KEEP_SENT).forEach(function (e) { removeEntry(e.id); });
  }

  function count() {
    return getSettings().then(function (s) { return call(s, { action: 'count' }); })
      .then(function (j) { return j.count; });
  }

  function ping(settings) { return call(settings, { action: 'ping' }); }

  return {
    getSettings: getSettings, saveSettings: saveSettings,
    addEntry: addEntry, deleteEntry: deleteEntry, allEntries: allEntries, getEntry: getEntry,
    flush: flush, count: count, ping: ping
  };
})();
