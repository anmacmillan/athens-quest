// Network-first with cache fallback; core files are precached so the game works offline in Athens.
const CACHE = 'owlq-cache';
const CORE = 'precache.json';
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    let list = [];
    try { const r = await fetch(CORE, { cache: 'no-store' }); const j = await r.json(); list = j.files; } catch (err) { }
    const c = await caches.open(CACHE);
    await Promise.all(list.map(f => c.add(f).catch(() => { })));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => { await self.clients.claim(); })());
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;     // Firebase etc. go straight to the network
  e.respondWith((async () => {
    try { const r = await fetch(e.request); if (r.ok) { const c = await caches.open(CACHE); c.put(e.request, r.clone()); } return r; }
    catch (err) { const m = await caches.match(e.request, { ignoreSearch: true }); if (m) return m; throw err; }
  })());
});
