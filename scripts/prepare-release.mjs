import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version.version)) throw new Error(`Invalid semantic version: ${version.version}`);
if (!Number.isInteger(version.versionCode) || version.versionCode < 1) throw new Error('versionCode must be a positive integer');

const gradlePath = path.join(root, 'android/app/build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${version.versionCode}`);
gradle = gradle.replace(/versionName\s+'[^']+'/, `versionName '${version.version}'`);
fs.writeFileSync(gradlePath, gradle);

const appJsPath = path.join(root, 'app/app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');
appJs = appJs.replace(/version: '\d+\.\d+\.\d+'/, `version: '${version.version}'`);
fs.writeFileSync(appJsPath, appJs);

const swPath = path.join(root, 'app/sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const VERSION = '\d+\.\d+\.\d+'/, `const VERSION = '${version.version}'`);
fs.writeFileSync(swPath, sw);

const javaVersionFiles = ['MainActivity.java', 'GeoMetProxy.java', 'WeatherRefreshWorker.java', 'UpdateCheckWorker.java'];
for (const file of javaVersionFiles) {
  const javaPath = path.join(root, 'android/app/src/main/java/ca/skymapontario/app', file);
  let source = fs.readFileSync(javaPath, 'utf8');
  source = source.replace(/SkyMapOntario\/\d+(?:\.\d+)*/g, `SkyMapOntario/${version.version}`);
  fs.writeFileSync(javaPath, source);
}

const mainActivityPath = path.join(root, 'android/app/src/main/java/ca/skymapontario/app/MainActivity.java');
const mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
if (!mainActivity.includes('requestAutomaticLocation')
    || !mainActivity.includes("document.getElementById('locate-button')")
    || !mainActivity.includes('AUTO_LOCATE_COOLDOWN_MS')) {
  throw new Error('Native current-location startup and resume handling is missing');
}

const validatorPath = path.join(root, 'scripts/validate-release.mjs');
let validator = fs.readFileSync(validatorPath, 'utf8');
validator = validator.replace(
  /assert\(version\.version === '\d+\.\d+\.\d+' && version\.versionCode === \d+, 'Release version is not [^']+'\);/,
  `assert(version.version === '${version.version}' && version.versionCode === ${version.versionCode}, 'Release version is not ${version.version} / ${version.versionCode}');`
);
validator = validator.replace(
  /assert\(version\.releaseName === '[^']*', 'Release name is not [^']*'\);/,
  `assert(version.releaseName === '${String(version.releaseName || '').replaceAll("'", "\\'")}', 'Release name is not ${String(version.releaseName || '').replaceAll("'", "\\'")}');`
);
fs.writeFileSync(validatorPath, validator);

fs.writeFileSync(path.join(root, 'app/version.json'), `${JSON.stringify(version, null, 2)}\n`);

const apkName = `${version.apkBaseName || 'SkyMap-Ontario'}-v${version.version}.apk`;
if (process.env.GITHUB_ENV) {
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_VERSION=${version.version}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_VERSION_CODE=${version.versionCode}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_RELEASE_NAME=${version.releaseName || ''}\n`);
  fs.appendFileSync(process.env.GITHUB_ENV, `SKYMAP_APK=${apkName}\n`);
}
console.log(JSON.stringify({ ...version, apkName }, null, 2));
