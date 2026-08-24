const CACHE_NAME = 'grounded-messaging-v6';
const OFFLINE_URL = './index.html';
const STATIC_ASSETS = [
  './',
  OFFLINE_URL,
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    // One asset 404ing used to abort the whole install and leave no cache at
    // all, which is why the offline fallback could never hit.
    caches.open(CACHE_NAME).then(cache => Promise.all(
      STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTML: network first, so an update ships immediately, but keep a copy so
  // there is something to serve when the network is gone.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(OFFLINE_URL, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request).then(hit => hit || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
