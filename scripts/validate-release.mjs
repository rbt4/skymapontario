import crypto from 'node:crypto';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const version = JSON.parse(read('version.json'));
const site = read('index.html');
const siteCss = read('assets/site.css');
const siteJs = read('assets/site.js');
const privacy = read('privacy.html');
const app = read('app/index.html');
const appCss = read('app/app.css');
const appJs = read('app/app.js');
const visitJs = read('app/visit.js');
const conditionsJs = read('app/conditions.js');
const nativeJs = read('app/native.js');
const engineJs = read('app/accuracy-engine.js');
const routerJs = read('app/evidence-router.js');
const intelligenceJs = read('app/forecast-intelligence-25.js');
const sw = read('app/sw.js');
const labRedirect = read('app/lab/index.html');
const appVersion = JSON.parse(read('app/version.json'));
const workflow = read('.github/workflows/deploy-pages.yml');
const mainActivity = read('android/app/src/main/java/ca/skymapontario/app/MainActivity.java');
const geoMetProxy = read('android/app/src/main/java/ca/skymapontario/app/GeoMetProxy.java');
const refreshWorker = read('android/app/src/main/java/ca/skymapontario/app/WeatherRefreshWorker.java');
const bridge = read('android/app/src/main/java/ca/skymapontario/app/SkyMapBridge.java');
const updateWorker = read('android/app/src/main/java/ca/skymapontario/app/UpdateCheckWorker.java');
const updateManager = read('android/app/src/main/java/ca/skymapontario/app/UpdateManager.java');
const application = read('android/app/src/main/java/ca/skymapontario/app/SkyMapApplication.java');
const buildGradle = read('android/app/build.gradle');
const proguard = read('android/app/proguard-rules.pro');
const signingGuide = read('docs/RELEASE_SIGNING.md');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const updatePaths = read('android/app/src/main/res/xml/update_file_paths.xml');
const gifEncoder = read('app/vendor/gifenc.esm.js');
const thirdPartyNotices = read('docs/THIRD_PARTY_NOTICES.md');
const visitWindowTest = read('scripts/check-visit-window.mjs');
const publicKey = fs.readFileSync('android/app/signing/skymap-public-release.jks');

const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(/^\d+\.\d+\.\d+$/.test(version.version), 'Version must use semantic versioning');
assert(Number.isInteger(version.versionCode), 'versionCode must be an integer');
assert(appVersion.version === version.version && appVersion.versionCode === version.versionCode, 'Web app version is not aligned');
assert(app.includes(`id="version-label">${version.version}<`), 'In-app version label is not aligned');

// --- Landing page -----------------------------------------------------------
assert(site.includes('id="home-map"') && site.includes('app/vendor/leaflet.js'), 'Landing page live map is missing');
assert((site.match(/data-weather-mode=/g) || []).length === 3, 'Landing map must expose rain, storm and cloud modes');
assert(site.includes('id="timeline-frames"') && siteJs.includes('getCapabilitiesTimes') && siteJs.includes('showFrame'), 'Landing weather timeline is missing');
assert(siteJs.includes('dark_nolabels') && siteJs.includes('dark_only_labels'), 'Landing basemap or label hierarchy is missing');
assert(privacy.includes('Shared visit cards') && privacy.includes('does not upload the generated file'), 'Generated-share privacy behaviour is not disclosed');
assert(!site.includes('<iframe'), 'Landing page must not embed the full app');
assert((site.match(/ko-fi\.com\/rbt4dev/g) || []).length >= 3, 'Ko-fi support must remain visible');
assert(site.includes('data-apk'), 'Public APK link is missing');
assert(siteCss.length < 30000, 'Landing CSS has become bloated');
assert(siteJs.length < 16000, 'Landing JavaScript has become bloated');

