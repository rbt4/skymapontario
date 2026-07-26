/* SkyMap Ontario service worker.
   Shell only. Weather never comes from cache — a stale radar frame is worse
   than no radar frame, so every live source goes straight to the network. */

const VERSION = '16.0.0';
const SHELL = `skymap-shell-${VERSION}`;

const SHELL_FILES = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'icon.svg',
  'manifest.webmanifest',
  'vendor/leaflet.css',
  'vendor/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== SHELL).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Anything off-origin (tiles, GeoMet, Open-Meteo) is left entirely alone.
  if (url.origin !== self.location.origin) return;
  // The release marker must always be truthful.
  if (url.pathname.endsWith('version.json')) return;
  // The native GeoMet relay shares this origin inside the Android app.
  if (url.pathname.includes('geomet-proxy')) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(SHELL).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      // Serve the cached shell instantly, then quietly refresh it for next launch.
      return cached || network;
    })
  );
});
