import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Aligns every release marker with version.json. It only rewrites version
// strings; the product itself is committed as readable source.
const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const replaceRequired = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) throw new Error(`Unable to update ${label}`);
  return source.replace(pattern, replacement);
};

const version = JSON.parse(read('version.json'));
if (!/^\d+\.\d+\.\d+$/.test(version.version)) throw new Error(`Invalid semantic version: ${version.version}`);
if (!Number.isInteger(version.versionCode) || version.versionCode < 1) throw new Error('versionCode must be a positive integer');

let gradle = read('android/app/build.gradle');
gradle = replaceRequired(gradle, /versionCode\s+\d+/, `versionCode ${version.versionCode}`, 'Gradle versionCode');
gradle = replaceRequired(gradle, /versionName\s+'[^']+'/, `versionName '${version.version}'`, 'Gradle versionName');
write('android/app/build.gradle', gradle);

write('app/sw.js', replaceRequired(read('app/sw.js'), /const VERSION = '\d+\.\d+\.\d+'/, `const VERSION = '${version.version}'`, 'service-worker version'));
write('app/index.html', replaceRequired(read('app/index.html'), /id="version-label">[^<]*</, `id="version-label">${version.version}<`, 'in-app version label'));
write('app/version.json', `${JSON.stringify(version, null, 2)}\n`);

for (const file of ['MainActivity.java', 'GeoMetProxy.java', 'WeatherRefreshWorker.java', 'UpdateCheckWorker.java']) {
  const javaPath = path.join('android/app/src/main/java/ca/skymapontario/app', file);
  write(javaPath, read(javaPath).replace(/SkyMapOntario\/\d+(?:\.\d+)*/g, `SkyMapOntario/${version.version}`));
}

const mainActivity = read('android/app/src/main/java/ca/skymapontario/app/MainActivity.java');
if (!mainActivity.includes('requestAutomaticLocation')
    || !mainActivity.includes("document.getElementById('locate-button')")
    || !mainActivity.includes('AUTO_LOCATE_COOLDOWN_MS')) {
  throw new Error('Native current-location startup and resume handling is missing');
}

const appScripts = ['native.js', 'conditions.js', 'visit.js', 'forecast-intelligence-25.js', 'accuracy-engine.js', 'evidence-router.js', 'app.js', 'sw.js'];
for (const required of [...appScripts.map(file => `app/${file}`), 'app/app.css', 'app/icon.svg', 'app/vendor/gifenc.esm.js', 'assets/site.css', 'assets/site.js']) {
  if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing release asset: ${required}`);
}
for (const file of [...appScripts.map(file => `app/${file}`), 'assets/site.js']) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
}

const apkName = `${version.apkBaseName || 'SkyMap-Ontario'}-v${version.version}.apk`;
if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_VERSION=${version.version}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_VERSION_CODE=${version.versionCode}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_RELEASE_NAME=${version.releaseName || ''}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_APK=${apkName}\n`);
}
console.log(JSON.stringify({ ...version, apkName }, null, 2));