// --- One app: the forecast engine is the product ------------------------------
assert(!fs.existsSync('lab') && !fs.existsSync('app/lab/lab.js') && !fs.existsSync('app/frontline.part-0.js'), 'A second app surface or patch layer returned');
assert(labRedirect.includes('url=../') && labRedirect.includes('noindex'), 'Old Future Lab links do not redirect to the app');
const scripts = [...app.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
const order = ['vendor/leaflet.js', 'native.js', 'conditions.js', 'visit.js', 'accuracy-engine.js', 'evidence-router.js', 'app.js'].map(file => scripts.indexOf(file));
assert(order.every(index => index >= 0) && order.every((value, index) => index === 0 || value > order[index - 1]), `App scripts are missing or out of order: ${scripts.join(', ')}`);
assert(app.includes('src="forecast-intelligence-25.js" data-phase="capture"') && app.includes('src="forecast-intelligence-25.js" data-phase="augment"'), 'Forecast IQ capture/augment phases are missing');
assert(appJs.includes('window.SkyMapEvidenceRouter?.route') && appJs.includes('personalShadowAt'), 'Evidence router or personal shadow is disconnected from the blend');
assert(routerJs.includes('governed-single-pass') && engineJs.includes('model_rows_mutated: 0'), 'Governed single-pass evidence contract is missing');
assert(engineJs.includes('truth_contract') && engineJs.includes('hasExplicitForecastEvidence'), 'Truth firewall is missing');
assert(intelligenceJs.includes('google_weathernext2_ensemble') && intelligenceJs.includes('__skymap_missing__'), 'WeatherNext null-guarded ensemble is missing');
assert(appJs.includes('const SNOW_CODES'), 'Snow weather codes are undefined in the point blend');
assert(appJs.includes('SkyMap will not translate missing precipitation values into a dry forecast'), 'Missing evidence may be shown as dry');

// --- Map, timeline and layers -------------------------------------------------
assert(appJs.includes("'RADAR_1KM_RRAI'") && appJs.includes("'Radar_1km_RainPrecipRate-Extrapolation'") && appJs.includes("'HRDPS.CONTINENTAL.DIAG_PR_PT1H'"), 'Measured, nowcast and HRDPS timeline layers are missing');
assert(appJs.includes("kind:'observed'") && appJs.includes("kind:'nowcast'") && appJs.includes("kind:'guidance'"), 'Source boundaries are not labelled');
assert((app.match(/data-map-mode=/g) || []).length === 5 && ['rain', 'storm', 'smoke', 'air', 'temp'].every(mode => app.includes(`data-map-mode="${mode}"`)), 'Direct map-layer rail is missing');
assert(appJs.includes('Lightning_2.5km_Density') && appJs.includes('RAQDPS.Sfc_PM2.5-WildfireSmokePlume') && appJs.includes('AQHI-OBS') && appJs.includes('HRDPS.CONTINENTAL_TT'), 'Storm, smoke, air or temperature layer is missing');
assert(appJs.includes('Single official layer · no playback'), 'Static layers may be presented as a radar loop');
assert(app.includes('id="map-legend"') && appJs.includes('function renderLegend'), 'The in-interface legend is missing');
assert(appJs.includes('dark_only_labels') && appJs.includes("createPane('labels')"), 'Place labels are no longer drawn above the weather');
assert(appJs.includes('attributionControl:true') && appJs.includes('OpenStreetMap contributors') && appJs.includes('CARTO'), 'Required base-map attribution is missing');
assert(!/\.leaflet-control-attribution\s*\{[^}]*display:\s*none/s.test(appCss), 'Base-map attribution is hidden');
assert(appJs.includes('NATIVE_GEOMET') && appJs.includes('function geometFetch'), 'Native GeoMet relay fallback is missing');
assert(appJs.includes('window.SkyMapBack'), 'Android back navigation is not handled by the app');

// --- Alerts and air quality -------------------------------------------------
assert(app.includes('id="alert-banner"') && app.includes('id="alert-list"') && app.includes('id="alerts-dialog"'), 'Alert banner or detail dialog is missing');
assert(conditionsJs.includes('weather-alerts') && conditionsJs.includes('expiration_datetime') && conditionsJs.includes('function renderAlerts'), 'Alerts are not fetched, filtered or rendered');
assert(conditionsJs.includes('textContent = alert.text'), 'Remote alert text must be assigned as text');
assert(app.includes('id="air-card"') && conditionsJs.includes('aqhi-observations-realtime'), 'Official AQHI point reading is missing');

// --- Visit check and sharing -------------------------------------------------
assert(app.includes('id="visit-dialog"') && app.includes('id="visit-start-time"') && app.includes('id="visit-end-time"'), 'Exact visit-window controls are missing');
assert(app.includes('id="visit-share-image"') && app.includes('id="visit-share-motion"') && app.includes('id="visit-hero"'), 'Visit sharing controls are missing');
assert(visitJs.includes('function buildVisitResult') && visitJs.includes('function analyzeRainArea') && visitJs.includes("'REPS.DIAG.3_PRMM.ERGE1'") && visitJs.includes("'REPS.DIAG.3_PRMM.ERGE5'"), 'Visit analysis or REPS ensemble is missing');
assert(visitJs.includes('wetEntries.length >= 3 && longestCircularWetRun(entries) >= 2'), 'Rain-band classification is no longer conservative');
assert(visitJs.includes("value: peak >= 70 ? 'WET' : peak >= 45 ? 'MIXED' : 'LOW'"), 'Uncalibrated model support can be mistaken for a rain probability');
assert(visitJs.includes('function createVisitImage') && visitJs.includes('canvas.width = 1080') && visitJs.includes('canvas.height = 1350'), 'Large-format share image is missing');
assert(visitJs.includes("import('./vendor/gifenc.esm.js')") && visitJs.includes('function createVisitGif'), 'Short GIF sharing is missing');
const shareCanvas = visitJs.slice(visitJs.indexOf('function drawCard'), visitJs.indexOf('const canvasBlob'));
assert(shareCanvas && !shareCanvas.includes('letterSpacing'), 'Share-card text depends on an inconsistently supported canvas font property');
assert(gifEncoder.includes('GIFEncoder') && thirdPartyNotices.includes('gifenc 1.0.3') && thirdPartyNotices.includes('MIT License'), 'GIF encoder or its license notice is missing');
assert(visitWindowTest.includes('Oakville') && visitWindowTest.includes('16 * 60') && visitWindowTest.includes('18 * 60'), 'Exact Oakville 4–6 PM release test is missing');
assert(workflow.includes('node scripts/check-visit-window.mjs'), 'Visit-window test is not wired into CI');
assert(nativeJs.includes('channel.postMessage') && nativeJs.includes("'rememberLocation'") && visitJs.includes("native.call('shareFile'"), 'Web app does not use the asynchronous native message channel');

// --- Readability, security and offline shell ----------------------------------
const tinyPx = [...appCss.matchAll(/font-size:\s*([\d.]+)px/g)].map(match => Number(match[1])).filter(size => size < 11);
const tinyRem = [...appCss.matchAll(/font-size:\s*([\d.]+)rem/g)].map(match => Number(match[1])).filter(size => size > 0 && size * 16 < 11);
assert(!tinyPx.length && !tinyRem.length, `Unreadable type returned to the app: ${[...tinyPx.map(v => `${v}px`), ...tinyRem.map(v => `${v}rem`)].join(', ')}`);
const tinySite = [...siteCss.matchAll(/font-size:\s*([\d.]+)px/g)].map(match => Number(match[1])).filter(size => size < 11);
assert(!tinySite.length, `Unreadable type returned to the site: ${[...new Set(tinySite)].join('px, ')}px`);
assert((app.match(/\sid="([^"]+)"/g) || []).length === new Set([...app.matchAll(/\sid="([^"]+)"/g)].map(match => match[1])).size, 'Duplicate app element IDs detected');
assert(appJs.includes('const esc =') && visitJs.includes('const esc ='), 'HTML escaping helper is missing');
assert(app.includes('Content-Security-Policy') && site.includes('Content-Security-Policy'), 'Content-Security-Policy is missing');
assert(/script-src 'self';/.test(app) && !app.includes("'unsafe-eval'"), 'App CSP allows non-self scripts');
for (const host of ['https://geo.weather.gc.ca', 'https://api.weather.gc.ca', 'https://api.open-meteo.com', 'https://ensemble-api.open-meteo.com', 'https://geocoding-api.open-meteo.com', 'https://raw.githubusercontent.com']) {
  assert(app.includes(host), `App CSP blocks ${host}`);
}
assert(sw.includes(`const VERSION = '${version.version}'`), 'Service worker version is not aligned');
for (const file of scripts.filter(file => !file.startsWith('vendor/')).concat(['app.css', 'vendor/gifenc.esm.js'])) {
  assert(sw.includes(`'${file}'`), `Offline shell is missing ${file}`);
}
assert(appJs.includes("navigator.serviceWorker.register('sw.js',{updateViaCache:'none'})"), 'Service worker is never registered without cache-safe update checks');
assert(sw.includes('cacheFreshShell') && sw.includes("cache: 'reload'"), 'Service-worker install can reuse stale shell bytes');
assert(sw.includes("client.navigate(client.url)") && sw.includes("key.startsWith('skymap-shell-')"), 'Stale shell clients are not upgraded immediately');
assert(sw.includes('return network;') && sw.includes('if (cached) return cached'), 'App shell is not network-first with an offline fallback');

