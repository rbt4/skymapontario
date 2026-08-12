(() => {
  'use strict';

  const VERSION = '20.0.1';
  const nativeFetch = window.fetch.bind(window);
  const ANCHOR_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const ANCHOR_TTL = 20 * 60 * 1000;
  const MODEL_RE = /^https:\/\/api\.open-meteo\.com\/v1\/(gem|ecmwf|gfs)(?:\?|$)/i;
  const RADAR_RE = /geo\.weather\.gc\.ca\/geomet/i;
  const PRECIP_CODES = new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
  const SNOW_CODES = new Set([71,73,75,77,85,86]);
  const anchorCache = new Map();

  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const placeBucket = (lat, lon) => `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  const roundHour = value => {
    const date = new Date(value);
    date.setMinutes(0, 0, 0);
    return date.getTime();
  };

  function modelIdFromUrl(url) {
    const parsed = new URL(url);
    const model = (parsed.searchParams.get('models') || '').toLowerCase();
    if (model.includes('aifs')) return 'aifs';
    if (parsed.pathname.includes('/ecmwf')) return 'ifs';
    if (parsed.pathname.includes('/gfs')) return 'gfs';
    if (parsed.pathname.includes('/gem')) return 'gem';
    return 'model';
  }

  function resetLegacyModelCache() {
    try {
      if (localStorage.getItem('skymap.accuracy.version') === VERSION) return;
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('skymap.lab.model.')) localStorage.removeItem(key);
      });
      localStorage.setItem('skymap.accuracy.version', VERSION);
    } catch (_) {}
  }

  function anchorUrl(lat, lon) {
    const params = new URLSearchParams({
      latitude: Number(lat).toFixed(4),
      longitude: Number(lon).toFixed(4),
      timezone: 'auto',
      forecast_days: '8',
      cell_selection: 'land',
      hourly: [
        'temperature_2m','precipitation_probability','precipitation','rain','showers','snowfall',
        'weather_code','cloud_cover','wind_speed_10m','wind_gusts_10m','wind_direction_10m'
      ].join(',')
    });
    return `${ANCHOR_ENDPOINT}?${params}`;
  }

  async function getAnchor(lat, lon) {
    const key = placeBucket(lat, lon);
    const cached = anchorCache.get(key);
    if (cached?.data && Date.now() - cached.savedAt < ANCHOR_TTL) return cached.data;
    if (cached?.promise) return cached.promise;

    const promise = nativeFetch(anchorUrl(lat, lon), { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`anchor ${response.status}`);
        return response.json();
      })
      .then(data => {
        anchorCache.set(key, { savedAt: Date.now(), data });
        return data;
      })
      .catch(error => {
        anchorCache.delete(key);
        throw error;
      });
    anchorCache.set(key, { savedAt: 0, data: null, promise });
    return promise;
  }

  function indexByTime(data) {
    const map = new Map();
    (data?.hourly?.time || []).forEach((time, index) => map.set(roundHour(time), index));
    return map;
  }

  function readSkill(bucket, modelId) {
    try {
      const all = JSON.parse(localStorage.getItem(`skymap.accuracy.skill.${bucket}`) || '{}');
      const score = finite(all?.[modelId]?.score);
      return score == null ? 0.72 : clamp(score, 0.35, 0.98);
    } catch (_) {
      return 0.72;
    }
  }

  function writeSkill(bucket, modelId, correct) {
    try {
      const key = `skymap.accuracy.skill.${bucket}`;
      const all = JSON.parse(localStorage.getItem(key) || '{}');
      const old = all[modelId] || { score: 0.72, samples: 0 };
      const alpha = old.samples < 8 ? 0.18 : 0.08;
      all[modelId] = {
        score: clamp(old.score * (1 - alpha) + correct * alpha, 0.35, 0.98),
        samples: Math.min(500, (old.samples || 0) + 1),
        updatedAt: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(all));
    } catch (_) {}
  }

  function anchorInfluence(leadHours, skill) {
    const base = leadHours <= 2 ? 0.30 : leadHours <= 18 ? 0.58 : leadHours <= 48 ? 0.52 : leadHours <= 96 ? 0.34 : 0.20;
    return clamp(base + (0.72 - skill) * 0.55, 0.16, 0.72);
  }

  function mix(a, b, weightB) {
    const av = finite(a);
    const bv = finite(b);
    if (av == null && bv == null) return 0;
    if (av == null) return bv;
    if (bv == null) return av;
    return av * (1 - weightB) + bv * weightB;
  }

  function dryWeatherCode(code) {
    return PRECIP_CODES.has(Number(code)) ? 3 : Number(code || 0);
  }

  function calibrateModel(data, anchor, modelId, lat, lon) {
    if (!data?.hourly?.time?.length || !anchor?.hourly?.time?.length) return data;
    const hourly = data.hourly;
    const ah = anchor.hourly;
    const anchorIndex = indexByTime(anchor);
    const bucket = placeBucket(lat, lon);
    const skill = readSkill(bucket, modelId);
    const now = Date.now();
    const ensure = key => {
      if (!Array.isArray(hourly[key])) hourly[key] = new Array(hourly.time.length).fill(0);
    };
    ['precipitation','rain','showers','snowfall','weather_code'].forEach(ensure);

    hourly.time.forEach((time, i) => {
      const j = anchorIndex.get(roundHour(time));
      if (j == null) return;
      const leadHours = Math.max(0, (new Date(time).getTime() - now) / 3600000);
      const influence = anchorInfluence(leadHours, skill);
      const pop = finite(ah.precipitation_probability?.[j]);
      const anchorPrecip = Math.max(0, finite(ah.precipitation?.[j]) || 0);
      const modelPrecip = Math.max(0, finite(hourly.precipitation?.[i]) || 0);

      let precip = Math.max(0, mix(modelPrecip, anchorPrecip, influence));
      let rain = Math.max(0, mix(hourly.rain?.[i], ah.rain?.[j], influence));
      let showers = Math.max(0, mix(hourly.showers?.[i], ah.showers?.[j], influence));
      let snowfall = Math.max(0, mix(hourly.snowfall?.[i], ah.snowfall?.[j], influence));
      let code = Number(hourly.weather_code?.[i] || 0);

      if (pop != null && pop < 20 && anchorPrecip < 0.10 && modelPrecip < 0.45) {
        precip = rain = showers = snowfall = 0;
        code = dryWeatherCode(code);
      } else if (pop != null && pop < 35 && anchorPrecip < 0.06 && modelPrecip < 0.20) {
        precip = rain = showers = snowfall = 0;
        code = dryWeatherCode(code);
      }

      if (pop != null && pop >= 65 && anchorPrecip >= 0.10) {
        precip = Math.max(precip, 0.13);
        if (!PRECIP_CODES.has(code) && PRECIP_CODES.has(Number(ah.weather_code?.[j]))) code = Number(ah.weather_code[j]);
      }

      if (leadHours > 36 && pop != null && pop < 50 && Number(ah.weather_code?.[j]) >= 80) {
        precip *= 0.78;
        rain *= 0.78;
        showers *= 0.78;
      }

      hourly.precipitation[i] = Number(precip.toFixed(3));
      hourly.rain[i] = Number(rain.toFixed(3));
      hourly.showers[i] = Number(showers.toFixed(3));
      hourly.snowfall[i] = Number(snowfall.toFixed(3));
      hourly.weather_code[i] = code;
    });

    data.skymap_accuracy = {
      version: VERSION,
      model: modelId,
      local_skill: skill,
      anchor: 'open-meteo-best-match',
      calibrated_at: new Date().toISOString()
    };
    saveSnapshots(bucket, modelId, data);
    return data;
  }

  function saveSnapshots(bucket, modelId, data) {
    try {
      const key = `skymap.accuracy.snapshots.${bucket}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const now = Date.now();
      const rows = [];
      (data?.hourly?.time || []).forEach((time, i) => {
        const valid = new Date(time).getTime();
        if (valid < now + 20 * 60000 || valid > now + 30 * 3600000) return;
        const precip = Math.max(0, finite(data.hourly.precipitation?.[i]) || 0);
        const snowfall = Math.max(0, finite(data.hourly.snowfall?.[i]) || 0);
        const code = Number(data.hourly.weather_code?.[i] || 0);
        rows.push({
          id: `${modelId}|${roundHour(valid)}|${Math.floor(now / 1800000)}`,
          modelId,
          madeAt: now,
          validAt: roundHour(valid),
          wet: precip >= 0.12 || PRECIP_CODES.has(code),
          snow: snowfall > 0.02 || SNOW_CODES.has(code),
          precip
        });
      });
      const combined = [...existing, ...rows]
        .filter(item => item?.madeAt && now - item.madeAt < 36 * 3600000)
        .slice(-700);
      localStorage.setItem(key, JSON.stringify(combined));
    } catch (_) {}
  }

  function extractRadarRate(data) {
    const props = data?.features?.[0]?.properties;
    if (!props) return null;
    const plausible = ([key, value]) => !/(time|date|lat|lon|x|y|id|index)/i.test(key) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 500;
    const entries = Object.entries(props);
    const preferred = entries.find(entry => /^(value|val)$|precip|rain.*rate|rate|band_?1|pixel/i.test(entry[0]) && plausible(entry));
    const fallback = entries.find(plausible);
    return finite(preferred?.[1] ?? fallback?.[1]);
  }

  function verifyAgainstRainRadar(url, data) {
    try {
      const parsed = new URL(url);
      if ((parsed.searchParams.get('request') || '').toLowerCase() !== 'getfeatureinfo') return;
      if (!(parsed.searchParams.get('layers') || '').includes('RADAR_1KM_RRAI')) return;
      const rate = extractRadarRate(data);
      if (rate == null) return;
      const bbox = (parsed.searchParams.get('bbox') || '').split(',').map(Number);
      if (bbox.length !== 4 || bbox.some(value => !Number.isFinite(value))) return;
      const lon = (bbox[0] + bbox[2]) / 2;
      const lat = (bbox[1] + bbox[3]) / 2;
      const bucket = placeBucket(lat, lon);
      const validAt = roundHour(parsed.searchParams.get('time') || Date.now());
      const observedWet = rate >= 0.12;
      const key = `skymap.accuracy.snapshots.${bucket}`;
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      let changed = false;

      rows.forEach(row => {
        if (row.verified || row.snow) return;
        if (Math.abs(row.validAt - validAt) > 75 * 60000) return;
        if (validAt - row.madeAt < 25 * 60000) return;
        row.verified = true;
        row.verifiedAt = Date.now();
        row.observedWet = observedWet;
        writeSkill(bucket, row.modelId, row.wet === observedWet ? 1 : 0);
        changed = true;
      });
      if (changed) localStorage.setItem(key, JSON.stringify(rows.slice(-700)));
    } catch (_) {}
  }

  function cloneJsonResponse(response, data) {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-skymap-forecast-iq', VERSION);
    return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
  }

  window.fetch = async function skyMapForecastIQ(input, init) {
    const requestUrl = typeof input === 'string' ? input : input?.url;
    if (!requestUrl) return nativeFetch(input, init);

    if (MODEL_RE.test(requestUrl)) {
      const parsed = new URL(requestUrl);
      const lat = finite(parsed.searchParams.get('latitude'));
      const lon = finite(parsed.searchParams.get('longitude'));
      const modelId = modelIdFromUrl(requestUrl);
      const [response, anchor] = await Promise.all([
        nativeFetch(input, init),
        lat != null && lon != null ? getAnchor(lat, lon).catch(() => null) : Promise.resolve(null)
      ]);
      if (!response.ok || !anchor) return response;
      try {
        const data = await response.clone().json();
        calibrateModel(data, anchor, modelId, lat, lon);
        return cloneJsonResponse(response, data);
      } catch (_) {
        return response;
      }
    }

    if (RADAR_RE.test(requestUrl) && /request=GetFeatureInfo/i.test(requestUrl)) {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      try {
        verifyAgainstRainRadar(requestUrl, await response.clone().json());
      } catch (_) {}
      return response;
    }

    return nativeFetch(input, init);
  };

  function decorateStatus() {
    const detail = document.querySelector('#feed-detail');
    if (!detail) return;
    const add = () => {
      const current = detail.textContent || '';
      if (!/Forecast IQ/i.test(current) && !/Connecting/i.test(current)) detail.textContent = `${current} · Forecast IQ`;
    };
    new MutationObserver(add).observe(detail, { childList: true, characterData: true, subtree: true });
    add();
  }

  resetLegacyModelCache();
  window.SkyMapAccuracy = Object.freeze({ version: VERSION, mode: 'horizon-calibrated-local-learning' });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateStatus, { once: true });
  else decorateStatus();
})();
