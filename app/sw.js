/* SkyMap Ontario service worker.
   Shell only. Weather never comes from cache — a stale radar frame is worse
   than no radar frame, so every live source goes straight to the network. */

const VERSION = '18.0.1';
const SHELL = `skymap-shell-${VERSION}`;

const SHELL_FILES = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'icon.svg',
  'manifest.webmanifest',
  'vendor/gifenc.esm.js',
  'vendor/leaflet.css',
  'vendor/leaflet.js'
];

async function cacheFreshShell(cache) {
  await Promise.all(SHELL_FILES.map(async file => {
    const separator = file.includes('?') ? '&' : '?';
    const response = await fetch(`${file}${separator}release=${VERSION}`, { cache: 'reload' });
    if (!response.ok) throw new Error(`Shell ${file}: HTTP ${response.status}`);
    await cache.put(file, response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cacheFreshShell)
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(async keys => {
        const stale = keys.filter(key => key.startsWith('skymap-shell-') && key !== SHELL);
        await Promise.all(stale.map(key => caches.delete(key)));
        await self.clients.claim();
        if (!stale.length) return;
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        await Promise.all(windows.map(client => client.navigate(client.url).catch(() => null)));
      })
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
        .catch(error => {
          if (cached) return cached;
          throw error;
        });
      // Online launches use one coherent release instead of briefly mixing an
      // old cached shell with a new version receipt. The cache remains the
      // complete offline fallback.
      return network;
    })
  );
});