// --- Android --------------------------------------------------------------------
assert(mainActivity.includes(`SkyMapOntario/${version.version}`), 'Android WebView version is not aligned');
assert(geoMetProxy.includes(`SkyMapOntario/${version.version}`), 'Native GeoMet relay version is not aligned');
assert(refreshWorker.includes(`SkyMapOntario/${version.version}`), 'Background refresh version is not aligned');
assert(updateWorker.includes(`SkyMapOntario/${version.version} updater`), 'Updater version is not aligned');
assert(mainActivity.includes("document.getElementById('locate-button')") && mainActivity.includes("document.getElementById('place-name')") && app.includes('id="locate-button"') && app.includes('id="place-name"'), 'Native auto-location no longer matches the app');
assert(refreshWorker.includes('&timeformat=unixtime') && refreshWorker.includes('parseForecastTime'), 'Android background forecast timestamps are not timezone-safe');
assert(geoMetProxy.includes('safeHeaders') && !geoMetProxy.includes('flattenHeaders'), 'Native relay still forwards upstream headers verbatim');
assert(androidManifest.includes('android:allowBackup="false"'), 'Cached weather and saved location are still cloud-backed-up');
assert(androidManifest.includes('@drawable/skymap_logo'), 'SkyMap logo is not applied to Android');
assert(updateWorker.includes('notifyUpdateReady') && application.includes('ACTION_UPDATE_READY'), 'Downloaded APK updates do not prompt the foreground app');
assert(workflow.includes('node scripts/check-live-sources.mjs'), 'Live source validation is not wired into deployment');
assert(!workflow.includes('git push origin HEAD:main'), 'Deployment must not rewrite its own source branch');
assert(!workflow.includes('git fetch origin') && !workflow.includes('git checkout origin/'), 'Deployment must build the checked-out readable source directly');

