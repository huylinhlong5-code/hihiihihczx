/* Pulse 24 service worker — offline app shell + runtime caching.
   Reads only; stores nothing about the user. */
var VERSION = 'pulse24-v3';
var SHELL = ['./', 'index.html', 'assets/styles.css', 'assets/app.js', 'manifest.json',
             'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== VERSION) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Images: cache-first (fast, offline-friendly).
  if (req.destination === 'image') {
    e.respondWith(caches.open(VERSION + '-img').then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
      });
    }));
    return;
  }
  // Same-origin app shell: cache-first.
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
    return;
  }
  // Feeds / cross-origin: network-first, fall back to cache.
  e.respondWith(fetch(req).then(function (res) {
    var copy = res.clone();
    caches.open(VERSION + '-net').then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () { return caches.match(req); }));
});
