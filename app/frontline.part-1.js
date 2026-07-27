
  function numericFrom(value) {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
    if (Array.isArray(value)) for (const item of value) { const result = numericFrom(item); if (result !== null) return result; }
    if (typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (/(time|date|lon|lat|x|y|id|index|quality)/i.test(key)) continue;
      const result = numericFrom(item);
      if (result !== null) return result;
    }
    return null;
  }

  async function pointValue(layer, style, time, reference, point) {
    const delta = .04;
    const query = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo', SRS: 'EPSG:4326',
      BBOX: `${point.lon - delta},${point.lat - delta},${point.lon + delta},${point.lat + delta}`,
      WIDTH: 20, HEIGHT: 20, X: 10, Y: 10, LAYERS: layer, QUERY_LAYERS: layer,
      INFO_FORMAT: 'application/json', FORMAT: 'image/png'
    });
    if (style) query.set('STYLES', style);
    if (time) query.set('TIME', formatTime(time));
    if (reference) query.set('DIM_REFERENCE_TIME', formatTime(reference));
    for (const endpoint of endpoints()) {
      try {
        const properties = (await fetchJson(`${endpoint}?${query}`, 8500)).features?.[0]?.properties;
        if (!properties) return null;
        return finite(properties.value) ?? numericFrom(properties);
      } catch (_) { }
    }
    return undefined;
  }

  async function radarEvidence(point) {
    const meta = await layerMeta(RADAR);
    const valid = meta.times.filter(value => new Date(value).getTime() <= Date.now() + 5 * 60000);
    const time = valid.at(-1) || meta.defaultTime || meta.times.at(-1);
    const reference = meta.defaultReference || meta.references.at(-1);
    const centrePromise = pointValue(RADAR, RADAR_STYLE, time, reference, point);
    const samples = DIRECTIONS.map(([direction, bearing]) => ({ direction, bearing, ...offsetPoint(point, 15, bearing) }));
    const nearbyValues = await Promise.all(samples.map(sample => pointValue(RADAR, RADAR_STYLE, time, reference, sample).catch(() => undefined)));
    const entries = samples.map((sample, index) => ({ ...sample, value: finite(nearbyValues[index]) }));
    const wet = entries.filter(entry => entry.value !== null && entry.value >= .03).sort((a, b) => b.value - a.value);
    return { centre: finite(await centrePromise), time, nearest: wet[0] || null, organized: wet.length >= 3 };
  }

  async function nowcastEvidence(point) {
    const meta = await layerMeta(NOWCAST);
    const now = Date.now();
    const times = meta.times.filter(value => {
      const time = new Date(value).getTime();
      return time >= now - 5 * 60000 && time <= now + 125 * 60000;
    }).sort((a, b) => new Date(a) - new Date(b));
    const picks = times.length ? [times[0], times[Math.floor(times.length / 2)], times.at(-1)].filter((value, index, all) => value && all.indexOf(value) === index) : [];
    const reference = meta.defaultReference || meta.references.at(-1);
    const frames = await Promise.all(picks.map(async time => ({ time, value: finite(await pointValue(NOWCAST, '', time, reference, point)) })));
    const arrival = frames.find(frame => frame.value !== null && frame.value >= .03);
    return { minutes: arrival ? Math.max(0, Math.round((new Date(arrival.time).getTime() - now) / 60000)) : null };
  }

  async function cityEvidence(point) {
    let features = [];
    for (const radius of [.8, 2.2, 5]) {
      const bbox = `${point.lon - radius},${point.lat - radius},${point.lon + radius},${point.lat + radius}`;
      features = (await fetchJson(`${WEATHER}/collections/citypageweather-realtime/items?f=json&bbox=${bbox}&limit=30`, 13000)).features || [];
      if (features.length) break;
    }
    if (!features.length) return null;
    const feature = features.sort((a, b) => {
      const ac = a.geometry?.coordinates || [999, 999];
      const bc = b.geometry?.coordinates || [999, 999];
      return ((ac[1] - point.lat) ** 2 + (ac[0] - point.lon) ** 2) - ((bc[1] - point.lat) ** 2 + (bc[0] - point.lon) ** 2);
    })[0];
    const properties = feature.properties || {};
    return { name: english(properties.name) || point.name, condition: String(english(properties.currentConditions?.condition) || '').trim() };
  }

  async function surfaceEvidence(point) {
    const bbox = `${point.lon - .8},${point.lat - .6},${point.lon + .8},${point.lat + .6}`;
    const query = new URLSearchParams({ f: 'json', limit: 80, bbox, sortby: '-date_tm-value', properties: 'date_tm-value,rnfl_amt_pst1hr,stn_nam-value' });
    const candidates = ((await fetchJson(`${WEATHER}/collections/swob-realtime/items?${query}`, 11000)).features || []).map(feature => {
      const coords = feature.geometry?.coordinates || [];
      const time = new Date(feature.properties?.['date_tm-value'] || 0);
      return { feature, time, distance: Number.isFinite(coords[0]) ? distanceKm(point, { lat: coords[1], lon: coords[0] }) : Infinity };
    }).filter(item => Number.isFinite(item.time.getTime()) && Date.now() - item.time.getTime() < 3 * 3600000)
      .sort((a, b) => a.distance - b.distance || b.time - a.time);
    const best = candidates[0];
    if (!best) return null;
    return {
      station: best.feature.properties?.['stn_nam-value'] || 'Nearby station',
      rain: Math.max(0, finite(best.feature.properties?.rnfl_amt_pst1hr) || 0)
    };
  }

  async function shortEvidence(point) {
    const params = new URLSearchParams({
      latitude: point.lat, longitude: point.lon, timezone: 'auto', forecast_hours: 6, forecast_minutely_15: 8,
      current: 'precipitation,rain,showers,weather_code,cloud_cover',
      minutely_15: 'precipitation,rain,showers,weather_code',
      hourly: 'precipitation_probability,cloud_cover'
    });
    const data = await fetchJson(`${OPEN_METEO}?${params}`, 13000);
    const current = data.current || {};
    const minutes = data.minutely_15 || {};
    const clouds = (data.hourly?.cloud_cover || []).slice(0, 4).map(value => clamp(finite(value) || 0, 0, 100));
    return {
      wet: Math.max(0, finite(current.precipitation) || 0) >= .01
        || Math.max(0, finite(current.rain) || 0) >= .01
        || Math.max(0, finite(current.showers) || 0) >= .01
        || [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(Number(current.weather_code))
        || (minutes.precipitation || []).slice(0, 2).some(value => (finite(value) || 0) >= .01),
      cloudNow: clamp(finite(current.cloud_cover) || clouds[0] || 0, 0, 100),
      cloudLater: clouds.at(-1) ?? null
    };
  }

  function rateLabel(value) {
    const amount = finite(value);
    if (amount === null) return 'Unavailable';
    if (amount < .03) return 'Below radar threshold';
    if (amount < .5) return `${amount.toFixed(1)} mm/h · trace`;
    if (amount < 2.5) return `${amount.toFixed(1)} mm/h · light`;
    if (amount < 7.5) return `${amount.toFixed(1)} mm/h · steady`;
    return `${amount.toFixed(amount < 10 ? 1 : 0)} mm/h · heavy`;
  }

  function buildTruth(point, city, surface, short, radar, nowcast) {
    const cityWet = Boolean(city?.condition && WET_WORDS.test(city.condition));
    const surfaceWet = (surface?.rain || 0) >= .1;
    const radarWet = radar?.centre !== null && radar?.centre !== undefined && radar.centre >= .03;
    const approaching = nowcast?.minutes !== null && nowcast?.minutes !== undefined && nowcast.minutes <= 90;
    const thickening = short?.cloudLater !== null && short?.cloudLater !== undefined && short.cloudLater - (short.cloudNow || 0) >= 18;
    let level = 'quiet';
    let title = 'No current rain signal at the pinpoint.';
    let copy = 'Radar, the nearest surface report and short-interval guidance do not confirm precipitation here. That is not proof that every drop is absent.';

    if (radarWet) {
      level = radar.centre >= 2.5 ? 'wet' : 'trace';
      title = radar.centre >= 2.5 ? 'Rain is over your pinpoint now.' : 'Light rain is over your pinpoint now.';
      copy = `ECCC radar measures about ${radar.centre.toFixed(radar.centre < 10 ? 1 : 0)} mm/h at the exact point.`;
    } else if (cityWet || surfaceWet) {
      level = 'trace';
      title = 'Very light precipitation may be reaching the surface.';
      const support = [cityWet ? `the nearest ECCC condition says ${city.condition.toLowerCase()}` : '', surfaceWet ? `${surface.station} recorded ${surface.rain.toFixed(1)} mm in the past hour` : ''].filter(Boolean).join(' and ');
      copy = `No measurable radar return is over the pinpoint, but ${support}. Fine shallow drizzle can be missed or underestimated by radar.`;
    } else if (short?.wet) {
      level = 'watch';
      title = 'A very light precipitation signal is near your pinpoint.';
      copy = 'Radar is below measurable range while short-interval guidance shows drizzle or light precipitation. This is a cautious heads-up, not a measured radar observation.';
    } else if (approaching || radar?.nearest) {
      level = 'watch';
      title = approaching ? `A rain edge may reach your pinpoint in about ${Math.max(5, nowcast.minutes)} minutes.` : 'A rain area is close to your pinpoint.';
      copy = approaching ? 'Official radar motion brings measurable precipitation to the point. Recheck as the edge approaches because small cells can shift.' : `Measured radar detects precipitation about 15 km to the ${radar.nearest.direction}, but it has not reached the pinpoint.`;
    } else if (thickening || (short?.cloudNow || 0) >= 80) {
      level = 'cloud';
      title = thickening ? 'A cloud front is building, but rain is not confirmed.' : 'Thick cloud is overhead, but rain is not confirmed.';
      copy = 'The GOES cloud layer can show the visible front while precipitation radar remains quiet. Cloud does not automatically mean rain at the ground.';
    }
