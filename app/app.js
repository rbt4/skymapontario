(() => {
  'use strict';

  const DIRECT_GEOMET = 'https://geo.weather.gc.ca/geomet';
  const NATIVE_GEOMET = 'https://appassets.androidplatform.net/geomet-proxy';
  const WEATHER_API = 'https://api.weather.gc.ca';
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
    rain: { label: 'Rain radar', layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR' },
    storm: { label: 'Storm radar', layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', contextLayer: 'Lightning_2.5km_Density', contextStyle: 'Lightning' },
    smoke: { label: 'Wildfire smoke forecast', layer: 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume', style: '' },
    temp: { label: 'Temperature forecast', layer: 'HRDPS.CONTINENTAL_TT', style: '' }
  };

  const state = {
    version: '14.1.1',
    place: loadPlace(),
    mode: 'rain',
    map: null,
    weatherOverlay: null,
    contextOverlay: null,
    objectUrls: new Set(),
    frames: [],
    frameIndex: 0,
    playing: false,
    playTimer: null,
    requestToken: 0,
    moveTimer: null,
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
    selectedSnapshot: null,
    refreshId: 0
  };

  function loadPlace() {
    try {
      const saved = JSON.parse(localStorage.getItem('skymap.place') || 'null');
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
    } catch (_) { }
    return { ...PLACES[0] };
  }

  function savePlace() {
    try { localStorage.setItem('skymap.place', JSON.stringify(state.place)); } catch (_) { }
    try { window.SkyMapNative?.rememberLocation?.(JSON.stringify(state.place)); } catch (_) { }
  }

  function cacheKey(model) {
    return `skymap.model.${model.id}.${state.place.lat.toFixed(2)}.${state.place.lon.toFixed(2)}`;
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
    if ([95, 96, 99].includes(code)) return { name: 'Thunderstorms', glyph: 'ϟ' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { name: 'Snow', glyph: '✦' };
    if ([61, 63, 65, 80, 81, 82].includes(code)) return { name: 'Rain', glyph: '◒' };
    if ([51, 53, 55, 56, 57].includes(code)) return { name: 'Drizzle', glyph: '⌁' };
    if ([45, 48].includes(code)) return { name: 'Fog', glyph: '≋' };
    if ([2, 3].includes(code)) return { name: code === 3 ? 'Cloudy' : 'Partly cloudy', glyph: '◐' };
    return { name: 'Mostly clear', glyph: '○' };
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
    const variants = [
      { latest: false, omitStyle: false },
      { latest: true, omitStyle: false },
      { latest: true, omitStyle: true }
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

  function initMap() {
    state.map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 4, maxZoom: 13, doubleClickZoom: true, preferCanvas: true, fadeAnimation: false }).setView([state.place.lat, state.place.lon], state.place.zoom || 8);
    state.map.createPane('weatherPane');
    state.map.getPane('weatherPane').style.zIndex = 340;
    state.map.createPane('contextPane');
    state.map.getPane('contextPane').style.zIndex = 350;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, opacity: .98 }).addTo(state.map);
    state.map.on('moveend', () => {
      clearTimeout(state.moveTimer);
      state.moveTimer = setTimeout(() => {
        if (!state.playing) refreshVisibleMap(false);
      }, 520);
    });
  }

  async function buildRadarFrames(force = false) {
    if (state.frames.length && !force) return state.frames;
    state.frameValue = null;
    setRadarState('loading', 'Connecting to ECCC radar', 'Reading observed and short-range frame times');
    const [observed, future] = await Promise.allSettled([
      getLayerMeta('RADAR_1KM_RRAI', force),
      getLayerMeta('Radar_1km_RainPrecipRate-Extrapolation', force)
    ]);
    const observedMeta = observed.status === 'fulfilled' ? observed.value : { times: [] };
    const futureMeta = future.status === 'fulfilled' ? future.value : { times: [] };
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
    state.frames = [
      ...pastTimes.map(time => ({ layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', time, referenceTime: observedMeta.defaultReferenceTime || observedMeta.referenceTimes?.at(-1) || null, kind: 'observed' })),
      ...futureTimes.map(time => ({ layer: 'Radar_1km_RainPrecipRate-Extrapolation', style: '', time, referenceTime: futureMeta.defaultReferenceTime || futureMeta.referenceTimes?.at(-1) || null, kind: 'nowcast' }))
    ];
    if (!state.frames.length) state.frames = [{ layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', time: observedMeta.defaultTime || null, referenceTime: observedMeta.defaultReferenceTime || null, kind: 'observed' }];
    state.frameIndex = state.frames.reduce((best, frame, index) => Math.abs(new Date(frame.time || now).getTime() - now) < Math.abs(new Date(state.frames[best].time || now).getTime() - now) ? index : best, 0);
    const slider = $('#timeline');
    slider.max = String(Math.max(0, state.frames.length - 1));
    slider.value = String(state.frameIndex);
    text('#timeline-past', pastTimes.length ? fmtTime(pastTimes[0]) : 'PAST 60M');
    text('#timeline-future', futureTimes.length ? fmtTime(futureTimes.at(-1)) : 'NEXT 2H');
    return state.frames;
  }

  function renderPlayback(frame) {
    const index = state.frameIndex;
    const slider = $('#timeline');
    if (slider) slider.value = String(index);
    const frameDate = frame?.time ? new Date(frame.time) : new Date();
    const minutes = Math.round((frameDate.getTime() - Date.now()) / 60000);
    text('#playback-label', Math.abs(minutes) <= 4 ? 'NOW' : minutes < 0 ? `${Math.abs(minutes)}m ago` : `+${minutes}m`);
    text('#playback-clock', frameStamp(frameDate));
    text('#playback-kind', frame?.kind === 'nowcast' ? 'NOWCAST' : 'OBSERVED');
  }

  async function showRadarFrame(index, force = false) {
    if (!state.frames.length) await buildRadarFrames();
    const safe = clamp(index, 0, state.frames.length - 1);
    if (!force && safe === state.frameIndex && state.weatherOverlay) return;
    state.frameIndex = safe;
    const frame = state.frames[safe];
    const token = ++state.requestToken;
    renderPlayback(frame);
    setRadarState('loading', frame.kind === 'nowcast' ? 'Loading official radar nowcast' : 'Loading observed ECCC radar', frame.time ? `${fmtTime(frame.time)} · ${IS_NATIVE ? 'native relay first' : 'direct public feed'}` : 'Using the latest available image');
    try {
      const loaded = await loadFrameImage(frame);
      if (token !== state.requestToken) return;
      replaceWeatherOverlay(loaded, .92);
      const transport = loaded.endpoint === NATIVE_GEOMET ? 'Native relay' : IS_NATIVE ? 'Direct fallback' : 'Direct web';
      setRadarState('ok', frame.kind === 'nowcast' ? 'Radar nowcast is live' : 'Observed radar is live', `${transport} · ${frame.time ? fmtTime(frame.time) : 'latest image'}`, { transport, lastSuccess: Date.now(), error: null });
      if (state.mode === 'storm') loadContextLayer({ layer: 'Lightning_2.5km_Density', style: 'Lightning', time: frame.time, kind: 'context' });
      else removeContextOverlay();
      updateStory();
      updateFrameExplanation(frame);
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
      const crossingNow = current.kind === 'observed' && next.kind === 'nowcast';
      state.frameIndex += 1;
      state.playTimer = setTimeout(advance, crossingNow ? 1650 : 1100);
    };
    advance();
  }

  async function loadStaticMode(mode) {
    stopPlayback();
    const config = MODES[mode];
    const meta = await getLayerMeta(config.layer, true);
    const target = new Date(Date.now() + (mode === 'smoke' ? 6 : 2) * 3600000);
    const frame = { layer: config.layer, style: config.style, time: nearest(meta.times, target) || meta.defaultTime, referenceTime: meta.defaultReferenceTime || meta.referenceTimes?.at(-1) || null, kind: 'model' };
    setRadarState('loading', `Loading ${config.label.toLowerCase()}`, 'Official forecast guidance');
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

  async function refreshVisibleMap(force = false) {
    if (!state.map) return;
    if (state.mode === 'rain' || state.mode === 'storm') {
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

  function readCachedModel(model) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(model)) || 'null');
      if (cached?.data?.hourly?.time?.length && Date.now() - cached.savedAt < 6 * 3600000) {
        state.modelData.set(model.id, cached.data);
        if (cached.data.timezone) state.forecastTimeZone = cached.data.timezone;
        return cached.data;
      }
    } catch (_) { }
    try {
      const raw = window.SkyMapNative?.getCache?.(`${model.id}:${state.place.lat.toFixed(2)},${state.place.lon.toFixed(2)}`);
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
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0b2131'); gradient.addColorStop(.55, '#0a1825'); gradient.addColorStop(1, '#06101a');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(100,219,255,.08)'; ctx.lineWidth = 1;
    for (let x = -height; x < width; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke(); }
    ctx.fillStyle = 'rgba(44,113,143,.24)';
    ctx.beginPath(); ctx.ellipse(width * .76, height * .5, width * .34, height * .26, -.24, 0, Math.PI * 2); ctx.fill();
    const wet = event.blend?.wet ?? event.day?.wet ?? 15;
    const rainBands = wet >= 50 ? 4 : wet >= 25 ? 2 : 0;
    for (let band = 0; band < rainBands; band += 1) {
      const x = width * (.05 + band * .14 + index * .015);
      const g = ctx.createLinearGradient(x, 0, x + width * .35, height);
      g.addColorStop(0, 'rgba(100,219,255,0)'); g.addColorStop(.5, `rgba(95,137,255,${.15 + wet / 180})`); g.addColorStop(1, 'rgba(190,100,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x + width * .16, height * .38, width * .08, height * .58, -.45, 0, Math.PI * 2); ctx.fill();
    }
    if (event.kind === 'night') {
      ctx.fillStyle = 'rgba(217,255,118,.68)'; ctx.beginPath(); ctx.arc(width * .78, height * .22, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a1825'; ctx.beginPath(); ctx.arc(width * .785, height * .215, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.arc(width * .58, height * .56, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(100,219,255,.42)'; ctx.beginPath(); ctx.arc(width * .58, height * .56, 12, 0, Math.PI * 2); ctx.stroke();
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
      button.innerHTML = `<canvas aria-hidden="true"></canvas><span class="snapshot-shade"></span><span class="snapshot-copy"><small>${event.label}</small><h3>${event.title}</h3><p>${event.copy}</p><time>${event.when}</time></span>`;
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
        row.innerHTML = `<span class="day-name"><b>${index === 0 ? 'Today' : dayName(day.date)}</b><small>${monthDay(day.date)}</small></span><span class="day-icon">○</span><span class="day-condition">Forecast unavailable</span><span class="rain-meter"><span><i style="width:0"></i></span><b>—</b></span><span class="day-temps">—</span>`;
      } else {
        const rainLabel = day.rain < .1 ? 'Dry' : `${day.rain.toFixed(day.rain < 10 ? 1 : 0)} mm`;
        const rainWidth = day.rain < .1 ? 0 : clamp(day.rain / 15 * 100, 5, 100);
        row.innerHTML = `<span class="day-name"><b>${index === 0 ? 'Today' : dayName(day.date)}</b><small>${monthDay(day.date)}</small></span><span class="day-icon">${day.weather.glyph}</span><span class="day-condition">${day.weather.name}${day.gust >= 42 ? ' · windy' : ''}</span><span class="rain-meter"><span><i style="width:${rainWidth}%"></i></span><b>${rainLabel}</b></span><span class="day-temps">${Math.round(day.high)}° <span>${Math.round(day.low)}°</span></span>`;
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

  async function fetchAlerts() {
    const p = state.place;
    try {
      const data = await fetchJson(`${WEATHER_API}/collections/weather-alerts/items?f=json&limit=20&bbox=${p.lon - 1.6},${p.lat - 1.1},${p.lon + 1.6},${p.lat + 1.1}`, 10000);
      state.alerts = data.features || [];
    } catch (_) { state.alerts = []; }
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
    const delta = .04;
    const query = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo', SRS: 'EPSG:4326', BBOX: `${p.lon - delta},${p.lat - delta},${p.lon + delta},${p.lat + delta}`, WIDTH: '20', HEIGHT: '20', X: '10', Y: '10', LAYERS: frame.layer, QUERY_LAYERS: frame.layer, INFO_FORMAT: 'application/json', FORMAT: 'image/png', TIME: formatWmsTime(frame.time) });
    if (frame.style) query.set('STYLES', frame.style);
    if (frame.referenceTime) query.set('DIM_REFERENCE_TIME', frame.referenceTime);
    for (const endpoint of geometEndpoints()) {
      try {
        const response = await fetchWithTimeout(`${endpoint}?${query}`, { cache: 'no-store' }, 7000);
        if (!response.ok) throw new Error(response.status);
        const data = await response.json();
        const direct = finite(data.features?.[0]?.properties?.value);
        return direct ?? numericFrom(data);
      } catch (_) { }
    }
    return undefined;
  }

  function frameKey(frame) {
    return `${frame?.layer || ''}|${frame?.time || 'latest'}|${frame?.referenceTime || ''}`;
  }

  function rainDescription(value, future, pending = false) {
    const verb = future ? 'The official nowcast projects' : 'Observed radar detected';
    if (pending) return ['Reading this exact point…', 'The radar image loaded; its local rain rate is still resolving.'];
    if (value === undefined) return ['Exact rain rate is unavailable.', 'The radar image is live, but the official point query did not return a usable value for this frame.'];
    if (value === null) return ['No radar return at this point.', `${verb} no measurable return at the selected location for this frame.`];
    if (value < .05) return [future ? 'No measurable rain is projected here.' : 'No measurable rain is over this point.', `${verb} no measurable rain at the selected location for this frame.`];
    if (value < .5) return ['A trace of rain is over this point.', `${verb} spotty or very light rain at the selected location.`];
    if (value < 2.5) return ['Light rain is over this point.', `${verb} light rain at the selected location.`];
    if (value < 7.5) return ['Steady rain is over this point.', `${verb} moderate rain at the selected location.`];
    if (value < 15) return ['Heavy rain is over this point.', `${verb} heavy rain; visibility and local drainage may worsen.`];
    return ['Very heavy rain is over this point.', `${verb} an intense rain rate. Check active warnings before travelling.`];
  }

  function renderStoryFacts(frame, value) {
    const facts = $('#story-facts');
    if (!facts) return;
    if (state.mode !== 'rain' && state.mode !== 'storm') { facts.hidden = true; return; }
    const target = frame?.time ? new Date(frame.time) : new Date();
    const official = nearestCitySnapshot(target);
    const blend = blendedAt(target);
    facts.hidden = false;
    text('#story-value-label', frame?.kind === 'nowcast' ? 'NOWCAST AT THIS POINT' : 'OBSERVED AT THIS POINT');
    const pending = state.frameValue?.pending;
    text('#story-value', pending ? 'Rate still resolving' : value === undefined ? 'Point value unavailable' : value === null ? 'No radar return' : `${value < .05 ? '0' : value.toFixed(value < 10 ? 1 : 0)} mm/h`);
    text('#story-official', officialWeatherLabel(official));
    text('#story-guidance', guidanceLabel(blend));
  }

  async function updateFrameExplanation(frame) {
    if (!frame || (state.mode !== 'rain' && state.mode !== 'storm')) return;
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
    const observed = [...state.frames].reverse().find(frame => frame.kind === 'observed');
    const future = state.frames.filter(frame => frame.kind === 'nowcast').slice(0, 4);
    const current = observed ? await featureInfo(observed) : null;
    if (current != null && current > .08) return { state: 'now', label: 'over you now', detail: 'Observed radar detects precipitation at the selected point.' };
    for (const frame of future) {
      const value = await featureInfo(frame);
      if (value != null && value > .08) {
        const minutes = Math.max(0, Math.round((new Date(frame.time).getTime() - Date.now()) / 60000));
        return { state: 'approaching', label: minutes < 15 ? 'within 15 minutes' : `in about ${Math.max(10, minutes - 10)}–${minutes + 10} minutes`, detail: 'The official radar extrapolation reaches the selected point.' };
      }
    }
    return null;
  }

  function updateStory() {
    if (state.selectedSnapshot) return;
    const frame = state.frames[state.frameIndex];
    if (state.mode !== 'rain' && state.mode !== 'storm') {
      const facts = $('#story-facts');
      if (facts) facts.hidden = true;
      const config = MODES[state.mode];
      text('#story-source', 'FORECAST GUIDANCE');
      text('#story-time', frame?.time ? frameStamp(frame.time) : 'LATEST');
      text('#story-title', config.label);
      text('#story-copy', state.radar.state === 'ok' ? 'Official model guidance is displayed over the selected area.' : 'The map layer is delayed, but the forecast cards remain available.');
      return;
    }
    text('#story-source', frame?.kind === 'nowcast' ? 'RADAR NOWCAST' : state.mode === 'storm' ? 'RADAR + LIGHTNING' : 'OBSERVED RADAR');
    text('#story-time', frame?.time ? frameStamp(frame.time) : 'NOW');
    if (state.playing) {
      const facts = $('#story-facts');
      if (facts) facts.hidden = true;
      text('#story-title', 'Watching the weather move.');
      text('#story-copy', 'Playback runs once, slows at the boundary between observed radar and nowcast, then explains the final frame.');
      return;
    }
    if (state.radar.state === 'error' && !state.weatherOverlay) {
      text('#story-title', 'Radar needs another attempt.');
      text('#story-copy', 'Forecast snapshots and the seven-day view are still available below.');
      return;
    }
    if (state.frameValue?.key === frameKey(frame)) {
      const future = frame?.kind === 'nowcast';
      const [headline, copy] = rainDescription(state.frameValue.value, future, state.frameValue.pending);
      if (!state.frameValue.pending && !future && Number.isFinite(state.frameValue.value) && state.frameValue.value < .05 && state.arrival?.state === 'approaching') {
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
    state.selectedSnapshot = event;
    text('#details-title', event.title);
    text('#detail-change-title', event.when);
    text('#detail-change-copy', event.copy);
    openSheet('details-sheet');
  }

  function openDay(day) {
    if (day.unavailable) return showToast('This day is not available yet');
    text('#details-title', `${dayName(day.date)}, ${monthDay(day.date)}`);
    text('#detail-change-title', `${day.weather.name} · ${day.rain < .1 ? 'little meaningful rain' : `${day.rain.toFixed(day.rain < 10 ? 1 : 0)} mm guidance blend`}`);
    text('#detail-change-copy', `High near ${Math.round(day.high)}°, low near ${Math.round(day.low)}°, with blended gusts peaking around ${Math.round(day.gust)} km/h.`);
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
      button.innerHTML = `<span><b>${place.name}</b><small>${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}</small></span><i>${button.className ? '✓' : '›'}</i>`;
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
    state.modelData.clear();
    state.modelErrors.clear();
    state.cityWeather = null;
    state.cityWeatherKey = '';
    state.frames = [];
    state.arrival = null;
    MODELS.forEach(readCachedModel);
    renderForecast();
    await refreshAll(true);
  }

  async function setMode(mode) {
    if (!MODES[mode] || mode === state.mode) return closeSheets();
    state.mode = mode;
    $$('#layer-list button').forEach(button => {
      const active = button.dataset.layer === mode;
      button.classList.toggle('active', active);
      const mark = button.querySelector('i');
      if (mark) mark.textContent = active ? '✓' : '';
    });
    closeSheets();
    await refreshVisibleMap(true);
  }

  function recenter() {
    state.map.flyTo([state.place.lat, state.place.lon], state.place.zoom || 9, { duration: .7 });
  }

  async function refreshForecastSources(refreshId) {
    MODELS.forEach(readCachedModel);
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
      if (state.mode === 'rain' || state.mode === 'storm') {
        state.arrival = await probeArrival().catch(() => null);
        renderForecast();
        updateStory();
      }
    });
    const forecastPromise = refreshForecastSources(refreshId);
    const contextPromise = Promise.allSettled([fetchObservation(), fetchAlerts(), fetchCityWeather(forceRadar)]).then(() => { if (refreshId === state.refreshId) renderForecast(); });
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
    $('#forecast-details-button')?.addEventListener('click', () => openSheet('details-sheet'));
    $('#radar-state')?.addEventListener('click', () => state.radar.state === 'ok' ? openSheet('details-sheet') : refreshVisibleMap(true));
    $('#play-button')?.addEventListener('click', playRadar);
    $('#timeline')?.addEventListener('input', event => { stopPlayback(); showRadarFrame(Number(event.target.value), true); });
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
    window.addEventListener('online', () => refreshAll(false));
    window.addEventListener('offline', () => { setRadarState(state.weatherOverlay ? 'stale' : 'warn', 'Offline', state.weatherOverlay ? 'Showing the last successful image' : 'Forecast cache remains available'); showToast('Offline · showing saved weather'); });
    window.addEventListener('resize', () => state.snapshots.forEach((event, index) => { const canvas = $$('.snapshot-card canvas')[index]; if (canvas) drawSnapshot(canvas, event, index); }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSheets(); });
    window.SkyMapBack = () => { if (!$('.sheet:not([hidden])')) return false; closeSheets(); return true; };
  }

  async function start() {
    bindEvents();
    renderLocations();
    text('#location-name', state.place.name);
    await loadVersion();
    initMap();
    MODELS.forEach(readCachedModel);
    renderForecast();
    await refreshAll(true);
  }

  start().catch(error => {
    console.error(error);
    setRadarState('error', 'SkyMap needs another attempt', 'The interface loaded, but startup did not finish');
    text('#story-title', 'SkyMap needs another attempt.');
    text('#story-copy', 'Tap the radar status or Refresh. Forecast cache remains available when present.');
    $('#refresh-button').disabled = false;
  });
})();