// --- Release continuity and security guarantees ----------------------------
assert(version.versionCode >= 40000, 'versionCode must stay above every published 18.x APK');
assert(buildGradle.includes("storeFile file('signing/skymap-public-release.jks')"), 'Public continuity keystore is not attached');
assert(buildGradle.includes("storePassword 'skymap-public-release'"), 'Public keystore credentials are not explicit');
assert(buildGradle.includes('signingConfig signingConfigs.release'), 'Release signing configuration is not attached');
assert(buildGradle.includes('minifyEnabled true'), 'R8 minification is not enabled for release');
assert(buildGradle.includes('debuggable false'), 'Release build is not explicitly non-debuggable');
assert(workflow.includes(':android-app:assembleRelease'), 'Workflow does not build the release APK');
assert(!workflow.includes('assembleDebug'), 'Debug APK build returned to the release workflow');
assert(workflow.includes('outputs/apk/release/android-app-release.apk'), 'Workflow does not consume the release APK path');
assert(!workflow.includes('debug.keystore') && !workflow.includes('androiddebugkey'), 'Android debug signing material returned');
assert(!workflow.includes('SKYMAP_KEYSTORE_B64') && !workflow.includes('SKYMAP_KEYSTORE_PASSWORD'), 'Secret-based signing unexpectedly returned');
assert(workflow.includes('Verify public continuity signing key'), 'Public continuity key is not verified in CI');
assert(workflow.includes('A3E872DE448550E75754DED732B94A403A5FD216B17BA0A80C9D74F4F5E4E344'), 'APK signer fingerprint is not pinned');
assert(workflow.includes("grep -q '^application-debuggable'"), 'CI does not reject debuggable APKs');
assert(crypto.createHash('sha256').update(publicKey).digest('hex') === '70fc1f50ba731049dbd623f61fbe31449838dbfa16a362c26e9b62c0d2b4c0e2', 'Committed public keystore bytes changed');

