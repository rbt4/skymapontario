const timeout = 25000;

async function request(url, attempts = 3, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout), cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkWms(name, layer, style = '') {
  const base = 'https://geo.weather.gc.ca/geomet/';
  const capabilities = await request(`${base}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${encodeURIComponent(layer)}`);
  const cors = capabilities.headers.get('access-control-allow-origin');
  assert(cors === '*' || cors?.includes('rbt4.github.io'), `${name}: browser CORS header is missing`);
  const xml = await capabilities.text();
  assert(xml.includes(layer), `${name}: layer is absent from GetCapabilities`);
  const dimension = xml.match(/<Dimension name="time"[^>]*>([^<]+)<\/Dimension>/)?.[1];
  assert(dimension, `${name}: no second-precision timestamps were advertised`);
  const time = dimension.includes('/') ? dimension.split('/')[1] : dimension.split(',').at(-1);
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetMap', layers: layer, styles: style,
    crs: 'EPSG:4326', bbox: '41,-96,58,-73', width: '256', height: '256', format: 'image/png', transparent: 'true', time
  });
  const image = await request(`${base}?${params}`);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert(image.headers.get('content-type')?.includes('image/png'), `${name}: GetMap did not return PNG data`);
  assert(bytes.length > 100, `${name}: GetMap returned an empty image`);
  return `${name}: ${time} (${bytes.length.toLocaleString()} bytes)`;
}

async function checkPointValue(name, layer, style = '') {
  const base = 'https://geo.weather.gc.ca/geomet/';
  const capabilities = await request(`${base}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${encodeURIComponent(layer)}`);
  const xml = await capabilities.text();
  const dimension = xml.match(/<Dimension name="time"[^>]*>([^<]+)<\/Dimension>/)?.[1];
  assert(dimension, `${name}: time dimension is missing`);
  const time = dimension.includes('/') ? dimension.split('/')[1] : dimension.split(',').at(-1);
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo', layers: layer, query_layers: layer, styles: style,
    crs: 'EPSG:3857', bbox: '-8939320,5312000,-8739320,5512000', width: '101', height: '101', i: '50', j: '50', info_format: 'application/json', time
  });
  const response = await request(`${base}?${params}`);
  const data = await response.json();
  const value = Number(data.features?.[0]?.properties?.value);
  assert(Number.isFinite(value), `${name}: no numeric centre-point value was returned`);
  return `${name}: point query ${value}`;
}

async function checkCityWeather() {
  const url = 'https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&bbox=-79.9,43.3,-78.9,44.0&limit=3';
  const response = await request(url);
  assert(response.headers.get('access-control-allow-origin') === '*', 'Local weather: browser CORS header is missing');
  const data = await response.json();
  const feature = data.features?.find(item => item.properties?.hourlyForecastGroup?.hourlyForecasts?.length);
  assert(feature?.properties?.currentConditions, 'Local weather: current conditions are missing');
  assert(feature.properties.hourlyForecastGroup.hourlyForecasts.length >= 12, 'Local weather: hourly forecast is incomplete');
  return `Local weather: ${feature.properties.name?.en} with ${feature.properties.hourlyForecastGroup.hourlyForecasts.length} hourly forecasts`;
}

async function checkAir() {
  const url = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&latest=true&bbox=-95.5,41.4,-73.8,57.6&limit=300';
  const response = await request(url);
  assert(response.headers.get('access-control-allow-origin') === '*', 'AQHI: browser CORS header is missing');
  const data = await response.json();
  const valid = (data.features || []).filter(feature => Number.isFinite(Number(feature.properties?.aqhi)) && feature.geometry?.type === 'Point');
  assert(valid.length, 'AQHI: no usable station observations returned');
  return `AQHI: ${valid.length} usable stations`;
}

async function checkAlerts() {
  const url = 'https://api.weather.gc.ca/collections/weather-alerts/items?f=json&province=ON&limit=1';
  const response = await request(url);
  assert(response.headers.get('access-control-allow-origin') === '*', 'Alerts: browser CORS header is missing');
  const data = await response.json();
  assert(data.type === 'FeatureCollection' && Array.isArray(data.features), 'Alerts: invalid FeatureCollection');
  return `Alerts: ${data.numberMatched ?? data.features.length} matching Ontario records`;
}

async function checkFires() {
  const base = 'https://geoserver.cwfif.nrcan.gc.ca/geoserver/ows';
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'public:cwfif_national_activefires', outputFormat: 'application/json', srsName: 'EPSG:4326', CQL_FILTER: `agency_code='ON' AND record_end > '${now}'`, propertyName: 'geometry,national_fire_id,agency_fire_id,stage_of_control_status,fire_size,status_date', count: '1000' });
  const response = await request(`${base}?${params}`, 3, { headers: { Origin: 'https://rbt4.github.io' } });
  const cors = response.headers.get('access-control-allow-origin');
  assert(cors === '*' || cors?.includes('rbt4.github.io'), 'Active fires: browser CORS header is missing');
  const data = await response.json();
  const valid = (data.features || []).filter(feature => feature.geometry?.type === 'Point' && feature.properties?.agency_fire_id);
  assert(data.type === 'FeatureCollection' && valid.length, 'Active fires: no usable Ontario agency records');
  return `Active fires: ${valid.length} current Ontario agency records`;
}

const checks = [];
for (const check of [
  () => checkWms('Rain radar', 'RADAR_1KM_RRAI', 'RADARURPPRECIPR14-LINEAR'),
  () => checkWms('Rain nowcast', 'Radar_1km_RainPrecipRate-Extrapolation', 'Radar-Rain_14colors'),
  () => checkWms('Smoke forecast', 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume'),
  () => checkPointValue('Radar explanation', 'RADAR_1KM_RRAI', 'RADARURPPRECIPR14-LINEAR'),
  () => checkPointValue('Smoke explanation', 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume'),
  checkCityWeather, checkAir, checkAlerts, checkFires
]) {
  const result = await check();
  checks.push(result);
  console.log(`✓ ${result}`);
}
