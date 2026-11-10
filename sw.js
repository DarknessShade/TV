const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const SHELL_URLS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_URLS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const networkFirst = async (req, cacheName) => {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
  }
};

const staleWhileRevalidate = async (req, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || (await fresh) || Response.error();
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // page navigations: network first, offline fallback
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, SHELL));

  // our own static files
  if (url.origin === location.origin) return e.respondWith(staleWhileRevalidate(req, SHELL));

  // big iptv-org catalogue: instant from cache, refreshed in background
  if (url.hostname === 'iptv-org.github.io') return e.respondWith(staleWhileRevalidate(req, DATA));

  // Iranian channel list: always try fresh first (servers change often)
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/FaTv/')) return e.respondWith(networkFirst(req, DATA));

  // everything else (video streams, images, CDNs) goes straight to the network
});
