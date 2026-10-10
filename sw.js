/* Phrase Inbox — service worker: offline app shell + background sync. */
importScripts('core.js');

var CACHE = 'phrase-inbox-v3';
var FONT_CACHE = 'phrase-inbox-fonts';
var SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'core.js', 'tagger.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== FONT_CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Google Fonts: cache first, so the font also works offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    ev.respondWith(caches.open(FONT_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        });
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return; // never touch Apps Script calls

  // Network first (so updates arrive), cache as fallback when offline.
  // Navigations (including share-target URLs with ?text=) fall back to index.html.
  ev.respondWith(
    fetch(req).then(function (res) {
      if (res.ok && url.search === '') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
      });
    })
  );
});

self.addEventListener('sync', function (ev) {
  if (ev.tag !== 'phrase-sync') return;
  ev.waitUntil(PI.flush().then(notifyClients));
});

function notifyClients() {
  return self.clients.matchAll().then(function (list) {
    list.forEach(function (c) { c.postMessage('synced'); });
  });
}
