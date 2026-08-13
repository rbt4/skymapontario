(() => {
  'use strict';

  const script = document.currentScript;
  const phase = script?.dataset?.phase || 'augment';
  const ORIGINAL_KEY = '__skymapNativeFetch25';
  const MISSING = '__skymap_missing__';
  const NULL_GUARD_RE = /^https:\/\/api\.open-meteo\.com\/v1\/(?:forecast|gem|ecmwf|gfs)(?:\?|$)|api\.weather\.gc\.ca\/collections\/citypageweather-realtime/i;

  function guardKnownNumericNulls(value, parentKey = '') {
    if (value === null) return /precip|rain|shower|snow|weather_code|temperature|cloud|wind|lop|prob/i.test(parentKey) ? MISSING : null;
    if (Array.isArray(value)) return value.map(item => guardKnownNumericNulls(item, parentKey));
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = guardKnownNumericNulls(item, key);
    return out;
  }

  function restoreMissing(value) {
    if (value === MISSING) return null;
    if (Array.isArray(value)) return value.map(restoreMissing);
    if (!value || typeof value !== 'object') return value;
    for (const [key, item] of Object.entries(value)) value[key] = restoreMissing(item);
    return value;
  }

  function jsonResponseLike(response, data, headerName, headerValue) {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json');
    if (headerName) headers.set(headerName, headerValue);
    return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
  }

  if (phase === 'capture') {
    if (!window[ORIGINAL_KEY]) window[ORIGINAL_KEY] = window.fetch.bind(window);
    const native = window[ORIGINAL_KEY];
    window.fetch = async function skyMapNullGuard25(input, init) {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      const response = await native(input, init);
      if (!response.ok || !NULL_GUARD_RE.test(url)) return response;
      try {
        const data = await response.clone().json();
        return jsonResponseLike(response, guardKnownNumericNulls(data), 'x-skymap-null-guard', '25');
      } catch (_) {
        return response;
      }
    };
    return;
  }

  const VERSION = '25.0.0';
  const nativeFetch = window[ORIGINAL_KEY] || window.fetch.bind(window);
  const upstreamFetch = window.fetch.bind(window);
  const ENSEMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble';
  const WEATHER_NEXT_MODEL = 'google_weathernext2_ensemble';
  const MODEL_RE = /^https:\/\/api\.open-meteo\.com\/v1\/(gem|ecmwf|gfs)(?:\?|$)/i;
  const CACHE_TTL = 30 * 60 * 1000;
  const contextCache = new Map();

  const finite = value => value === null || value === undefined || value === '' || value === MISSING ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
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

  function annotate(data, context, id) {
    restoreMissing(data);
    if (!data?.hourly?.time?.length) return data;
    data.skymap_iq25 = {
      version: VERSION,
      model: id,
      mode: 'weathernext-ensemble-single-pass-sidecar',
      null_guard: 'known numeric nulls stay missing through model loading and consensus routing',
      weathernext_rows_available: context?.rows?.size || 0,
      weathernext_members: context?.members || 0,
      model_rows_mutated: 0,
      note: 'WeatherNext is exposed to the Lab 33 router once; model arrays remain raw.'
    };
    return data;
  }

  function cloneJsonResponse(response, data) {
    return jsonResponseLike(response, data, 'x-skymap-forecast-iq25', VERSION);
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
    if (!response.ok) return response;
    try {
      const data = restoreMissing(await response.clone().json());
      if (!context) return cloneJsonResponse(response, data);
      return cloneJsonResponse(response, annotate(data, context, modelId(url)));
    } catch (_) {
      return response;
    }
  };

  window.SkyMapForecastIQ25 = {
    version: VERSION,
    source: 'Google DeepMind WeatherNext 2 via Open-Meteo Ensemble API',
    mode: 'single-pass-sidecar+legacy-null-guard',
    cache: contextCache,
    at(lat, lon, target) {
      return weatherNextAt(contextCache.get(placeKey(lat, lon))?.data, target);
    }
  };
})();