assert(!mainActivity.includes('addJavascriptInterface'), 'Unscoped addJavascriptInterface returned');
assert(mainActivity.includes('WebViewCompat.addWebMessageListener'), 'Origin-scoped WebMessage listener is missing');
assert(mainActivity.includes('Set.of(APP_ORIGIN)'), 'Native bridge origin allowlist is missing');
assert(mainActivity.includes('isMainFrame') && mainActivity.includes('isTrustedOrigin'), 'Native messages are not restricted to the trusted main frame');
assert(mainActivity.includes('removeWebMessageListener'), 'Native message listener is not removed on teardown');
assert(!bridge.includes('@JavascriptInterface') && !bridge.includes('android.webkit.JavascriptInterface'), 'Legacy JavascriptInterface annotations remain');
assert(mainActivity.includes('case "shareFile"') && bridge.includes('public void shareFile'), 'Android file-sharing bridge is missing');
assert(bridge.includes('MAX_SHARE_BYTES') && bridge.includes('"image/png"') && bridge.includes('"image/gif"'), 'Android share payload is not bounded to approved image types');
assert(bridge.includes('getCanonicalPath') && bridge.includes('filename.endsWith(extension)'), 'Android share filenames are not confined to the approved file type and directory');
assert(!/\)\s*\.(?:setClipData|addFlags)\(/.test(bridge), 'Android share intents must call void mutators as separate statements');
assert(workflow.includes("grep -q 'id=\"visit-dialog\"'") && workflow.includes("grep -q 'createVisitGif' /tmp/apk-inspect/assets/visit.js") && workflow.includes("test -s /tmp/apk-inspect/assets/vendor/gifenc.esm.js"), 'CI does not inspect the packaged visit-and-share experience');

// Automatic public APK update flow.
assert(androidManifest.includes('android.permission.REQUEST_INSTALL_PACKAGES'), 'APK installer permission is missing');
assert(androidManifest.includes('android:name=".SkyMapApplication"'), 'Update scheduler application is missing');
assert(androidManifest.includes('androidx.core.content.FileProvider'), 'Update FileProvider is missing');
assert(updatePaths.includes('<files-path name="updates" path="updates/"'), 'Update file path is not restricted');
assert(updatePaths.includes('<files-path name="shares" path="shares/"'), 'Generated share files are not restricted to their FileProvider directory');
assert(application.includes('UpdateManager.schedule(this)'), 'Automatic update scheduling is missing');
assert(application.includes('UpdateManager.promptPendingUpdate(activity)'), 'Ready update is not prompted on app resume');
assert(updateManager.includes('PeriodicWorkRequest.Builder(UpdateCheckWorker.class, 12, TimeUnit.HOURS)'), 'Twelve-hour update schedule is missing');
assert(updateManager.includes('Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES'), 'Unknown-app installer permission flow is missing');
assert(updateManager.includes('FileProvider.getUriForFile'), 'APK is not shared through FileProvider');
assert(updateManager.includes('PackageInfo') && updateManager.includes('getLongVersionCode'), 'Installed package version lookup is missing');
assert(updateWorker.includes('UpdateManager.currentVersionCode(context)'), 'Background updater does not compare against installed package metadata');
assert(!`${updateManager}\n${updateWorker}`.includes('BuildConfig.VERSION_CODE'), 'Updater incorrectly depends on generated BuildConfig');
assert(updateWorker.includes('release.json'), 'Updater does not read the published release receipt');
assert(updateWorker.includes('SkyMap-Ontario-latest.apk'), 'Updater does not download the stable APK URL');
assert(updateWorker.includes('SkyMap-Ontario-latest.apk.sha256'), 'Updater does not fetch the published checksum');
assert(updateWorker.includes('downloadVerified') && updateWorker.includes('APK checksum mismatch'), 'Updater does not verify the APK checksum');
assert(proguard.includes('WeatherRefreshWorker') && proguard.includes('UpdateCheckWorker'), 'R8 keep rules for WorkManager are incomplete');

const actionRefs = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map(match => match[1]);
assert(actionRefs.length >= 8, 'Expected GitHub Actions references are missing');
assert(actionRefs.every(ref => /@[0-9a-f]{40}$/.test(ref)), `Mutable GitHub Action reference found: ${actionRefs.find(ref => !/@[0-9a-f]{40}$/.test(ref)) || 'unknown'}`);
const buildJob = workflow.split('\n  deploy:')[0];
assert(!buildJob.includes('pages: write') && !buildJob.includes('id-token: write'), 'Build job still holds deployment permissions');
assert(workflow.includes("if: github.ref == 'refs/heads/main'"), 'Pages deployment is not restricted to main');
assert(workflow.includes('SkyMap-Ontario-latest.apk.sha256'), 'Public checksum is not deployed');
assert(signingGuide.includes('private signing key') && signingGuide.includes('update continuity, not publisher authenticity'), 'Public signing risk is not documented plainly');
assert(signingGuide.includes('cannot silently install'), 'Android install-confirmation limitation is not documented');
assert(!fs.existsSync('scripts/configure-release-signing.sh'), 'Obsolete private-key setup script still exists');

console.log(`SkyMap ${version.version} validation passed`);
