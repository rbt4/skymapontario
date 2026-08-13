import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [accuracy, weatherNext, lab] = await Promise.all([
  fs.readFile('app/lab/accuracy-engine.js', 'utf8'),
  fs.readFile('app/lab/forecast-intelligence-25.js', 'utf8'),
  fs.readFile('app/lab/lab.js', 'utf8')
]);

assert.doesNotMatch(accuracy, /const \[response, context\]\s*=\s*await Promise\.all/, 'model response still waits for the shared ECCC bundle');
assert.match(accuracy, /void warmEvidence\(lat, lon, false\)/, 'ECCC evidence is not warming in the background');
assert.match(accuracy, /notifyEvidence\('best-match'/, 'Best Match readiness is not progressive');
assert.match(accuracy, /notifyEvidence\('eccc-guidance'/, 'ECCC enrichment readiness is not progressive');
assert.match(accuracy, /const capabilitiesCache =/, 'ECCC capabilities metadata is not deduplicated');
assert.match(accuracy, /if \(current !== next\)/, 'status observer loop guard is missing');

assert.doesNotMatch(weatherNext, /const \[response, context\]\s*=\s*await Promise\.all/, 'model response still waits for WeatherNext');
assert.match(weatherNext, /void warmWeatherNext\(lat, lon, false\)/, 'WeatherNext is not warming in the background');
assert.match(weatherNext, /skymap\.weathernext25/, 'fresh WeatherNext results are not persisted across reloads');
assert.match(weatherNext, /skymap:evidence-ready/, 'WeatherNext cannot trigger a bounded consensus refresh');

assert.match(lab, /state\.models\.size>=2\)scheduleForecastRender/, 'two-model progressive render gate is missing');
assert.match(lab, /await Promise\.allSettled\(tasks\)/, 'one failed model can still reject the whole forecast load');
assert.doesNotMatch(lab, /await framePromise/, 'forecast output still waits for radar metadata');
assert.match(lab, /new AbortController\(\)/, 'model requests do not have a finite latency budget');
assert.match(lab, /Date\.now\(\)-cached\.savedAt<6\*3600000/, 'bounded stale-cache fallback is missing');
assert.match(lab, /const capabilitiesCache =/, 'the Lab still downloads GeoMet capabilities separately for every layer');

console.log('✓ Forecast Lab 33.1 progressive fast-path contract passed');
