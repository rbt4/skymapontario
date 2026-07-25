import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const version = JSON.parse(read('version.json'));
const site = read('index.html');
const siteCss = read('assets/site.css');
const siteJs = read('assets/site.js');
const app = read('app/index.html');
const appCss = read('app/app.css');
const appJs = read('app/app.js');
const appVersion = JSON.parse(read('app/version.json'));
const workflow = read('.github/workflows/deploy-pages.yml');
const mainActivity = read('android/app/src/main/java/ca/skymapontario/app/MainActivity.java');
const geoMetProxy = read('android/app/src/main/java/ca/skymapontario/app/GeoMetProxy.java');
const refreshWorker = read('android/app/src/main/java/ca/skymapontario/app/WeatherRefreshWorker.java');
const bridge = read('android/app/src/main/java/ca/skymapontario/app/SkyMapBridge.java');
const buildGradle = read('android/app/build.gradle');
const proguard = read('android/app/proguard-rules.pro');
const signingGuide = read('docs/RELEASE_SIGNING.md');
const signingScript = read('scripts/configure-release-signing.sh');

const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(/^\d+\.\d+\.\d+$/.test(version.version), 'Version must use semantic versioning');
assert(Number.isInteger(version.versionCode), 'versionCode must be an integer');
assert(appVersion.version === version.version && appVersion.versionCode === version.versionCode, 'Web app version is not aligned');
assert(appJs.includes(`version: '${version.version}'`), 'Web app fallback version is not aligned');
assert(site.includes('Weather,<br><em>moving toward you.</em>'), 'Radar-first hero is missing');
assert(!site.includes('<iframe'), 'Landing page must not embed the full app');
assert((site.match(/ko-fi\.com\/rbt4dev/g) || []).length >= 3, 'Ko-fi support must remain visible');
assert(site.includes('data-apk'), 'Dynamic aligned APK link is missing');
assert(siteCss.length < 30000, 'Landing CSS has become bloated');
assert(siteJs.length < 6000, 'Landing JavaScript has become bloated');
assert(app.includes('WEATHER SNAPSHOTS'), 'Snapshot rail is missing');
assert(app.includes('7-DAY FORECAST'), 'Seven-day forecast is missing');
assert(app.includes('Keep radar first'), 'Layer sheet is missing its radar-first hierarchy');
assert(app.includes('id="story-facts"'), 'Selected-time explanation facts are missing');
assert(app.includes('id="zoom-in-button"') && app.includes('id="zoom-out-button"'), 'Visible map zoom controls are missing');
assert(app.includes('ko-fi.com/rbt4dev'), 'Restrained in-app support link is missing');
assert(appCss.includes('grid-template-columns:minmax(0,1.45fr)'), 'Desktop map/forecast layout is missing');
assert(appCss.includes('@media(max-width:980px)'), 'Mobile layout is missing');
assert(appJs.includes('NATIVE_GEOMET'), 'Native GeoMet relay is missing');
assert(appJs.includes('Promise.allSettled'), 'Progressive source loading is missing');
assert(appJs.includes('buildSnapshots'), 'Meaningful snapshots are missing');
assert(appJs.includes('buildDaily'), 'Daily forecast generation is missing');
assert(appJs.includes('citypageweather-realtime'), 'Official ECCC city forecast context is missing');
assert(appJs.includes("timeformat: 'unixtime'"), 'Timezone-safe model timestamps are missing');
assert(appJs.includes('modelDate(data, value)'), 'UNIX forecast timestamp parsing is missing');
assert(appJs.includes('updateFrameExplanation'), 'Per-frame radar explanation is missing');
assert(appJs.includes('function formatWmsTime'), 'Whole-second WMS timestamp formatting is missing');
assert(appJs.includes("replace(/\\.\\d{3}Z$/, 'Z')"), 'WMS timestamps may still include unsupported milliseconds');
assert(appJs.includes('Point value unavailable'), 'Failed point queries are not distinguished from zero rain');
assert(appJs.includes('fetchCompleteJson'), 'Point queries are not protected through complete response parsing');
assert(appJs.includes('pointValueRequests'), 'Duplicate point queries are not coalesced');
assert(appJs.includes("formatWmsTime(frame.referenceTime)"), 'Point-query reference times may still include unsupported milliseconds');
assert(appJs.includes('await updateFrameExplanation(frame)'), 'The selected point must resolve before arrival probing begins');
assert(appJs.includes('function frameStamp'), 'Selected radar date-and-time label is missing');
assert(appJs.includes('crossingNow ? 1650 : 1100'), 'Calm one-pass radar timing is missing');
assert(appJs.includes('RAQDPS.Sfc_PM2.5-WildfireSmokePlume'), 'Wildfire-specific smoke guidance is missing');
assert(appJs.includes('if (state.frameIndex >= state.frames.length - 1)'), 'Radar playback must stop instead of looping forever');
assert((app.match(/\sid="([^"]+)"/g) || []).length === new Set([...app.matchAll(/\sid="([^"]+)"/g)].map(match => match[1])).size, 'Duplicate app element IDs detected');
assert(!site.includes('v4.4') && !site.includes('Version 4.4'), 'Stale v4.4 copy remains');
assert(!app.includes('SkyMap Ontario 13'), 'Stale v13 app copy remains');
assert(!`${site}\n${siteJs}\n${app}\n${appJs}`.includes('wet signal'), 'Unexplained wet-signal copy remains');
assert(mainActivity.includes(`SkyMapOntario/${version.version}`), 'Android WebView version is not aligned');
assert(geoMetProxy.includes(`SkyMapOntario/${version.version}`), 'Native GeoMet relay version is not aligned');
assert(refreshWorker.includes(`SkyMapOntario/${version.version}`), 'Background refresh version is not aligned');
assert(refreshWorker.includes('&timeformat=unixtime'), 'Android background forecast timestamps are not timezone-safe');
assert(refreshWorker.includes('parseForecastTime'), 'Android background forecast timestamp parsing is missing');
assert(workflow.includes('node scripts/check-live-sources.mjs'), 'Live source validation is not wired into deployment');
assert(!workflow.includes('git push origin HEAD:main'), 'Deployment must not rewrite its own source branch');
assert(!workflow.includes('git fetch origin') && !workflow.includes('git checkout origin/'), 'Deployment must build the checked-out readable source directly');

