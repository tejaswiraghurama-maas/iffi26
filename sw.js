// Festival Diaries offline + speed:
//  • files with a version (app.js?v=…, data.js?v=…) and posters never change → served from the phone instantly
//  • pages: try the network for 1.5 s, otherwise show the saved copy (works offline)
//  • Google sign-in code: saved after first use
const C = 'fd-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const c = res.clone(); caches.open(C).then(x => x.put(req, c)); } return res; };
const cacheFirst = r => caches.match(r).then(c => c || fetch(r).then(res => put(r, res)));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (u.searchParams.has('v') || u.pathname.includes('/posters/')) { e.respondWith(cacheFirst(r)); return; }
    e.respondWith(new Promise(resolve => {
      let done = false;
      const saved = () => caches.match(r, { ignoreSearch: true }).then(c => c || caches.match(new URL('./', self.registration.scope).href));
      const t = setTimeout(() => saved().then(c => { if (c && !done) { done = true; resolve(c); } }), 1500);
      fetch(r).then(res => { clearTimeout(t); put(r, res); if (!done) { done = true; resolve(res); } })
        .catch(() => { clearTimeout(t); saved().then(c => { if (!done) { done = true; resolve(c || Response.error()); } }); });
    }));
  } else if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) {
    e.respondWith(cacheFirst(r));
  }
});
