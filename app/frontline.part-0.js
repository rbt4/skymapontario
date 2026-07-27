(() => {
  'use strict';

  const GEOMET = 'https://geo.weather.gc.ca/geomet';
  const NATIVE_GEOMET = 'https://appassets.androidplatform.net/geomet-proxy';
  const WEATHER = 'https://api.weather.gc.ca';
  const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
  const RADAR = 'RADAR_1KM_RRAI';
  const RADAR_STYLE = 'RADARURPPRECIPR14-LINEAR';
  const NOWCAST = 'Radar_1km_RainPrecipRate-Extrapolation';
  const SATELLITE = 'GOES-East_1km_DayVis-NightIR';
  const IS_NATIVE = location.hostname === 'appassets.androidplatform.net';
  const WET_WORDS = /(drizzle|rain|shower|precipitation|sprinkle|freezing drizzle|freezing rain)/i;
  const DIRECTIONS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
  const geo = navigator.geolocation;
  const originalGetCurrentPosition = geo?.getCurrentPosition?.bind(geo);
  const originalWatchPosition = geo?.watchPosition?.bind(geo);
  const originalClearWatch = geo?.clearWatch?.bind(geo);

  const state = {
    map: null,
    follow: true,
    watchId: null,
    position: null,
    lastApplied: null,
    applying: false,
    locality: '',
    accuracyCircle: null,
    truth: null,
    truthToken: 0,
    truthTimer: null,
    metadata: new Map(),
    cloudEnabled: loadCloudPreference(),
    cloudOverlay: null,
    cloudTimer: null,
    rewriting: false
  };

  const $ = selector => document.querySelector(selector);
  const finite = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const english = value => value && typeof value === 'object' && 'en' in value ? value.en : value;
  const endpoints = () => IS_NATIVE ? [NATIVE_GEOMET, GEOMET] : [GEOMET];

  function loadCloudPreference() {
    try { return localStorage.getItem('skymap.cloudFront') !== 'false'; }
    catch (_) { return true; }
  }

  function saveCloudPreference() {
    try { localStorage.setItem('skymap.cloudFront', String(state.cloudEnabled)); } catch (_) { }
  }

  function fmtTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date) : '—';
  }

  function distanceKm(a, b) {
    const toRad = value => value * Math.PI / 180;
    const dLat = toRad(Number(b.lat) - Number(a.lat));
    const dLon = toRad(Number(b.lon) - Number(a.lon));
    const lat1 = toRad(Number(a.lat));
    const lat2 = toRad(Number(b.lat));
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function offsetPoint(point, distance, bearing) {
    const radians = bearing * Math.PI / 180;
    return {
      lat: point.lat + Math.cos(radians) * distance / 111.32,
      lon: point.lon + Math.sin(radians) * distance / (111.32 * Math.max(.2, Math.cos(point.lat * Math.PI / 180)))
    };
  }

  function savedPoint() {
    try {
      const place = JSON.parse(localStorage.getItem('skymap.place') || 'null');
      if (Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lon))) {
        return { lat: Number(place.lat), lon: Number(place.lon), name: String(place.name || 'Selected place') };
      }
    } catch (_) { }
    return { lat: 43.6532, lon: -79.3832, name: 'Toronto' };
  }

  function activePoint() {
    if (state.follow && state.position) {
      return { lat: state.position.coords.latitude, lon: state.position.coords.longitude, name: state.locality || 'Current location' };
    }
    return savedPoint();
  }

  async function fetchText(url, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return text;
    } finally { clearTimeout(timer); }
  }

  async function fetchJson(url, timeout = 12000) {
    return JSON.parse(await fetchText(url, timeout));
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().replace(/\.\d{3}Z$/, 'Z') : String(value || '');
  }

  function expandTimes(value) {
    const source = String(value || '').trim();
    if (!source) return [];
    if (source.includes(',')) return source.split(',').map(item => formatTime(item.trim())).filter(Boolean);
    if (!source.includes('/')) return [formatTime(source)];
    const [startRaw, endRaw, period] = source.split('/');
    const start = new Date(startRaw).getTime();
    const end = new Date(endRaw).getTime();
    const duration = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(period || '');
    const step = ((Number(duration?.[1]) || 0) * 60 + (Number(duration?.[2]) || 0)) * 60000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || !step) return [];
    const output = [];
    for (let time = start; time <= end && output.length < 1600; time += step) output.push(formatTime(time));
    return output;
  }

  function childText(node, name) {
    for (const child of node.children || []) if (child.localName === name) return child.textContent?.trim() || '';
    return '';
  }

  async function layerMeta(layer, force = false) {
    const cached = state.metadata.get(layer);
    if (!force && cached && Date.now() - cached.loadedAt < 8 * 60000) return cached;
    let lastError;
    for (const endpoint of endpoints()) {
      try {
        const query = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetCapabilities', LAYERS: layer, layer, lang: 'en', _: Date.now() });
        const xml = new DOMParser().parseFromString(await fetchText(`${endpoint}?${query}`, 10000), 'application/xml');
        const node = [...xml.getElementsByTagNameNS('*', 'Layer')].find(item => childText(item, 'Name') === layer);
        if (!node) throw new Error(`Layer ${layer} not found`);
        const dimensions = [...node.getElementsByTagNameNS('*', 'Dimension'), ...node.getElementsByTagNameNS('*', 'Extent')];
        const time = dimensions.find(item => (item.getAttribute('name') || '').toLowerCase() === 'time');
        const reference = dimensions.find(item => (item.getAttribute('name') || '').toLowerCase() === 'reference_time');
        const result = {
          times: expandTimes(time?.textContent),
          defaultTime: time?.getAttribute('default') || null,
          references: expandTimes(reference?.textContent),
          defaultReference: reference?.getAttribute('default') || null,
          loadedAt: Date.now()
        };
        state.metadata.set(layer, result);
        return result;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Weather metadata unavailable');
  }
