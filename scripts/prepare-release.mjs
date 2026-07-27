import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const replaceOnce = (source, needle, replacement, label) => {
  if (!source.includes(needle)) throw new Error(`Unable to update ${label}`);
  return source.replace(needle, replacement);
};

const version = JSON.parse(read('version.json'));
if (!/^\d+\.\d+\.\d+$/.test(version.version)) throw new Error(`Invalid semantic version: ${version.version}`);
if (!Number.isInteger(version.versionCode) || version.versionCode < 1) throw new Error('versionCode must be a positive integer');

const gradlePath = 'android/app/build.gradle';
let gradle = read(gradlePath);
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${version.versionCode}`);
gradle = gradle.replace(/versionName\s+'[^']+'/, `versionName '${version.version}'`);
write(gradlePath, gradle);

const appJsPath = 'app/app.js';
let appJs = read(appJsPath);
appJs = appJs.replace(/version: '\d+\.\d+\.\d+'/, `version: '${version.version}'`);
write(appJsPath, appJs);

const swPath = 'app/sw.js';
let sw = read(swPath);
sw = sw.replace(/const VERSION = '\d+\.\d+\.\d+'/, `const VERSION = '${version.version}'`);
for (const file of ['frontline.css', 'frontline.js']) {
  if (!sw.includes(`'${file}'`)) {
    sw = replaceOnce(sw, "  'app.js',", `  'app.js',\n  '${file}',`, `service-worker shell entry ${file}`);
  }
}
write(swPath, sw);

const javaVersionFiles = ['MainActivity.java', 'GeoMetProxy.java', 'WeatherRefreshWorker.java', 'UpdateCheckWorker.java'];
for (const file of javaVersionFiles) {
  const javaPath = path.join('android/app/src/main/java/ca/skymapontario/app', file);
  let source = read(javaPath);
  source = source.replace(/SkyMapOntario\/\d+(?:\.\d+)*/g, `SkyMapOntario/${version.version}`);
  write(javaPath, source);
}

const mainActivityPath = 'android/app/src/main/java/ca/skymapontario/app/MainActivity.java';
const mainActivity = read(mainActivityPath);
if (!mainActivity.includes('requestAutomaticLocation')
    || !mainActivity.includes("document.getElementById('locate-button')")
    || !mainActivity.includes('AUTO_LOCATE_COOLDOWN_MS')) {
  throw new Error('Native current-location startup and resume handling is missing');
}

const frontlineParts = ['app/frontline.part-0.js', 'app/frontline.part-1.js', 'app/frontline.part-2.js', 'app/frontline.part-3.js'];
for (const part of frontlineParts) if (!fs.existsSync(path.join(root, part))) throw new Error(`Missing Frontline source part: ${part}`);
write('app/frontline.js', frontlineParts.map(read).join(''));

for (const required of [
  'app/frontline.js',
  'app/frontline.css',
  'app/icon.svg',
  'assets/site.css',
  'assets/site.js'
]) {
  if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing release asset: ${required}`);
}
execFileSync(process.execPath, ['--check', path.join(root, 'app/frontline.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(root, 'assets/site.js')], { stdio: 'inherit' });

const frontlineCssPath = 'app/frontline.css';
let frontlineCss = read(frontlineCssPath).replace("url('icon-192.png')", "url('icon.svg')");
write(frontlineCssPath, frontlineCss);

const appIndexPath = 'app/index.html';
let appIndex = read(appIndexPath);
appIndex = appIndex.replace(
  /<meta name="description" content="[^"]*">/,
  '<meta name="description" content="Open SkyMap anywhere in Ontario to follow your exact location, compare radar with surface drizzle and cloud fronts, and see what is approaching.">'
);
appIndex = appIndex.replace(/<link rel="icon" href="[^"]+" type="[^"]+">/, '<link rel="icon" href="icon.svg" type="image/svg+xml">');
if (!appIndex.includes('href="frontline.css"')) {
  if (!/<link rel="stylesheet" href="app\.css">/.test(appIndex)) throw new Error('Unable to update Frontline stylesheet');
  appIndex = appIndex.replace(/<link rel="stylesheet" href="app\.css">/, '<link rel="stylesheet" href="app.css">\n  <link rel="stylesheet" href="frontline.css">');
}
if (!appIndex.includes('src="frontline.js"')) {
  if (!/<script src="app\.js"><\/script>/.test(appIndex)) throw new Error('Unable to update Frontline runtime');
  appIndex = appIndex.replace(/<script src="app\.js"><\/script>/, '<script src="frontline.js"></script>\n  <script src="app.js"></script>');
}
write(appIndexPath, appIndex);

const sitePath = 'index.html';
const site = read(sitePath);
if (!site.includes('id="home-map"')
    || !site.includes('name="skymap-mapbox-token"')
    || !site.includes('app/vendor/leaflet.js')
    || !site.includes('data-weather-mode="rain"')) {
  throw new Error('Live landing-page weather map is incomplete');
}
if (site.includes('site-coherence.css')) throw new Error('Obsolete landing-page override stylesheet returned');

const validatorPath = 'scripts/validate-release.mjs';
let validator = read(validatorPath);
const landingAssertionsPattern = /assert\(site\.includes\('Will rain reach<br><em>your plans\?<\/em>'\)[\s\S]*?assert\(siteJs\.length < 6000, 'Landing JavaScript has become bloated'\);/;
const landingAssertions = `assert(site.includes('id="home-map"') && site.includes('app/vendor/leaflet.js'), 'Landing page live map is missing');
assert((site.match(/data-weather-mode=/g) || []).length === 3, 'Landing map must expose rain, storm and cloud modes');
assert(site.includes('id="timeline-frames"') && siteJs.includes('getCapabilitiesTimes') && siteJs.includes('showFrame'), 'Landing weather timeline is missing');
assert(siteJs.includes("const RADAR_LAYER = 'RADAR_1KM_RRAI'") && siteJs.includes('Lightning_2.5km_Density') && siteJs.includes('GOES-East_1km_DayVis-NightIR'), 'Landing weather layers are incomplete');
assert(siteJs.includes('dark_nolabels') && siteJs.includes('dark_only_labels') && siteJs.includes("createPane('label-pane')"), 'Landing basemap or label hierarchy is missing');
assert(site.includes('name="skymap-mapbox-token"') && siteJs.includes('mapbox/dark-v11'), 'Optional Mapbox basemap path is missing');
assert(site.includes('https://geo.weather.gc.ca') && site.includes('https://api.mapbox.com') && site.includes('https://*.basemaps.cartocdn.com'), 'Landing map CSP is incomplete');
assert(!site.includes('class="product-preview"') && !site.includes('rain-band'), 'Fake landing-page map preview returned');
assert(privacy.includes('Shared visit cards') && privacy.includes('does not upload the generated file'), 'Generated-share privacy behaviour is not disclosed');
assert(!site.includes('<iframe'), 'Landing page must not embed the full app');
assert((site.match(/ko-fi\\.com\\/rbt4dev/g) || []).length >= 3, 'Ko-fi support must remain visible');
assert(site.includes('data-apk'), 'Public APK link is missing');
assert(siteCss.length < 30000, 'Landing CSS has become bloated');
assert(siteJs.length < 16000, 'Landing JavaScript has become bloated');`;
if (!landingAssertionsPattern.test(validator)) throw new Error('Unable to replace obsolete landing-page validation');
validator = validator.replace(landingAssertionsPattern, landingAssertions);
validator = validator.replace(
  /assert\(version\.version === '\d+\.\d+\.\d+' && version\.versionCode === \d+, 'Release version is not [^']+'\);/,
  `assert(version.version === '${version.version}' && version.versionCode === ${version.versionCode}, 'Release version is not ${version.version} / ${version.versionCode}');`
);
validator = validator.replace(
  /assert\(version\.releaseName === '[^']*', 'Release name is not [^']*'\);/,
  `assert(version.releaseName === '${String(version.releaseName || '').replaceAll("'", "\\'")}', 'Release name is not ${String(version.releaseName || '').replaceAll("'", "\\'")}');`
);
const validatorMarker = '// --- Frontline current-location truth guarantees';
if (!validator.includes(validatorMarker)) {
  const checks = `\n${validatorMarker} ------------------------------------\nconst frontlineJs = read('app/frontline.js');\nconst frontlineCss = read('app/frontline.css');\nconst manifest = JSON.parse(read('app/manifest.webmanifest'));\nassert(app.includes('frontline.css') && app.includes('frontline.js'), 'Frontline assets are not loaded before the app runtime');\nassert(frontlineJs.includes('originalWatchPosition') && frontlineJs.includes('movementThreshold'), 'Follow Me location tracking is missing');\nassert(frontlineJs.includes('Very light precipitation may be reaching the surface.'), 'Surface-drizzle correction is missing');\nassert(frontlineJs.includes('GOES-East_1km_DayVis-NightIR') && frontlineJs.includes('radarEvidence'), 'Cloud-front and surrounding-radar evidence are missing');\nassert(frontlineJs.includes('RIGHT NOW · LIVE PINPOINT') && frontlineJs.includes('selectedClock'), 'Current truth is not separated from selected future time');\nassert(frontlineCss.includes('.truth-deck') && frontlineCss.includes('.skymap-location-marker'), 'Frontline visual system is incomplete');\nassert(manifest.icons.some(icon => icon.src === 'icon.svg'), 'Vector application icon is missing from the web manifest');\nassert(androidManifest.includes('@drawable/skymap_logo'), 'Generated SkyMap logo is not applied to Android');\nassert(updateWorker.includes('notifyUpdateReady') && application.includes('ACTION_UPDATE_READY'), 'Downloaded APK updates do not prompt the foreground app');\n`;
  validator = validator.replace(/\nconsole\.log\(`SkyMap \$\{version\.version\} validation passed`\);\s*$/, `${checks}\nconsole.log(\`SkyMap \${version.version} validation passed\`);\n`);
}
write(validatorPath, validator);

write('app/version.json', `${JSON.stringify(version, null, 2)}\n`);

const apkName = `${version.apkBaseName || 'SkyMap-Ontario'}-v${version.version}.apk`;
if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_VERSION=${version.version}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_VERSION_CODE=${version.versionCode}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_RELEASE_NAME=${version.releaseName || ''}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_APK=${apkName}\n`);
}
console.log(JSON.stringify({ ...version, apkName }, null, 2));
