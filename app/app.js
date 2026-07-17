(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const EMBED = new URLSearchParams(location.search).get('embed') === '1';
  const IS_FILE = location.protocol === 'file:';

  if (EMBED) document.body.classList.add('embed');

  const CONFIG = {
    rain: {
      label: 'Rain', kicker: 'LIVE RAIN RADAR', title: 'See what is moving your way.', story: 'Recent precipitation observations across Ontario.',
      source: 'Environment Canada radar', sourceUrl: 'https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en/',
      note: 'Radar is observational data. Frames can be delayed or briefly unavailable.',
      legend: ['Precipitation rate', 'mm/h', 'rain', ['Light', 'Moderate', 'Heavy']],
      wms: { url: 'https://geo.weather.gc.ca/geomet/', layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', opacity: .84 }, timed: true
    },
    smoke: {
      label: 'Smoke', kicker: 'WILDFIRE SMOKE FORECAST', title: 'See where smoke may travel.', story: 'Modelled wildfire-smoke concentration across Ontario.',
      source: 'Environment Canada RAQDPS', sourceUrl: 'https://eccc-msc.github.io/open-data/msc-data/nwp_raqdps/readme_raqdps_en/',
      note: 'Smoke is a model forecast, not a measurement or public-health instruction.',
      legend: ['Wildfire PM₂.₅', 'µg/m³', 'smoke', ['Lower', 'Elevated', 'Higher']],
      wms: { url: 'https://geo.weather.gc.ca/geomet/', layer: 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume', style: '', opacity: .74 }, timed: true
    },
    air: {
      label: 'Air', kicker: 'OBSERVED AIR QUALITY', title: 'Know the health risk nearby.', story: 'Latest AQHI observations from reporting stations.',
      source: 'Environment Canada AQHI', sourceUrl: 'https://api.weather.gc.ca/',
      note: 'AQHI values are station observations. Conditions between stations can differ.',
      legend: ['AQHI health risk', 'index', 'air', ['Low', 'Moderate', 'High', 'Very high']], timed: false
    },
    fire: {
      label: 'Fires', kicker: 'SATELLITE HOTSPOTS', title: 'Find recent heat detections.', story: 'Ontario thermal hotspots detected in the last 24 hours.',
      source: 'NRCan CWFIS', sourceUrl: 'https://cwfis.cfs.nrcan.gc.ca/',
      note: 'Hotspots are satellite detections, not confirmed fires or fire perimeters.',
      legend: ['Hotspot recency', 'hours', 'fire', ['Older', 'Recent', 'Newest']], timed: false
    },
    alerts: {
      label: 'Alerts', kicker: 'ACTIVE WEATHER ALERTS', title: 'See warnings that affect Ontario.', story: 'Current warnings, watches and advisories with mapped areas.',
      source: 'Environment Canada alerts', sourceUrl: 'https://weather.gc.ca/warnings/index_e.html?prov=on',
      note: 'Always follow the full alert and instructions from official authorities.',
      legend: ['Alert type', '', 'alerts', ['Advisory', 'Watch', 'Warning']], timed: false
    }
  };

  const PLACES = [
    ['Ontario', 49.65, -84.35, 5, 'Province view'], ['Toronto', 43.653, -79.383, 9, 'Greater Toronto'], ['Ottawa', 45.421, -75.697, 9, 'Eastern Ontario'],
    ['Hamilton', 43.255, -79.871, 10, 'Golden Horseshoe'], ['Niagara', 43.09, -79.08, 10, 'Niagara Region'], ['London', 42.984, -81.245, 9, 'Southwestern Ontario'],
    ['Windsor', 42.314, -83.036, 9, 'Essex County'], ['Kitchener–Waterloo', 43.451, -80.493, 9, 'Waterloo Region'], ['Barrie', 44.389, -79.69, 9, 'Central Ontario'],
    ['Kingston', 44.231, -76.486, 9, 'Lake Ontario'], ['Sudbury', 46.491, -80.993, 8, 'Northeastern Ontario'], ['North Bay', 46.31, -79.46, 8, 'Nipissing'],
    ['Sault Ste. Marie', 46.522, -84.347, 8, 'Algoma'], ['Thunder Bay', 48.381, -89.247, 8, 'Northwestern Ontario'], ['Timmins', 48.475, -81.33, 8, 'Cochrane District'],
    ['Kenora', 49.768, -94.49, 8, 'Lake of the Woods']
  ];

  const DOM = {
    loading: $('loading-screen'), loadingMessage: $('loading-message'), connection: $('connection-label'),
    placeButton: $('place-button'), placeLabel: $('place-label'), placeSheet: $('place-sheet'), placeGrid: $('place-grid'),
    infoSheet: $('info-sheet'), backdrop: $('sheet-backdrop'), menu: $('menu-button'), locate: $('locate-button'), share: $('share-button'),
    modeKicker: $('mode-kicker'), modeTitle: $('mode-title'), mobileKicker: $('mobile-kicker'), mobileStory: $('mobile-story'), restoreLabel: $('restore-label'),
    feedStatus: $('feed-status'), statusText: $('status-text'), statusDetail: $('status-detail'), updatedTime: $('updated-time'),
    sheetStatus: $('sheet-status'), sheetUpdated: $('sheet-updated'), sheetModeTitle: $('sheet-mode-title'), sheetModeCopy: $('sheet-mode-copy'),
    primary: $('primary-card'), primaryValue: $('primary-value'), primaryLabel: $('primary-label'), primaryTitle: $('primary-title'), primaryDetail: $('primary-detail'),
    legendTitle: $('legend-title'), legendUnit: $('legend-unit'), legendBar: $('legend-bar'), legendLabels: $('legend-labels'),
    activityTitle: $('activity-title'), activityCount: $('activity-count'), activityList: $('activity-list'),
    source: $('source-link'), dataNote: $('data-note'), alertBadge: $('alert-badge'),
    panel: $('insight-panel'), panelClose: $('panel-close'), panelRestore: $('panel-restore'),
    timeline: $('timeline'), play: $('play-button'), slider: $('time-slider'), progress: $('range-progress'), nowMarker: $('now-marker'),
    relative: $('relative-time'), absolute: $('absolute-time'), rangeStart: $('range-start'), rangeEnd: $('range-end'), refresh: $('refresh-button'),
    mobilePeek: $('mobile-peek'), opacity: $('opacity-slider'), install: $('install-button'),
    error: $('error-banner'), errorTitle: $('error-title'), errorMessage: $('error-message'), errorRetry: $('error-retry'), toast: $('toast')
  };

  const readStorage = (key, fallback = null) => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
  const writeStorage = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const formatClock = date => new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date);
  const formatFrame = date => new Intl.DateTimeFormat('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
  const formatWmsTime = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const state = {
    map: null, layer: null, labels: null, mode: CONFIG[readStorage('skymap.mode', 'rain')] ? readStorage('skymap.mode', 'rain') : 'rain',
    place: readStorage('skymap.place', 'Ontario'), opacity: Math.max(.25, Math.min(1, Number(readStorage('skymap.opacity', '82')) / 100 || .82)),
    frames: [], frameIndex: 0, playing: false, frameTimer: null, modeToken: 0, installPrompt: null,
    air: [], fires: [], alerts: [], airLoadedAt: 0, firesLoadedAt: 0, alertsLoadedAt: 0, currentFrame: null
  };

  function showToast(message) {
    DOM.toast.textContent = message;
    DOM.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => DOM.toast.classList.remove('show'), 2600);
  }

  function showError(title, message, retry = true) {
    DOM.errorTitle.textContent = title;
    DOM.errorMessage.textContent = message;
    DOM.errorRetry.hidden = !retry;
    DOM.error.hidden = false;
  }

  function clearError() { DOM.error.hidden = true; }

  function setStatus(message, stateName = 'loading', detail = 'Official public data', updated = null) {
    DOM.feedStatus.dataset.state = stateName;
    DOM.statusText.textContent = message;
    DOM.statusDetail.textContent = detail;
    DOM.updatedTime.textContent = updated ? formatClock(updated) : stateName === 'loading' ? 'Working…' : '—';
    DOM.sheetStatus.textContent = message;
    DOM.sheetUpdated.textContent = updated ? `Updated ${formatClock(updated)} · ${detail}` : detail;
    const dot = DOM.infoSheet.querySelector('.sheet-live > i');
    if (dot) dot.style.background = stateName === 'ok' ? 'var(--green)' : stateName === 'error' ? 'var(--red)' : 'var(--yellow)';
  }

  function setConnection(online) {
    DOM.connection.textContent = online ? 'LIVE PUBLIC DATA' : 'OFFLINE';
    DOM.connection.previousElementSibling?.classList.toggle('offline', !online);
    if (!online) setStatus('You are offline', 'error', 'Cached map content may remain visible');
  }

  async function fetchResponse(url, options = {}, timeout = 18000, attempts = 2) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await wait(650 * (attempt + 1));
      } finally { clearTimeout(timer); }
    }
    throw lastError || new Error('Request failed');
  }

  async function fetchJson(url, timeout, attempts) { return (await fetchResponse(url, {}, timeout, attempts)).json(); }

  function restoreView() {
    const hash = /map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)&mode=(\w+)/.exec(location.hash);
    if (hash) {
      if (CONFIG[hash[4]]) state.mode = hash[4];
      return { center: [Number(hash[2]), Number(hash[3])], zoom: Number(hash[1]) };
    }
    try {
      const saved = JSON.parse(readStorage('skymap.view', 'null'));
      if (Number.isFinite(saved?.lat) && Number.isFinite(saved?.lng) && Number.isFinite(saved?.zoom)) return { center: [saved.lat, saved.lng], zoom: saved.zoom };
    } catch (_) {}
    return { center: [49.65, -84.35], zoom: 5 };
  }

  function initMap() {
    if (!window.L) throw new Error('The bundled map engine could not start.');
    const view = restoreView();
    state.map = L.map('map', { ...view, minZoom: 3, maxZoom: 14, preferCanvas: true, zoomControl: false, attributionControl: true });
    state.map.attributionControl.setPrefix(false);
    state.map.createPane('weather'); state.map.getPane('weather').style.zIndex = '320';
    state.map.createPane('alerts'); state.map.getPane('alerts').style.zIndex = '390';
    state.map.createPane('observations'); state.map.getPane('observations').style.zIndex = '420';
    state.map.createPane('labels'); state.map.getPane('labels').style.zIndex = '500'; state.map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, updateWhenIdle: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(state.map);
    state.labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      pane: 'labels', subdomains: 'abcd', maxZoom: 19, updateWhenIdle: true
    }).addTo(state.map);
    state.map.on('moveend', () => {
      const center = state.map.getCenter();
      writeStorage('skymap.view', JSON.stringify({ lat: +center.lat.toFixed(5), lng: +center.lng.toFixed(5), zoom: state.map.getZoom() }));
      updateNearestAir();
      if (state.mode === 'air') renderAirActivity();
    });
    window.addEventListener('resize', () => state.map.invalidateSize({ pan: false }));
  }

  function removeLayer() {
    if (!state.layer) return;
    if (state.layer._skyTimeout) clearTimeout(state.layer._skyTimeout);
    state.map.removeLayer(state.layer);
    state.layer = null;
  }

  function setOverlayOpacity() {
    if (!state.layer) return;
    if (typeof state.layer.setOpacity === 'function') state.layer.setOpacity(state.opacity * (CONFIG[state.mode].wms?.opacity || 1));
    if (typeof state.layer.eachLayer === 'function') {
      state.layer.eachLayer(layer => {
        const base = layer.options?.skyFillOpacity;
        if (Number.isFinite(base) && typeof layer.setStyle === 'function') layer.setStyle({ fillOpacity: base * state.opacity });
      });
    }
  }

  function updateModeUI(mode) {
    const config = CONFIG[mode];
    document.body.dataset.mode = mode;
    all('.layer-button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
    DOM.modeKicker.textContent = config.kicker;
    DOM.modeTitle.textContent = config.title;
    DOM.mobileKicker.textContent = config.kicker;
    DOM.mobileStory.textContent = config.story;
    DOM.restoreLabel.textContent = config.label;
    DOM.sheetModeTitle.textContent = config.label === 'Fires' ? 'Wildfire hotspots' : config.label === 'Air' ? 'Air quality observations' : config.title;
    DOM.sheetModeCopy.textContent = config.story;
    DOM.legendTitle.textContent = config.legend[0];
    DOM.legendUnit.textContent = config.legend[1];
    DOM.legendBar.className = `legend ${config.legend[2]}`;
    DOM.legendLabels.innerHTML = config.legend[3].map(label => `<span>${escapeHtml(label)}</span>`).join('');
    DOM.source.textContent = `${config.source} ↗`;
    DOM.source.href = config.sourceUrl;
    DOM.dataNote.textContent = config.note;
    DOM.timeline.classList.toggle('hidden', !config.timed);
    DOM.mobilePeek.classList.toggle('hidden', config.timed);
    updatePrimaryForMode();
    renderActivity();
  }

  function parseDuration(value) {
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value || '');
    if (!match) return 3600000;
    return ((+match[1] || 0) * 86400 + (+match[2] || 0) * 3600 + (+match[3] || 0) * 60 + (+match[4] || 0)) * 1000;
  }

  function parseTimeDimension(text) {
    const value = (text || '').trim();
    if (!value) return [];
    if (value.includes(',')) return value.split(',').map(item => new Date(item.trim())).filter(date => !Number.isNaN(date.getTime()));
    const parts = value.split('/');
    if (parts.length >= 3) {
      const start = new Date(parts[0]);
      const end = new Date(parts[1]);
      const step = parseDuration(parts[2]);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !step) return [];
      const result = [];
      for (let time = start.getTime(), guard = 0; time <= end.getTime() + 1000 && guard < 240; time += step, guard += 1) result.push(new Date(time));
      return result;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? [] : [date];
  }

  function createWmsLayer(config, token) {
    const layer = L.tileLayer.wms(config.wms.url, {
      layers: config.wms.layer, styles: config.wms.style, format: 'image/png', transparent: true, version: '1.3.0',
      pane: 'weather', opacity: state.opacity * config.wms.opacity, tileSize: 256, updateWhenIdle: false, updateWhenZooming: false, keepBuffer: 2
    });
    let loaded = 0;
    let failed = 0;
    const finish = () => {
      if (token !== state.modeToken || state.layer !== layer) return;
      clearTimeout(layer._skyTimeout);
      if (loaded > 0) {
        const time = state.currentFrame || new Date();
        setStatus(`${config.label} data is live`, 'ok', `${loaded} map tiles rendered`, time);
        clearError();
      } else {
        setStatus(`${config.label} feed did not render`, 'error', `${failed || 'No'} usable map tiles`);
        showError(`${config.label} is temporarily unavailable`, 'The official map feed returned no usable tiles. Other layers may still work.', true);
      }
    };
    layer.on('loading', () => {
      loaded = 0; failed = 0;
      setStatus(`Loading ${config.label.toLowerCase()} data…`, 'loading', 'Requesting official map tiles');
      clearTimeout(layer._skyTimeout);
      layer._skyTimeout = setTimeout(finish, 20000);
    });
    layer.on('tileload', () => { loaded += 1; });
    layer.on('tileerror', () => { failed += 1; });
    layer.on('load', finish);
    return layer;
  }

  async function loadTimeFrames(config, token) {
    try {
      const url = `${config.wms.url}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${encodeURIComponent(config.wms.layer)}&_=${Date.now()}`;
      const xmlText = await (await fetchResponse(url, {}, 18000, 2)).text();
      if (token !== state.modeToken) return;
      const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('Invalid capabilities document');
      const dimensions = [...xml.getElementsByTagName('Dimension')];
      const dimension = dimensions.find(node => (node.getAttribute('name') || '').toLowerCase() === 'time');
      let frames = parseTimeDimension(dimension?.textContent);
      const limit = state.mode === 'rain' ? 31 : 49;
      if (frames.length > limit) frames = state.mode === 'rain' ? frames.slice(-limit) : frames.slice(0, limit);
      if (!frames.length) throw new Error('No advertised time frames');
      state.frames = frames;
      const now = Date.now();
      state.frameIndex = state.mode === 'rain' ? frames.length - 1 : frames.reduce((best, date, index) => Math.abs(date.getTime() - now) < Math.abs(frames[best].getTime() - now) ? index : best, 0);
      applyFrame(state.frameIndex, false);
      renderActivity();
    } catch (_) {
      if (token !== state.modeToken) return;
      state.frames = [];
      state.currentFrame = null;
      renderTimeline();
      showToast('Timeline unavailable — showing the feed’s default latest layer.');
    }
  }

  function applyFrame(index, user = true) {
    if (!state.frames.length || !state.layer?.setParams) return;
    state.frameIndex = Math.max(0, Math.min(index, state.frames.length - 1));
    state.currentFrame = state.frames[state.frameIndex];
    state.layer.setParams({ time: formatWmsTime(state.currentFrame) }, false);
    renderTimeline();
    if (user) setStatus(`Loading frame ${state.frameIndex + 1} of ${state.frames.length}…`, 'loading', 'Requesting timestamped map tiles');
  }

  function renderTimeline() {
    const frames = state.frames;
    const max = Math.max(0, frames.length - 1);
    DOM.slider.max = String(max);
    DOM.slider.value = String(Math.min(state.frameIndex, max));
    DOM.progress.style.width = `${max ? (state.frameIndex / max) * 100 : 0}%`;
    if (!frames.length) {
      DOM.relative.textContent = 'LATEST'; DOM.absolute.textContent = 'Using the feed’s current layer';
      DOM.rangeStart.textContent = '—'; DOM.rangeEnd.textContent = '—'; DOM.nowMarker.style.display = 'none';
      return;
    }
    const current = frames[state.frameIndex];
    const minutes = Math.round((current.getTime() - Date.now()) / 60000);
    DOM.relative.textContent = Math.abs(minutes) < 4 ? 'RIGHT NOW' : minutes < 0 ? `${Math.abs(minutes)} MIN AGO` : `IN ${minutes} MIN`;
    DOM.absolute.textContent = formatFrame(current);
    DOM.rangeStart.textContent = formatClock(frames[0]);
    DOM.rangeEnd.textContent = formatClock(frames[max]);
    const nearest = frames.reduce((best, date, index) => Math.abs(date.getTime() - Date.now()) < Math.abs(frames[best].getTime() - Date.now()) ? index : best, 0);
    DOM.nowMarker.style.display = max ? '' : 'none';
    DOM.nowMarker.style.left = `${max ? (nearest / max) * 100 : 0}%`;
  }

  function startPlayback() {
    if (state.frames.length < 2) return showToast('This layer has no animation frames right now.');
    state.playing = true;
    DOM.play.classList.add('playing'); DOM.play.textContent = 'Ⅱ'; DOM.play.setAttribute('aria-label', 'Pause animation');
    state.frameTimer = setInterval(() => applyFrame((state.frameIndex + 1) % state.frames.length, false), state.mode === 'rain' ? 650 : 850);
  }

  function stopPlayback() {
    state.playing = false;
    clearInterval(state.frameTimer); state.frameTimer = null;
    DOM.play.classList.remove('playing'); DOM.play.textContent = '▶'; DOM.play.setAttribute('aria-label', 'Play animation');
  }

  function airRisk(value) {
    if (value <= 3) return ['Low risk', '#58e49e'];
    if (value <= 6) return ['Moderate risk', '#ffd36a'];
    if (value <= 10) return ['High risk', '#ff946d'];
    return ['Very high risk', '#d95fff'];
  }

  function normalizeAir(feature) {
    const properties = feature.properties || {};
    const coordinates = feature.geometry?.coordinates || [];
    const value = Number(properties.aqhi ?? properties.AQHI ?? properties.value ?? properties.observed_value);
    const lat = Number(coordinates[1]);
    const lng = Number(coordinates[0]);
    if (!Number.isFinite(value) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      value, lat, lng,
      name: properties.location_name_en || properties.station_name || properties.name_en || properties.name || 'Ontario reporting station',
      observed: new Date(properties.observation_datetime || properties.observation_datetime_utc || properties.observation_time || feature.properties?.datetime || Date.now())
    };
  }

  async function loadAir(force = false) {
    if (!force && state.air.length && Date.now() - state.airLoadedAt < 10 * 60 * 1000) return state.air;
    const url = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&latest=true&bbox=-95.5,41.4,-73.8,57.6&limit=300';
    const data = await fetchJson(url, 18000, 2);
    const stations = (data.features || []).map(normalizeAir).filter(Boolean);
    if (!stations.length) throw new Error('No AQHI observations returned');
    state.air = stations;
    state.airLoadedAt = Date.now();
    updateNearestAir();
    return stations;
  }

  function nearestAirStations() {
    if (!state.map || !state.air.length) return [];
    const center = state.map.getCenter();
    return [...state.air].sort((a, b) => ((a.lat - center.lat) ** 2 + (a.lng - center.lng) ** 2) - ((b.lat - center.lat) ** 2 + (b.lng - center.lng) ** 2));
  }

  function updateNearestAir() {
    if (!state.air.length) return;
    const nearest = nearestAirStations()[0];
    const [risk, colour] = airRisk(nearest.value);
    DOM.primaryValue.textContent = nearest.value > 10 ? '10+' : String(Math.round(nearest.value));
    DOM.primaryValue.style.color = colour; DOM.primaryValue.style.borderColor = colour;
    if (['rain', 'smoke', 'air'].includes(state.mode)) {
      DOM.primaryLabel.textContent = 'NEAREST AQHI'; DOM.primaryTitle.textContent = risk; DOM.primaryDetail.textContent = nearest.name;
    }
  }

  function renderAirLayer() {
    const group = L.layerGroup();
    state.air.forEach(station => {
      const [risk, colour] = airRisk(station.value);
      const marker = L.circleMarker([station.lat, station.lng], { pane: 'observations', radius: 8, color: '#07121c', weight: 2, fillColor: colour, fillOpacity: .88 * state.opacity, skyFillOpacity: .88 });
      marker.bindTooltip(`<b>${escapeHtml(station.name)}</b><br>AQHI ${escapeHtml(station.value > 10 ? '10+' : Math.round(station.value))} · ${escapeHtml(risk)}`, { direction: 'top' });
      group.addLayer(marker);
    });
    return group;
  }

  function renderAirActivity() {
    const nearest = nearestAirStations().slice(0, 4);
    DOM.activityTitle.textContent = 'Stations near the map centre'; DOM.activityCount.textContent = `${state.air.length} LIVE`;
    DOM.activityList.innerHTML = nearest.length ? nearest.map(station => {
      const [risk] = airRisk(station.value);
      return `<div class="activity-item"><span><b>${escapeHtml(station.name)}</b><small>${escapeHtml(risk)}</small></span><em>AQHI ${escapeHtml(station.value > 10 ? '10+' : Math.round(station.value))}</em></div>`;
    }).join('') : '<p>No AQHI stations were returned.</p>';
  }

  async function loadFires(force = false) {
    if (!force && state.firesLoadedAt && Date.now() - state.firesLoadedAt < 10 * 60 * 1000) return state.fires;
    const base = 'https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows';
    const params = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'public:hotspots_last24hrs', outputFormat: 'application/json', srsName: 'EPSG:4326', CQL_FILTER: "agency='ON'", propertyName: 'geometry,rep_date,source,sensor,satellite,agency,age,frp', count: '10000' });
    const data = await fetchJson(`${base}?${params}`, 26000, 2);
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid hotspot response');
    const features = data.features.filter(feature => feature.geometry?.type === 'Point');
    state.fires = features;
    state.firesLoadedAt = Date.now();
    return features;
  }

  function fireColour(age) {
    const hours = Number(age);
    if (Number.isFinite(hours) && hours <= 6) return '#ff4f58';
    if (Number.isFinite(hours) && hours <= 12) return '#ff946d';
    return '#ffd36a';
  }

  function renderFireLayer() {
    return L.geoJSON({ type: 'FeatureCollection', features: state.fires }, {
      pane: 'observations',
      pointToLayer: (feature, latlng) => {
        const properties = feature.properties || {};
        const colour = fireColour(properties.age);
        const radius = Math.max(3, Math.min(8, 3 + Math.sqrt(Math.max(0, Number(properties.frp) || 0)) / 2));
        const marker = L.circleMarker(latlng, { pane: 'observations', radius, color: '#220a0b', weight: 1, fillColor: colour, fillOpacity: .82 * state.opacity, skyFillOpacity: .82 });
        marker.bindTooltip(`<b>Satellite hotspot</b><br>${escapeHtml(properties.satellite || properties.source || 'Thermal detection')} · ${escapeHtml(properties.age ?? '—')}h old`, { direction: 'top' });
        return marker;
      }
    });
  }

  function renderFireActivity() {
    const newest = [...state.fires].sort((a, b) => Number(a.properties?.age ?? 99) - Number(b.properties?.age ?? 99)).slice(0, 4);
    DOM.activityTitle.textContent = 'Newest satellite detections'; DOM.activityCount.textContent = `${state.fires.length.toLocaleString('en-CA')} POINTS`;
    DOM.activityList.innerHTML = newest.map(feature => {
      const properties = feature.properties || {};
      return `<div class="activity-item"><span><b>${escapeHtml(properties.satellite || properties.source || 'Satellite detection')}</b><small>${escapeHtml(properties.sensor || 'Thermal hotspot')}</small></span><em>${escapeHtml(properties.age ?? '—')}h ago</em></div>`;
    }).join('') || '<p>No Ontario hotspots were returned.</p>';
  }

  async function loadAlerts(force = false) {
    if (!force && state.alerts.length && Date.now() - state.alertsLoadedAt < 10 * 60 * 1000) return state.alerts;
    const properties = 'id,alert_code,alert_type,alert_name_en,alert_short_name_en,publication_datetime,expiration_datetime,risk_colour_en,feature_name_en,province,status_en';
    const url = `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&province=ON&limit=250&sortby=-publication_datetime&properties=${encodeURIComponent(properties)}`;
    const data = await fetchJson(url, 26000, 2);
    const unique = new Map();
    (data.features || []).forEach(feature => {
      const item = feature.properties || {};
      const key = `${item.alert_code || item.alert_name_en || 'alert'}|${item.feature_name_en || item.id || feature.id || unique.size}`;
      if (!unique.has(key)) unique.set(key, feature);
    });
    state.alerts = [...unique.values()];
    state.alertsLoadedAt = Date.now();
    DOM.alertBadge.hidden = state.alerts.length === 0;
    DOM.alertBadge.textContent = state.alerts.length > 99 ? '99+' : String(state.alerts.length);
    return state.alerts;
  }

  function alertColour(feature) {
    const properties = feature.properties || {};
    const text = `${properties.alert_type || ''} ${properties.alert_name_en || ''} ${properties.alert_short_name_en || ''}`.toLowerCase();
    if (text.includes('warning')) return '#ff5b64';
    if (text.includes('watch')) return '#ff9b68';
    return '#ffd36a';
  }

  function renderAlertLayer() {
    return L.geoJSON({ type: 'FeatureCollection', features: state.alerts }, {
      pane: 'alerts',
      style: feature => ({ pane: 'alerts', color: alertColour(feature), weight: 1.5, opacity: .95, fillColor: alertColour(feature), fillOpacity: .17 * state.opacity, skyFillOpacity: .17 }),
      onEachFeature: (feature, layer) => {
        const properties = feature.properties || {};
        const title = properties.alert_short_name_en || properties.alert_name_en || properties.alert_type || 'Weather alert';
        const area = properties.feature_name_en || 'Ontario';
        layer.bindTooltip(`<b>${escapeHtml(title)}</b><br>${escapeHtml(area)}`, { sticky: true });
      }
    });
  }

  function renderAlertActivity() {
    DOM.activityTitle.textContent = 'Current Ontario alerts'; DOM.activityCount.textContent = `${state.alerts.length} ACTIVE`;
    DOM.activityList.innerHTML = state.alerts.slice(0, 4).map(feature => {
      const properties = feature.properties || {};
      const title = properties.alert_short_name_en || properties.alert_name_en || properties.alert_type || 'Weather alert';
      const area = properties.feature_name_en || 'Ontario';
      return `<div class="activity-item"><span><b>${escapeHtml(title)}</b><small>${escapeHtml(area)}</small></span><em>ACTIVE</em></div>`;
    }).join('') || '<p>No active Ontario alerts were returned by the official feed.</p>';
  }

  function updatePrimaryForMode() {
    DOM.primary.hidden = false;
    if (state.mode === 'fire') {
      DOM.primaryValue.textContent = state.fires.length ? state.fires.length.toLocaleString('en-CA') : '—';
      DOM.primaryValue.style.color = 'var(--orange)'; DOM.primaryValue.style.borderColor = 'var(--orange)';
      DOM.primaryLabel.textContent = 'ONTARIO HOTSPOTS'; DOM.primaryTitle.textContent = state.fires.length ? 'Detected in the last 24 hours' : 'Loading detections…'; DOM.primaryDetail.textContent = 'Satellite thermal observations';
    } else if (state.mode === 'alerts') {
      DOM.primaryValue.textContent = state.alerts.length ? String(state.alerts.length) : '0';
      DOM.primaryValue.style.color = state.alerts.length ? 'var(--yellow)' : 'var(--green)'; DOM.primaryValue.style.borderColor = state.alerts.length ? 'var(--yellow)' : 'var(--green)';
      DOM.primaryLabel.textContent = 'ACTIVE ALERT AREAS'; DOM.primaryTitle.textContent = state.alerts.length ? 'Review official instructions' : 'No active alerts returned'; DOM.primaryDetail.textContent = 'Environment Canada Ontario feed';
    } else if (state.air.length) updateNearestAir();
    else {
      DOM.primaryValue.textContent = '—'; DOM.primaryValue.style.color = 'var(--green)'; DOM.primaryValue.style.borderColor = 'var(--green)';
      DOM.primaryLabel.textContent = 'NEAREST AQHI'; DOM.primaryTitle.textContent = 'Finding a station…'; DOM.primaryDetail.textContent = 'Ontario';
    }
  }

  function renderActivity() {
    if (state.mode === 'air') return renderAirActivity();
    if (state.mode === 'fire') return renderFireActivity();
    if (state.mode === 'alerts') return renderAlertActivity();
    DOM.activityTitle.textContent = state.mode === 'rain' ? 'Radar timeline' : 'Forecast timeline';
    DOM.activityCount.textContent = state.frames.length ? `${state.frames.length} FRAMES` : 'LIVE';
    DOM.activityList.innerHTML = `<p>${state.frames.length ? `Choose from ${state.frames.length} verified timestamps using the timeline below.` : `The ${escapeHtml(CONFIG[state.mode].label.toLowerCase())} feed is loading its available timestamps.`}</p>`;
  }

  async function setMode(mode, { force = false } = {}) {
    if (!CONFIG[mode]) mode = 'rain';
    if (!force && mode === state.mode && state.layer) return;
    stopPlayback(); clearError(); removeLayer();
    const token = ++state.modeToken;
    state.mode = mode; state.frames = []; state.currentFrame = null;
    writeStorage('skymap.mode', mode);
    renderTimeline(); updateModeUI(mode);
    const config = CONFIG[mode];
    try {
      if (config.wms) {
        state.layer = createWmsLayer(config, token).addTo(state.map);
        await loadTimeFrames(config, token);
      } else if (mode === 'air') {
        setStatus('Loading AQHI observations…', 'loading', 'Environment Canada station feed');
        await loadAir(force);
        if (token !== state.modeToken) return;
        state.layer = renderAirLayer().addTo(state.map);
        updatePrimaryForMode(); renderAirActivity();
        const newest = state.air.map(item => item.observed).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => b - a)[0] || new Date();
        setStatus('AQHI observations are live', 'ok', `${state.air.length} Ontario stations rendered`, newest);
      } else if (mode === 'fire') {
        setStatus('Loading wildfire hotspots…', 'loading', 'NRCan satellite feed');
        await loadFires(force);
        if (token !== state.modeToken) return;
        state.layer = renderFireLayer().addTo(state.map);
        updatePrimaryForMode(); renderFireActivity();
        setStatus(state.fires.length ? 'Wildfire hotspots are live' : 'No Ontario hotspots returned', 'ok', `${state.fires.length.toLocaleString('en-CA')} Ontario detections rendered`, new Date());
      } else if (mode === 'alerts') {
        setStatus('Loading Ontario alert areas…', 'loading', 'Environment Canada alert feed');
        await loadAlerts(force);
        if (token !== state.modeToken) return;
        state.layer = renderAlertLayer().addTo(state.map);
        updatePrimaryForMode(); renderAlertActivity();
        setStatus(state.alerts.length ? 'Ontario alert areas are live' : 'No active alert areas returned', 'ok', `${state.alerts.length} mapped alert records`, new Date());
      }
      setOverlayOpacity();
    } catch (error) {
      if (token !== state.modeToken) return;
      setStatus(`${config.label} feed is unavailable`, 'error', error.message || 'Public data request failed');
      showError(`${config.label} did not load`, 'The official public feed could not be reached. Try again or choose another layer.', true);
    }
  }

  function renderPlaces() {
    DOM.placeGrid.innerHTML = '';
    PLACES.forEach(([name, lat, lng, zoom, region]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `place-option${name === state.place ? ' active' : ''}`;
      button.innerHTML = `<b>${escapeHtml(name)}</b><span>${escapeHtml(region)}</span>`;
      button.addEventListener('click', () => {
        state.place = name; writeStorage('skymap.place', name); DOM.placeLabel.textContent = name;
        all('.place-option').forEach(item => item.classList.toggle('active', item === button));
        closeSheets(); state.map.flyTo([lat, lng], zoom, { duration: 1.05 }); showToast(`Viewing ${name}`);
      });
      DOM.placeGrid.appendChild(button);
    });
  }

  function openSheet(sheet) {
    closeSheets(false);
    sheet.hidden = false; DOM.backdrop.hidden = false; document.body.dataset.sheetOpen = 'true';
    requestAnimationFrame(() => sheet.querySelector('button,a,input')?.focus());
  }

  function closeSheets(restoreFocus = true) {
    DOM.placeSheet.hidden = true; DOM.infoSheet.hidden = true; DOM.backdrop.hidden = true; delete document.body.dataset.sheetOpen;
    if (restoreFocus) DOM.menu.focus({ preventScroll: true });
  }

  function locateUser() {
    if (!navigator.geolocation) return showError('Location is unavailable', 'This browser does not provide location access.', false);
    DOM.locate.textContent = '…';
    navigator.geolocation.getCurrentPosition(position => {
      DOM.locate.textContent = '◎'; state.place = 'My location'; DOM.placeLabel.textContent = 'My location';
      state.map.flyTo([position.coords.latitude, position.coords.longitude], 9, { duration: 1.05 }); showToast('Centred on your location');
    }, error => {
      DOM.locate.textContent = '◎';
      showError('Location was not available', error.code === 1 ? 'Location permission was not granted.' : 'Your position could not be determined.', false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  async function shareView() {
    const center = state.map.getCenter();
    const url = new URL(IS_FILE ? 'https://rbt4.github.io/skymapontario/app/' : location.href);
    url.searchParams.delete('embed');
    url.hash = `map=${state.map.getZoom()}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}&mode=${state.mode}`;
    try {
      if (navigator.share) await navigator.share({ title: 'SkyMap Ontario', text: CONFIG[state.mode].story, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); showToast('Map link copied'); }
    } catch (error) { if (error.name !== 'AbortError') showToast('The map link could not be shared.'); }
  }

  function bindEvents() {
    all('.layer-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    DOM.placeButton.addEventListener('click', () => openSheet(DOM.placeSheet));
    DOM.menu.addEventListener('click', () => openSheet(DOM.infoSheet));
    document.querySelector('[data-open="info-sheet"]')?.addEventListener('click', () => openSheet(DOM.infoSheet));
    DOM.mobilePeek.addEventListener('click', () => openSheet(DOM.infoSheet));
    DOM.backdrop.addEventListener('click', () => closeSheets());
    all('[data-close]').forEach(button => button.addEventListener('click', () => closeSheets()));
    DOM.locate.addEventListener('click', locateUser); DOM.share.addEventListener('click', shareView);
    DOM.play.addEventListener('click', () => state.playing ? stopPlayback() : startPlayback());
    DOM.slider.addEventListener('input', () => { stopPlayback(); applyFrame(Number(DOM.slider.value)); renderActivity(); });
    DOM.refresh.addEventListener('click', () => setMode(state.mode, { force: true }));
    DOM.errorRetry.addEventListener('click', () => { clearError(); setMode(state.mode, { force: true }); });
    DOM.opacity.value = String(Math.round(state.opacity * 100));
    DOM.opacity.addEventListener('input', () => { state.opacity = Number(DOM.opacity.value) / 100; writeStorage('skymap.opacity', DOM.opacity.value); setOverlayOpacity(); });
    DOM.panelClose.addEventListener('click', () => { DOM.panel.classList.add('collapsed'); DOM.panelRestore.hidden = false; DOM.timeline.style.right = '20px'; });
    DOM.panelRestore.addEventListener('click', () => { DOM.panel.classList.remove('collapsed'); DOM.panelRestore.hidden = true; DOM.timeline.style.right = ''; });
    window.addEventListener('online', () => { setConnection(true); setMode(state.mode, { force: true }); });
    window.addEventListener('offline', () => setConnection(false));
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; DOM.install.hidden = false; });
    DOM.install.addEventListener('click', async () => { if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; DOM.install.hidden = true; });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !DOM.backdrop.hidden) closeSheets();
      if (event.code === 'Space' && !/INPUT|BUTTON|A/.test(document.activeElement?.tagName || '')) { event.preventDefault(); state.playing ? stopPlayback() : startPlayback(); }
    });
    window.SkyMapBack = () => { if (!DOM.backdrop.hidden) { closeSheets(false); return true; } return false; };
  }

  async function registerServiceWorker() {
    if (!IS_FILE && 'serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); } catch (_) {}
    }
  }

  async function start() {
    try {
      bindEvents(); renderPlaces(); setConnection(navigator.onLine);
      DOM.loadingMessage.textContent = 'Starting the bundled map engine…';
      initMap();
      const savedPlace = PLACES.find(place => place[0] === state.place);
      DOM.placeLabel.textContent = savedPlace?.[0] || state.place;
      updateModeUI(state.mode);
      DOM.loadingMessage.textContent = 'Connecting to official Ontario data…';
      const background = Promise.allSettled([
        state.mode === 'air' ? Promise.resolve() : loadAir(),
        state.mode === 'alerts' ? Promise.resolve() : loadAlerts(),
        registerServiceWorker()
      ]);
      await setMode(state.mode, { force: true });
      await background;
      updatePrimaryForMode(); if (state.mode === 'air') renderAirActivity(); if (state.mode === 'alerts') renderAlertActivity();
      await wait(250); DOM.loading.classList.add('done'); setTimeout(() => DOM.loading.remove(), 650);
      setInterval(async () => {
        if (!navigator.onLine || state.playing) return;
        await Promise.allSettled([loadAir(true), loadAlerts(true)]);
        if (state.mode === 'air' || state.mode === 'alerts') setMode(state.mode, { force: true });
        else updatePrimaryForMode();
      }, 10 * 60 * 1000);
      setInterval(() => { if (navigator.onLine && !state.playing && CONFIG[state.mode].timed) setMode(state.mode, { force: true }); }, 10 * 60 * 1000);
    } catch (error) {
      DOM.loading.classList.add('done');
      setStatus('Map startup failed', 'error', error.message || 'Unexpected startup error');
      showError('SkyMap Ontario could not start', error.message || 'Refresh the app and try again.', true);
    }
  }

  start();
})();