// --- 14.2 guarantees -------------------------------------------------------
const sw = read('app/sw.js');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');

// Legibility is a contract, not a preference. This is the regression that keeps coming back.
const tinyApp = [...appCss.matchAll(/font-size:\s*([\d.]+)px/g)].map(match => Number(match[1])).filter(size => size < 11);
assert(!tinyApp.length, `Unreadable type returned to the app: ${[...new Set(tinyApp)].join('px, ')}px`);
const tinySite = [...siteCss.matchAll(/font-size:\s*([\d.]+)px/g)].map(match => Number(match[1])).filter(size => size < 11);
assert(!tinySite.length, `Unreadable type returned to the site: ${[...new Set(tinySite)].join('px, ')}px`);

// Alerts must reach the screen, not just the network layer.
assert(app.includes('id="alert-banner"'), 'Break-through alert banner is missing');
assert(app.includes('id="alert-list"'), 'Alert detail sheet is missing');
assert(appJs.includes('function renderAlerts'), 'Alerts are fetched but never rendered');
assert(appJs.includes('expiration_datetime'), 'Expired alerts are not filtered out');

// Air quality and the always-visible legend are first-class, per the product brief.
assert(app.includes('data-layer="air"'), 'Air quality view is missing');
assert(appJs.includes('aqhi-observations-realtime'), 'Official AQHI point reading is missing');
assert(app.includes('id="map-legend"'), 'The in-interface legend is missing');
assert(appJs.includes('LEGENDS'), 'Per-view legend data is missing');

// Geography has to stay readable underneath the weather.
assert(appJs.includes('dark_only_labels') && appJs.includes("createPane('labelPane')"), 'Place labels are no longer drawn above the weather');

// Remote strings reach innerHTML in several places.
assert(appJs.includes('function esc('), 'HTML escaping helper is missing');
assert(app.includes('Content-Security-Policy') && site.includes('Content-Security-Policy'), 'Content-Security-Policy is missing');

// Offline shell.
assert(sw.includes(`const VERSION = '${version.version}'`), 'Service worker version is not aligned');
assert(app.includes('serviceWorker'), 'Service worker is never registered');

// Android hardening.
assert(geoMetProxy.includes('safeHeaders') && !geoMetProxy.includes('flattenHeaders'), 'Native relay still forwards upstream headers verbatim');
assert(androidManifest.includes('android:allowBackup="false"'), 'Cached weather and saved location are still cloud-backed-up');

// --- 14.2.1 security release guarantees ----------------------------------
assert(version.version === '14.2.1' && version.versionCode === 14021, 'Security release version is not 14.2.1 / 14021');
assert(version.releaseName === 'Trust Boundary', 'Security release name is not aligned');

