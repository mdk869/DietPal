// DietPal – service worker
const CACHE = 'dietpal-v21';
const SHELL = [
  './',
  './index.html',
  './app.css',
  './foods.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co')) return;   // reminders API: never cache

  // Only keep good responses (opaque = cross-origin CDN without CORS, can't be checked)
  const keep = (res) => res && (res.ok || res.type === 'opaque');
  const put = (key, res) => { if (keep(res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return res; };

  // Page navigations: network first, fall back to cached app shell (offline)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => put('./index.html', res)).catch(() => caches.match('./index.html')));
    return;
  }

  if (url.origin === self.location.origin) {
    // App code & styles: network first, so a new deploy is used straight away (cache = offline copy)
    if (/\.(js|css)$/.test(url.pathname)) {
      e.respondWith(fetch(req).then((res) => put(req, res)).catch(() => caches.match(req)));
      return;
    }
    // Icons, manifest: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }

  // CDN (Google Fonts): stale-while-revalidate so the app works offline after first load
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (keep(res)) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }))
  );
});


// ---------- Push reminders ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'DietPal', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || 'dietpal',
    lang: 'ms-MY',
    data: { url: new URL(d.url || './', self.registration.scope).href }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ type: 'open', url }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
