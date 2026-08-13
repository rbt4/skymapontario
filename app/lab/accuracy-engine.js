(() => {
  'use strict';

  const VERSION = '34.0.0';
  const MODEL_CACHE_SCHEMA = '2';
  const COURT_VERSION = 1;
  const COURT_KEY = 'skymap.accuracy.forecast-court.v1';
  const COURT_MIN_SAMPLES = 48;
  const COURT_MIN_SPAN_DAYS = 30;
  const COURT_MIN_WET = 8;
  const COURT_MIN_DRY = 16;
  const COURT_PRIOR_STRENGTH = 24;
  const COURT_PRIOR_QUALITY = 0.72;
  const COURT_MAX_FACTOR_SHIFT = 0.14;
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
  const capabilitiesCache = { savedAt:0, xml:null, promise:null };

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
      const schemaKey = 'skymap.accuracy.model-cache-schema';
      if (localStorage.getItem(schemaKey) !== MODEL_CACHE_SCHEMA && !localStorage.getItem('skymap.accuracy.version')) {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('skymap.lab.model.')) localStorage.removeItem(key);
        });
      }
      localStorage.setItem(schemaKey, MODEL_CACHE_SCHEMA);
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

  async function geometCapabilities() {
    if (capabilitiesCache.xml && Date.now() - capabilitiesCache.savedAt < 10 * 60 * 1000) return capabilitiesCache.xml;
    if (capabilitiesCache.promise) return capabilitiesCache.promise;
    const params = new URLSearchParams({ service:'WMS', request:'GetCapabilities', version:'1.3.0', lang:'en' });
    capabilitiesCache.promise = nativeFetch(`${GEOMET}?${params}`, { cache:'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`GeoMet metadata ${response.status}`);
        const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
        capabilitiesCache.xml = xml;
        capabilitiesCache.savedAt = Date.now();
        capabilitiesCache.promise = null;
        return xml;
      })
      .catch(error => { capabilitiesCache.promise = null; throw error; });
    return capabilitiesCache.promise;
  }

  async function layerMetadata(layer) {
    const xml = await geometCapabilities();
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

  const calibrationPlaceBucket = (lat, lon) => `${Number(lat).toFixed(1)},${Number(lon).toFixed(1)}`;
  const seasonBucket = value => {
    const month = new Date(value).getUTCMonth() + 1;
    if (month === 12 || month <= 2) return 'winter';
    if (month <= 5) return 'spring';
    if (month <= 8) return 'summer';
    return 'autumn';
  };

  function forecastRegime(rows) {
    const scorable = (rows || []).filter(row => row?.wet !== undefined && row?.wet !== null);
    if (!scorable.length) return 'unknown';
    const snowVotes = scorable.filter(row => row.snow).length;
    if (snowVotes >= Math.max(2, Math.ceil(scorable.length / 2))) return 'snow';
    const wetVotes = scorable.filter(row => row.wet).length;
    if (wetVotes < Math.ceil(scorable.length / 2)) return 'dry';
    const amounts = scorable.map(row => finite(row.precip)).filter(value => value != null);
    const mean = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : 0;
    return mean >= 1.5 ? 'steady-rain' : 'light-rain';
  }

  function courtTierKeys(place, bucketName, season, regime) {
    const local = `local:${place}|lead:${bucketName}`;
    const province = `ontario|lead:${bucketName}`;
    return [
      `${local}|season:${season}|regime:${regime}`,
      `${local}|season:${season}`,
      local,
      `${province}|season:${season}|regime:${regime}`,
      province
    ];
  }

  function readCourt() {
    try {
      const parsed = JSON.parse(localStorage.getItem(COURT_KEY) || 'null');
      if (parsed?.version === COURT_VERSION && parsed.tiers && typeof parsed.tiers === 'object') return parsed;
    } catch (_) {}
    return { version:COURT_VERSION, observations:[], tiers:{} };
  }

  function writeCourt(court) {
    try {
      court.observations = [...new Set(court.observations || [])].slice(-2500);
      localStorage.setItem(COURT_KEY, JSON.stringify(court));
    } catch (_) {}
  }

  function courtEligibility(entry, modelIds = []) {
    const first = finite(entry?.firstObservedAt), last = finite(entry?.lastObservedAt);
    const spanDays = first == null || last == null ? 0 : Math.max(0, (last - first) / 86400000);
    const verifiedHours = Number(entry?.observations?.length) || 0;
    const wetHours = Number(entry?.wetHours) || 0;
    const dryHours = Number(entry?.dryHours) || 0;
    const eligibleModels = modelIds.filter(id => Number(entry?.models?.[id]?.samples) >= COURT_MIN_SAMPLES);
    const active = verifiedHours >= COURT_MIN_SAMPLES && spanDays >= COURT_MIN_SPAN_DAYS && wetHours >= COURT_MIN_WET && dryHours >= COURT_MIN_DRY && eligibleModels.length >= 2;
    return {
      active, verifiedHours, wetHours, dryHours, spanDays:Number(spanDays.toFixed(1)), eligibleModels,
      thresholds:Object.freeze({ samples:COURT_MIN_SAMPLES, spanDays:COURT_MIN_SPAN_DAYS, wet:COURT_MIN_WET, dry:COURT_MIN_DRY, models:2 })
    };
  }

  function snapshotQuality(row, observedWet, rate) {
    const occurrence = Boolean(row?.wet) === Boolean(observedWet) ? 1 : 0;
    const forecastAmount = Math.max(0, finite(row?.precip) ?? 0);
    const observedAmount = Math.max(0, finite(rate) ?? 0);
    const amount = !row?.wet && !observedWet
      ? 1
      : 1 - clamp(Math.abs(Math.log1p(forecastAmount) - Math.log1p(observedAmount)) / Math.log1p(8), 0, 1);
    return { occurrence, amount, quality:occurrence * .8 + amount * .2 };
  }

  function recordCourtObservation(lat, lon, validAt, rows, rate) {
    const observedWet = rate >= 0.12;
    const regime = forecastRegime(rows);
    if (regime === 'snow' || regime === 'unknown') return false;
    const court = readCourt();
    const place = calibrationPlaceBucket(lat, lon);
    const season = seasonBucket(validAt);
    const observationId = `${place}|${roundHour(validAt)}`;
    if (!court.observations.includes(observationId)) court.observations.push(observationId);
    let changed = false;
    const byLead = new Map();
    rows.forEach(row => {
      const name = row.leadBucket || leadBucket((row.validAt - row.madeAt) / 3600000);
      if (!byLead.has(name)) byLead.set(name, []);
      byLead.get(name).push(row);
    });
    byLead.forEach((leadRows, bucketName) => {
      courtTierKeys(place, bucketName, season, regime).forEach(tierKey => {
        const entry = court.tiers[tierKey] ||= { observations:[], wetHours:0, dryHours:0, firstObservedAt:null, lastObservedAt:null, models:{} };
        if (!entry.observations.includes(observationId)) {
          entry.observations.push(observationId);
          entry.observations = entry.observations.slice(-750);
          entry[observedWet ? 'wetHours' : 'dryHours'] = (entry[observedWet ? 'wetHours' : 'dryHours'] || 0) + 1;
          entry.firstObservedAt = entry.firstObservedAt == null ? validAt : Math.min(entry.firstObservedAt, validAt);
          entry.lastObservedAt = entry.lastObservedAt == null ? validAt : Math.max(entry.lastObservedAt, validAt);
        }
        leadRows.forEach(row => {
          const model = entry.models[row.modelId] ||= { samples:0, qualityTotal:0, occurrenceHits:0, amountTotal:0, missedWet:0, falseWet:0, samplesSeen:[] };
          const sampleId = `${row.modelId}|${roundHour(validAt)}|${bucketName}`;
          if (model.samplesSeen.includes(sampleId)) return;
          const score = snapshotQuality(row, observedWet, rate);
          model.samplesSeen.push(sampleId);
          model.samplesSeen = model.samplesSeen.slice(-750);
          model.samples += 1;
          model.qualityTotal += score.quality;
          model.occurrenceHits += score.occurrence;
          model.amountTotal += score.amount;
          if (observedWet && !row.wet) model.missedWet += 1;
          if (!observedWet && row.wet) model.falseWet += 1;
          changed = true;
        });
      });
    });
    if (changed) writeCourt(court);
    return changed;
  }

  function posteriorQuality(model) {
    const samples = Number(model?.samples) || 0;
    const total = Number(model?.qualityTotal) || 0;
    return (total + COURT_PRIOR_QUALITY * COURT_PRIOR_STRENGTH) / (samples + COURT_PRIOR_STRENGTH);
  }

  function boundedCourtWeights(rows, qualities = {}) {
    const usable = (rows || []).filter(row => row?.model?.id && finite(row.weight) != null && row.weight > 0);
    const baseTotal = usable.reduce((sum, row) => sum + row.weight, 0);
    if (!baseTotal) return {};
    const baseRaw = Object.fromEntries(usable.map(row => [row.model.id, row.weight]));
    const base = Object.fromEntries(usable.map(row => [row.model.id, row.weight / baseTotal]));
    const raw = Object.fromEntries(usable.map(row => {
      const quality = finite(qualities[row.model.id]);
      return [row.model.id, quality == null ? 1 : clamp(quality / COURT_PRIOR_QUALITY, 1 - COURT_MAX_FACTOR_SHIFT, 1 + COURT_MAX_FACTOR_SHIFT)];
    }));
    const rawMean = usable.reduce((sum, row) => sum + base[row.model.id] * raw[row.model.id], 0) || 1;
    const factors = Object.fromEntries(usable.map(row => [row.model.id, clamp(raw[row.model.id] / rawMean, 1 - COURT_MAX_FACTOR_SHIFT, 1 + COURT_MAX_FACTOR_SHIFT)]));
    for (let pass = 0; pass < 3; pass++) {
      const total = usable.reduce((sum, row) => sum + base[row.model.id] * factors[row.model.id], 0);
      const delta = 1 - total;
      if (Math.abs(delta) < 1e-9) break;
      const limit = delta > 0 ? 1 + COURT_MAX_FACTOR_SHIFT : 1 - COURT_MAX_FACTOR_SHIFT;
      const capacity = usable.reduce((sum, row) => sum + base[row.model.id] * Math.abs(limit - factors[row.model.id]), 0);
      if (!capacity) break;
      usable.forEach(row => {
        const id = row.model.id;
        factors[id] += delta * Math.abs(limit - factors[id]) / capacity;
        factors[id] = clamp(factors[id], 1 - COURT_MAX_FACTOR_SHIFT, 1 + COURT_MAX_FACTOR_SHIFT);
      });
    }
    return Object.fromEntries(usable.map(row => [row.model.id, baseRaw[row.model.id] * factors[row.model.id]]));
  }

  function courtWeightsAt(lat, lon, target, rows) {
    const modelIds = (rows || []).map(row => row?.model?.id).filter(Boolean);
    const baseWeights = boundedCourtWeights(rows, {});
    const regime = forecastRegime(rows);
    const season = seasonBucket(target);
    const bucketName = leadBucket(Math.max(0, (new Date(target).getTime() - Date.now()) / 3600000));
    const court = readCourt();
    const candidates = regime === 'snow' ? [] : courtTierKeys(calibrationPlaceBucket(lat, lon), bucketName, season, regime);
    let collecting = null;
    for (const tierKey of candidates) {
      const entry = court.tiers[tierKey];
      if (!entry) continue;
      const eligibility = courtEligibility(entry, modelIds);
      if (!collecting || eligibility.verifiedHours > collecting.verifiedHours) collecting = { tierKey, entry, ...eligibility };
      if (!eligibility.active) continue;
      const qualities = Object.fromEntries(eligibility.eligibleModels.map(id => [id, posteriorQuality(entry.models[id])]));
      const weights = boundedCourtWeights(rows, qualities);
      return Object.freeze({ active:true, tier:tierKey, regime, season, leadBucket:bucketName, weights:Object.freeze(weights), qualities:Object.freeze(qualities), ...eligibility, maxShift:COURT_MAX_FACTOR_SHIFT });
    }
    return Object.freeze({
      active:false, tier:collecting?.tierKey || (regime === 'snow' ? 'snow-withheld' : 'collecting'), regime, season, leadBucket:bucketName,
      weights:Object.freeze(baseWeights), verifiedHours:collecting?.verifiedHours || 0, wetHours:collecting?.wetHours || 0, dryHours:collecting?.dryHours || 0,
      spanDays:collecting?.spanDays || 0, requiredHours:COURT_MIN_SAMPLES, reason:regime === 'snow' ? 'rain-radar-cannot-verify-snow' : 'prospective-thresholds-not-met', maxShift:COURT_MAX_FACTOR_SHIFT
    });
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

  function notifyEvidence(source, context) {
    try {
      window.dispatchEvent(new CustomEvent('skymap:evidence-ready', { detail:{ source, placeKey:placeBucket(context.lat, context.lon), savedAt:context.savedAt } }));
    } catch (_) {}
  }

  async function buildContext(lat, lon) {
    const anchor = await fetchBestMatch(lat, lon);
    if (!anchor.exact?.hourly?.time?.length) throw new Error('Best Match unavailable');
    const neighbourIndexes = new Map(anchor.neighbours.map(data => [data, indexByTime(data)]));
    return {
      lat: Number(lat), lon: Number(lon), savedAt: Date.now(), anchor, anchorIndex: indexByTime(anchor.exact),
      neighbourIndexes, official:{ name:null, updated:null, hourly:[] }, nowcast:[], reps:[], enriched:false
    };
  }

  async function enrichContext(context) {
    const [official, nowcast, reps] = await Promise.all([
      fetchOfficial(context.lat, context.lon),
      fetchNowcast(context.lat, context.lon),
      fetchReps(context.lat, context.lon, context.anchor.exact)
    ]);
    context.official = official;
    context.nowcast = nowcast;
    context.reps = reps;
    context.savedAt = Date.now();
    context.enriched = true;
    return context;
  }

  async function getContext(lat, lon) {
    const key = placeBucket(lat, lon);
    const cached = contextCache.get(key);
    const ttl = cached?.data?.official?.hourly?.length ? OFFICIAL_TTL : ANCHOR_TTL;
    if (cached?.data && Date.now() - cached.savedAt < ttl) return cached.data;
    if (cached?.promise) return cached.promise;
    const promise = buildContext(lat, lon)
      .then(data => {
        const entry = { savedAt: Date.now(), data, enrichPromise:null };
        contextCache.set(key, entry);
        notifyEvidence('best-match', data);
        entry.enrichPromise = enrichContext(data).then(enriched => {
          entry.savedAt = Date.now();
          entry.enrichPromise = null;
          notifyEvidence('eccc-guidance', enriched);
          return enriched;
        }).catch(() => { entry.enrichPromise = null; return data; });
        return data;
      })
      .catch(error => {
        contextCache.delete(key);
        throw error;
      });
    contextCache.set(key, { savedAt: 0, data: null, promise });
    return promise;
  }

  function warmEvidence(lat, lon, announceReady = true) {
    if (finite(lat) == null || finite(lon) == null) return Promise.resolve(null);
    return getContext(lat, lon).then(context => {
      if (announceReady) {
        notifyEvidence('best-match', context);
        if (context.enriched) notifyEvidence('eccc-guidance', context);
      }
      return context;
    }).catch(() => null);
  }

  function evidenceAt(lat, lon, target) {
    const context = contextCache.get(placeBucket(lat, lon))?.data;
    if (!context?.anchor?.exact?.hourly?.time?.length) return null;
    const j = context.anchorIndex.get(roundHour(target));
    if (j == null) return null;
    const anchor = context.anchor.exact.hourly;
    const exactPrecip = finite(anchor.precipitation?.[j]);
    const exactRain = finite(anchor.rain?.[j]);
    const exactShowers = finite(anchor.showers?.[j]);
    const exactSnowfall = finite(anchor.snowfall?.[j]);
    return {
      exactPop: finite(anchor.precipitation_probability?.[j]),
      exactPrecip: exactPrecip == null ? null : Math.max(0, exactPrecip),
      exactRain: exactRain == null ? null : Math.max(0, exactRain),
      exactShowers: exactShowers == null ? null : Math.max(0, exactShowers),
      exactSnowfall: exactSnowfall == null ? null : Math.max(0, exactSnowfall),
      exactCode: finite(anchor.weather_code?.[j]),
      officialPop: officialPopAt(context, target),
      officialName: context.official.name || null,
      repsPop: repsPopAt(context, target),
      nowcastRate: nowcastRateAt(context, target),
      neighbours: neighbourStats(context, target),
      collectedAt: context.savedAt
    };
  }

  function modelSkillAt(lat, lon, modelId, target) {
    const leadHours = Math.max(0, (new Date(target).getTime() - Date.now()) / 3600000);
    return readSkill(placeBucket(lat, lon), modelId, leadHours);
  }

  function annotateModel(data, context, modelId, lat, lon) {
    if (!data?.hourly?.time?.length) return data;
    const bucket = placeBucket(lat, lon);
    data.skymap_accuracy = {
      version: VERSION,
      model: modelId,
      mode: 'raw-model-plus-shared-evidence-sidecar',
      local_skill: readSkill(bucket, modelId, 12),
      anchor: context?.anchor?.exact ? 'open-meteo-best-match' : null,
      official: context?.official?.name || null,
      reps_samples: context?.reps?.length || 0,
      nowcast_samples: context?.nowcast?.length || 0,
      model_rows_mutated: 0,
      truth_contract: 'shared evidence is routed once after raw model consensus; missing values stay missing',
      annotated_at: new Date().toISOString()
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
        if (valid < now + 20 * 60000 || valid > now + 168 * 3600000) return;
        const precipRaw = finite(data.hourly.precipitation?.[i]);
        const code = finite(data.hourly.weather_code?.[i]);
        if (!hasExplicitForecastEvidence(precipRaw, code)) return;
        const snowfallRaw = finite(data.hourly.snowfall?.[i]);
        const precip = precipRaw == null ? null : Math.max(0, precipRaw);
        const snowfall = snowfallRaw == null ? null : Math.max(0, snowfallRaw);
        const leadHours = Math.max(0, (valid - now) / 3600000);
        const bucketName = leadBucket(leadHours);
        rows.push({
          id: `${modelId}|${roundHour(valid)}|${bucketName}`,
          modelId, madeAt: now, validAt: roundHour(valid), leadBucket: leadBucket(leadHours),
          wet: (precip != null && precip >= 0.12) || (code != null && PRECIP_CODES.has(code)),
          snow: (snowfall != null && snowfall > 0.02) || (code != null && SNOW_CODES.has(code)),
          precip, evidence: { precipitation: precip != null, weatherCode: code != null }, contractVersion: VERSION
        });
      });
      const prospective = new Map();
      [...existing, ...rows]
        .filter(item => item?.madeAt && now - item.madeAt < 9 * 86400000)
        .sort((a, b) => a.madeAt - b.madeAt)
        .forEach(item => {
          const itemKey = `${item.modelId}|${roundHour(item.validAt)}|${item.leadBucket || leadBucket((item.validAt - item.madeAt) / 3600000)}`;
          if (!prospective.has(itemKey) || item.verified) prospective.set(itemKey, item);
        });
      localStorage.setItem(key, JSON.stringify([...prospective.values()].slice(-4000)));
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
      const candidates = rows.filter(row => !row.verified && Math.abs(row.validAt - validAt) <= 75 * 60000 && validAt - row.madeAt >= 25 * 60000);
      const groups = new Map();
      candidates.forEach(row => {
        const issue = Math.floor(row.madeAt / 1800000);
        const groupKey = `${row.validAt}|${issue}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(row);
      });
      groups.forEach(group => {
        if (group.some(row => row.snow)) return;
        recordCourtObservation(lat, lon, validAt, group, rate);
        group.forEach(row => {
          row.verified = true;
          row.verifiedAt = Date.now();
          row.observedWet = observedWet;
          row.observedRate = rate;
          const correct = row.wet === observedWet ? 1 : 0;
          writeSkill(bucket, row.modelId, row.leadBucket || leadBucket((row.validAt - row.madeAt) / 3600000), correct);
          changed = true;
        });
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

  function forecastCourtStats() {
    try {
      const court = readCourt();
      const entries = Object.values(court.tiers || {});
      const activeTiers = entries.filter(entry => courtEligibility(entry, Object.keys(entry.models || {})).active).length;
      return { verifiedHours:new Set(court.observations || []).size, activeTiers, minimum:COURT_MIN_SAMPLES };
    } catch (_) {
      return { verifiedHours:0, activeTiers:0, minimum:COURT_MIN_SAMPLES };
    }
  }

  function contextStatus() {
    const contexts = [...contextCache.values()].map(item => item.data).filter(Boolean);
    const latest = contexts.sort((a, b) => b.savedAt - a.savedAt)[0];
    const stats = accuracyStats();
    const court = forecastCourtStats();
    return {
      official: latest?.official?.name || null,
      reps: latest?.reps?.length || 0,
      nowcast: latest?.nowcast?.length || 0,
      samples: stats.samples,
      score: stats.score,
      court
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
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      try {
        const data = await response.clone().json();
        const context = lat != null && lon != null ? contextCache.get(placeBucket(lat, lon))?.data : null;
        annotateModel(data, context, modelId, lat, lon);
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
      if (status.court.activeTiers) extras.push(`Forecast Court active · ${status.court.verifiedHours} verified hours`);
      else if (status.court.verifiedHours) extras.push(`Forecast Court collecting · ${status.court.verifiedHours} verified hours`);
      const suffix = extras.length ? `Forecast IQ · ${extras.join(' · ')}` : 'Forecast IQ';
      const base = current.replace(/\s*·\s*Forecast IQ.*$/i, '');
      const next = `${base} · ${suffix}`;
      if (current !== next) detail.textContent = next;
    };
    new MutationObserver(add).observe(detail, { childList: true, characterData: true, subtree: true });
    add();
  }

  resetLegacyModelCache();
  window.SkyMapAccuracy = Object.freeze({
    version: VERSION,
    mode: 'truth-firewall+single-pass-sidecar+radar-first+official+reps+forecast-court-calibration',
    status: contextStatus,
    warm: warmEvidence,
    evidenceAt,
    modelSkillAt,
    courtWeightsAt,
    courtStatus: forecastCourtStats,
    contract: Object.freeze({
      finite, mix, dryWeatherCode, hasExplicitForecastEvidence, seasonBucket, forecastRegime, courtEligibility, boundedCourtWeights,
      courtRules:Object.freeze({ version:COURT_VERSION, minimumSamples:COURT_MIN_SAMPLES, minimumSpanDays:COURT_MIN_SPAN_DAYS, minimumWet:COURT_MIN_WET, minimumDry:COURT_MIN_DRY, priorStrength:COURT_PRIOR_STRENGTH, maxFactorShift:COURT_MAX_FACTOR_SHIFT })
    })
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateStatus, { once: true });
  else decorateStatus();
})();
