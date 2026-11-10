// morethere service worker: fast, resilient app shell.
// Only same-origin static files are cached. Supabase (data, auth, photos) and
// /api/* are never cached, so private content never sits in this cache.
const VERSION = 'mt-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'mt-share').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Something shared to morethere from another app (Android share sheet).
  // The photo, if any, waits in a private cache until the app picks it up.
  if (req.method === 'POST' && url.pathname === '/share-target') {
    e.respondWith((async () => {
      const form = await req.formData();
      const params = new URLSearchParams({ share: '1' });
      for (const k of ['title', 'text', 'url']) { const v = form.get(k); if (v) params.set(k, String(v).slice(0, 2000)); }
      const file = form.get('media');
      if (file && typeof file === 'object' && file.size) {
        const cache = await caches.open('mt-share');
        await cache.put('/__shared-media', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
        params.set('media', '1');
      }
      return Response.redirect('/?' + params.toString(), 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: network first, cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put('/', copy));
      return res;
    }).catch(() => caches.match('/')));
    return;
  }
  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
