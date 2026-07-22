const timeout = 30000;

const sources = {
  geomet: 'https://geo.weather.gc.ca/geomet',
  weather: 'https://api.weather.gc.ca'
};

const models = [
  ['Canada GEM', 'https://api.open-meteo.com/v1/gem', 'gem_seamless'],
  ['ECMWF IFS', 'https://api.open-meteo.com/v1/ecmwf', 'ecmwf_ifs025'],
  ['NOAA GFS', 'https://api.open-meteo.com/v1/gfs', 'gfs_seamless'],
  ['ECMWF AIFS', 'https://api.open-meteo.com/v1/ecmwf', 'ecmwf_aifs025_single']
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function request(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 900));
    }
  }
  throw lastError;
}

function layerBlock(xml, layer) {
  const nameIndex = xml.indexOf(`<Name>${layer}</Name>`);
  assert(nameIndex >= 0, `${layer}: layer is absent`);
  const start = xml.lastIndexOf('<Layer', nameIndex);
  const end = xml.indexOf('</Layer>', nameIndex);
  assert(start >= 0 && end > nameIndex, `${layer}: layer metadata is malformed`);
  return xml.slice(start, end + 8);
}

function timeDimension(xml, layer) {
  const match = layerBlock(xml, layer).match(/<(?:Dimension|Extent)\b[^>]*name=["']time["'][^>]*>([^<]+)<\/(?:Dimension|Extent)>/i);
  return match?.[1]?.trim() || '';
}

function latestDimensionTime(value) {
  if (!value) return '';
  if (value.includes(',')) return value.split(',').at(-1).trim();
  if (value.includes('/')) return value.split('/')[1].trim();
  return value;
}

async function checkWms(name, layer, style = '') {
  const capabilitiesUrl = `${sources.geomet}?${new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetCapabilities', layer })}`;
  const capabilities = await request(capabilitiesUrl);
  const xml = await capabilities.text();
  const time = latestDimensionTime(timeDimension(xml, layer));
  const query = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: layer, STYLES: style,
    CRS: 'EPSG:4326', BBOX: '41,-84,47,-74', WIDTH: '640', HEIGHT: '480',
    FORMAT: 'image/png', TRANSPARENT: 'TRUE'
  });
  if (time) query.set('TIME', time);
  const image = await request(`${sources.geomet}?${query}`);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert(image.headers.get('content-type')?.includes('image/png'), `${name}: GetMap was not PNG`);
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${name}: invalid PNG signature`);
  assert(bytes.length > 500, `${name}: image was empty`);
  console.log(`✓ ${name}: ${time || 'default time'} · ${bytes.length.toLocaleString()} bytes`);
  return time;
}

async function checkRadarPoint(time) {
  assert(time, 'Observed radar point query: layer-scoped time is missing');
  const query = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo', SRS: 'EPSG:4326',
    BBOX: '-79.4232,43.6132,-79.3432,43.6932', WIDTH: '20', HEIGHT: '20', X: '10', Y: '10',
    LAYERS: 'RADAR_1KM_RRAI', QUERY_LAYERS: 'RADAR_1KM_RRAI', STYLES: 'RADARURPPRECIPR14-LINEAR',
    INFO_FORMAT: 'application/json', FORMAT: 'image/png', TIME: time
  });
  const response = await request(`${sources.geomet}?${query}`);
  const data = await response.json();
  assert(data.type === 'FeatureCollection' && Array.isArray(data.features), 'Observed radar point query: invalid FeatureCollection');
  const value = data.features[0]?.properties?.value;
  assert(value === undefined || value === null || Number.isFinite(Number(value)), 'Observed radar point query: invalid rain rate');
  console.log(`✓ Exact radar point: ${value == null ? 'no measurable return' : `${Number(value)} mm/h`} near Toronto`);
}

async function checkCityWeather() {
  const response = await request(`${sources.weather}/collections/citypageweather-realtime/items?f=json&bbox=-80.2,43.2,-78.8,44.1&limit=12`);
  const data = await response.json();
  const feature = (data.features || []).find(item => item.properties?.currentConditions && item.properties?.hourlyForecastGroup?.hourlyForecasts?.length >= 12);
  assert(feature, 'ECCC city weather: current or hourly forecast is missing');
  const hours = feature.properties.hourlyForecastGroup.hourlyForecasts;
  assert(hours.some(hour => hour.timestamp && hour.condition), 'ECCC city weather: hourly timestamps or conditions are missing');
  console.log(`✓ ECCC city weather: ${feature.properties.name?.en || 'near Toronto'} · ${hours.length} hourly periods`);
}

async function checkAlerts() {
  const response = await request(`${sources.weather}/collections/weather-alerts/items?f=json&province=ON&limit=1`);
  const data = await response.json();
  assert(data.type === 'FeatureCollection' && Array.isArray(data.features), 'ECCC alerts: invalid FeatureCollection');
  console.log(`✓ ECCC alerts: ${data.numberMatched ?? data.features.length} Ontario records`);
}

async function checkModel([name, endpoint, model]) {
  const query = new URLSearchParams({
    latitude: '43.6532', longitude: '-79.3832', timezone: 'auto', timeformat: 'unixtime',
    forecast_days: '8', models: model,
    hourly: 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover'
  });
  const response = await request(`${endpoint}?${query}`, 2);
  const data = await response.json();
  assert(data.timezone && Number.isFinite(Number(data.utc_offset_seconds)), `${name}: timezone metadata is missing`);
  assert(data.hourly?.time?.length >= 7 * 24, `${name}: hourly forecast is incomplete`);
  assert(data.hourly.time.every(value => Number.isFinite(Number(value))), `${name}: timestamps are not UNIX seconds`);
  assert(data.hourly.temperature_2m.some(value => Number.isFinite(Number(value))), `${name}: temperatures are missing`);
  console.log(`✓ ${name}: ${data.hourly.time.length} hours · ${data.timezone}`);
}

const observedTime = await checkWms('Observed rain radar', 'RADAR_1KM_RRAI', 'RADARURPPRECIPR14-LINEAR');
await checkRadarPoint(observedTime);
await checkWms('Short-range rain nowcast', 'Radar_1km_RainPrecipRate-Extrapolation');
await checkWms('Wildfire smoke guidance', 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume');
await checkWms('High-resolution temperature', 'HRDPS.CONTINENTAL_TT');
await checkWms('Lightning density', 'Lightning_2.5km_Density', 'Lightning');
await checkCityWeather();
await checkAlerts();
for (const model of models) {
  await checkModel(model);
  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log('✓ All live sources required by SkyMap 14.1 responded with usable data');
