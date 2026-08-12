(() => {
  'use strict';

  // SkyMap's weather frames are large transient PNG blobs. The main app
  // normally revokes them when a Leaflet overlay is replaced, but a request
  // that finishes after the user has already selected another frame never
  // reaches that cleanup path. Keep a short safety lease on every object URL
  // so stale frames cannot accumulate until the tab dies.
  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const objectUrlTimers = new Map();
  const objectUrlMeta = new Map();
  const OBJECT_URL_LEASE_MS = 12_000;

  // Track GeoMet request generations. Storm context layers used to be able to
  // finish out of order: an old lightning request could arrive after a newer
  // one and become an unreachable Leaflet layer. Tag response blobs and direct
  // fallback URLs with request generation so the map can reject late context.
  const nativeFetch = window.fetch.bind(window);
  const responseMeta = new WeakMap();
  const blobMeta = new WeakMap();
  const requestUrlMeta = new Map();
  const latestGeneration = new Map();
  let generation = 0;

  const MAIN_LAYERS = new Set([
    'RADAR_1KM_RRAI',
    'Radar_1km_RainPrecipRate-Extrapolation',
    'HRDPS.CONTINENTAL.DIAG_PR_PT1H',
    'RAQDPS.Sfc_PM2.5-WildfireSmokePlume',
    'AQHI-OBS',
    'HRDPS.CONTINENTAL_TT'
  ]);
  const CONTEXT_LAYERS = new Set([
    'Lightning_2.5km_Density',
    'HRDPS-WEonG_2.5km_Thunderstorm-Prob'
  ]);

  function requestInfo(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return null;
      const url = new URL(raw, location.href);
      const geoMet = url.hostname === 'geo.weather.gc.ca'
        || (url.hostname === 'appassets.androidplatform.net' && url.pathname.includes('geomet-proxy'));
      if (!geoMet || String(url.searchParams.get('REQUEST') || '').toLowerCase() !== 'getmap') return null;
      const layer = url.searchParams.get('LAYERS') || '';
      const group = CONTEXT_LAYERS.has(layer) ? 'context' : MAIN_LAYERS.has(layer) ? 'main' : null;
      return group ? { group, href: url.href } : null;
    } catch (_) {
      return null;
    }
  }

  function rememberRequestUrl(href, meta) {
    requestUrlMeta.set(href, meta);
    while (requestUrlMeta.size > 80) requestUrlMeta.delete(requestUrlMeta.keys().next().value);
  }

  window.fetch = async (input, init) => {
    const info = requestInfo(input);
    if (!info) return nativeFetch(input, init);
    const requestGeneration = ++generation;
    const meta = { group: info.group, generation: requestGeneration };
    latestGeneration.set(info.group, requestGeneration);
    rememberRequestUrl(info.href, meta);
    const response = await nativeFetch(input, init);
    responseMeta.set(response, meta);
    return response;
  };

  const nativeResponseBlob = Response.prototype.blob;
  Response.prototype.blob = function (...args) {
    const meta = responseMeta.get(this);
    return nativeResponseBlob.apply(this, args).then(blob => {
      if (meta) blobMeta.set(blob, meta);
      return blob;
    });
  };

  URL.createObjectURL = blob => {
    const url = nativeCreateObjectURL(blob);
    const meta = blobMeta.get(blob);
    if (meta) objectUrlMeta.set(url, meta);
    const timer = setTimeout(() => {
      objectUrlTimers.delete(url);
      objectUrlMeta.delete(url);
      try { nativeRevokeObjectURL(url); } catch (_) { }
    }, OBJECT_URL_LEASE_MS);
    objectUrlTimers.set(url, timer);
    return url;
  };

  URL.revokeObjectURL = url => {
    const timer = objectUrlTimers.get(url);
    if (timer) clearTimeout(timer);
    objectUrlTimers.delete(url);
    objectUrlMeta.delete(url);
    try { nativeRevokeObjectURL(url); } catch (_) { }
  };

  if (window.L?.Map && window.L?.ImageOverlay) {
    const nativeAddLayer = L.Map.prototype.addLayer;
    const nativeRemoveLayer = L.Map.prototype.removeLayer;

    L.Map.prototype.addLayer = function (layer) {
      const isContext = layer instanceof L.ImageOverlay && layer.options?.pane === 'contextPane';
      if (!isContext) return nativeAddLayer.call(this, layer);

      let meta = objectUrlMeta.get(layer._url);
      if (!meta && typeof layer._url === 'string') {
        try { meta = requestUrlMeta.get(new URL(layer._url, location.href).href); } catch (_) { }
      }
      if (meta?.group === 'context' && meta.generation !== latestGeneration.get('context')) {
        // Do not let a late lightning/storm image displace the current one.
        if (typeof layer._url === 'string' && layer._url.startsWith('blob:')) URL.revokeObjectURL(layer._url);
        return this;
      }

      if (this._skyContextLayer && this._skyContextLayer !== layer && this.hasLayer(this._skyContextLayer)) {
        const previous = this._skyContextLayer;
        try { nativeRemoveLayer.call(this, previous); } catch (_) { }
        const previousUrl = previous._skyObjectUrl || previous._url;
        if (typeof previousUrl === 'string' && previousUrl.startsWith('blob:')) URL.revokeObjectURL(previousUrl);
      }
      this._skyContextLayer = layer;
      return nativeAddLayer.call(this, layer);
    };

    L.Map.prototype.removeLayer = function (layer) {
      if (this._skyContextLayer === layer) this._skyContextLayer = null;
      return nativeRemoveLayer.call(this, layer);
    };
  }

  // The original look stacked many live backdrop blurs over a moving Leaflet
  // map. They are visually subtle but expensive to composite, especially on
  // integrated GPUs and mobile browsers. Opaque glass keeps the hierarchy
  // while removing repeated off-screen blur passes.
  const style = document.createElement('style');
  style.dataset.skymapStability = 'true';
  style.textContent = `
    .topbar,
    .alert-banner,
    .map-mode-rail,
    .radar-state,
    .map-actions button,
    .story-facts,
    .timeflow,
    .leaflet-control-attribution,
    .backdrop {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    .map-grain { display: none !important; }
    .forecast-stack > .section-block {
      content-visibility: auto;
      contain-intrinsic-size: 420px;
    }
  `;
  document.head.append(style);

  addEventListener('pagehide', () => {
    for (const [url, timer] of objectUrlTimers) {
      clearTimeout(timer);
      try { nativeRevokeObjectURL(url); } catch (_) { }
    }
    objectUrlTimers.clear();
    objectUrlMeta.clear();
    requestUrlMeta.clear();
  }, { once: true });
})();
