(() => {
  'use strict';

  // SkyMap's weather frames are large transient PNG blobs. The main app
  // normally revokes them when a Leaflet overlay is replaced, but a request
  // that finishes after the user has already selected another frame never
  // reaches that cleanup path. Keep a short, conservative safety lease on
  // every object URL so stale frames cannot accumulate until the tab dies.
  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const objectUrlTimers = new Map();
  const OBJECT_URL_LEASE_MS = 12_000;

  URL.createObjectURL = blob => {
    const url = nativeCreateObjectURL(blob);
    const timer = setTimeout(() => {
      objectUrlTimers.delete(url);
      try { nativeRevokeObjectURL(url); } catch (_) { }
    }, OBJECT_URL_LEASE_MS);
    objectUrlTimers.set(url, timer);
    return url;
  };

  URL.revokeObjectURL = url => {
    const timer = objectUrlTimers.get(url);
    if (timer) clearTimeout(timer);
    objectUrlTimers.delete(url);
    try { nativeRevokeObjectURL(url); } catch (_) { }
  };

  // Track GeoMet request generations. Storm context layers used to be able to
  // finish out of order: an old lightning request could arrive after a newer
  // one and become an unreachable Leaflet layer. Tag response blobs with the
  // request generation so the map can reject late context overlays.
  const nativeFetch = window.fetch.bind(window);
  const responseMeta = new WeakMap();
  const blobMeta = new WeakMap();
  const objectUrlMeta = new Map();
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

  function requestGroup(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return null;
      const url = new URL(raw, location.href);
      const geoMet = url.hostname === 'geo.weather.gc.ca'
        || (url.hostname === 'appassets.androidplatform.net' && url.pathname.includes('geomet-proxy'));
      if (!geoMet || String(url.searchParams.get('REQUEST') || '').toLowerCase() !== 'getmap') return null;
      const layer = url.searchParams.get('LAYERS') || '';
      if (CONTEXT_LAYERS.has(layer)) return 'context';
      if (MAIN_LAYERS.has(layer)) return 'main';
    } catch (_) { }
    return null;
  }

  window.fetch = async (input, init) => {
    const group = requestGroup(input);
    if (!group) return nativeFetch(input, init);
    const requestGeneration = ++generation;
    latestGeneration.set(group, requestGeneration);
    const response = await nativeFetch(input, init);
    responseMeta.set(response, { group, generation: requestGeneration });
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

  // Extend the object-URL wrapper with request provenance.
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

      const meta = objectUrlMeta.get(layer._url);
      if (meta?.group === 'context' && meta.generation !== latestGeneration.get('context')) {
        // Do not let a late lightning/storm image displace the current one.
        if (typeof layer._url === 'string' && layer._url.startsWith('blob:')) URL.revokeObjectURL(layer._url);
        return this;
      }

      if (this._skyContextLayer && this._skyContextLayer !== layer && this.hasLayer(this._skyContextLayer)) {
        try { nativeRemoveLayer.call(this, this._skyContextLayer); } catch (_) { }
        const previousUrl = this._skyContextLayer._skyObjectUrl || this._skyContextLayer._url;
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
  // integrated GPUs and mobile browsers. Opaque glass keeps the visual system
  // while removing the repeated off-screen blur passes.
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
  }, { once: true });
})();
