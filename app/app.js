(() => {
  'use strict';

  const DIRECT_GEOMET = 'https://geo.weather.gc.ca/geomet';
  const NATIVE_GEOMET = 'https://appassets.androidplatform.net/geomet-proxy';
  const WEATHER_API = 'https://api.weather.gc.ca';
  const FUTURECAST_LAYER = 'HRDPS.CONTINENTAL.DIAG_PR_PT1H';
  const FUTURECAST_STYLE = 'RDPA-WXO';
  const FUTURE_STORM_LAYER = 'HRDPS-WEonG_2.5km_Thunderstorm-Prob';
  const FUTURE_STORM_STYLE = 'Thunderstorm-Prob_Dis';
  const IS_NATIVE = location.hostname === 'appassets.androidplatform.net';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const english = value => value && typeof value === 'object' && 'en' in value ? value.en : value;
  const finite = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

  const PLACES = [
    { name: 'Toronto', lat: 43.6532, lon: -79.3832, zoom: 8 },
    { name: 'Etobicoke', lat: 43.6205, lon: -79.5132, zoom: 9 },
    { name: 'Ottawa', lat: 45.4215, lon: -75.6972, zoom: 8 },
    { name: 'Hamilton', lat: 43.2557, lon: -79.8711, zoom: 9 },
    { name: 'London', lat: 42.9849, lon: -81.2453, zoom: 8 },
    { name: 'Windsor', lat: 42.3149, lon: -83.0364, zoom: 8 },
    { name: 'Kingston', lat: 44.2312, lon: -76.486, zoom: 8 },
    { name: 'Barrie', lat: 44.3894, lon: -79.6903, zoom: 9 },
    { name: 'Sudbury', lat: 46.4917, lon: -80.993, zoom: 7 },
    { name: 'Thunder Bay', lat: 48.3809, lon: -89.2477, zoom: 7 }
  ];

  const MODELS = [
    { id: 'gem', name: 'Canada GEM', endpoint: 'https://api.open-meteo.com/v1/gem', model: 'gem_seamless', weight: .36, accent: '#64dbff' },
    { id: 'ifs', name: 'ECMWF IFS', endpoint: 'https://api.open-meteo.com/v1/ecmwf', model: 'ecmwf_ifs025', weight: .28, accent: '#d9ff76' },
    { id: 'gfs', name: 'NOAA GFS', endpoint: 'https://api.open-meteo.com/v1/gfs', model: 'gfs_seamless', weight: .20, accent: '#ffc96b' },
    { id: 'aifs', name: 'ECMWF AIFS', endpoint: 'https://api.open-meteo.com/v1/ecmwf', model: 'ecmwf_aifs025_single', weight: .16, accent: '#bca2ff' }
  ];

  const MODES = {
    rain: { label: 'Rain and futurecast', layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', radar: true, source: 'ECCC radar and HRDPS guidance' },
    storm: { label: 'Storm outlook', layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', contextLayer: 'Lightning_2.5km_Density', contextStyle: 'Lightning', radar: true, source: 'Radar, lightning and thunderstorm guidance' },
    smoke: { label: 'Wildfire smoke forecast', layer: 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume', style: '', radar: false, ahead: 6, source: 'Wildfire smoke guidance' },
    air: { label: 'Air quality', layer: 'AQHI-OBS', style: 'default', radar: false, ahead: 0, observed: true, source: 'Observed air quality index' },
    temp: { label: 'Temperature forecast', layer: 'HRDPS.CONTINENTAL_TT', style: '', radar: false, ahead: 2, source: 'High-resolution temperature' }
  };

  // The legend lives in the interface, not behind a menu. Rain uses a
  // quantitative gradient because observed rate and forecast accumulation
  // are different measurements.
  const LEGENDS = {
    rain: { title: 'Rain', stops: '#a8dcff,#087cf2,#00d990,#10a21f,#f2e800,#ff9a00,#ff2500,#ed008c,#65058f' },
    storm: { title: 'Rain + storm', stops: '#a8dcff,#087cf2,#00d990,#f2e800,#ff2500,#ed008c,#65058f' },
    smoke: { title: 'Smoke', stops: '#f3e6b8,#e8b06a,#d1705c,#8f4757' },
    air: { title: 'AQHI', stops: '#5ac8d8,#ffcf85,#ff9aa0,#b06a9a' },
    temp: { title: 'Temperature', stops: '#5b8dff,#6fdcff,#cdf283,#ffcf85,#ff846b' }
  };

  const HORIZONS = {
    now: { label: 'Now', hours: 2, step: 0, zoom: null },
    6: { label: '6 hours', hours: 6, step: 1, zoom: 8 },
    24: { label: '24 hours', hours: 24, step: 3, zoom: 7 },
    48: { label: '48 hours', hours: 48, step: 6, zoom: 7 }
  };

  const state = {
    version: '16.0.0',
    place: loadPlace(),
    mode: 'rain',
    map: null,
    weatherOverlay: null,
    contextOverlay: null,
    locationMarker: null,
    objectUrls: new Set(),
    allFrames: [],
    frames: [],
    frameIndex: 0,
    timelineHorizon: 'now',
    playing: false,
    playTimer: null,
    requestToken: 0,
    moveTimer: null,
    ignoreMapMoveUntil: 0,
    layerMeta: new Map(),
    modelData: new Map(),
    modelErrors: new Map(),
    forecastTimeZone: 'America/Toronto',
    cityWeather: null,
    cityWeatherKey: '',
    cityWeatherLoadedAt: 0,
    observation: null,
    alerts: [],
    arrival: null,
    currentBlend: null,
    daily: [],
    snapshots: [],
    radar: { state: 'loading', title: 'Connecting to ECCC radar', copy: 'Checking the official feed', transport: IS_NATIVE ? 'Native relay' : 'Direct web', lastSuccess: null, error: null },
    frameValue: null,
    frameExplanationToken: 0,
    pointValueCache: new Map(),
    pointValueRequests: new Map(),
    selectedSnapshot: null,
    airQuality: null,
    refreshId: 0
  };

  // Android exposes one origin-scoped message channel. The web build never sees it.
  // Every call is asynchronous so no privileged object is attached through addJavascriptInterface.
  const NativeBridge = (() => {
    const channel = IS_NATIVE ? window.SkyMapNative : null;
    if (!channel || typeof channel.postMessage !== 'function') return null;

    const pending = new Map();
    let sequence = 0;
    const receive = event => {
      try {
        const response = JSON.parse(event.data || '{}');
        const request = pending.get(response.id);
        if (!request) return;
        pending.delete(response.id);
        clearTimeout(request.timer);
        if (response.ok) request.resolve(response.result);
        else request.reject(new Error(response.error || 'Native request failed'));
      } catch (_) { }
    };

    if (typeof channel.addEventListener === 'function') channel.addEventListener('message', receive);
    else channel.onmessage = receive;

    return {
      call(method, ...args) {
        const id = `${Date.now().toString(36)}-${(++sequence).toString(36)}`;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error('Native request timed out'));
          }, 12000);
          pending.set(id, { resolve, reject, timer });
          try {
            channel.postMessage(JSON.stringify({ id, method, args }));
          } catch (error) {
            clearTimeout(timer);
            pending.delete(id);
            reject(error);
          }
        });
      }
    };
  })();

  function loadPlace() {
    try {
      const saved = JSON.parse(localStorage.getItem('skymap.place') || 'null');
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
    } catch (_) { }
    return { ...PLACES[0] };
  }

  function savePlace() {
    try { localStorage.setItem('skymap.place', JSON.stringify(state.place)); } catch (_) { }
    if (NativeBridge) void NativeBridge.call('rememberLocation', JSON.stringify(state.place)).catch(() => { });
  }

  function cacheKey(model) {
    return `skymap.model.${model.id}.${state.place.lat.toFixed(2)}.${state.place.lon.toFixed(2)}`;
  }

  // Anything that reaches innerHTML and did not originate in this file is escaped.
  // ECCC condition strings, alert names and area names are remote input.
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function text(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function forecastZone() {
    return state.forecastTimeZone || 'America/Toronto';
  }

  function formatForecastDate(value, options) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: forecastZone(), ...options }).format(date); }
    catch (_) { return new Intl.DateTimeFormat('en-CA', options).format(date); }
  }

  function fmtTime(value) {
    return formatForecastDate(value, { hour: 'numeric', minute: '2-digit' });
  }

  function frameStamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return 'LATEST';
    const dateLabel = dateKeyInZone(date) === dateKeyInZone(new Date()) ? 'Today' : `${dayName(date)} ${monthDay(date)}`;
    return `${dateLabel} · ${fmtTime(date)}`;
  }

  function leadHours(frame, from = Date.now()) {
    const time = new Date(frame?.time || from).getTime();
    return Number.isFinite(time) ? Math.max(0, (time - from) / 3600000) : 0;
  }

  function frameKindLabel(frame) {
    if (frame?.kind === 'futurecast') return 'Model forecast';
    if (frame?.kind === 'nowcast') return 'Short-range';
    return 'Measured';
  }

  function frameConfidence(frame) {
    if (frame?.kind === 'observed') return { short: 'MEASURED', detail: 'Measured by radar', level: 'measured' };
    if (frame?.kind === 'nowcast') return { short: 'HIGH', detail: 'High · radar motion', level: 'high' };
    const hours = leadHours(frame);
    if (hours <= 9) return { short: 'MED–HIGH', detail: 'Medium-high · HRDPS', level: 'medium-high' };
    if (hours <= 27) return { short: 'MEDIUM', detail: 'Medium · HRDPS', level: 'medium' };
    return { short: 'LOWER', detail: 'Lower · long lead', level: 'lower' };
  }

  function frameAriaLabel(frame) {
    const source = frame?.kind === 'futurecast'
      ? 'HRDPS precipitation forecast'
      : frame?.kind === 'nowcast'
        ? 'Projected radar'
        : 'Observed radar';
    return `${source} at ${frame?.time ? frameStamp(frame.time) : 'the latest available time'}`;
  }

  function dayName(date) {
    return formatForecastDate(date, { weekday: 'short' });
  }

  function monthDay(date) {
    return formatForecastDate(date, { month: 'short', day: 'numeric' });
  }

  function dateKeyInZone(value, timeZone = forecastZone()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function dateFromKey(key) {
    return new Date(`${key}T12:00:00Z`);
  }

  function forecastDayKeys(count = 7) {
    const first = dateFromKey(dateKeyInZone(new Date()));
    return Array.from({ length: count }, (_, index) => dateKeyInZone(new Date(first.getTime() + index * 86400000), 'UTC'));
  }

  function hourInZone(value, timeZone = forecastZone()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(value);
    return Number(parts.find(item => item.type === 'hour')?.value);
  }

  function modelDate(data, value) {
    const numeric = Number(value);
    if (value !== '' && Number.isFinite(numeric) && numeric > 100000000) return new Date(numeric * (numeric < 1000000000000 ? 1000 : 1));
    return new Date(value);
  }

  function forecastHour(dayOffset, hour) {
    const key = forecastDayKeys(dayOffset + 1)[dayOffset];
    for (const model of MODELS) {
      const data = state.modelData.get(model.id);
      const times = data?.hourly?.time || [];
      let best = null;
      let delta = Infinity;
      for (const value of times) {
        const date = modelDate(data, value);
        if (dateKeyInZone(date, data.timezone || forecastZone()) !== key) continue;
        const nextDelta = Math.abs(hourInZone(date, data.timezone || forecastZone()) - hour);
        if (nextDelta < delta) { best = date; delta = nextDelta; }
      }
      if (best) return best;
    }
    return null;
  }

  function weather(code = 0) {
    if ([95, 96, 99].includes(code)) return { name: 'Thunderstorms', icon: 'storm' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { name: 'Snow', icon: 'snow' };
    if ([61, 63, 65, 80, 81, 82].includes(code)) return { name: 'Rain', icon: 'rain' };
    if ([51, 53, 55, 56, 57].includes(code)) return { name: 'Drizzle', icon: 'drizzle' };
    if ([45, 48].includes(code)) return { name: 'Fog', icon: 'fog' };
    if ([2, 3].includes(code)) return { name: code === 3 ? 'Cloudy' : 'Partly cloudy', icon: code === 3 ? 'cloud' : 'partly' };
    return { name: 'Mostly clear', icon: 'clear' };
  }

  function weatherIconMarkup(kind) {
    const cloud = '<path d="M7.1 15.7h9.3a3.5 3.5 0 0 0 .5-7 5.3 5.3 0 0 0-10.1 1.4 2.85 2.85 0 0 0 .3 5.6Z"/>';
    const paths = {
      clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
      partly: '<circle cx="9" cy="8.5" r="3.3"/>' + cloud,
      cloud,
      drizzle: cloud + '<path d="M9 18.2l-.6 1.3M13 18.2l-.6 1.3M17 18.2l-.6 1.3"/>',
      rain: cloud + '<path d="m8.5 18-1 2M12.5 18l-1 2M16.5 18l-1 2"/>',
      storm: cloud + '<path d="m13.2 15.5-3 3.5h2.5l-1.2 2.5 4-4.3h-2.7l.4-1.7Z"/>',
      snow: cloud + '<path d="M9 18.7h3M10.5 17.2v3M15 18.7h3M16.5 17.2v3"/>',
      fog: '<path d="M4 8h13M7 12h13M4 16h13M8 20h10"/>'
    };
    return `<svg class="weather-glyph" viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.clear}</svg>`;
  }

  function setRadarState(next, title, copy, extra = {}) {
    state.radar = { ...state.radar, state: next, title, copy, ...extra };
    const button = $('#radar-state');
    if (button) button.dataset.state = next;
    text('#radar-state-title', title);
    text('#radar-state-copy', copy);
    renderDetails();
  }

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2700);
  }

  function geometEndpoints() {
    return IS_NATIVE ? [NATIVE_GEOMET, DIRECT_GEOMET] : [DIRECT_GEOMET];
  }

  async function fetchWithTimeout(url, options = {}, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url, timeout = 12000) {
    const response = await fetchWithTimeout(url, { cache: 'no-store' }, timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function fetchCompleteJson(url, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(body);
    } finally {
      clearTimeout(timer);
    }
  }

  function parseDuration(value) {
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value || '');
    if (!match) return 60;
    return ((Number(match[1]) || 0) * 1440) + ((Number(match[2]) || 0) * 60) + (Number(match[3]) || 0);
  }

  function formatWmsTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().replace(/\.\d{3}Z$/, 'Z') : String(value);
  }

  function expandDimension(value) {
    const content = (value || '').trim();
    if (!content) return [];
    if (content.includes(',')) return content.split(',').map(item => formatWmsTime(item.trim())).filter(Boolean);
    if (!content.includes('/')) return [formatWmsTime(content)];
    const [startValue, endValue, period] = content.split('/');
    const start = new Date(startValue).getTime();
    const end = new Date(endValue).getTime();
    const step = parseDuration(period) * 60000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || !step) return [];
    const output = [];
    for (let time = start; time <= end && output.length < 1400; time += step) output.push(formatWmsTime(time));
    return output;
  }

  function directChildText(node, name) {
    for (const child of node.children || []) if (child.localName === name) return child.textContent?.trim() || '';
    return '';
  }

  function findLayerNode(xml, name) {
    for (const node of xml.getElementsByTagNameNS('*', 'Layer')) if (directChildText(node, 'Name') === name) return node;
    return null;
  }

  async function getLayerMeta(layer, force = false) {
    const cached = state.layerMeta.get(layer);
    if (!force && cached && Date.now() - cached.loadedAt < 10 * 60 * 1000) return cached;
    let lastError;
    for (const endpoint of geometEndpoints()) {
      try {
        const query = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetCapabilities', LAYERS: layer, layer, lang: 'en', _: Date.now() });
        const response = await fetchWithTimeout(`${endpoint}?${query}`, { cache: 'no-store' }, 14000);
        if (!response.ok) throw new Error(`Capabilities HTTP ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error('Capabilities XML error');
        const node = findLayerNode(xml, layer);
        if (!node) throw new Error(`Layer ${layer} not found`);
        const dimensions = [...node.getElementsByTagNameNS('*', 'Dimension'), ...node.getElementsByTagNameNS('*', 'Extent')];
        const timeNode = dimensions.find(item => (item.getAttribute('name') || '').toLowerCase() === 'time');
        const referenceNode = dimensions.find(item => (item.getAttribute('name') || '').toLowerCase() === 'reference_time');
        const meta = {
          layer,
          times: expandDimension(timeNode?.textContent),
          referenceTimes: expandDimension(referenceNode?.textContent),
          defaultTime: timeNode?.getAttribute('default') || null,
          defaultReferenceTime: referenceNode?.getAttribute('default') || null,
          endpoint,
          loadedAt: Date.now()
        };
        state.layerMeta.set(layer, meta);
        return meta;
      } catch (error) {
        lastError = error;
      }
    }
    const fallback = { layer, times: [], referenceTimes: [], defaultTime: null, defaultReferenceTime: null, endpoint: null, loadedAt: Date.now(), error: String(lastError || 'Capabilities unavailable') };
    state.layerMeta.set(layer, fallback);
    return fallback;
  }

  function nearest(values, target) {
    if (!values?.length) return null;
    const targetTime = target instanceof Date ? target.getTime() : new Date(target).getTime();
    return values.reduce((best, value) => Math.abs(new Date(value).getTime() - targetTime) < Math.abs(new Date(best).getTime() - targetTime) ? value : best, values[0]);
  }

  function mapImageSize() {
    const size = state.map.getSize();
    const ratio = Math.min(1.35, window.devicePixelRatio || 1);
    return {
      width: clamp(Math.round(size.x * ratio), 360, 1100),
      height: clamp(Math.round(size.y * ratio), 300, 900)
    };
  }

  function wmsMapUrl(endpoint, frame, { latest = false, omitStyle = false } = {}) {
    const bounds = state.map.getBounds();
    const size = mapImageSize();
    const query = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: frame.layer,
      STYLES: omitStyle ? '' : (frame.style || ''), CRS: 'EPSG:4326',
      BBOX: `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`,
      WIDTH: size.width, HEIGHT: size.height, FORMAT: 'image/png', TRANSPARENT: 'TRUE', _: Date.now()
    });
    if (!latest && frame.time) query.set('TIME', formatWmsTime(frame.time));
    if (!latest && frame.referenceTime) query.set('DIM_REFERENCE_TIME', formatWmsTime(frame.referenceTime));
    return `${endpoint}?${query}`;
  }

  async function decodeImageUrl(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => { image.src = ''; reject(new Error('Image timeout')); }, timeout);
      image.onload = () => {
        clearTimeout(timer);
        if (!image.naturalWidth || !image.naturalHeight) reject(new Error('Empty image'));
        else resolve(url);
      };
      image.onerror = () => { clearTimeout(timer); reject(new Error('Image decode failed')); };
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.src = url;
    });
  }

  async function resolvedImageUrl(url) {
    try {
      const response = await fetchWithTimeout(url, { cache: 'no-store' }, 15000);
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('image')) throw new Error(`Unexpected ${type || 'response'}`);
      const blob = await response.blob();
      if (blob.size < 250) throw new Error('Image response too small');
      const objectUrl = URL.createObjectURL(blob);
      state.objectUrls.add(objectUrl);
      await decodeImageUrl(objectUrl);
      return { url: objectUrl, objectUrl: true };
    } catch (fetchError) {
      await decodeImageUrl(url);
      return { url, objectUrl: false, fetchError };
    }
  }

  async function loadFrameImage(frame) {
    let lastError;
    // A timestamped forecast must never silently degrade to a different
    // "latest" frame. That would make the time label look precise while the
    // image underneath it is wrong.
    const variants = frame.kind === 'observed'
      ? [
          { latest: false, omitStyle: false },
          { latest: true, omitStyle: false },
          { latest: true, omitStyle: true }
        ]
      : [
          { latest: false, omitStyle: false },
          { latest: false, omitStyle: true }
        ];
    for (const endpoint of geometEndpoints()) {
      for (const variant of variants) {
        try {
          const resolved = await resolvedImageUrl(wmsMapUrl(endpoint, frame, variant));
          return { ...resolved, endpoint, variant };
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw lastError || new Error('No radar route succeeded');
  }

  function replaceWeatherOverlay(loaded, opacity = .9) {
    const previous = state.weatherOverlay;
    const next = L.imageOverlay(loaded.url, state.map.getBounds(), { opacity: 0, interactive: false, pane: 'weatherPane' }).addTo(state.map);
    next._skyObjectUrl = loaded.objectUrl ? loaded.url : null;
    state.weatherOverlay = next;
    requestAnimationFrame(() => {
      const element = next.getElement();
      if (element) {
        element.style.transition = 'opacity 520ms ease';
        element.style.opacity = String(opacity);
      }
      next.setOpacity(opacity);
    });
    if (previous && previous !== next) setTimeout(() => {
      try { state.map.removeLayer(previous); } catch (_) { }
      if (previous._skyObjectUrl) {
        URL.revokeObjectURL(previous._skyObjectUrl);
        state.objectUrls.delete(previous._skyObjectUrl);
      }
    }, 600);
  }

  function removeContextOverlay() {
    if (!state.contextOverlay) return;
    const old = state.contextOverlay;
    try { state.map.removeLayer(old); } catch (_) { }
    if (old._skyObjectUrl) { URL.revokeObjectURL(old._skyObjectUrl); state.objectUrls.delete(old._skyObjectUrl); }
    state.contextOverlay = null;
  }

  async function loadContextLayer(frame) {
    removeContextOverlay();
    if (!frame?.layer) return;
    try {
      const loaded = await loadFrameImage(frame);
      state.contextOverlay = L.imageOverlay(loaded.url, state.map.getBounds(), { opacity: .72, interactive: false, pane: 'contextPane' }).addTo(state.map);
      state.contextOverlay._skyObjectUrl = loaded.objectUrl ? loaded.url : null;
    } catch (_) { }
  }

  function placeLocationMarker() {
    if (!state.map) return;
    if (!state.locationMarker) {
      const icon = L.divIcon({
        className: 'skymap-location-marker',
        html: '<span><i></i></span>',
        iconSize: [42, 42],
        iconAnchor: [21, 21]
      });
      state.locationMarker = L.marker([state.place.lat, state.place.lon], {
        icon,
        interactive: false,
        keyboard: false,
        pane: 'labelPane',
        zIndexOffset: 1000
      }).addTo(state.map);
    } else {
      state.locationMarker.setLatLng([state.place.lat, state.place.lon]);
    }
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 4, maxZoom: 13, doubleClickZoom: true, preferCanvas: true, fadeAnimation: false }).setView([state.place.lat, state.place.lon], state.place.zoom || 8);
    state.map.createPane('weatherPane');
    state.map.getPane('weatherPane').style.zIndex = 340;
    state.map.createPane('contextPane');
    state.map.getPane('contextPane').style.zIndex = 350;
    state.map.createPane('labelPane');
    state.map.getPane('labelPane').style.zIndex = 380;
    // Base geography sits under the weather; the names sit on top of it, so a heavy
    // radar cell can never hide which town it is sitting over.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, opacity: .98 }).addTo(state.map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, opacity: .96, pane: 'labelPane' }).addTo(state.map);
    placeLocationMarker();
    state.map.on('moveend', () => {
      if (Date.now() < state.ignoreMapMoveUntil) return;
      clearTimeout(state.moveTimer);
      state.moveTimer = setTimeout(() => {
        if (!state.playing) refreshVisibleMap(false);
      }, 520);
    });
  }

  async function buildRadarFrames(force = false) {
    if (state.allFrames.length && !force) return state.frames;
    state.frameValue = null;
    setRadarState('loading', 'Building the weather timeline', 'Reading measured, short-range and 48-hour frame times');
    const [observed, future, futurecast] = await Promise.allSettled([
      getLayerMeta('RADAR_1KM_RRAI', force),
      getLayerMeta('Radar_1km_RainPrecipRate-Extrapolation', force),
      getLayerMeta(FUTURECAST_LAYER, force)
    ]);
    const observedMeta = observed.status === 'fulfilled' ? observed.value : { times: [] };
    const futureMeta = future.status === 'fulfilled' ? future.value : { times: [] };
    const futurecastMeta = futurecast.status === 'fulfilled' ? futurecast.value : { times: [] };
    const now = Date.now();
    const pastTimes = (observedMeta.times || []).filter(value => {
      const time = new Date(value).getTime();
      return time <= now + 5 * 60000 && time >= now - 75 * 60000;
    }).slice(-7);
    const futureTimesAll = (futureMeta.times || []).filter(value => {
      const time = new Date(value).getTime();
      return time >= now - 7 * 60000 && time <= now + 125 * 60000;
    });
    const futureTimes = [];
    if (futureTimesAll.length) {
      const step = Math.max(1, Math.ceil(futureTimesAll.length / 5));
      for (let index = 0; index < futureTimesAll.length; index += step) futureTimes.push(futureTimesAll[index]);
      if (futureTimes.at(-1) !== futureTimesAll.at(-1)) futureTimes.push(futureTimesAll.at(-1));
    }
    const futurecastTimes = (futurecastMeta.times || []).filter(value => {
      const time = new Date(value).getTime();
      return time >= now + 100 * 60000 && time <= now + 49 * 3600000;
    });
    state.allFrames = [
      ...pastTimes.map(time => ({ layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', time, referenceTime: observedMeta.defaultReferenceTime || observedMeta.referenceTimes?.at(-1) || null, kind: 'observed' })),
      ...futureTimes.map(time => ({ layer: 'Radar_1km_RainPrecipRate-Extrapolation', style: '', time, referenceTime: futureMeta.defaultReferenceTime || futureMeta.referenceTimes?.at(-1) || null, kind: 'nowcast' })),
      ...futurecastTimes.map(time => ({ layer: FUTURECAST_LAYER, style: FUTURECAST_STYLE, time, referenceTime: futurecastMeta.defaultReferenceTime || futurecastMeta.referenceTimes?.at(-1) || null, kind: 'futurecast' }))
    ];
    if (!state.allFrames.length) {
      state.allFrames = [{ layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', time: observedMeta.defaultTime || null, referenceTime: observedMeta.defaultReferenceTime || null, kind: 'observed' }];
    }
    applyTimelineHorizon(state.timelineHorizon, { load: false, autoFrame: false });
    return state.frames;
  }

  function nearestFrame(frames, target) {
    if (!frames.length) return null;
    const wanted = target instanceof Date ? target.getTime() : Number(target);
    return frames.reduce((best, frame) => {
      const time = new Date(frame.time || wanted).getTime();
      const bestTime = new Date(best.time || wanted).getTime();
      return Math.abs(time - wanted) < Math.abs(bestTime - wanted) ? frame : best;
    }, frames[0]);
  }

  function pushUniqueFrame(output, frame) {
    if (frame && !output.some(item => frameKey(item) === frameKey(frame))) output.push(frame);
  }

  function framesForHorizon(horizon) {
    const config = HORIZONS[horizon] || HORIZONS.now;
    const now = Date.now();
    const observed = state.allFrames.filter(frame => frame.kind === 'observed');
    const nowcast = state.allFrames.filter(frame => frame.kind === 'nowcast');
    const futurecast = state.allFrames.filter(frame => frame.kind === 'futurecast');
    if (horizon === 'now' || !futurecast.length) {
      const near = [...observed, ...nowcast];
      return near.length ? near : futurecast.slice(0, 1);
    }

    const output = [];
    pushUniqueFrame(output, observed.at(-1));
    if (horizon === '6') {
      nowcast.forEach(frame => pushUniqueFrame(output, frame));
    } else {
      pushUniqueFrame(output, nowcast.at(-1));
    }
    for (let hour = config.step; hour <= config.hours; hour += config.step) {
      const frame = nearestFrame(futurecast, now + hour * 3600000);
      if (frame && new Date(frame.time).getTime() <= now + (config.hours + 1) * 3600000) pushUniqueFrame(output, frame);
    }
    return output.length ? output : [...observed, ...nowcast];
  }

  function renderHorizonControls() {
    const hasFuturecast = state.allFrames.some(frame => frame.kind === 'futurecast');
    $$('[data-horizon]').forEach(button => {
      const active = button.dataset.horizon === state.timelineHorizon;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = button.dataset.horizon !== 'now' && !hasFuturecast;
    });
  }

  function renderTimelineRange() {
    const first = state.frames[0];
    const last = state.frames.at(-1);
    if (state.timelineHorizon === 'now') {
      text('#timeline-past', first?.time ? fmtTime(first.time) : 'Past hour');
      text('#timeline-centre', 'NOW');
      text('#timeline-future', last?.time ? fmtTime(last.time) : 'Radar nowcast');
      return;
    }
    text('#timeline-past', 'NOW');
    text('#timeline-centre', 'HRDPS 2.5 KM');
    text('#timeline-future', last?.time ? frameStamp(last.time) : HORIZONS[state.timelineHorizon].label);
  }

  function applyTimelineHorizon(horizon, { load = true, autoFrame = true } = {}) {
    const requested = HORIZONS[horizon] ? String(horizon) : 'now';
    const hasFuturecast = state.allFrames.some(frame => frame.kind === 'futurecast');
    state.timelineHorizon = requested !== 'now' && !hasFuturecast ? 'now' : requested;
    state.frames = framesForHorizon(state.timelineHorizon);
    const target = state.timelineHorizon === 'now'
      ? Date.now()
      : Date.now() + HORIZONS[state.timelineHorizon].hours * 3600000;
    const selected = nearestFrame(state.frames, target);
    state.frameIndex = Math.max(0, state.frames.indexOf(selected));
    renderRibbon();
    renderHorizonControls();
    renderTimelineRange();
    renderPlayback(state.frames[state.frameIndex]);
    renderLegend();
    if (autoFrame && state.map) {
      const zoom = HORIZONS[state.timelineHorizon].zoom ?? state.place.zoom ?? 8;
      state.ignoreMapMoveUntil = Date.now() + 1200;
      state.map.flyTo([state.place.lat, state.place.lon], Math.min(state.place.zoom || zoom, zoom), { duration: .65 });
    }
    if (load && state.frames.length) void showRadarFrame(state.frameIndex, true);
  }

  // Each frame gets a large proportional target. Observed, extrapolated and
  // model-guidance frames have different textures; boundaries are explicit.
  function renderRibbon() {
    const ribbon = $('#timeline');
    if (!ribbon) return;
    ribbon.innerHTML = '';
    state.frames.forEach((frame, index) => {
      const previous = state.frames[index - 1];
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'tick';
      tick.dataset.kind = frame.kind;
      if (previous && previous.kind !== frame.kind) tick.dataset.boundary = 'true';
      tick.setAttribute('aria-pressed', String(index === state.frameIndex));
      tick.setAttribute('aria-label', frameAriaLabel(frame));
      tick.addEventListener('click', () => { stopPlayback(); showRadarFrame(index, true); });
      ribbon.append(tick);
    });
  }

  function setRibbonMode(radarMode) {
    const ribbon = $('#timeline');
    const legend = $('#ribbon-legend');
    const staticNote = $('#static-time');
    const play = $('#play-button');
    const horizons = $('.horizon-switch');
    if (ribbon) ribbon.hidden = !radarMode;
    if (legend) legend.hidden = !radarMode;
    if (staticNote) staticNote.hidden = radarMode;
    if (play) play.hidden = !radarMode;
    if (horizons) horizons.hidden = !radarMode;
  }

  function renderLegend() {
    const legend = $('#map-legend');
    if (!legend) return;
    const config = LEGENDS[state.mode] || LEGENDS.rain;
    const frame = state.frames[state.frameIndex];
    const futurecast = isRadarMode() && frame?.kind === 'futurecast';
    const ranges = state.mode === 'rain' || state.mode === 'storm'
      ? futurecast
        ? ['0.1', '10', '40+ mm / hour']
        : ['0.1', '8', '64+ mm/h']
      : state.mode === 'air'
        ? ['1 low', '6 moderate', '10+ high']
        : state.mode === 'temp'
          ? ['colder', 'mild', 'warmer']
          : ['thin', 'noticeable', 'thick'];
    legend.innerHTML = `<span class="legend-heading"><b>${config.title}</b><small>${futurecast ? 'FORECAST HOUR' : state.mode === 'rain' || state.mode === 'storm' ? 'LIVE RATE' : 'MAP SCALE'}</small></span><span class="legend-scale"><i style="--legend-stops:${config.stops}"></i><em><b>${ranges[0]}</b><b>${ranges[1]}</b><b>${ranges[2]}</b></em></span>`;
  }

  function renderPlayback(frame) {
    $$('#timeline .tick').forEach((tick, index) => tick.setAttribute('aria-pressed', String(index === state.frameIndex)));
    const frameDate = frame?.time ? new Date(frame.time) : new Date();
    const minutes = Math.round((frameDate.getTime() - Date.now()) / 60000);
    const hours = Math.max(1, Math.round(minutes / 60));
    text('#playback-label', Math.abs(minutes) <= 4
      ? 'Now'
      : minutes < 0
        ? `${Math.abs(minutes)} min ago`
        : minutes < 120
          ? `In ${minutes} min`
          : hours < 24
            ? `In ${hours} hr`
            : hours < 36
              ? 'Tomorrow'
              : `In ${hours} hr`);
    text('#playback-clock', frameStamp(frameDate));
    const kind = frame?.kind || 'observed';
    document.body.dataset.frameKind = kind;
    text('#playback-kind', frameKindLabel(frame));
    const badge = $('#playback-kind');
    if (badge) badge.dataset.kind = kind;
    const confidence = frameConfidence(frame);
    text('#frame-confidence', confidence.short);
    const confidenceBadge = $('#frame-confidence');
    if (confidenceBadge) confidenceBadge.dataset.kind = confidence.level;
    renderLegend();
  }

  async function showRadarFrame(index, force = false) {
    if (!state.frames.length) await buildRadarFrames();
    const safe = clamp(index, 0, state.frames.length - 1);
    if (!force && safe === state.frameIndex && state.weatherOverlay) return;
    state.frameIndex = safe;
    const frame = state.frames[safe];
    const token = ++state.requestToken;
    renderPlayback(frame);
    const loadingTitle = frame.kind === 'futurecast'
      ? 'Loading 48-hour futurecast'
      : frame.kind === 'nowcast'
        ? 'Loading official radar nowcast'
        : 'Loading observed ECCC radar';
    setRadarState('loading', loadingTitle, frame.time ? `${frameStamp(frame.time)} · ${IS_NATIVE ? 'native relay first' : 'direct public feed'}` : 'Using the latest available image');
    try {
      const loaded = await loadFrameImage(frame);
      if (token !== state.requestToken) return;
      replaceWeatherOverlay(loaded, frame.kind === 'futurecast' ? .84 : .92);
      const transport = loaded.endpoint === NATIVE_GEOMET ? 'Native relay' : IS_NATIVE ? 'Direct fallback' : 'Direct web';
      const liveTitle = frame.kind === 'futurecast'
        ? 'HRDPS futurecast is live'
        : frame.kind === 'nowcast'
          ? 'Radar nowcast is live'
          : 'Observed radar is live';
      setRadarState('ok', liveTitle, `${transport} · ${frame.time ? frameStamp(frame.time) : 'latest image'}`, { transport, lastSuccess: Date.now(), error: null });
      if (state.mode === 'storm' && frame.kind === 'futurecast') {
        loadContextLayer({ layer: FUTURE_STORM_LAYER, style: FUTURE_STORM_STYLE, time: frame.time, referenceTime: frame.referenceTime, kind: 'context' });
      } else if (state.mode === 'storm') {
        loadContextLayer({ layer: 'Lightning_2.5km_Density', style: 'Lightning', time: frame.time, kind: 'context' });
      }
      else removeContextOverlay();
      updateStory();
      await updateFrameExplanation(frame);
    } catch (error) {
      const hasPrevious = Boolean(state.weatherOverlay);
      setRadarState(hasPrevious ? 'stale' : 'error', hasPrevious ? 'Fresh radar delayed' : 'Radar could not load', hasPrevious ? 'Keeping the last successful frame · tap to retry' : 'Forecasts still work · tap to retry', { error: String(error) });
      updateStory();
    }
  }

  function stopPlayback() {
    state.playing = false;
    clearTimeout(state.playTimer);
    $('#play-button')?.classList.remove('playing');
  }

  async function playRadar() {
    if (state.playing) return stopPlayback();
    if (!state.frames.length) await buildRadarFrames();
    state.playing = true;
    $('#play-button')?.classList.add('playing');
    if (state.frameIndex >= state.frames.length - 1) state.frameIndex = 0;
    const advance = async () => {
      if (!state.playing) return;
      const current = state.frames[state.frameIndex];
      await showRadarFrame(state.frameIndex, true);
      if (!state.playing) return;
      if (state.frameIndex >= state.frames.length - 1) {
        stopPlayback();
        updateFrameExplanation(current);
        return;
      }
      const next = state.frames[state.frameIndex + 1];
      const crossingSource = current.kind !== next.kind;
      state.frameIndex += 1;
      state.playTimer = setTimeout(advance, crossingSource ? 1750 : current.kind === 'futurecast' ? 1250 : 1050);
    };
    advance();
  }

  async function loadStaticMode(mode) {
    stopPlayback();
    const config = MODES[mode];
    const meta = await getLayerMeta(config.layer, true);
    const target = new Date(Date.now() + (config.ahead || 0) * 3600000);
    const frame = { layer: config.layer, style: config.style, time: nearest(meta.times, target) || meta.defaultTime, referenceTime: meta.defaultReferenceTime || meta.referenceTimes?.at(-1) || null, kind: config.observed ? 'observed' : 'model' };
    document.body.dataset.frameKind = frame.kind;
    text('#playback-label', config.label);
    text('#playback-clock', frame.time ? frameStamp(frame.time) : 'Latest available');
    text('#playback-kind', config.observed ? 'Observed' : 'Forecast');
    const badge = $('#playback-kind');
    if (badge) badge.dataset.kind = config.observed ? 'observed' : 'model';
    text('#frame-confidence', config.observed ? 'MEASURED' : 'GUIDANCE');
    const confidenceBadge = $('#frame-confidence');
    if (confidenceBadge) confidenceBadge.dataset.kind = config.observed ? 'measured' : 'medium';
    text('#static-time', config.observed
      ? 'Latest official readings. This view has no playback.'
      : `Model guidance for about ${config.ahead} hour${config.ahead === 1 ? '' : 's'} ahead. This view has no playback.`);
    setRadarState('loading', `Loading ${config.label.toLowerCase()}`, config.observed ? 'Official observations' : 'Official forecast guidance');
    const token = ++state.requestToken;
    try {
      const loaded = await loadFrameImage(frame);
      if (token !== state.requestToken) return;
      replaceWeatherOverlay(loaded, mode === 'temp' ? .74 : .82);
      removeContextOverlay();
      setRadarState('ok', `${config.label} is live`, `${loaded.endpoint === NATIVE_GEOMET ? 'Native relay' : IS_NATIVE ? 'Direct fallback' : 'Direct web'} · ${frame.time ? fmtTime(frame.time) : 'latest available'}`, { lastSuccess: Date.now(), error: null });
      updateStory();
    } catch (error) {
      setRadarState(state.weatherOverlay ? 'stale' : 'error', `${config.label} is delayed`, state.weatherOverlay ? 'Keeping the last successful weather image' : 'Forecast cards remain available', { error: String(error) });
    }
  }

  function isRadarMode() {
    return Boolean(MODES[state.mode]?.radar);
  }

  async function refreshVisibleMap(force = false) {
    if (!state.map) return;
    setRibbonMode(isRadarMode());
    renderLegend();
    if (isRadarMode()) {
      await buildRadarFrames(force);
      await showRadarFrame(state.frameIndex, true);
    } else {
      await loadStaticMode(state.mode);
    }
  }

  function modelUrl(model) {
    const params = new URLSearchParams({
      latitude: state.place.lat,
      longitude: state.place.lon,
      timezone: 'auto',
      timeformat: 'unixtime',
      forecast_days: '8',
      models: model.model,
      hourly: 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover'
    });
    return `${model.endpoint}?${params}`;
  }

  async function readCachedModel(model) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(model)) || 'null');
      if (cached?.data?.hourly?.time?.length && Date.now() - cached.savedAt < 6 * 3600000) {
        state.modelData.set(model.id, cached.data);
        if (cached.data.timezone) state.forecastTimeZone = cached.data.timezone;
        return cached.data;
      }
    } catch (_) { }
    try {
      const raw = NativeBridge
        ? await NativeBridge.call('getCache', `${model.id}:${state.place.lat.toFixed(2)},${state.place.lon.toFixed(2)}`)
        : '';
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.hourly?.time?.length) {
        state.modelData.set(model.id, parsed);
        if (parsed.timezone) state.forecastTimeZone = parsed.timezone;
        return parsed;
      }
    } catch (_) { }
    return null;
  }

  function storeModel(model, data) {
    try { localStorage.setItem(cacheKey(model), JSON.stringify({ savedAt: Date.now(), data })); } catch (_) { }
  }

  async function fetchModel(model) {
    try {
      const data = await fetchJson(modelUrl(model), model.id === 'gem' ? 11000 : 14000);
      if (!data?.hourly?.time?.length) throw new Error('No hourly data');
      state.modelData.set(model.id, data);
      if (data.timezone) state.forecastTimeZone = data.timezone;
      state.modelErrors.delete(model.id);
      storeModel(model, data);
      renderForecast();
      return data;
    } catch (error) {
      state.modelErrors.set(model.id, String(error));
      return state.modelData.get(model.id) || null;
    }
  }

  function modelPoint(data, target) {
    const hourly = data?.hourly;
    if (!hourly?.time?.length) return null;
    const targetTime = target instanceof Date ? target.getTime() : new Date(target).getTime();
    let best = 0;
    let bestDelta = Infinity;
    hourly.time.forEach((value, index) => {
      const delta = Math.abs(modelDate(data, value).getTime() - targetTime);
      if (delta < bestDelta) { bestDelta = delta; best = index; }
    });
    const value = key => Number(hourly[key]?.[best]);
    const code = value('weather_code');
    return {
      time: modelDate(data, hourly.time[best]),
      temp: value('temperature_2m'),
      rain: Math.max(0, value('precipitation') || 0),
      code: Number.isFinite(code) ? code : 0,
      wind: Math.max(0, value('wind_speed_10m') || 0),
      gust: Math.max(0, value('wind_gusts_10m') || 0),
      dir: value('wind_direction_10m') || 270,
      cloud: clamp(value('cloud_cover') || 0, 0, 100)
    };
  }

  function availableRows(target) {
    return MODELS.map(model => ({ model, point: modelPoint(state.modelData.get(model.id), target) })).filter(row => row.point);
  }

  function blendedAt(target) {
    const rows = availableRows(target);
    if (!rows.length) return null;
    const total = rows.reduce((sum, row) => sum + row.model.weight, 0);
    const average = key => rows.reduce((sum, row) => sum + (Number.isFinite(row.point[key]) ? row.point[key] : 0) * row.model.weight, 0) / total;
    const wetWeight = rows.reduce((sum, row) => sum + (row.point.rain >= .12 ? row.model.weight : 0), 0) / total;
    const wetModels = rows.filter(row => row.point.rain >= .12).length;
    const dominant = [...rows].sort((a, b) => b.model.weight - a.model.weight)[0].point.code;
    return {
      rows,
      date: target instanceof Date ? target : new Date(target),
      temp: average('temp'), rain: average('rain'), wind: average('wind'), gust: average('gust'), cloud: average('cloud'),
      wet: Math.round(wetWeight * 100), wetModels, agreement: Math.round(Math.max(wetWeight, 1 - wetWeight) * 100), weather: weather(dominant)
    };
  }

  function guidanceLabel(blend) {
    if (!blend?.rows?.length) return 'Guidance unavailable';
    if (!blend.wetModels) return `All ${blend.rows.length} guidance models keep this hour dry`;
    return `${blend.wetModels} of ${blend.rows.length} guidance models show rain`;
  }

  function precipitationContext(target, blend) {
    const official = nearestCitySnapshot(target);
    if (official?.precipitation !== null && official?.precipitation !== undefined) return `${Math.round(official.precipitation)}% official precipitation chance`;
    return guidanceLabel(blend);
  }

  function dailyForModel(model, data) {
    const hourly = data?.hourly;
    if (!hourly?.time?.length) return new Map();
    const groups = new Map();
    hourly.time.forEach((value, index) => {
      const date = modelDate(data, value);
      const key = dateKeyInZone(date, data.timezone || forecastZone());
      const group = groups.get(key) || { date: dateFromKey(key), temps: [], rain: 0, wetHours: 0, totalHours: 0, gust: 0, codes: new Map(), model };
      const temp = Number(hourly.temperature_2m?.[index]);
      const rain = Math.max(0, Number(hourly.precipitation?.[index]) || 0);
      const gust = Math.max(0, Number(hourly.wind_gusts_10m?.[index]) || 0);
      const code = Number(hourly.weather_code?.[index]) || 0;
      if (Number.isFinite(temp)) group.temps.push(temp);
      group.rain += rain;
      group.wetHours += rain >= .12 ? 1 : 0;
      group.totalHours += 1;
      group.gust = Math.max(group.gust, gust);
      group.codes.set(code, (group.codes.get(code) || 0) + 1);
      groups.set(key, group);
    });
    return groups;
  }

  function buildDaily() {
    const perModel = MODELS.map(model => ({ model, groups: dailyForModel(model, state.modelData.get(model.id)) })).filter(item => item.groups.size);
    const output = [];
    const keys = forecastDayKeys(7);
    for (let offset = 0; offset < keys.length; offset += 1) {
      const key = keys[offset];
      const date = dateFromKey(key);
      const rows = perModel.map(item => ({ model: item.model, group: item.groups.get(key) })).filter(row => row.group?.temps.length);
      if (!rows.length) {
        output.push({ date, unavailable: true });
        continue;
      }
      const total = rows.reduce((sum, row) => sum + row.model.weight, 0);
      const weighted = fn => rows.reduce((sum, row) => sum + fn(row.group) * row.model.weight, 0) / total;
      const codeWeights = new Map();
      rows.forEach(row => row.group.codes.forEach((count, code) => codeWeights.set(code, (codeWeights.get(code) || 0) + count * row.model.weight)));
      const code = [...codeWeights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
      output.push({
        date,
        high: weighted(group => Math.max(...group.temps)),
        low: weighted(group => Math.min(...group.temps)),
        rain: weighted(group => group.rain),
        wet: clamp(Math.round(weighted(group => group.totalHours ? group.wetHours / group.totalHours * 100 : 0) * 1.9), 0, 100),
        gust: weighted(group => group.gust),
        weather: weather(code),
        unavailable: false
      });
    }
    state.daily = output;
    return output;
  }

  function buildSnapshots() {
    const now = new Date();
    let tonight = forecastHour(0, 21);
    if (!tonight || tonight < now) tonight = forecastHour(1, 21) || new Date(now.getTime() + 12 * 3600000);
    const tomorrow = forecastHour(1, 15) || new Date(now.getTime() + 24 * 3600000);
    const tomorrowMorning = forecastHour(1, 8) || new Date(now.getTime() + 18 * 3600000);
    const events = [];
    const near = blendedAt(new Date(now.getTime() + 2 * 3600000)) || blendedAt(now);
    if (state.arrival?.state === 'approaching') events.push({ kind: 'arrival', label: 'NEXT', title: 'Rain approaching', copy: state.arrival.detail || 'Official radar extrapolation reaches your area.', when: state.arrival.label, blend: near, date: new Date(now.getTime() + 45 * 60000) });
    else events.push({ kind: 'now', label: 'NOW', title: near?.weather.name || 'Current weather', copy: near ? precipitationContext(now, near) : 'Observed radar remains the primary view.', when: 'Live radar', blend: near, date: now });
    const nightBlend = blendedAt(tonight);
    if (nightBlend) events.push({ kind: 'night', label: 'TONIGHT', title: nightBlend.weather.name, copy: `${Math.round(nightBlend.temp)}° · ${precipitationContext(tonight, nightBlend)}`, when: fmtTime(tonight), blend: nightBlend, date: tonight });
    const morningBlend = blendedAt(tomorrowMorning);
    if (morningBlend) events.push({ kind: 'morning', label: 'TOMORROW AM', title: morningBlend.weather.name, copy: `${Math.round(morningBlend.temp)}° · gusts near ${Math.round(morningBlend.gust)} km/h`, when: fmtTime(tomorrowMorning), blend: morningBlend, date: tomorrowMorning });
    const tomorrowBlend = blendedAt(tomorrow);
    if (tomorrowBlend) events.push({ kind: 'tomorrow', label: 'TOMORROW PM', title: tomorrowBlend.weather.name, copy: `${Math.round(tomorrowBlend.temp)}° · ${precipitationContext(tomorrow, tomorrowBlend)}`, when: fmtTime(tomorrow), blend: tomorrowBlend, date: tomorrow });
    const wettest = state.daily.filter(day => !day.unavailable).slice(1).sort((a, b) => b.rain - a.rain)[0];
    if (wettest && wettest.rain >= 1) events.push({ kind: 'wettest', label: 'MOST RAIN', title: `${dayName(wettest.date)} looks wettest`, copy: `Around ${wettest.rain.toFixed(wettest.rain < 10 ? 1 : 0)} mm across the guidance blend`, when: monthDay(wettest.date), day: wettest, date: wettest.date });
    else {
      const driest = state.daily.filter(day => !day.unavailable).slice(1).sort((a, b) => a.rain - b.rain)[0];
      if (driest) events.push({ kind: 'dry', label: 'BEST DRY WINDOW', title: `${dayName(driest.date)} looks calmest`, copy: `${driest.rain < .1 ? 'No meaningful rain' : `${driest.rain.toFixed(1)} mm`} · high near ${Math.round(driest.high)}°`, when: monthDay(driest.date), day: driest, date: driest.date });
    }
    state.snapshots = events.slice(0, 5);
    return state.snapshots;
  }

  function drawSnapshot(canvas, event, index) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(220, Math.round(rect.width * (window.devicePixelRatio || 1)));
    const height = Math.max(150, Math.round(rect.height * (window.devicePixelRatio || 1)));
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const isNight = event.kind === 'night';
    const isMorning = event.kind === 'morning';
    const wet = event.blend?.wet ?? event.day?.wet ?? 15;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, isNight ? '#0b1725' : isMorning ? '#16302e' : '#102c28');
    gradient.addColorStop(.58, '#091a17');
    gradient.addColorStop(1, '#05100e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * .8, height * .12, 0, width * .8, height * .12, width * .55);
    glow.addColorStop(0, isNight ? 'rgba(188,162,255,.22)' : isMorning ? 'rgba(255,211,138,.25)' : 'rgba(114,228,255,.16)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(114,228,255,.09)';
    ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    for (let ring = 0; ring < 4; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(width * .7, height * .52, width * (.24 + ring * .1), height * (.16 + ring * .07), -.24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(42,122,128,.25)';
    ctx.beginPath();
    ctx.ellipse(width * .81, height * .58, width * .36, height * .24, -.24, 0, Math.PI * 2);
    ctx.fill();

    const rainBands = wet >= 55 ? 4 : wet >= 28 ? 3 : wet >= 12 ? 1 : 0;
    for (let band = 0; band < rainBands; band += 1) {
      const x = width * (.02 + band * .13 + index * .012);
      const rain = ctx.createLinearGradient(x, 0, x + width * .32, height);
      rain.addColorStop(0, 'rgba(114,228,255,0)');
      rain.addColorStop(.38, `rgba(60,126,255,${.18 + wet / 190})`);
      rain.addColorStop(.63, `rgba(87,232,196,${.12 + wet / 230})`);
      rain.addColorStop(1, 'rgba(185,99,255,0)');
      ctx.fillStyle = rain;
      ctx.beginPath();
      ctx.ellipse(x + width * .14, height * .38, width * .07, height * .62, -.46, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isNight) {
      ctx.fillStyle = 'rgba(216,255,120,.78)';
      ctx.beginPath();
      ctx.arc(width * .79, height * .2, height * .045, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101a21';
      ctx.beginPath();
      ctx.arc(width * .805, height * .185, height * .042, 0, Math.PI * 2);
      ctx.fill();
    } else if (isMorning) {
      ctx.fillStyle = 'rgba(255,211,138,.78)';
      ctx.beginPath();
      ctx.arc(width * .81, height * .21, height * .04, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e8fbff';
    ctx.beginPath();
    ctx.arc(width * .58, height * .56, Math.max(3, height * .017), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(114,228,255,.52)';
    ctx.beginPath();
    ctx.arc(width * .58, height * .56, height * .06, 0, Math.PI * 2);
    ctx.stroke();
  }

  function renderSnapshots() {
    const rail = $('#snapshot-rail');
    if (!rail) return;
    rail.innerHTML = '';
    const events = buildSnapshots();
    events.forEach((event, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'snapshot-card';
      const mapsToFuturecast = event.date && new Date(event.date).getTime() <= Date.now() + 49 * 3600000;
      button.innerHTML = `<canvas aria-hidden="true"></canvas><span class="snapshot-shade"></span><span class="snapshot-copy"><small>${esc(event.label)}</small><h3>${esc(event.title)}</h3><p>${esc(event.copy)}</p><span class="snapshot-foot"><time>${esc(event.when)}</time><b>${mapsToFuturecast ? 'SEE ON MAP →' : 'OPEN DETAIL →'}</b></span></span>`;
      button.addEventListener('click', () => openSnapshot(event, button));
      rail.append(button);
      requestAnimationFrame(() => drawSnapshot(button.querySelector('canvas'), event, index));
    });
    text('#moments-heading', state.arrival?.state === 'approaching' ? `Rain may arrive ${state.arrival.label.toLowerCase()}` : 'The next meaningful moments');
  }

  function renderDaily() {
    const list = $('#daily-list');
    if (!list) return;
    const days = buildDaily();
    list.innerHTML = '';
    days.forEach((day, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `day-row${index === 0 ? ' today' : ''}`;
      if (day.unavailable) {
        row.innerHTML = `<span class="day-name"><b>${index === 0 ? 'Today' : dayName(day.date)}</b><small>${monthDay(day.date)}</small></span><span class="day-icon">${weatherIconMarkup('clear')}</span><span class="day-condition">Forecast unavailable</span><span class="rain-meter"><span><i style="width:0"></i></span><b>—</b></span><span class="day-temps">—</span>`;
      } else {
        const rainLabel = day.rain < .1 ? 'Dry' : `${day.rain.toFixed(day.rain < 10 ? 1 : 0)} mm`;
        const rainWidth = day.rain < .1 ? 0 : clamp(day.rain / 15 * 100, 5, 100);
        row.innerHTML = `<span class="day-name"><b>${index === 0 ? 'Today' : dayName(day.date)}</b><small>${monthDay(day.date)}</small></span><span class="day-icon">${weatherIconMarkup(day.weather.icon)}</span><span class="day-condition">${esc(day.weather.name)}${day.gust >= 42 ? ' · windy' : ''}</span><span class="rain-meter"><span><i style="width:${rainWidth}%"></i></span><b>${rainLabel}</b></span><span class="day-temps">${Math.round(day.high)}° <span>${Math.round(day.low)}°</span></span>`;
      }
      row.addEventListener('click', () => openDay(day));
      list.append(row);
    });
    const wettest = days.filter(day => !day.unavailable).sort((a, b) => b.rain - a.rain)[0];
    text('#daily-heading', wettest?.rain >= 2 ? `${indexLabel(wettest.date)} carries the most rain` : 'A mostly dry-looking week');
  }

  function indexLabel(date) {
    return dateKeyInZone(date) === dateKeyInZone(new Date()) ? 'Today' : dayName(date);
  }

  function nearestCitySnapshot(target = new Date()) {
    const properties = state.cityWeather?.properties;
    if (!properties) return null;
    const targetDate = target instanceof Date ? target : new Date(target);
    const current = properties.currentConditions || {};
    const hourly = properties.hourlyForecastGroup?.hourlyForecasts || [];
    const nearestHour = hourly.reduce((best, item) => {
      const date = new Date(item.timestamp);
      if (!Number.isFinite(date.getTime())) return best;
      if (!best) return item;
      return Math.abs(date - targetDate) < Math.abs(new Date(best.timestamp) - targetDate) ? item : best;
    }, null);
    const currentDate = new Date(english(current.timestamp));
    const useCurrent = Number.isFinite(currentDate.getTime()) && targetDate <= new Date(Date.now() + 10 * 60000) && Math.abs(currentDate - targetDate) < 4 * 3600000;
    const item = useCurrent ? current : nearestHour;
    if (!item) return null;
    const wind = item.wind || {};
    return {
      name: english(properties.name) || state.place.name,
      condition: english(item.condition) || 'Conditions unavailable',
      temperature: finite(english(item.temperature?.value)),
      precipitation: finite(english(item.lop?.value)),
      windSpeed: finite(english(wind.speed?.value)),
      windDirection: english(wind.direction?.value) || english(wind.direction?.windDirFull) || 'Variable',
      timestamp: useCurrent ? currentDate : new Date(item.timestamp),
      isCurrent: useCurrent
    };
  }

  function officialWeatherLabel(snapshot) {
    if (!snapshot) return 'Official forecast still loading';
    const temperature = snapshot.temperature === null ? '' : ` · ${Math.round(snapshot.temperature)}°`;
    const chance = snapshot.precipitation === null ? '' : ` · ${Math.round(snapshot.precipitation)}% precip.`;
    return `${snapshot.condition}${temperature}${chance}`;
  }

  async function fetchCityWeather(force = false) {
    const p = state.place;
    const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
    if (!force && state.cityWeather && state.cityWeatherKey === key && Date.now() - state.cityWeatherLoadedAt < 10 * 60000) return state.cityWeather;
    let features = [];
    for (const radius of [0.8, 2.2, 5]) {
      const bbox = `${p.lon - radius},${p.lat - radius},${p.lon + radius},${p.lat + radius}`;
      const data = await fetchJson(`${WEATHER_API}/collections/citypageweather-realtime/items?f=json&bbox=${bbox}&limit=30`, 13000);
      features = data.features || [];
      if (features.length) break;
    }
    if (!features.length) throw new Error('No nearby official city forecast');
    state.cityWeather = features.sort((a, b) => {
      const ac = a.geometry?.coordinates || [999, 999];
      const bc = b.geometry?.coordinates || [999, 999];
      return ((ac[1] - p.lat) ** 2 + (ac[0] - p.lon) ** 2) - ((bc[1] - p.lat) ** 2 + (bc[0] - p.lon) ** 2);
    })[0];
    state.cityWeatherKey = key;
    state.cityWeatherLoadedAt = Date.now();
    renderForecast();
    updateStory();
    return state.cityWeather;
  }

  function renderSummary() {
    const blend = blendedAt(new Date());
    state.currentBlend = blend;
    if (!blend) {
      text('#summary-title', 'Waiting for forecast guidance');
      text('#summary-copy', 'Radar can still load while forecast models reconnect.');
      text('#summary-temp', '—');
      return;
    }
    const today = state.daily.find(day => !day.unavailable) || buildDaily().find(day => !day.unavailable);
    const alertCount = state.alerts.length;
    const official = nearestCitySnapshot(new Date());
    const displayTemp = Number.isFinite(state.observation?.temp) ? state.observation.temp : official?.temperature ?? blend.temp;
    const condition = official?.condition || blend.weather.name;
    text('#current-temp', `${Math.round(displayTemp)}°`);
    text('#current-condition', condition);
    text('#summary-title', alertCount ? `${condition} · ${alertCount} nearby alert${alertCount === 1 ? '' : 's'}` : condition);
    const officialLead = official ? `${official.name}: ${official.condition}${official.precipitation === null ? '' : ` with a ${Math.round(official.precipitation)}% precipitation chance`}.` : '';
    text('#summary-copy', state.arrival?.state === 'approaching' ? `Official radar suggests precipitation ${state.arrival.label.toLowerCase()}.` : `${officialLead} ${guidanceLabel(blend)}.`.trim());
    text('#summary-temp', `${Math.round(displayTemp)}°`);
    text('#summary-range', today && !today.unavailable ? `${Math.round(today.high)}° / ${Math.round(today.low)}°` : `${Math.round(blend.gust)} km/h gusts`);
  }

  function renderModelStatus() {
    const count = state.modelData.size;
    const total = MODELS.length;
    text('#model-status', `${state.cityWeather ? 'ECCC + ' : ''}${count ? `${count}/${total} guidance` : 'connecting'}`);
  }

  function renderModelList() {
    const list = $('#model-list');
    if (!list) return;
    list.innerHTML = '';
    const now = new Date();
    MODELS.forEach(model => {
      const point = modelPoint(state.modelData.get(model.id), now);
      const row = document.createElement('div');
      row.className = 'model-row';
      row.innerHTML = `<span>${model.name}</span><div><i style="width:${point ? Math.max(12, model.weight * 100 / .36) : 0}%;background:${model.accent}"></i></div><b>${point ? `${Math.round(point.temp)}° · ${point.rain >= .12 ? 'wet' : 'dry'}` : 'unavailable'}</b>`;
      list.append(row);
    });
  }

  function renderDetails() {
    const blend = state.currentBlend || blendedAt(new Date());
    const official = nearestCitySnapshot(new Date());
    text('#detail-radar-title', state.radar.state === 'ok' ? state.radar.title : state.radar.state === 'stale' ? 'Using the last good frame' : state.radar.state === 'error' ? 'Both radar routes failed' : 'Checking the official feed');
    text('#detail-radar-copy', `${state.radar.copy}${state.radar.lastSuccess ? ` · Last success ${fmtTime(state.radar.lastSuccess)}` : ''}`);
    text('#detail-model-title', blend ? guidanceLabel(blend) : 'Waiting for guidance');
    text('#detail-model-copy', blend ? `${official ? `Official nearby forecast: ${officialWeatherLabel(official)}. ` : ''}${blend.agreement}% of the weighted guidance agrees on whether this hour is wet or dry.` : 'SkyMap will render with the first dependable source instead of waiting for every connection.');
    const change = computeChange(blend);
    text('#detail-change-title', change.title);
    text('#detail-change-copy', change.copy);
    renderModelList();
  }

  function computeChange(blend) {
    if (!blend) return { title: 'No comparison yet', copy: 'A comparison appears after fresh forecast guidance arrives.' };
    const current = { temp: Math.round(blend.temp), wet: blend.wet, savedAt: Date.now() };
    let previous;
    try { previous = JSON.parse(localStorage.getItem('skymap.lastSummary') || 'null'); } catch (_) { }
    try { localStorage.setItem('skymap.lastSummary', JSON.stringify(current)); } catch (_) { }
    if (!previous || Date.now() - previous.savedAt < 12 * 60000) return { title: 'First forecast of this session', copy: 'SkyMap will compare this with the next meaningful refresh.' };
    const tempChange = current.temp - previous.temp;
    const wetChange = current.wet - previous.wet;
    if (Math.abs(wetChange) >= 15) return { title: wetChange > 0 ? 'More guidance now supports rain' : 'Less guidance now supports rain', copy: `The weighted rain-support measure moved ${Math.abs(wetChange)} points since the saved forecast.` };
    if (Math.abs(tempChange) >= 2) return { title: tempChange > 0 ? 'The forecast turned warmer' : 'The forecast turned cooler', copy: `The current blended temperature shifted about ${Math.abs(tempChange)}°.` };
    return { title: 'The forecast is fairly stable', copy: 'No large temperature or precipitation shift was detected.' };
  }

  function renderForecast() {
    renderModelStatus();
    renderDaily();
    renderSummary();
    renderSnapshots();
    renderDetails();
  }

  async function fetchObservation() {
    const p = state.place;
    const bbox = `${p.lon - .8},${p.lat - .6},${p.lon + .8},${p.lat + .6}`;
    const query = new URLSearchParams({ f: 'json', limit: '40', bbox, sortby: '-date_tm-value', properties: 'date_tm-value,air_temp,rnfl_amt_pst1hr,stn_nam-value,max_wnd_spd_10m_pst10mts' });
    try {
      const data = await fetchJson(`${WEATHER_API}/collections/swob-realtime/items?${query}`, 10000);
      const feature = (data.features || []).find(item => Number.isFinite(Number(item.properties?.air_temp)));
      if (!feature) return null;
      state.observation = { temp: Number(feature.properties.air_temp), rain: Number(feature.properties.rnfl_amt_pst1hr) || 0, wind: Number(feature.properties.max_wnd_spd_10m_pst10mts) || 0, station: feature.properties['stn_nam-value'] || 'Nearby station', time: feature.properties['date_tm-value'] };
      return state.observation;
    } catch (_) { return null; }
  }

  const ALERT_RANK = { warning: 3, watch: 2, advisory: 1, statement: 0 };

  function readAlert(feature) {
    const p = feature?.properties || {};
    const type = String(p.alert_type || 'statement').toLowerCase();
    const expires = new Date(p.expiration_datetime || p.event_end_datetime || 0);
    return {
      id: p.id || feature?.id || '',
      type,
      rank: ALERT_RANK[type] ?? 0,
      name: p.alert_name_en || p.alert_short_name_en || 'Weather alert',
      area: p.feature_name_en || '',
      text: (p.alert_text_en || '').trim(),
      issued: new Date(p.publication_datetime || p.validity_datetime || 0),
      ends: new Date(p.event_end_datetime || p.expiration_datetime || 0),
      expires
    };
  }

  async function fetchAlerts() {
    const p = state.place;
    try {
      const data = await fetchJson(`${WEATHER_API}/collections/weather-alerts/items?f=json&limit=40&bbox=${p.lon - 1.6},${p.lat - 1.1},${p.lon + 1.6},${p.lat + 1.1}`, 10000);
      const now = Date.now();
      const seen = new Set();
      state.alerts = (data.features || [])
        .map(readAlert)
        // An expired bulletin is not an alert. The feed still carries them.
        .filter(alert => !Number.isFinite(alert.expires.getTime()) || alert.expires.getTime() > now)
        .filter(alert => { const key = `${alert.name}|${alert.text.slice(0, 60)}`; if (seen.has(key)) return false; seen.add(key); return true; })
        .sort((a, b) => b.rank - a.rank || a.ends - b.ends);
    } catch (_) { state.alerts = []; }
    renderAlerts();
  }

  function sentenceCase(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }

  // Warnings are stated plainly. No sirens, no shouting, no red screen.
  function renderAlerts() {
    const banner = $('#alert-banner');
    const list = $('#alert-list');
    const [first, ...rest] = state.alerts;
    if (banner) {
      banner.hidden = !first;
      if (first) {
        text('#alert-headline', sentenceCase(first.name));
        const until = Number.isFinite(first.ends.getTime()) && first.ends.getTime() > Date.now() ? ` · until ${fmtTime(first.ends)}` : '';
        const more = rest.length ? ` · ${rest.length} more nearby` : '';
        text('#alert-detail', `Environment Canada${first.area ? ` · ${first.area}` : ''}${until}${more}`);
      }
    }
    if (!list) return;
    list.innerHTML = '';
    if (!state.alerts.length) {
      const empty = document.createElement('article');
      empty.innerHTML = '<h3>Nothing active nearby</h3><p>Environment Canada has no warnings, watches or statements in effect for this area right now.</p>';
      list.append(empty);
      return;
    }
    state.alerts.forEach(alert => {
      const article = document.createElement('article');
      const when = Number.isFinite(alert.ends.getTime()) && alert.ends.getTime() > Date.now() ? `In effect until ${frameStamp(alert.ends)}` : 'In effect now';
      article.innerHTML = `<small>${esc(alert.type.toUpperCase())}${alert.area ? ` · ${esc(alert.area)}` : ''}</small><h3>${esc(sentenceCase(alert.name))}</h3><p></p><footer>${esc(when)} · Environment Canada</footer>`;
      article.querySelector('p').textContent = alert.text || 'Open weather.gc.ca for the full bulletin.';
      list.append(article);
    });
  }

  const AIR_WORDS = [
    [3, 'Low health risk', 'Air quality is good. Normal outdoor activity is fine for most people.'],
    [6, 'Moderate health risk', 'Consider easing off strenuous outdoor activity if you notice coughing or throat irritation.'],
    [10, 'High health risk', 'Reduce or reschedule strenuous outdoor activity, especially if you have heart or breathing trouble.'],
    [Infinity, 'Very high health risk', 'Avoid strenuous outdoor activity. Keep windows closed if smoke is nearby.']
  ];

  function airWords(index) {
    return AIR_WORDS.find(([ceiling]) => index <= ceiling) || AIR_WORDS.at(-1);
  }

  async function fetchAirQuality() {
    const p = state.place;
    try {
      for (const radius of [0.6, 1.6, 3.5]) {
        const bbox = `${p.lon - radius},${p.lat - radius},${p.lon + radius},${p.lat + radius}`;
        const data = await fetchJson(`${WEATHER_API}/collections/aqhi-observations-realtime/items?f=json&limit=20&bbox=${bbox}`, 10000);
        const features = (data.features || []).filter(item => finite(item.properties?.aqhi) !== null);
        if (!features.length) continue;
        const nearestStation = features.sort((a, b) => {
          const ac = a.geometry?.coordinates || [999, 999];
          const bc = b.geometry?.coordinates || [999, 999];
          return ((ac[1] - p.lat) ** 2 + (ac[0] - p.lon) ** 2) - ((bc[1] - p.lat) ** 2 + (bc[0] - p.lon) ** 2);
        })[0];
        state.airQuality = {
          index: Number(nearestStation.properties.aqhi),
          station: nearestStation.properties.location_name_en || 'Nearby station',
          observed: new Date(nearestStation.properties.observation_datetime || Date.now())
        };
        return state.airQuality;
      }
    } catch (_) { }
    return null;
  }

  function numericFrom(value) {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
    if (Array.isArray(value)) for (const item of value) { const result = numericFrom(item); if (result != null) return result; }
    if (typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (/(time|date|lon|lat|x|y|id|index|quality)/i.test(key)) continue; const result = numericFrom(item); if (result != null) return result; }
    return null;
  }

  async function featureInfo(frame) {
    if (!frame?.time) return undefined;
    const p = state.place;
    const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}|${frameKey(frame)}`;
    const cached = state.pointValueCache.get(key);
    if (cached && Date.now() - cached.savedAt < 5 * 60000) return cached.value;
    if (state.pointValueRequests.has(key)) return state.pointValueRequests.get(key);

    const delta = .04;
    const query = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo', SRS: 'EPSG:4326', BBOX: `${p.lon - delta},${p.lat - delta},${p.lon + delta},${p.lat + delta}`, WIDTH: '20', HEIGHT: '20', X: '10', Y: '10', LAYERS: frame.layer, QUERY_LAYERS: frame.layer, INFO_FORMAT: 'application/json', FORMAT: 'image/png', TIME: formatWmsTime(frame.time) });
    if (frame.style) query.set('STYLES', frame.style);
    if (frame.referenceTime) query.set('DIM_REFERENCE_TIME', formatWmsTime(frame.referenceTime));

    const request = (async () => {
      for (const endpoint of geometEndpoints()) {
        try {
          const data = await fetchCompleteJson(`${endpoint}?${query}`, 8000);
          const properties = data.features?.[0]?.properties;
          if (!properties) return null;
          const direct = finite(properties.value);
          return direct ?? numericFrom(properties);
        } catch (_) { }
      }
      return undefined;
    })();

    state.pointValueRequests.set(key, request);
    try {
      const value = await request;
      state.pointValueCache.set(key, { value, savedAt: Date.now() });
      return value;
    } finally {
      state.pointValueRequests.delete(key);
    }
  }

  function frameKey(frame) {
    return `${frame?.layer || ''}|${frame?.time || 'latest'}|${frame?.referenceTime || ''}`;
  }

  function rainDescription(value, frame, pending = false) {
    const kind = frame?.kind || 'observed';
    if (pending) {
      return kind === 'futurecast'
        ? ['Reading this forecast hour…', 'The futurecast image loaded; its exact one-hour precipitation amount is still resolving.']
        : ['Reading this exact point…', 'The weather image loaded; its local rain rate is still resolving.'];
    }
    if (value === undefined) {
      return ['Exact local value is unavailable.', 'The weather image is live, but the official point query did not return a usable value for this frame.'];
    }
    if (kind === 'futurecast') {
      const at = frame?.time ? frameStamp(frame.time) : 'this forecast hour';
      if (value === null || value < .05) return ['No meaningful precipitation is forecast here.', `HRDPS keeps this point essentially dry for the hour ending ${at}. This is model guidance, not observed radar.`];
      if (value < .5) return ['A trace is forecast at this point.', `HRDPS projects about ${value.toFixed(1)} mm in the hour ending ${at}. Small cells can shift before arrival.`];
      if (value < 2.5) return ['Light precipitation is forecast here.', `HRDPS projects about ${value.toFixed(1)} mm in the hour ending ${at}. Confidence decreases as the lead time grows.`];
      if (value < 7.5) return ['A steadier wet hour is forecast here.', `HRDPS projects about ${value.toFixed(1)} mm in the hour ending ${at}. Use the shape as guidance, not an exact future radar return.`];
      if (value < 15) return ['A heavy precipitation signal is forecast here.', `HRDPS projects about ${value.toFixed(1)} mm in this hour. Recheck nearer the event because location and intensity can still shift.`];
      return ['An intense precipitation signal is forecast here.', `HRDPS projects roughly ${value.toFixed(0)} mm in this hour. Check official alerts and newer runs before making a safety decision.`];
    }
    const projected = kind === 'nowcast';
    const verb = projected ? 'The official radar extrapolation projects' : 'Observed radar measured';
    if (value === null) return [projected ? 'No radar return is projected here.' : 'No radar return is over this point.', `${verb} no measurable return at the selected location for this frame.`];
    if (value < .05) return [projected ? 'No measurable rain is projected here.' : 'No measurable rain is over this point.', `${verb} no measurable rain at the selected location for this frame.`];
    if (value < .5) return [projected ? 'A trace of rain is projected here.' : 'A trace of rain is over this point.', `${verb} spotty or very light rain at the selected location.`];
    if (value < 2.5) return [projected ? 'Light rain is projected here.' : 'Light rain is over this point.', `${verb} light rain at the selected location.`];
    if (value < 7.5) return [projected ? 'Steady rain is projected here.' : 'Steady rain is over this point.', `${verb} moderate rain at the selected location.`];
    if (value < 15) return [projected ? 'Heavy rain is projected here.' : 'Heavy rain is over this point.', `${verb} heavy rain; visibility and local drainage may worsen.`];
    return [projected ? 'Very heavy rain is projected here.' : 'Very heavy rain is over this point.', `${verb} an intense rain rate. Check active warnings before travelling.`];
  }

  function renderStoryFacts(frame, value) {
    const facts = $('#story-facts');
    if (!facts) return;
    if (!isRadarMode()) { facts.hidden = true; return; }
    const target = frame?.time ? new Date(frame.time) : new Date();
    const official = nearestCitySnapshot(target);
    const blend = blendedAt(target);
    facts.hidden = false;
    const where = String(state.place.name || 'your location').slice(0, 28).toUpperCase();
    const model = frame?.kind === 'futurecast';
    const nowcast = frame?.kind === 'nowcast';
    text('#story-value-label', `${model ? 'FORECAST HOUR AT' : nowcast ? 'PROJECTED RATE AT' : 'OBSERVED RATE AT'} ${where}`);
    text('#story-official-label', model ? 'OFFICIAL HOURLY' : 'OFFICIAL NEARBY');
    text('#story-guidance-label', 'CONFIDENCE');
    const pending = state.frameValue?.pending;
    text('#story-value', pending
      ? model ? 'Amount still resolving' : 'Rate still resolving'
      : value === undefined
        ? 'Point value unavailable'
        : value === null
          ? model ? 'No forecast value' : 'No radar return'
          : `${value < .05 ? '0' : value.toFixed(value < 10 ? 1 : 0)} ${model ? 'mm this hour' : 'mm/h'}`);
    text('#story-official', officialWeatherLabel(official));
    text('#story-guidance', frameConfidence(frame).detail);
  }

  async function updateFrameExplanation(frame) {
    if (!frame || !isRadarMode()) return;
    const key = frameKey(frame);
    const token = ++state.frameExplanationToken;
    if (state.playing) {
      state.frameValue = null;
      const facts = $('#story-facts');
      if (facts) facts.hidden = true;
      return;
    }
    state.frameValue = { key, value: null, pending: true };
    renderStoryFacts(frame, null);
    updateStory();
    const value = await featureInfo(frame).catch(() => undefined);
    if (token !== state.frameExplanationToken || key !== frameKey(state.frames[state.frameIndex])) return;
    state.frameValue = { key, value, pending: false };
    renderStoryFacts(frame, value);
    updateStory();
  }

  async function probeArrival() {
    const observed = [...state.allFrames].reverse().find(frame => frame.kind === 'observed');
    const future = state.allFrames.filter(frame => frame.kind === 'nowcast').slice(0, 4);
    const current = observed ? await featureInfo(observed) : null;
    if (current != null && current > .08) return { state: 'now', label: 'over you now', detail: 'Observed radar detects precipitation at the selected point.' };
    const values = await Promise.all(future.map(frame => featureInfo(frame).catch(() => undefined)));
    for (let index = 0; index < future.length; index += 1) {
      const value = values[index];
      if (value != null && value > .08) {
        const frame = future[index];
        const minutes = Math.max(0, Math.round((new Date(frame.time).getTime() - Date.now()) / 60000));
        return { state: 'approaching', label: minutes < 15 ? 'within 15 minutes' : `in about ${Math.max(10, minutes - 10)}–${minutes + 10} minutes`, detail: 'The official radar extrapolation reaches the selected point.' };
      }
    }
    return null;
  }

  function updateStory() {
    if (state.selectedSnapshot) return;
    const frame = state.frames[state.frameIndex];
    if (!isRadarMode()) {
      const facts = $('#story-facts');
      if (facts) facts.hidden = true;
      const config = MODES[state.mode];
      text('#story-source', config.source.toUpperCase());
      text('#story-time', config.observed ? 'LATEST READING' : 'FORECAST');
      if (state.radar.state !== 'ok') {
        text('#story-title', `${config.label} is delayed.`);
        text('#story-copy', 'The map layer did not arrive, but the forecast below is unaffected. Tap the status chip to try again.');
        return;
      }
      if (state.mode === 'air' && state.airQuality) {
        const [, headline, advice] = airWords(state.airQuality.index);
        text('#story-title', `Air quality is ${state.airQuality.index}. ${headline}.`);
        text('#story-copy', `${advice} Measured at ${state.airQuality.station}.`);
        return;
      }
      if (state.mode === 'smoke') {
        text('#story-title', 'Where wildfire smoke is expected.');
        text('#story-copy', 'Shaded areas show forecast fine particles from active wildfires. Darker means thicker smoke near the ground.');
        return;
      }
      if (state.mode === 'temp') {
        text('#story-title', 'Temperature across the province.');
        text('#story-copy', 'High-resolution guidance a couple of hours ahead. Cooler colours are colder air.');
        return;
      }
      text('#story-title', config.label);
      text('#story-copy', 'Official guidance is displayed over the selected area.');
      return;
    }
    text('#story-source', frame?.kind === 'futurecast'
      ? state.mode === 'storm' ? 'HRDPS RAIN + STORM OUTLOOK' : 'HRDPS 2.5 KM FUTURECAST'
      : frame?.kind === 'nowcast'
        ? 'RADAR NOWCAST'
        : state.mode === 'storm'
          ? 'RADAR + LIGHTNING'
          : 'OBSERVED RADAR');
    text('#story-time', frame?.time ? frameStamp(frame.time) : 'NOW');
    if (state.playing) {
      const facts = $('#story-facts');
      if (facts) facts.hidden = true;
      text('#story-title', 'Watching the weather move.');
      text('#story-copy', 'Playback runs once and pauses at each source boundary: measured radar, short-range extrapolation, then HRDPS futurecast.');
      return;
    }
    if (state.radar.state === 'error' && !state.weatherOverlay) {
      text('#story-title', 'Radar needs another attempt.');
      text('#story-copy', 'Forecast snapshots and the seven-day view are still available below.');
      return;
    }
    if (state.frameValue?.key === frameKey(frame)) {
      const [headline, copy] = rainDescription(state.frameValue.value, frame, state.frameValue.pending);
      if (!state.frameValue.pending && frame?.kind === 'observed' && Number.isFinite(state.frameValue.value) && state.frameValue.value < .05 && state.arrival?.state === 'approaching') {
        text('#story-title', `Dry at this point now. Rain may arrive ${state.arrival.label}.`);
        text('#story-copy', `Observed radar is dry here in this frame; the short-range nowcast reaches the point later. ${state.arrival.detail}`);
      } else {
        text('#story-title', headline);
        text('#story-copy', copy);
      }
      return;
    }
    if (state.arrival?.state === 'now') {
      text('#story-title', 'Precipitation is over your location.');
      text('#story-copy', state.arrival.detail);
    } else if (state.arrival?.state === 'approaching') {
      text('#story-title', `Rain may arrive ${state.arrival.label}.`);
      text('#story-copy', state.arrival.detail);
    } else if (state.currentBlend) {
      text('#story-title', state.currentBlend.wetModels >= Math.ceil(state.currentBlend.rows.length / 2) ? 'Guidance leans wetter.' : 'No strong near-term rain signal.');
      text('#story-copy', `${guidanceLabel(state.currentBlend)}. Radar remains the source of truth for what is happening now.`);
    } else {
      text('#story-title', state.radar.state === 'ok' ? 'Radar is live.' : 'Building your weather picture.');
      text('#story-copy', 'Forecast guidance loads independently so one slow source cannot freeze the app.');
    }
  }

  function openSnapshot(event, button) {
    $$('.snapshot-card').forEach(item => item.classList.toggle('selected', item === button));
    const targetTime = new Date(event.date || 0).getTime();
    const weatherFrames = state.allFrames.filter(frame => {
      if (targetTime <= Date.now() + 2 * 3600000) return frame.kind === 'observed' || frame.kind === 'nowcast';
      return frame.kind === 'futurecast';
    });
    const mapFrame = Number.isFinite(targetTime) ? nearestFrame(weatherFrames, targetTime) : null;
    const tolerance = mapFrame?.kind === 'futurecast' ? 90 * 60000 : 35 * 60000;
    if (mapFrame && Math.abs(new Date(mapFrame.time).getTime() - targetTime) <= tolerance) {
      const hours = Math.max(0, (targetTime - Date.now()) / 3600000);
      const horizon = hours <= 2 ? 'now' : hours <= 6 ? '6' : hours <= 24 ? '24' : '48';
      applyTimelineHorizon(horizon, { load: false, autoFrame: true });
      pushUniqueFrame(state.frames, mapFrame);
      state.frames.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
      state.frameIndex = state.frames.findIndex(frame => frameKey(frame) === frameKey(mapFrame));
      renderRibbon();
      renderTimelineRange();
      void showRadarFrame(state.frameIndex, true);
      if (matchMedia('(max-width: 980px)').matches) $('.radar-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast(`${event.label.toLowerCase()} · shown on the weather map`);
      return;
    }
    state.selectedSnapshot = event;
    text('#details-title', event.title);
    text('#detail-radar-title', event.when);
    text('#detail-radar-copy', event.copy);
    openSheet('details-sheet');
  }

  function openDay(day) {
    if (day.unavailable) return showToast('This day is not available yet');
    text('#details-title', `${dayName(day.date)}, ${monthDay(day.date)}`);
    text('#detail-radar-title', `${day.weather.name} · ${day.rain < .1 ? 'little meaningful rain' : `${day.rain.toFixed(day.rain < 10 ? 1 : 0)} mm across the guidance blend`}`);
    text('#detail-radar-copy', `High near ${Math.round(day.high)}°, low near ${Math.round(day.low)}°, with blended gusts peaking around ${Math.round(day.gust)} km/h.`);
    openSheet('details-sheet');
  }

  function openSheet(id) {
    $('#backdrop').hidden = false;
    $$('.sheet').forEach(sheet => { sheet.hidden = sheet.id !== id; });
    document.body.style.overflow = 'hidden';
  }

  function closeSheets() {
    $('#backdrop').hidden = true;
    $$('.sheet').forEach(sheet => { sheet.hidden = true; });
    document.body.style.overflow = '';
    state.selectedSnapshot = null;
    $$('.snapshot-card').forEach(item => item.classList.remove('selected'));
    text('#details-title', 'What SkyMap is seeing');
    renderDetails();
  }

  function renderLocations() {
    const grid = $('#location-grid');
    if (!grid) return;
    grid.innerHTML = '';
    PLACES.forEach(place => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = Math.abs(place.lat - state.place.lat) < .01 && Math.abs(place.lon - state.place.lon) < .01 ? 'active' : '';
      button.innerHTML = `<span><b>${esc(place.name)}</b><small>${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}</small></span><i>${button.className ? '✓' : '›'}</i>`;
      button.addEventListener('click', () => setPlace(place));
      grid.append(button);
    });
  }

  async function setPlace(place) {
    state.place = { ...place, lat: Number(place.lat), lon: Number(place.lon), zoom: Number(place.zoom) || 9 };
    savePlace();
    text('#location-name', state.place.name);
    closeSheets();
    state.map.setView([state.place.lat, state.place.lon], state.place.zoom);
    placeLocationMarker();
    state.modelData.clear();
    state.modelErrors.clear();
    state.cityWeather = null;
    state.cityWeatherKey = '';
    state.allFrames = [];
    state.frames = [];
    state.timelineHorizon = 'now';
    state.arrival = null;
    state.airQuality = null;
    state.alerts = [];
    renderAlerts();
    await Promise.allSettled(MODELS.map(readCachedModel));
    renderForecast();
    await refreshAll(true);
  }

  async function setMode(mode) {
    if (!MODES[mode] || mode === state.mode) return closeSheets();
    state.mode = mode;
    syncModeControls();
    closeSheets();
    await refreshVisibleMap(true);
  }

  function syncModeControls() {
    $$('#layer-list button').forEach(button => {
      const active = button.dataset.layer === state.mode;
      button.classList.toggle('active', active);
      const mark = button.querySelector('i');
      if (mark) mark.textContent = active ? '✓' : '';
    });
    $$('[data-map-mode]').forEach(button => {
      const active = button.dataset.mapMode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function mapFocusPreference() {
    try { return localStorage.getItem('skymap.mapFocus') === 'true'; }
    catch (_) { return false; }
  }

  function setMapFocus(enabled, persist = true) {
    const active = Boolean(enabled && matchMedia('(min-width: 981px)').matches);
    document.body.classList.toggle('map-focus', active);
    const button = $('#focus-button');
    if (button) {
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Show the forecast briefing' : 'Focus on the map');
      const label = button.querySelector('b');
      if (label) label.textContent = active ? 'Show briefing' : 'Focus map';
    }
    if (persist) {
      try { localStorage.setItem('skymap.mapFocus', String(Boolean(enabled))); } catch (_) { }
    }
    setTimeout(() => state.map?.invalidateSize(), 240);
  }

  function recenter() {
    state.map.flyTo([state.place.lat, state.place.lon], state.place.zoom || 9, { duration: .7 });
  }

  async function refreshForecastSources(refreshId) {
    await Promise.allSettled(MODELS.map(readCachedModel));
    renderForecast();
    const primary = MODELS[0];
    await fetchModel(primary);
    if (refreshId !== state.refreshId) return;
    const rest = MODELS.slice(1).map(async model => {
      await fetchModel(model);
      if (refreshId === state.refreshId) renderForecast();
    });
    await Promise.allSettled(rest);
  }

  async function refreshAll(forceRadar = false) {
    const refreshId = ++state.refreshId;
    const button = $('#refresh-button');
    if (button) button.disabled = true;
    text('#model-status', 'Refreshing guidance');
    const radarPromise = refreshVisibleMap(forceRadar).then(async () => {
      if (isRadarMode()) {
        state.arrival = await probeArrival().catch(() => null);
        renderForecast();
        updateStory();
      }
    });
    const forecastPromise = refreshForecastSources(refreshId);
    const contextPromise = Promise.allSettled([fetchObservation(), fetchAlerts(), fetchAirQuality(), fetchCityWeather(forceRadar)]).then(() => { if (refreshId === state.refreshId) renderForecast(); });
    await Promise.allSettled([radarPromise, forecastPromise, contextPromise]);
    if (refreshId === state.refreshId && button) button.disabled = false;
  }

  async function loadVersion() {
    try {
      const response = await fetch('version.json', { cache: 'no-store' });
      if (response.ok) {
        const version = await response.json();
        state.version = version.version || state.version;
        text('#version-label', `${version.product || 'SkyMap Ontario'} ${state.version} · ${version.releaseName || ''}`.trim());
        document.title = `${version.product || 'SkyMap Ontario'} ${state.version}`;
      }
    } catch (_) {
      text('#version-label', `SkyMap Ontario ${state.version}`);
    }
  }

  function bindEvents() {
    $('#location-button')?.addEventListener('click', () => { renderLocations(); openSheet('location-sheet'); });
    $('#layers-button')?.addEventListener('click', () => openSheet('layers-sheet'));
    $('#focus-button')?.addEventListener('click', () => setMapFocus(!document.body.classList.contains('map-focus')));
    $('#forecast-details-button')?.addEventListener('click', () => openSheet('details-sheet'));
    $('#radar-state')?.addEventListener('click', () => state.radar.state === 'ok' ? openSheet('details-sheet') : refreshVisibleMap(true));
    $('#play-button')?.addEventListener('click', playRadar);
    $$('[data-horizon]').forEach(button => button.addEventListener('click', () => {
      stopPlayback();
      applyTimelineHorizon(button.dataset.horizon, { load: true, autoFrame: true });
    }));
    $('#alert-banner')?.addEventListener('click', () => { renderAlerts(); openSheet('alerts-sheet'); });
    $('#locate-button')?.addEventListener('click', () => {
      if (!navigator.geolocation) return showToast('Location is unavailable on this device');
      navigator.geolocation.getCurrentPosition(position => setPlace({ name: 'My location', lat: position.coords.latitude, lon: position.coords.longitude, zoom: 9 }), () => showToast('Location permission was not granted'), { enableHighAccuracy: true, timeout: 12000 });
    });
    $('#recenter-button')?.addEventListener('click', recenter);
    $('#zoom-in-button')?.addEventListener('click', () => state.map.zoomIn());
    $('#zoom-out-button')?.addEventListener('click', () => state.map.zoomOut());
    $('#refresh-button')?.addEventListener('click', () => refreshAll(true));
    $('#details-refresh-button')?.addEventListener('click', () => { closeSheets(); refreshAll(true); });
    $('#backdrop')?.addEventListener('click', closeSheets);
    $$('.sheet-close').forEach(button => button.addEventListener('click', closeSheets));
    $$('#layer-list button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.layer)));
    $$('[data-map-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mapMode)));
    $('.skip-link')?.addEventListener('click', () => setMapFocus(false));
    window.addEventListener('hashchange', () => {
      if (location.hash === '#forecast') setMapFocus(false);
    });
    window.addEventListener('online', () => refreshAll(false));
    window.addEventListener('offline', () => { setRadarState(state.weatherOverlay ? 'stale' : 'warn', 'Offline', state.weatherOverlay ? 'Showing the last successful image' : 'Forecast cache remains available'); showToast('Offline · showing saved weather'); });
    window.addEventListener('resize', () => {
      setMapFocus(mapFocusPreference(), false);
      state.snapshots.forEach((event, index) => {
        const canvas = $$('.snapshot-card canvas')[index];
        if (canvas) drawSnapshot(canvas, event, index);
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') return closeSheets();
      if (!isRadarMode()) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (!$('#timeline')?.contains(document.activeElement)) return;
        event.preventDefault();
        stopPlayback();
        const next = clamp(state.frameIndex + (event.key === 'ArrowRight' ? 1 : -1), 0, state.frames.length - 1);
        showRadarFrame(next, true);
        $$('#timeline .tick')[next]?.focus();
      }
    });
    window.SkyMapBack = () => { if (!$('.sheet:not([hidden])')) return false; closeSheets(); return true; };
  }

  async function start() {
    bindEvents();
    setMapFocus(location.hash === '#forecast' ? false : mapFocusPreference(), false);
    syncModeControls();
    renderLocations();
    renderLegend();
    setRibbonMode(isRadarMode());
    renderAlerts();
    text('#location-name', state.place.name);
    await loadVersion();
    initMap();
    await Promise.allSettled(MODELS.map(readCachedModel));
    renderForecast();
    await refreshAll(true);
  }

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }

  start().catch(error => {
    console.error(error);
    setRadarState('error', 'SkyMap needs another attempt', 'The interface loaded, but startup did not finish');
    text('#story-title', 'SkyMap needs another attempt.');
    text('#story-copy', 'Tap the radar status or Refresh. Forecast cache remains available when present.');
    $('#refresh-button').disabled = false;
  });
})();
