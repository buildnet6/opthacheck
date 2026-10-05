// OphthaCheck service worker - offline-first shell (Bible §14).
// Pages: network first, fall back to cache. Assets: cache first, refreshed in the background.
const CACHE = 'ophthacheck-v0.7.1';
const ASSETS = ['./', './index.html', './evaluate.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/schema.js', './js/extract.js', './js/checks.js', './js/sbar.js', './js/store.js', './js/voice.js', './js/output.js', './js/evaluate.js',
  './tests/cases.js', './tests/heldout.js', './vendor/jspdf.umd.min.js', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
// On activation: drop old caches, take control, and reload any open window that was still running an
// older version (v0.6 pages could not open after login, so they must not linger on nurses' phones).
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  const old = keys.filter(x => x !== CACHE);
  await Promise.all(old.map(x => caches.delete(x)));
  await self.clients.claim();
  if (old.length) for (const c of await self.clients.matchAll({ type: 'window' })) { try { c.navigate(c.url); } catch {} }
})()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); return r; })
      .catch(() => caches.match(req).then(x => x || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
