// Retirement worker. Earlier OphthaCheck versions may have installed an offline worker under this file name.
// When a phone checks for an update it fetches this file, which removes the old offline copy and reloads the
// page so the current app (served with sw.js) takes over. Saved records are not touched.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (!k.startsWith('ophthacheck-v0.7')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) { try { c.navigate(c.url); } catch {} }
})()));
