import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const appHtml = read('app/index.html');
const appJs = read('app/app.js');
const siteHtml = read('index.html');
const siteJs = read('assets/site.js');
const serviceWorker = read('app/sw.js');

const ids = [...appHtml.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert(!duplicateIds.length, `Duplicate app IDs: ${[...new Set(duplicateIds)].join(', ')}`);

const referencedIds = [...appJs.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
const missingIds = [...new Set(referencedIds.filter(id => !ids.includes(id)))];
assert(!missingIds.length, `app.js references missing IDs: ${missingIds.join(', ')}`);

function checkAssets(html, htmlPath) {
  const base = dirname(resolve(root, htmlPath));
  const refs = [...html.matchAll(/<(?:script|img|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  const local = refs.filter(value => !/^(?:https?:|data:|#)/.test(value) && !value.includes('download/SkyMap-Ontario'));
  const missing = local.filter(value => !existsSync(resolve(base, value.split(/[?#]/)[0])));
  assert(!missing.length, `${htmlPath} references missing assets: ${missing.join(', ')}`);
}

checkAssets(appHtml, 'app/index.html');
checkAssets(siteHtml, 'index.html');

const shellPaths = [...serviceWorker.matchAll(/'\.\/([^']+)'/g)].map(match => match[1]).filter(value => value && value !== '');
const missingShell = shellPaths.filter(value => !existsSync(resolve(root, 'app', value)));
assert(!missingShell.length, `Service worker caches missing files: ${missingShell.join(', ')}`);

const combined = [appHtml, appJs, siteHtml, siteJs, serviceWorker, read('README.md')].join('\n');
assert(!combined.includes('geoserver.cwfis.cfs.nrcan.gc.ca'), 'Dead CWFIS hostname is present');
assert(appJs.includes('geoserver.cwfif.nrcan.gc.ca'), 'Current NRCan active-fire service is not wired');
assert(!combined.includes('SkyMap-Ontario-v4.2.apk'), 'Stale 4.2 APK link is present');
assert(!combined.includes('SkyMap-Ontario-v4.3.apk'), 'Stale 4.3 APK link is present');
assert(appJs.includes("replace(/\\.\\d{3}Z$/, 'Z')"), 'WMS timestamp normalization is missing');
assert(appJs.includes('Radar_1km_RainPrecipRate-Extrapolation'), 'Next-hour radar nowcast is not wired');
assert(appJs.includes('citypageweather-realtime'), 'Local city weather is not wired');
assert(appJs.includes("request: 'GetFeatureInfo'"), 'Per-time map-value explanations are not wired');
assert(appHtml.includes('vendor/leaflet.js') && appHtml.includes('vendor/leaflet.css'), 'Bundled Leaflet assets are not wired');
assert(appJs.includes('DOM.timeline.hidden = !config.timed'), 'Non-timed layers do not hide the timeline semantically');
assert(appHtml.includes('aria-label="Rain radar"') && appHtml.includes('aria-label="Weather alerts"'), 'Layer controls need explicit accessible names');

console.log(`✓ ${ids.length} app IDs are unique and wired`);
console.log('✓ HTML assets and service-worker shell files exist');
console.log('✓ Dead endpoints and stale APK links are absent');
