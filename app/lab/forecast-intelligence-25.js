(() => {
  'use strict';

  const script = document.currentScript;
  const phase = script?.dataset?.phase || 'augment';
  const ORIGINAL_KEY = '__skymapNativeFetch25';

  if (phase === 'capture') {
    if (!window[ORIGINAL_KEY]) window[ORIGINAL_KEY] = window.fetch.bind(window);
    return;
  }

  const VERSION = '25.0.0';
  const nativeFetch = window[ORIGINAL_KEY] || window.fetch.bind(window);
  const upstreamFetch = window.fetch.bind(window);
  const ENSEMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble';
  const WEATHER_NEXT_MODEL = 'google_weathernext2_ensemble';
  const MODEL_RE = /^https:\/\/api\.open-meteo\.com\/v1\/(gem|ecmwf|gfs)(?:\?|$)/i;
  const PRECIP_CODES = new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
  const SNOW_CODES = new Set([71,73,75,77,85,86]);
  const CACHE_TTL = 30 * 60 * 1000;
  const contextCache = new Map();

  const finite = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const roundHour = value => {
    const date = new Date(value);
    date.setMinutes(0, 0, 0);
    return date.getTime();
  };
  const placeKey = (lat, lon) => `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;

  function modelId(url) {
    const parsed = new URL(url);
    const model = (parsed.searchParams.get('models') || '').toLowerCase();
    if (model.includes('aifs')) return 'aifs';
    if (parsed.pathname.includes('/ecmwf')) return 'ifs';
    if (parsed.pathname.includes('/gfs')) return 'gfs';
    if (parsed.pathname.includes('/gem')) return 'gem';
    return 'model';
  }

  function weatherNextUrl(lat, lon) {
    const params = new URLSearchParams({
      latitude: Number(lat).toFixed(4),
      longitude: Number(lon).toFixed(4),
      timezone: 'UTC',
      forecast_days: '8',
      models: WEATHER_NEXT_MODEL,
      hourly: 'precipitation,weather_code'
    });
    return `${ENSEMBLE}?${params}`;
  }

  function percentile(values, q) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function parseWeatherNext(data) {
    const hourly = data?.hourly;
    const times = hourly?.time || [];
    if (!times.length) throw new Error('WeatherNext time axis missing');
    const precipKeys = Object.keys(hourly).filter(key => /^precipitation(?:_member\d+)?$/i.test(key) && Array.isArray(hourly[key]));
    if (precipKeys.length < 24) throw new Error(`WeatherNext member arrays unavailable (${precipKeys.length})`);
    const rows = new Map();
    times.forEach((time, index) => {
      const values = precipKeys.map(key => finite(hourly[key]?.[index])).filter(value => value != null).map(value => Math.max(0, value));
      if (values.length < 20) return;
      const wet = values.filter(value => value >= 0.10).length;
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const p10 = percentile(values, 0.10) || 0;
      const p90 = percentile(values, 0.90) || 0;
      rows.set(roundHour(time), {
        probability: 100 * wet / values.length,
        mean,
        spread: Math.max(0, p90 - p10),
        members: values.length
      });
    });
    if (!rows.size) throw new Error('WeatherNext produced no usable ensemble rows');
    return { rows, members: precipKeys.length, fetchedAt: Date.now() };
  }

  async function fetchWeatherNext(lat, lon) {
    const response = await nativeFetch(weatherNextUrl(lat, lon), { cache: 'no-store' });
    if (!response.ok) throw new Error(`WeatherNext ${response.status}`);
    return parseWeatherNext(await response.json());
  }

  async function getWeatherNext(lat, lon) {
    const key = placeKey(lat, lon);
    const cached = contextCache.get(key);
    if (cached?.data && Date.now() - cached.savedAt < CACHE_TTL) return cached.data;
    if (cached?.promise) return cached.promise;
    const promise = fetchWeatherNext(lat, lon)
      .then(data => {
        contextCache.set(key, { savedAt: Date.now(), data });
        return data;
      })
      .catch(error => {
        contextCache.set(key, { savedAt: Date.now(), data: null, error: String(error?.message || error) });
        return null;
      });
    contextCache.set(key, { savedAt: 0, data: null, promise });
    return promise;
  }

  function weatherNextAt(context, target) {
    if (!context?.rows?.size) return null;
    const wanted = roundHour(target);
    let row = context.rows.get(wanted) || null;
    if (row) return row;
    let best = null, delta = Infinity;
    for (const [time, candidate] of context.rows) {
      const distance = Math.abs(time - wanted);
      if (distance < delta) { delta = distance; best = candidate; }
    }
    return delta <= 75 * 60000 ? best : null;
  }

  function dryCode(code) {
    return PRECIP_CODES.has(Number(code)) ? 3 : Number(code || 0);
  }

  function augment(data, context, id) {
    if (!data?.hourly?.time?.length || !context) return data;
    const hourly = data.hourly;
    const now = Date.now();
    let used = 0;
    let probabilitySum = 0;
    let maxMembers = 0;

    hourly.time.forEach((time, index) => {
      const target = new Date(time).getTime();
      if (!Number.isFinite(target)) return;
      const leadHours = Math.max(0, (target - now) / 3600000);
      if (leadHours <= 2.3 || leadHours > 168) return; // radar/official nowcast remains king at short range
      const wn = weatherNextAt(context, target);
      if (!wn || wn.members < 20) return;

      const precip0 = finite(hourly.precipitation?.[index]);
      if (precip0 == null) return;
      let precip = Math.max(0, precip0);
      let rain = Math.max(0, finite(hourly.rain?.[index]) || 0);
      let showers = Math.max(0, finite(hourly.showers?.[index]) || 0);
      const snowfall = Math.max(0, finite(hourly.snowfall?.[index]) || 0);
      let code = Number(hourly.weather_code?.[index] || 0);
      const snowSignal = snowfall > 0.02 || SNOW_CODES.has(code);
      const probability = clamp(wn.probability, 0, 100);
      const confidence = Math.abs(probability - 50) / 50;
      const baseWeight = leadHours <= 24 ? 0.13 : leadHours <= 72 ? 0.19 : 0.14;
      const weight = baseWeight * (0.55 + 0.45 * confidence);
      const probabilityFactor = clamp(0.72 + 0.56 * probability / 100, 0.72, 1.28);
      const amountFactor = wn.mean > 0 ? clamp(0.78 + Math.min(0.42, wn.mean * 0.25), 0.78, 1.20) : 0.82;
      const factor = probabilityFactor * 0.72 + amountFactor * 0.28;
      const blendedFactor = 1 + (factor - 1) * weight;

      precip *= blendedFactor;
      rain *= blendedFactor;
      showers *= blendedFactor;

      // Strong ensemble disagreement should widen uncertainty, not create false hourly precision.
      if (probability >= 35 && probability <= 65 && wn.spread > 0.8 && leadHours > 24) {
        precip *= 0.92;
        rain *= 0.92;
        showers *= 0.92;
      }

      // Extreme 64-member consensus is allowed a small veto/rescue, never an absolute override.
      if (!snowSignal && probability <= 8 && precip0 < 0.30) {
        precip *= 0.72;
        rain *= 0.72;
        showers *= 0.72;
        if (precip < 0.09) code = dryCode(code);
      } else if (probability >= 80 && wn.mean >= 0.06 && precip < 0.13) {
        precip = 0.13;
        if (rain + showers < 0.10) rain = Math.max(rain, 0.10);
      }

      hourly.precipitation[index] = Number(Math.max(0, precip).toFixed(3));
      if (Array.isArray(hourly.rain)) hourly.rain[index] = Number(Math.max(0, rain).toFixed(3));
      if (Array.isArray(hourly.showers)) hourly.showers[index] = Number(Math.max(0, showers).toFixed(3));
      if (Array.isArray(hourly.weather_code)) hourly.weather_code[index] = code;
      used++;
      probabilitySum += probability;
      maxMembers = Math.max(maxMembers, wn.members);
    });

    data.skymap_iq25 = {
      version: VERSION,
      mode: 'weathernext-ensemble-shadow-augmentation',
      model: id,
      weathernext_rows_used: used,
      weathernext_members: maxMembers || context.members || 0,
      mean_weathernext_probability: used ? Number((probabilitySum / used).toFixed(1)) : null,
      note: 'WeatherNext is a bounded cross-check. ECCC radar and official short-range guidance retain priority.'
    };
    return data;
  }

  function cloneJsonResponse(response, data) {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-skymap-forecast-iq25', VERSION);
    return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
  }

  window.fetch = async function skyMapForecastIQ25(input, init) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (!MODEL_RE.test(url)) return upstreamFetch(input, init);
    const parsed = new URL(url);
    const lat = finite(parsed.searchParams.get('latitude'));
    const lon = finite(parsed.searchParams.get('longitude'));
    if (lat == null || lon == null) return upstreamFetch(input, init);

    const [response, context] = await Promise.all([
      upstreamFetch(input, init),
      getWeatherNext(lat, lon)
    ]);
    if (!response.ok || !context) return response;
    try {
      const data = await response.clone().json();
      return cloneJsonResponse(response, augment(data, context, modelId(url)));
    } catch (_) {
      return response;
    }
  };

  window.SkyMapForecastIQ25 = {
    version: VERSION,
    source: 'Google DeepMind WeatherNext 2 via Open-Meteo Ensemble API',
    mode: 'bounded-ensemble-cross-check',
    cache: contextCache
  };
})();
