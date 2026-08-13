(() => {
  'use strict';

  const VERSION = '32.0.0';
  const nativeFetch = window.fetch.bind(window);
  const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
  const ECCC_API = 'https://api.weather.gc.ca';
  const GEOMET = 'https://geo.weather.gc.ca/geomet';
  const MODEL_RE = /^https:\/\/api\.open-meteo\.com\/v1\/(gem|ecmwf|gfs)(?:\?|$)/i;
  const GEOMET_RE = /geo\.weather\.gc\.ca\/geomet/i;
  const PRECIP_CODES = new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
  const SNOW_CODES = new Set([71,73,75,77,85,86]);
  const ANCHOR_TTL = 20 * 60 * 1000;
  const OFFICIAL_TTL = 30 * 60 * 1000;
  const contextCache = new Map();

  const finite = value => value === null || value === undefined || value === '' || value === '__skymap_missing__' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const english = value => value && typeof value === 'object' && 'en' in value ? value.en : value;
  const roundHour = value => {
    const date = new Date(value);
    date.setMinutes(0, 0, 0);
    return date.getTime();
  };
  const placeBucket = (lat, lon) => `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  const leadBucket = leadHours => leadHours <= 3 ? '0-3h' : leadHours <= 12 ? '3-12h' : leadHours <= 24 ? '12-24h' : leadHours <= 48 ? '24-48h' : leadHours <= 96 ? '48-96h' : '96h+';

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

  function neighbourhoodCoordinates(lat, lon) {
    const y = Number(lat), x = Number(lon);
    const dLat = 0.07;
    const cos = Math.max(0.45, Math.cos(y * Math.PI / 180));
    const dLon = 0.07 / cos;
    return [
      [y, x], [y + dLat, x], [y - dLat, x], [y, x + dLon], [y, x - dLon]
    ];
  }

  function bestMatchUrl(lat, lon) {
    const coords = neighbourhoodCoordinates(lat, lon);
    const params = new URLSearchParams({
      latitude: coords.map(point => point[0].toFixed(4)).join(','),
      longitude: coords.map(point => point[1].toFixed(4)).join(','),
      timezone: 'auto',
      forecast_days: '8',
      cell_selection: 'land',
      hourly: [
        'temperature_2m','precipitation_probability','precipitation','rain','showers','snowfall',
        'weather_code','cloud_cover','wind_speed_10m','wind_gusts_10m','wind_direction_10m'
      ].join(',')
    });
    return `${OPEN_METEO}?${params}`;
  }

  async function fetchBestMatch(lat, lon) {
    const response = await nativeFetch(bestMatchUrl(lat, lon), { cache: 'no-store' });
    if (!response.ok) throw new Error(`best-match ${response.status}`);
    const raw = await response.json();
    const locations = Array.isArray(raw) ? raw : [raw];
    return {
      exact: locations[0] || null,
      neighbours: locations.slice(1),
      all: locations
    };
  }

  function distanceSq(lat1, lon1, lat2, lon2) {
    const dy = Number(lat1) - Number(lat2);
    const dx = (Number(lon1) - Number(lon2)) * Math.cos((Number(lat1) + Number(lat2)) * Math.PI / 360);
    return dy * dy + dx * dx;
  }

  function featureCoordinates(feature) {
    const coords = feature?.geometry?.coordinates;
    if (Array.isArray(coords) && Number.isFinite(Number(coords[0])) && Number.isFinite(Number(coords[1]))) {
      return { lon: Number(coords[0]), lat: Number(coords[1]) };
    }
    const url = english(feature?.properties?.url) || '';
    const match = /coords=([-\d.]+),([-\d.]+)/.exec(url);
    return match ? { lat: Number(match[1]), lon: Number(match[2]) } : null;
  }

  function officialForecastUrl(lat, lon) {
    const d = 0.85;
    const bbox = [Number(lon) - d, Number(lat) - d, Number(lon) + d, Number(lat) + d].map(v => v.toFixed(3)).join(',');
    const params = new URLSearchParams({ bbox, limit: '20', f: 'json' });
    return `${ECCC_API}/collections/citypageweather-realtime/items?${params}`;
  }

  function parseOfficialFeature(feature) {
    if (!feature) return { name: null, updated: null, hourly: [] };
    const props = feature.properties || {};
    const rawHourly = props.hourlyForecastGroup?.hourlyForecasts;
    const rows = Array.isArray(rawHourly) ? rawHourly : rawHourly ? [rawHourly] : [];
    const hourly = rows.map(row => ({
      time: new Date(row.timestamp).getTime(),
      pop: finite(english(row.lop?.value)),
      condition: english(row.condition) || '',
      temperature: finite(english(row.temperature?.value))
    })).filter(row => Number.isFinite(row.time));
    return {
      name: english(props.name) || english(props.region) || null,
      updated: props.lastUpdated || english(props.hourlyForecastGroup?.timestamp) || null,
      hourly
    };
  }

  async function fetchOfficial(lat, lon) {
    try {
      const response = await nativeFetch(officialForecastUrl(lat, lon), { cache: 'no-store' });
      if (!response.ok) throw new Error(`official ${response.status}`);
      const data = await response.json();
      const features = data?.features || [];
      let best = null;
      let bestDistance = Infinity;
      features.forEach(feature => {
        const point = featureCoordinates(feature);
        if (!point) return;
        const distance = distanceSq(lat, lon, point.lat, point.lon);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = feature;
        }
      });
      return parseOfficialFeature(best || features[0]);
    } catch (_) {
      return { name: null, updated: null, hourly: [] };
    }
  }

  function durationMinutes(value) {
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value || '');
    return match ? ((+match[1] || 0) * 1440 + (+match[2] || 0) * 60 + (+match[3] || 0)) : 60;
  }

  function expandTimes(value) {
    const raw = (value || '').trim();
    if (!raw) return [];
    if (raw.includes(',')) return raw.split(',').map(item => new Date(item.trim()).toISOString()).filter(Boolean);
    if (!raw.includes('/')) return [new Date(raw).toISOString()];
    const [a, b, period] = raw.split('/');
    const start = new Date(a).getTime(), end = new Date(b).getTime(), step = durationMinutes(period) * 60000;
    const out = [];
    if (!Number.isFinite(start) || !Number.isFinite(end) || !step) return out;
    for (let t = start; t <= end && out.length < 800; t += step) out.push(new Date(t).toISOString());
    return out;
  }

  function directChildText(node, name) {
    for (const child of node?.children || []) if (child.localName === name) return child.textContent?.trim() || '';
    return '';
  }

  function findLayer(xml, name) {
    for (const node of xml.getElementsByTagNameNS('*', 'Layer')) if (directChildText(node, 'Name') === name) return node;
    return null;
  }

  async function layerMetadata(layer) {
    const params = new URLSearchParams({ service: 'WMS', request: 'GetCapabilities', version: '1.3.0', lang: 'en', layer, _: String(Date.now()) });
    const response = await nativeFetch(`${GEOMET}?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`GeoMet metadata ${response.status}`);
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    const node = findLayer(xml, layer);
    if (!node) throw new Error(`${layer} unavailable`);
    const dims = [...(node.getElementsByTagNameNS('*', 'Dimension') || [])];
    const time = dims.find(d => (d.getAttribute('name') || '').toLowerCase() === 'time');
    const reference = dims.find(d => (d.getAttribute('name') || '').toLowerCase() === 'reference_time');
    return {
      times: expandTimes(time?.textContent),
      reference: expandTimes(reference?.textContent).at(-1) || null
    };
  }

  function extractNumericFeature(data, max = 500) {
    const props = data?.features?.[0]?.properties;
    if (!props) return null;
    const plausible = ([key, value]) => !/(time|date|lat|lon|x|y|id|index)/i.test(key) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max;
    const entries = Object.entries(props);
    const preferred = entries.find(entry => /^(value|val)$|precip|rain.*rate|rate|prob|percent|band_?1|pixel/i.test(entry[0]) && plausible(entry));
    const fallback = entries.find(plausible);
    return finite(preferred?.[1] ?? fallback?.[1]);
  }

  async function queryLayerPoint(layer, style, time, reference, lat, lon, max = 500) {
    const d = layer.startsWith('REPS.') ? 0.14 : 0.08;
    const params = new URLSearchParams({
      service: 'WMS', request: 'GetFeatureInfo', version: '1.1.1', layers: layer, query_layers: layer, styles: style || '',
      srs: 'EPSG:4326', bbox: `${Number(lon)-d},${Number(lat)-d},${Number(lon)+d},${Number(lat)+d}`,
      width: '101', height: '101', x: '50', y: '50', info_format: 'application/json', feature_count: '1', time
    });
    if (reference) params.set('reference_time', reference);
    const response = await nativeFetch(`${GEOMET}?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`GeoMet point ${response.status}`);
    return extractNumericFeature(await response.json(), max);
  }

  function nearestTimes(times, now, end, maxItems) {
    const eligible = times.filter(value => {
      const t = new Date(value).getTime();
      return t >= now - 5 * 60000 && t <= end;
    });
    if (eligible.length <= maxItems) return eligible;
    const result = [];
    for (let i = 0; i < maxItems; i++) result.push(eligible[Math.round(i * (eligible.length - 1) / (maxItems - 1))]);
    return [...new Set(result)];
  }

  async function fetchNowcast(lat, lon) {
    try {
      const layer = 'Radar_1km_RainPrecipRate-Extrapolation';
      const meta = await layerMetadata(layer);
      const now = Date.now();
      const times = nearestTimes(meta.times, now, now + 130 * 60000, 8);
      const values = await Promise.all(times.map(async time => ({
        time: new Date(time).getTime(),
        rate: await queryLayerPoint(layer, '', time, meta.reference, lat, lon).catch(() => null)
      })));
      return values.filter(row => Number.isFinite(row.time) && row.rate != null);
    } catch (_) {
      return [];
    }
  }

  function topAnchorTargets(anchor) {
    const hourly = anchor?.hourly;
    if (!hourly?.time?.length) return [];
    const now = Date.now();
    const candidates = hourly.time.map((time, index) => ({
      time: new Date(time).getTime(),
      score: (finite(hourly.precipitation_probability?.[index]) || 0) + Math.min(40, (finite(hourly.precipitation?.[index]) || 0) * 12)
    })).filter(row => row.time >= now && row.time <= now + 49 * 3600000);
    candidates.sort((a, b) => b.score - a.score);
    const chosen = [now + 3 * 3600000, now + 9 * 3600000];
    for (const row of candidates) {
      if (chosen.some(time => Math.abs(time - row.time) < 2.5 * 3600000)) continue;
      chosen.push(row.time);
      if (chosen.length >= 7) break;
    }
    return chosen;
  }

  async function fetchReps(lat, lon, anchor) {
    try {
      const layer = 'REPS.DIAG.3_PRMM.ERGE1';
      const style = 'REPS_PROB-LINEAR';
      const meta = await layerMetadata(layer);
      const available = meta.times.map(value => new Date(value).getTime()).filter(Number.isFinite);
      const targets = topAnchorTargets(anchor);
      const selected = [];
      targets.forEach(target => {
        let best = null, delta = Infinity;
        available.forEach(time => {
          const d = Math.abs(time - target);
          if (d < delta) { delta = d; best = time; }
        });
        if (best != null && delta <= 2 * 3600000 && !selected.includes(best)) selected.push(best);
      });
      const values = await Promise.all(selected.slice(0, 7).map(async time => ({
        time,
        probability: await queryLayerPoint(layer, style, new Date(time).toISOString(), meta.reference, lat, lon, 100).catch(() => null)
      })));
      return values.filter(row => row.probability != null);
    } catch (_) {
      return [];
    }
  }

  function indexByTime(data) {
    const map = new Map();
    (data?.hourly?.time || []).forEach((time, index) => map.set(roundHour(time), index));
    return map;
  }

  function nearestRow(rows, target, toleranceMs) {
    if (!rows?.length) return null;
    const wanted = new Date(target).getTime();
    let best = null, delta = Infinity;
    rows.forEach(row => {
      const d = Math.abs(Number(row.time) - wanted);
      if (d < delta) { delta = d; best = row; }
    });
    return delta <= toleranceMs ? best : null;
  }

  function neighbourStats(context, target) {
    const values = [];
    context.anchor.neighbours.forEach(data => {
      const index = context.neighbourIndexes.get(data)?.get(roundHour(target));
      if (index == null) return;
      const pop = finite(data.hourly?.precipitation_probability?.[index]);
      const precipRaw = finite(data.hourly?.precipitation?.[index]);
      const precip = precipRaw == null ? null : Math.max(0, precipRaw);
      if (pop == null && precip == null) return;
      values.push({ pop, precip });
    });
    const pops = values.map(row => row.pop).filter(value => value != null);
    const precips = values.map(row => row.precip).filter(value => value != null);
    const scorable = values.filter(row => row.precip != null || row.pop != null);
    return {
      meanPop: pops.length ? pops.reduce((sum, value) => sum + value, 0) / pops.length : null,
      maxPop: pops.length ? Math.max(...pops) : null,
      wetFraction: scorable.length ? scorable.filter(row => (row.precip != null && row.precip >= 0.1) || (row.pop != null && row.pop >= 50)).length / scorable.length : null,
      maxPrecip: precips.length ? Math.max(...precips) : null,
      samples: scorable.length
    };
  }

  function skillStorageKey(bucket) {
    return `skymap.accuracy.skill.v21.${bucket}`;
  }

  function readSkill(bucket, modelId, leadHours) {
    try {
      const all = JSON.parse(localStorage.getItem(skillStorageKey(bucket)) || '{}');
      const specific = finite(all?.[`${modelId}:${leadBucket(leadHours)}`]?.score);
      const overall = finite(all?.[modelId]?.score);
      if (specific != null) return clamp(specific, 0.35, 0.98);
      if (overall != null) return clamp(overall, 0.35, 0.98);
      const legacy = JSON.parse(localStorage.getItem(`skymap.accuracy.skill.${bucket}`) || '{}');
      const legacyScore = finite(legacy?.[modelId]?.score);
      return legacyScore == null ? 0.72 : clamp(legacyScore, 0.35, 0.98);
    } catch (_) {
      return 0.72;
    }
  }

  function writeSkill(bucket, modelId, bucketName, correct) {
    try {
      const key = skillStorageKey(bucket);
      const all = JSON.parse(localStorage.getItem(key) || '{}');
      const update = itemKey => {
        const old = all[itemKey] || { score: 0.72, samples: 0 };
        const alpha = old.samples < 10 ? 0.15 : 0.06;
        all[itemKey] = {
          score: clamp(old.score * (1 - alpha) + correct * alpha, 0.35, 0.98),
          samples: Math.min(1000, (old.samples || 0) + 1),
          updatedAt: Date.now()
        };
      };
      update(modelId);
      update(`${modelId}:${bucketName}`);
      localStorage.setItem(key, JSON.stringify(all));
    } catch (_) {}
  }

  function sourceInfluence(leadHours, skill, modelId) {
    let base = leadHours <= 2 ? 0.22 : leadHours <= 18 ? 0.54 : leadHours <= 48 ? 0.48 : leadHours <= 96 ? 0.34 : 0.22;
    if (modelId === 'gem' && leadHours <= 48) base -= 0.07;
    if ((modelId === 'ifs' || modelId === 'aifs') && leadHours > 48) base -= 0.04;
    if (modelId === 'gfs' && leadHours <= 24) base += 0.04;
    return clamp(base + (0.72 - skill) * 0.58, 0.12, 0.72);
  }

  function mix(a, b, weightB) {
    const av = finite(a), bv = finite(b);
    if (av == null && bv == null) return null;
    if (av == null) return bv;
    if (bv == null) return av;
    return av * (1 - weightB) + bv * weightB;
  }

  function dryWeatherCode(code) {
    const value = finite(code);
    if (value == null) return null;
    return PRECIP_CODES.has(value) ? 3 : value;
  }

  function hasExplicitForecastEvidence(precipitation, weatherCode) {
    return finite(precipitation) != null || finite(weatherCode) != null;
  }

  function officialPopAt(context, target) {
    return nearestRow(context.official.hourly, target, 75 * 60000)?.pop ?? null;
  }

  function repsPopAt(context, target) {
    return nearestRow(context.reps, target, 2 * 3600000)?.probability ?? null;
  }

  function nowcastRateAt(context, target) {
    return nearestRow(context.nowcast, target, 24 * 60000)?.rate ?? null;
  }

  function fusedProbability(exactPop, officialPop, repsPop, neighbour, leadHours) {
    const values = [];
    const add = (value, weight) => { if (value != null) values.push({ value: clamp(value, 0, 100), weight }); };
    add(exactPop, leadHours <= 48 ? 0.52 : 0.72);
    if (leadHours <= 54) add(officialPop, 0.26);
    if (leadHours <= 54) add(repsPop, 0.30);
    add(neighbour.meanPop, leadHours <= 48 ? 0.09 : 0.06);
    if (!values.length) return null;
    const total = values.reduce((sum, row) => sum + row.weight, 0);
    return values.reduce((sum, row) => sum + row.value * row.weight, 0) / total;
  }

  async function buildContext(lat, lon) {
    const anchor = await fetchBestMatch(lat, lon);
    if (!anchor.exact?.hourly?.time?.length) throw new Error('Best Match unavailable');
    const [official, nowcast, reps] = await Promise.all([
      fetchOfficial(lat, lon),
      fetchNowcast(lat, lon),
      fetchReps(lat, lon, anchor.exact)
    ]);
    const neighbourIndexes = new Map(anchor.neighbours.map(data => [data, indexByTime(data)]));
    return {
      lat: Number(lat), lon: Number(lon), savedAt: Date.now(), anchor, anchorIndex: indexByTime(anchor.exact),
      neighbourIndexes, official, nowcast, reps
    };
  }

  async function getContext(lat, lon) {
    const key = placeBucket(lat, lon);
    const cached = contextCache.get(key);
    const ttl = cached?.data?.official?.hourly?.length ? OFFICIAL_TTL : ANCHOR_TTL;
    if (cached?.data && Date.now() - cached.savedAt < ttl) return cached.data;
    if (cached?.promise) return cached.promise;
    const promise = buildContext(lat, lon)
      .then(data => {
        contextCache.set(key, { savedAt: Date.now(), data });
        return data;
      })
      .catch(error => {
        contextCache.delete(key);
        throw error;
      });
    contextCache.set(key, { savedAt: 0, data: null, promise });
    return promise;
  }

  function calibrateModel(data, context, modelId, lat, lon) {
    if (!data?.hourly?.time?.length || !context?.anchor?.exact?.hourly?.time?.length) return data;
    const hourly = data.hourly;
    const anchor = context.anchor.exact.hourly;
    if (!Array.isArray(hourly.precipitation)) return data;
    const bucket = placeBucket(lat, lon);
    const now = Date.now();
    let calibratedRows = 0;
    let skippedMissingRows = 0;

    hourly.time.forEach((time, i) => {
      const target = new Date(time).getTime();
      const j = context.anchorIndex.get(roundHour(target));
      if (j == null) return;
      const leadHours = Math.max(0, (target - now) / 3600000);
      const skill = readSkill(bucket, modelId, leadHours);
      const influence = sourceInfluence(leadHours, skill, modelId);
      const exactPop = finite(anchor.precipitation_probability?.[j]);
      const modelPrecipRaw = finite(hourly.precipitation?.[i]);
      const exactPrecipRaw = finite(anchor.precipitation?.[j]);
      if (modelPrecipRaw == null && exactPrecipRaw == null) {
        skippedMissingRows++;
        return;
      }
      const modelPrecip = modelPrecipRaw == null ? null : Math.max(0, modelPrecipRaw);
      const exactPrecip = exactPrecipRaw == null ? null : Math.max(0, exactPrecipRaw);
      const officialPop = officialPopAt(context, target);
      const repsPop = repsPopAt(context, target);
      const neighbours = neighbourStats(context, target);
      const fusedPop = fusedProbability(exactPop, officialPop, repsPop, neighbours, leadHours);
      const nowcastRate = leadHours <= 2.3 ? nowcastRateAt(context, target) : null;

      let precip = mix(modelPrecip, exactPrecip, influence);
      if (precip == null) {
        skippedMissingRows++;
        return;
      }
      precip = Math.max(0, precip);
      const mixedRain = mix(hourly.rain?.[i], anchor.rain?.[j], influence);
      const mixedShowers = mix(hourly.showers?.[i], anchor.showers?.[j], influence);
      const mixedSnowfall = mix(hourly.snowfall?.[i], anchor.snowfall?.[j], influence);
      let rain = mixedRain == null ? null : Math.max(0, mixedRain);
      let showers = mixedShowers == null ? null : Math.max(0, mixedShowers);
      let snowfall = mixedSnowfall == null ? null : Math.max(0, mixedSnowfall);
      let code = finite(hourly.weather_code?.[i]);
      const anchorCode = finite(anchor.weather_code?.[j]);
      const snowSignal = (snowfall != null && snowfall > 0.02) || (code != null && SNOW_CODES.has(code)) || (anchorCode != null && SNOW_CODES.has(anchorCode));

      if (!snowSignal && nowcastRate != null && leadHours <= 2.3) {
        if (nowcastRate < 0.03 && (fusedPop == null || fusedPop < 48)) {
          precip = 0;
          if (rain != null) rain = 0;
          if (showers != null) showers = 0;
          code = dryWeatherCode(code);
        } else if (nowcastRate >= 0.12) {
          const targetRate = clamp(nowcastRate, 0.13, 12);
          precip = Math.max(precip, targetRate * 0.72);
          if (rain != null) rain = Math.max(rain, targetRate * 0.62);
        }
      }

      const strongDry = fusedPop != null && fusedPop < 18 && exactPrecip != null && exactPrecip < 0.10 && (officialPop == null || officialPop < 30) && (repsPop == null || repsPop < 25);
      const moderateDry = fusedPop != null && fusedPop < 30 && exactPrecip != null && modelPrecip != null && exactPrecip < 0.06 && modelPrecip < 0.24;
      if (!snowSignal && (strongDry || moderateDry)) {
        precip = 0;
        if (rain != null) rain = 0;
        if (showers != null) showers = 0;
        code = dryWeatherCode(code);
      }

      const strongWet = fusedPop != null && fusedPop >= 66 && exactPrecip != null && exactPrecip >= 0.08;
      const officialWetAgreement = officialPop != null && officialPop >= 60 && exactPop != null && exactPop >= 55;
      if (strongWet || officialWetAgreement) {
        precip = Math.max(precip, 0.13);
        if ((code == null || !PRECIP_CODES.has(code)) && anchorCode != null && PRECIP_CODES.has(anchorCode)) code = anchorCode;
      }

      if (exactPrecip != null && exactPop != null && exactPrecip < 0.06 && exactPop < 35 && neighbours.wetFraction != null && neighbours.wetFraction >= 0.75 && neighbours.maxPop != null && neighbours.maxPop >= 65) {
        precip = Math.min(precip, 0.10);
      }

      if (leadHours > 30 && fusedPop != null && fusedPop < 52 && anchorCode != null && anchorCode >= 80) {
        precip *= 0.76;
        if (rain != null) rain *= 0.76;
        if (showers != null) showers *= 0.76;
      }

      hourly.precipitation[i] = Number(precip.toFixed(3));
      if (rain != null && Array.isArray(hourly.rain)) hourly.rain[i] = Number(rain.toFixed(3));
      if (showers != null && Array.isArray(hourly.showers)) hourly.showers[i] = Number(showers.toFixed(3));
      if (snowfall != null && Array.isArray(hourly.snowfall)) hourly.snowfall[i] = Number(snowfall.toFixed(3));
      if (code != null && Array.isArray(hourly.weather_code)) hourly.weather_code[i] = code;
      calibratedRows++;
    });

    data.skymap_accuracy = {
      version: VERSION,
      model: modelId,
      local_skill: readSkill(bucket, modelId, 12),
      anchor: 'open-meteo-best-match',
      official: context.official.name || null,
      reps_samples: context.reps.length,
      nowcast_samples: context.nowcast.length,
      calibrated_rows: calibratedRows,
      skipped_missing_rows: skippedMissingRows,
      truth_contract: 'missing weather values remain missing and cannot become dry evidence',
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
        if (valid < now + 20 * 60000 || valid > now + 48 * 3600000) return;
        const precipRaw = finite(data.hourly.precipitation?.[i]);
        const code = finite(data.hourly.weather_code?.[i]);
        if (!hasExplicitForecastEvidence(precipRaw, code)) return;
        const snowfallRaw = finite(data.hourly.snowfall?.[i]);
        const precip = precipRaw == null ? null : Math.max(0, precipRaw);
        const snowfall = snowfallRaw == null ? null : Math.max(0, snowfallRaw);
        const leadHours = Math.max(0, (valid - now) / 3600000);
        rows.push({
          id: `${modelId}|${roundHour(valid)}|${Math.floor(now / 1800000)}`,
          modelId, madeAt: now, validAt: roundHour(valid), leadBucket: leadBucket(leadHours),
          wet: (precip != null && precip >= 0.12) || (code != null && PRECIP_CODES.has(code)),
          snow: (snowfall != null && snowfall > 0.02) || (code != null && SNOW_CODES.has(code)),
          precip, evidence: { precipitation: precip != null, weatherCode: code != null }, contractVersion: VERSION
        });
      });
      const combined = [...existing, ...rows]
        .filter(item => item?.madeAt && now - item.madeAt < 60 * 3600000)
        .slice(-1000);
      localStorage.setItem(key, JSON.stringify(combined));
    } catch (_) {}
  }

  function extractRadarRate(data) {
    return extractNumericFeature(data, 500);
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
        const correct = row.wet === observedWet ? 1 : 0;
        writeSkill(bucket, row.modelId, row.leadBucket || leadBucket((row.validAt - row.madeAt) / 3600000), correct);
        changed = true;
      });
      if (changed) localStorage.setItem(key, JSON.stringify(rows.slice(-1000)));
    } catch (_) {}
  }

  function cloneJsonResponse(response, data) {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-skymap-forecast-iq', VERSION);
    return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
  }

  function accuracyStats() {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('skymap.accuracy.skill.v21.'));
      let samples = 0, weighted = 0;
      keys.forEach(key => {
        const all = JSON.parse(localStorage.getItem(key) || '{}');
        Object.entries(all).forEach(([name, value]) => {
          if (name.includes(':') || !value?.samples) return;
          samples += Number(value.samples) || 0;
          weighted += (Number(value.score) || 0) * (Number(value.samples) || 0);
        });
      });
      return { samples, score: samples ? Math.round(weighted / samples * 100) : null };
    } catch (_) {
      return { samples: 0, score: null };
    }
  }

  function contextStatus() {
    const contexts = [...contextCache.values()].map(item => item.data).filter(Boolean);
    const latest = contexts.sort((a, b) => b.savedAt - a.savedAt)[0];
    const stats = accuracyStats();
    return {
      official: latest?.official?.name || null,
      reps: latest?.reps?.length || 0,
      nowcast: latest?.nowcast?.length || 0,
      samples: stats.samples,
      score: stats.score
    };
  }

  window.fetch = async function skyMapForecastIQ(input, init) {
    const requestUrl = typeof input === 'string' ? input : input?.url;
    if (!requestUrl) return nativeFetch(input, init);

    if (MODEL_RE.test(requestUrl)) {
      const parsed = new URL(requestUrl);
      const lat = finite(parsed.searchParams.get('latitude'));
      const lon = finite(parsed.searchParams.get('longitude'));
      const modelId = modelIdFromUrl(requestUrl);
      const [response, context] = await Promise.all([
        nativeFetch(input, init),
        lat != null && lon != null ? getContext(lat, lon).catch(() => null) : Promise.resolve(null)
      ]);
      if (!response.ok || !context) return response;
      try {
        const data = await response.clone().json();
        calibrateModel(data, context, modelId, lat, lon);
        return cloneJsonResponse(response, data);
      } catch (_) {
        return response;
      }
    }

    if (GEOMET_RE.test(requestUrl) && /request=GetFeatureInfo/i.test(requestUrl)) {
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
      if (/Connecting/i.test(current)) return;
      const status = contextStatus();
      const extras = [];
      if (status.official) extras.push('official ECCC');
      if (status.reps) extras.push('REPS');
      if (status.nowcast) extras.push('point nowcast');
      if (status.samples >= 8 && status.score != null) extras.push(`${status.score}% local hit rate`);
      const suffix = extras.length ? `Forecast IQ · ${extras.join(' · ')}` : 'Forecast IQ';
      const base = current.replace(/\s*·\s*Forecast IQ.*$/i, '');
      detail.textContent = `${base} · ${suffix}`;
    };
    new MutationObserver(add).observe(detail, { childList: true, characterData: true, subtree: true });
    add();
  }

  resetLegacyModelCache();
  window.SkyMapAccuracy = Object.freeze({
    version: VERSION,
    mode: 'truth-firewall+radar-first+official+reps+spatial+local-learning',
    status: contextStatus,
    contract: Object.freeze({ finite, mix, dryWeatherCode, hasExplicitForecastEvidence })
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateStatus, { once: true });
  else decorateStatus();
})();
