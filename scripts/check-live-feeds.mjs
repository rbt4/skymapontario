const timeout = 25000;

async function request(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
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
  const timestamps = xml.match(/20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g) || [];
  assert(timestamps.length, `${name}: no second-precision timestamps were advertised`);
  const time = timestamps.at(-1);
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
  const base = 'https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows';
  const params = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'public:hotspots_last24hrs', outputFormat: 'application/json', srsName: 'EPSG:4326', CQL_FILTER: "agency='ON'", propertyName: 'geometry,rep_date,source,sensor,satellite,agency,age,frp', count: '1' });
  const response = await request(`${base}?${params}`);
  const cors = response.headers.get('access-control-allow-origin');
  assert(cors === '*' || cors?.includes('rbt4.github.io'), 'Hotspots: browser CORS header is missing');
  const data = await response.json();
  assert(data.type === 'FeatureCollection' && Array.isArray(data.features), 'Hotspots: invalid FeatureCollection');
  return `Hotspots: endpoint healthy (${data.totalFeatures ?? data.numberMatched ?? 'count available in app'})`;
}

const checks = await Promise.all([
  checkWms('Rain radar', 'RADAR_1KM_RRAI', 'RADARURPPRECIPR14-LINEAR'),
  checkWms('Smoke forecast', 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume'),
  checkAir(), checkAlerts(), checkFires()
]);

checks.forEach(result => console.log(`✓ ${result}`));
