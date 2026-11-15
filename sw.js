// IFFI Diary offline support: app page network-first (falls back to saved copy), Firebase scripts cached.
const C = 'iffi-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const c = res.clone(); caches.open(C).then(x => x.put(req, c)); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(r, { ignoreSearch: true }).then(c => c || caches.match('./', { ignoreSearch: true }));
      const t = setTimeout(() => fallback().then(c => { if (c && !done) { done = true; resolve(c); } }), 4000);
      fetch(r).then(res => { clearTimeout(t); put(r, res); if (!done) { done = true; resolve(res); } })
        .catch(() => { clearTimeout(t); fallback().then(c => { if (!done) { done = true; resolve(c || Response.error()); } }); });
    }));
  } else if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(r).then(c => c || fetch(r).then(res => put(r, res))));
  }
});
