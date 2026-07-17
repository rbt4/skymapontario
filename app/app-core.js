  'use strict';

  const $ = id => document.getElementById(id);
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const EMBED = new URLSearchParams(location.search).get('embed') === '1';
  const IS_FILE = location.protocol === 'file:';
  if (EMBED) document.body.classList.add('embed');

  const DOM = {
    map: $('map'), loading: $('loading-screen'), loadingMessage: $('loading-message'), connection: $('connection-label'),
    placeButton: $('place-button'), placeLabel: $('place-label'), placeSheet: $('place-sheet'), placeGrid: $('place-grid'),
    infoSheet: $('info-sheet'), backdrop: $('sheet-backdrop'), menuButton: $('menu-button'), locateButton: $('locate-button'), shareButton: $('share-button'),
    modeKicker: $('mode-kicker'), modeTitle: $('mode-title'), mobileKicker: $('mobile-kicker'), mobileStory: $('mobile-story'),
    statusText: $('status-text'), statusDot: $('status-dot'), updatedTime: $('updated-time'), sheetStatusText: $('sheet-status-text'), sheetStatusDot: $('sheet-status-dot'), sheetUpdatedTime: $('sheet-updated-time'),
    legendCard: $('legend-card'), legendName: $('legend-name'), legendUnit: $('legend-unit'), legendBar: $('legend-bar'), legendLabels: $('legend-labels'),
    aqValue: $('aq-value'), aqRisk: $('aq-risk'), aqStation: $('aq-station'), sheetAqValue: $('sheet-aq-value'), sheetAqRisk: $('sheet-aq-risk'), sheetAqStation: $('sheet-aq-station'),
    alertsCard: $('alerts-card'), alertTotal: $('alert-total'), alertList: $('alert-list'), sheetAlertTotal: $('sheet-alert-total'), sheetAlertList: $('sheet-alert-list'), modeAlertCount: $('mode-alert-count'),
    sourceLink: $('source-link'), desktopInfo: $('desktop-info'), panelRestore: $('panel-restore'), mobileSummary: $('mobile-summary'), mobileSummaryButton: $('mobile-summary-button'),
    timeline: $('timeline-panel'), play: $('play-button'), slider: $('time-slider'), progress: $('range-progress'), nowMarker: $('now-marker'), relative: $('relative-time'), absolute: $('absolute-time'), rangeStart: $('range-start'), rangeEnd: $('range-end'), refresh: $('refresh-button'),
    install: $('install-button'), opacity: $('opacity-slider'), sheetModeCopy: $('sheet-mode-copy'),
    error: $('error-banner'), errorMessage: $('error-message'), errorRetry: $('error-retry'), toast: $('toast')
  };

  const CONFIG = {
    rain: {
      label: 'Rain', kicker: 'RAIN RADAR', title: 'What is moving across Ontario', story: 'Live rain radar across Ontario',
      url: 'https://geo.weather.gc.ca/geomet/', layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', opacity: .84,
      source: 'Environment Canada radar', sourceUrl: 'https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en/', timed: true,
      legend: ['Precipitation rate', 'mm/h', 'rain-legend', ['Light', 'Moderate', 'Heavy']]
    },
    smoke: {
      label: 'Smoke', kicker: 'SMOKE FORECAST', title: 'Where wildfire smoke may travel', story: 'Modelled wildfire smoke across Ontario',
      url: 'https://geo.weather.gc.ca/geomet/', layer: 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume', style: '', opacity: .74,
      source: 'Environment Canada RAQDPS', sourceUrl: 'https://eccc-msc.github.io/open-data/msc-data/nwp_raqdps/readme_raqdps_en/', timed: true,
      legend: ['Wildfire PM₂.₅', 'µg/m³', 'smoke-legend', ['Lower', 'Elevated', 'Higher']]
    },
    air: {
      label: 'Air', kicker: 'AIR QUALITY', title: 'Current air-quality health risk', story: 'Observed Air Quality Health Index across Ontario',
      url: 'https://geo.weather.gc.ca/geomet/', layer: 'AQHI-OBS', style: '', opacity: .9,
      source: 'Environment Canada AQHI', sourceUrl: 'https://eccc-msc.github.io/open-data/msc-data/aqhi/readme_aqhi-geomet_en/', timed: false,
      legend: ['AQHI risk', 'index', 'air-legend', ['Low', 'Moderate', 'High', 'Very high']]
    },
    fire: {
      label: 'Fires', kicker: 'FIRE HOTSPOTS', title: 'Recent satellite heat detections', story: 'Hotspots detected during the last 24 hours',
      url: 'https://geoserver.cwfis.cfs.nrcan.gc.ca/geoserver/public/wms', layer: 'public:hotspots_24h', style: '', opacity: 1,
      source: 'NRCan CWFIS', sourceUrl: 'https://cwfis.cfs.nrcan.gc.ca/', timed: false,
      legend: ['Hotspot age', 'hours', 'fire-legend', ['Older', 'Recent', 'Newest']]
    },
    alerts: {
      label: 'Alerts', kicker: 'WEATHER ALERTS', title: 'Active Ontario warnings and watches', story: 'Current Ontario warnings, watches and advisories',
      source: 'Environment Canada alerts', sourceUrl: 'https://weather.gc.ca/warnings/index_e.html?prov=on', timed: false,
      legend: ['Alert severity', '', 'air-legend', ['Advisory', 'Watch', 'Warning']]
    }
  };

  const PLACES = [
    ['Ontario', 49.65, -84.35, 5, 'Province view'], ['Toronto', 43.653, -79.383, 9, 'GTA'], ['Ottawa', 45.421, -75.697, 9, 'Eastern Ontario'],
    ['Hamilton', 43.255, -79.871, 10, 'Golden Horseshoe'], ['Niagara', 43.09, -79.08, 10, 'Niagara Region'], ['London', 42.984, -81.245, 9, 'Southwestern Ontario'],
    ['Windsor', 42.314, -83.036, 9, 'Essex County'], ['Kitchener–Waterloo', 43.451, -80.493, 9, 'Waterloo Region'], ['Barrie', 44.389, -79.69, 9, 'Central Ontario'],
    ['Kingston', 44.231, -76.486, 9, 'Lake Ontario'], ['Sudbury', 46.491, -80.993, 8, 'Northeastern Ontario'], ['North Bay', 46.31, -79.46, 8, 'Nipissing'],
    ['Sault Ste. Marie', 46.522, -84.347, 8, 'Algoma'], ['Thunder Bay', 48.381, -89.247, 8, 'Northwestern Ontario'], ['Timmins', 48.475, -81.33, 8, 'Cochrane District'],
    ['Kenora', 49.768, -94.49, 8, 'Lake of the Woods']
  ];

  function safeStorageGet(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } }

  const state = {
    map: null, weatherLayer: null, labelLayer: null, baseLayer: null, mode: safeStorageGet('skymap.mode', 'rain'),
    frames: [], frameIndex: 0, frameTimer: null, playing: false, opacity: Number(safeStorageGet('skymap.opacity', '82')) / 100,
    place: safeStorageGet('skymap.place', 'Ontario'), alertFeatures: [], installPrompt: null, lastStatus: '', loadingTiles: 0,
    refreshToken: 0
  };

  function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function formatClock(date) { return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date); }
  function formatDateTime(date) { return new Intl.DateTimeFormat('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date); }
  function formatShort(date) { return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date); }
  function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function showToast(message) {
    DOM.toast.textContent = message;
    DOM.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => DOM.toast.classList.remove('show'), 2600);
  }

  function showError(message, retry = true) {
    DOM.errorMessage.textContent = message;
    DOM.errorRetry.hidden = !retry;
    DOM.error.hidden = false;
  }
  function clearError() { DOM.error.hidden = true; }

  function setConnection(online) {
    DOM.connection.textContent = online ? 'LIVE PUBLIC DATA' : 'OFFLINE';
    DOM.connection.previousElementSibling?.classList.toggle('offline', !online);
    if (!online) setStatus('Offline — showing cached map tiles where available', 'error');
  }

  function setStatus(message, kind = 'loading', time = null) {
    state.lastStatus = message;
    const colour = kind === 'ok' ? 'var(--green)' : kind === 'error' ? 'var(--red)' : 'var(--yellow)';
    [DOM.statusDot, DOM.sheetStatusDot].forEach(dot => { if (dot) dot.style.background = colour; });
    DOM.statusText.textContent = message;
    DOM.sheetStatusText.textContent = message;
    const label = time ? `Updated ${formatClock(time)}` : kind === 'loading' ? 'Working…' : '—';
    DOM.updatedTime.textContent = label;
    DOM.sheetUpdatedTime.textContent = label;
  }

  async function fetchWithTimeout(url, options = {}, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } finally { clearTimeout(timer); }
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url; script.async = true; script.crossOrigin = 'anonymous';
      script.onload = resolve; script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function loadLeaflet() {
    if (window.L) return;
    const urls = [
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
    ];
    for (const url of urls) {
      try { await loadScript(url); if (window.L) return; } catch (_) {}
    }
    throw new Error('The map library could not be loaded. Check your connection and try again.');
  }

  function initMap() {
    const saved = (() => { try { return JSON.parse(safeStorageGet('skymap.view', 'null')); } catch (_) { return null; } })();
    const initial = saved && Number.isFinite(saved.lat) ? [saved.lat, saved.lng, saved.zoom] : [49.65, -84.35, 5];
    state.map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: 4, maxZoom: 13 }).setView([initial[0], initial[1]], initial[2]);
    state.map.createPane('weather'); state.map.getPane('weather').style.zIndex = 360;
    state.map.createPane('labels'); state.map.getPane('labels').style.zIndex = 500; state.map.getPane('labels').style.pointerEvents = 'none';
    state.baseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, crossOrigin: true, updateWhenIdle: true }).addTo(state.map);
    state.labelLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { pane: 'labels', subdomains: 'abcd', maxZoom: 19, crossOrigin: true, updateWhenIdle: true }).addTo(state.map);
    state.map.on('moveend', () => {
      const center = state.map.getCenter();
      safeStorageSet('skymap.view', JSON.stringify({ lat: +center.lat.toFixed(5), lng: +center.lng.toFixed(5), zoom: state.map.getZoom() }));
      loadAQHI(center.lat, center.lng);
    });
    window.addEventListener('resize', () => state.map?.invalidateSize({ pan: false }));
    new ResizeObserver(() => state.map?.invalidateSize({ pan: false })).observe(DOM.map);
  }

  function makeWmsLayer(config) {
    const options = {
      layers: config.layer, styles: config.style || '', format: 'image/png', transparent: true, version: '1.3.0',
      pane: 'weather', opacity: Math.min(1, state.opacity * (config.opacity / .82)), crossOrigin: true, tileSize: 256,
      updateWhenIdle: false, updateWhenZooming: false, keepBuffer: 3
    };
    const layer = L.tileLayer.wms(config.url, options);
    let errors = 0;
    layer.on('loading', () => { state.loadingTiles += 1; setStatus(`Loading ${config.label.toLowerCase()} layer…`, 'loading'); });
    layer.on('load', () => { state.loadingTiles = Math.max(0, state.loadingTiles - 1); setStatus(`${config.label} layer ready`, 'ok', new Date()); clearError(); });
    layer.on('tileerror', () => {
      errors += 1;
      if (errors >= 4) { setStatus(`${config.label} feed is temporarily unavailable`, 'error'); showError(`${config.label} data could not be drawn. The public feed may be delayed.`, true); }
    });
    return layer;
  }

  function updateModeUI(mode) {
    const config = CONFIG[mode];
    document.body.dataset.mode = mode;
    qsa('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
    DOM.modeKicker.textContent = config.kicker; DOM.modeTitle.textContent = config.title;
    DOM.mobileKicker.textContent = config.kicker; DOM.mobileStory.textContent = config.story;
    DOM.sheetModeCopy.textContent = `${config.story}. Source: ${config.source}.`;
    DOM.sourceLink.textContent = `${config.source} ↗`; DOM.sourceLink.href = config.sourceUrl;
    DOM.legendName.textContent = config.legend[0]; DOM.legendUnit.textContent = config.legend[1];
    DOM.legendBar.className = `legend-bar ${config.legend[2]}`;
    DOM.legendLabels.innerHTML = config.legend[3].map(label => `<span>${escapeHtml(label)}</span>`).join('');
    DOM.timeline.classList.toggle('hidden', !config.timed);
    DOM.mobileSummary.classList.toggle('hidden', config.timed);
    DOM.alertsCard.style.display = mode === 'alerts' || innerWidth > 780 ? '' : 'none';
  }

  async function setMode(mode, { force = false } = {}) {
    if (!CONFIG[mode]) mode = 'rain';
    if (!force && state.mode === mode && state.weatherLayer) return;
    stopPlayback(); clearError();
    state.mode = mode; safeStorageSet('skymap.mode', mode); updateModeUI(mode);
    if (state.weatherLayer) { state.map.removeLayer(state.weatherLayer); state.weatherLayer = null; }
    if (mode === 'alerts') {
      state.frames = []; renderTimeline(); setStatus('Showing active Ontario alert information', 'ok', new Date());
      openInfoSheetOnMobile(); return;
    }
    const config = CONFIG[mode];
    state.weatherLayer = makeWmsLayer(config).addTo(state.map);
    state.weatherLayer.setOpacity(Math.min(1, state.opacity * (config.opacity / .82)));
    if (config.timed) await loadTimeFrames(mode); else { state.frames = []; renderTimeline(); }
  }

  function parseDuration(value) {
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value || '');
    if (!match) return 3600000;
    return ((+match[1] || 0) * 86400 + (+match[2] || 0) * 3600 + (+match[3] || 0) * 60 + (+match[4] || 0)) * 1000;
  }

  function parseTimeDimension(text) {
    const clean = (text || '').trim();
    if (!clean) return [];
    if (clean.includes(',')) return clean.split(',').map(v => new Date(v.trim())).filter(d => !Number.isNaN(d.getTime()));
    const parts = clean.split('/');
    if (parts.length >= 3) {
      const start = new Date(parts[0]), end = new Date(parts[1]), step = parseDuration(parts[2]);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !step) return [];
      const frames = [];
      for (let time = start.getTime(), guard = 0; time <= end.getTime() + 1000 && guard < 180; time += step, guard += 1) frames.push(new Date(time));
      return frames;
    }
    const single = new Date(clean); return Number.isNaN(single.getTime()) ? [] : [single];
  }

  async function loadTimeFrames(mode) {
    const token = ++state.refreshToken;
    const config = CONFIG[mode];
    setStatus(`Checking the latest ${config.label.toLowerCase()} times…`, 'loading');
    try {
      const url = `${config.url}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${encodeURIComponent(config.layer)}&_=${Date.now()}`;
      const response = await fetchWithTimeout(url, {}, 15000);
      const xmlText = await response.text();
      if (token !== state.refreshToken || mode !== state.mode) return;
      const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
      const dimensions = [...xml.getElementsByTagName('Dimension')];
      const dimension = dimensions.find(node => (node.getAttribute('name') || '').toLowerCase() === 'time') || dimensions[0];
      let frames = parseTimeDimension(dimension?.textContent || '');
      if (frames.length > 32) {
        const keep = mode === 'rain' ? 32 : 28;
        frames = frames.slice(-keep);
      }
      if (!frames.length) throw new Error('No time frames advertised');
      state.frames = frames;
      const now = Date.now();
      state.frameIndex = mode === 'rain' ? frames.length - 1 : frames.reduce((best, date, index) => Math.abs(date - now) < Math.abs(frames[best] - now) ? index : best, 0);
      applyFrame(state.frameIndex, false);
      setStatus(`${frames.length} ${config.label.toLowerCase()} frames ready`, 'ok', new Date());
    } catch (error) {
      state.frames = [new Date()]; state.frameIndex = 0; applyFrame(0, false);
      setStatus(`${config.label} is live; animation times are unavailable`, 'error');
      showToast('Timeline unavailable — showing the latest public layer.');
    }
  }