// Production must be a real release build with no debug fallback.
assert(buildGradle.includes('signingConfig signingConfigs.release'), 'Release signing configuration is not attached');
assert(buildGradle.includes('SKYMAP_SIGNING_PROPERTIES'), 'Gradle does not require external signing properties');
assert(buildGradle.includes('minifyEnabled true'), 'R8 minification is not enabled for release');
assert(buildGradle.includes('debuggable false'), 'Release build is not explicitly non-debuggable');
assert(workflow.includes(':android-app:assembleRelease'), 'Workflow does not build the release APK');
assert(!workflow.includes('assembleDebug'), 'Debug APK build returned to the release workflow');
assert(workflow.includes('outputs/apk/release/android-app-release.apk'), 'Workflow does not consume the release APK path');
assert(!workflow.includes('debug.keystore') && !workflow.includes('androiddebugkey'), 'Public Android debug signing material returned');
assert(workflow.includes('SKYMAP_KEYSTORE_B64') && workflow.includes('SKYMAP_SIGNING_CERT_SHA256'), 'Production signing secrets are not wired in');
assert(workflow.includes('Missing SKYMAP_KEYSTORE_B64 repository secret'), 'Production signing does not fail closed');
assert(workflow.includes("SKYMAP_SIGNING_MODE=pull-request"), 'Pull requests do not use an explicit disposable signer');
assert(workflow.includes("SKYMAP_SIGNING_MODE=production"), 'Production signing mode is not explicit');
assert(workflow.includes("grep -q '^application-debuggable'"), 'CI does not reject debuggable APKs');
assert(workflow.includes('ACTUAL_CERT_SHA256') && workflow.includes('SKYMAP_EXPECTED_CERT_SHA256'), 'CI does not pin the production signing certificate');

// Privileged native methods are origin-scoped and asynchronous.
assert(!mainActivity.includes('addJavascriptInterface'), 'Unscoped addJavascriptInterface returned');
assert(mainActivity.includes('WebViewCompat.addWebMessageListener'), 'Origin-scoped WebMessage listener is missing');
assert(mainActivity.includes('Set.of(APP_ORIGIN)'), 'Native bridge origin allowlist is missing');
assert(mainActivity.includes('isMainFrame') && mainActivity.includes('isTrustedOrigin'), 'Native messages are not restricted to the trusted main frame');
assert(mainActivity.includes('removeWebMessageListener'), 'Native message listener is not removed on teardown');
assert(!bridge.includes('@JavascriptInterface') && !bridge.includes('android.webkit.JavascriptInterface'), 'Legacy JavascriptInterface annotations remain');
assert(appJs.includes('channel.postMessage') && appJs.includes('NativeBridge.call'), 'Web app does not use the asynchronous native message channel');
assert(appJs.includes("await NativeBridge.call(\'getCache\'"), 'Native cache reads are not asynchronous');
assert(appJs.includes('Promise.allSettled(MODELS.map(readCachedModel))'), 'Native cache hydration is not awaited safely');

// The workflow containing signing material is immutable and least-privileged.
const actionRefs = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map(match => match[1]);
assert(actionRefs.length >= 8, 'Expected GitHub Actions references are missing');
assert(actionRefs.every(ref => /@[0-9a-f]{40}$/.test(ref)), `Mutable GitHub Action reference found: ${actionRefs.find(ref => !/@[0-9a-f]{40}$/.test(ref)) || 'unknown'}`);
const buildJob = workflow.split('\n  deploy:')[0];
assert(!buildJob.includes('pages: write') && !buildJob.includes('id-token: write'), 'Build job still holds deployment permissions');
assert(workflow.includes("if: github.ref == 'refs/heads/main'"), 'Pages deployment is not restricted to main');

// Key material must never enter the repository.
const forbiddenKeyFiles = [];
for (const entry of fs.readdirSync('.', { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const name = entry.name.toLowerCase();
  if (name.endsWith('.jks') || name.endsWith('.keystore') || name === 'signing.properties') forbiddenKeyFiles.push(name);
}
assert(!forbiddenKeyFiles.length, `Private signing material is committed: ${forbiddenKeyFiles.join(', ')}`);
assert(signingGuide.includes('SKYMAP_KEYSTORE_B64') && signingGuide.includes('cannot be upgraded in place'), 'Release signing migration guide is incomplete');
assert(signingScript.includes('gh secret set SKYMAP_KEYSTORE_B64') && signingScript.includes('-keysize 4096'), 'Signing setup script is incomplete');
assert(proguard.includes('WeatherRefreshWorker'), 'R8 keep rule for WorkManager is missing');

console.log(`SkyMap ${version.version} validation passed`);
