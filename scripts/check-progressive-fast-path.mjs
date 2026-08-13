import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [accuracy, weatherNext, lab] = await Promise.all([
  fs.readFile('app/lab/accuracy-engine.js', 'utf8'),
  fs.readFile('app/lab/forecast-intelligence-25.js', 'utf8'),
  fs.readFile('app/lab/lab.js', 'utf8')
]);

assert.doesNotMatch(accuracy, /const \[response, context\]\s*=\s*await Promise\.all/, 'model response still waits for the shared ECCC bundle');
assert.doesNotMatch(accuracy, /warmEvidence\(lat, lon, false\)/, 'model requests still start competing ECCC traffic');
assert.match(accuracy, /notifyEvidence\('best-match'/, 'Best Match readiness is not progressive');
assert.match(accuracy, /notifyEvidence\('eccc-guidance'/, 'ECCC enrichment readiness is not progressive');
assert.match(accuracy, /const capabilitiesCache =/, 'ECCC capabilities metadata is not deduplicated');
assert.match(accuracy, /if \(current !== next\)/, 'status observer loop guard is missing');

assert.doesNotMatch(weatherNext, /const \[response, context\]\s*=\s*await Promise\.all/, 'model response still waits for WeatherNext');
assert.doesNotMatch(weatherNext, /warmWeatherNext\(lat, lon, false\)/, 'model requests still start competing WeatherNext traffic');
assert.match(weatherNext, /skymap\.weathernext25/, 'fresh WeatherNext results are not persisted across reloads');
assert.match(weatherNext, /skymap:evidence-ready/, 'WeatherNext cannot trigger a bounded consensus refresh');

assert.match(lab, /state\.models\.size>=2/, 'two-model progressive render gate is missing');
assert.match(lab, /state\.models\.size<\(allowPartial\?1:2\)/, 'a stray render can expose a one-model forecast as consensus');
assert.match(lab, /model\.id==='gem'\|\|model\.id==='ifs'/, 'the trustworthy GEM + IFS primary pair is missing');
assert.match(lab, /plan\.hedgeMs/, 'the slow-primary hedge is missing');
assert.match(lab, /plan\.expansionMs/, 'the final fallback model lane is missing');
assert.match(lab, /afterNextPaint\(\(\)=>/, 'deferred traffic can start before the first forecast paint');
assert.match(lab, /startMapLayers\(\); startRemaining\(\); startEnrichment/, 'secondary models, map tiles, and enrichment are not behind the first-paint gate');
assert.match(lab, /await Promise\.allSettled\(primary\)/, 'one failed primary model can still reject the forecast load');
assert.doesNotMatch(lab, /await framePromise/, 'forecast output still waits for radar metadata');
assert.match(lab, /new AbortController\(\)/, 'model requests do not have a finite latency budget');
assert.match(lab, /abortModelRequests\(\)/, 'obsolete location requests are not cancelled');
assert.match(lab, /Date\.now\(\)-cached\.savedAt<6\*3600000/, 'bounded stale-cache fallback is missing');
assert.match(lab, /const capabilitiesCache =/, 'the Lab still downloads GeoMet capabilities separately for every layer');
assert.match(lab, /PERFORMANCE_KEY = 'skymap\.lab\.performance\.v1'/, 'local first-paint telemetry is missing');
assert.match(lab, /performanceHistory\(\).*slice\(-8\)/s, 'adaptive loading does not use bounded device history');
assert.match(lab, /refreshAll\(\{forceLive:true\}\)/, 'scheduled refresh can silently reuse the fresh cache');
assert.match(lab, /state\.modelStale\.set\(model\.id,Date\.now\(\)-cached\.savedAt\)/, 'cached guidance is not visibly labelled');
const initMap = lab.match(/function initMap\(\)[\s\S]*?(?=\n  function startMapLayers)/)?.[0] || '';
assert.doesNotMatch(initMap, /dark_nolabels/, 'map tiles are still attached during map initialization');
assert.match(lab, /function startMapLayers\(\)[\s\S]*dark_nolabels/, 'deferred map tiles are missing');

console.log('✓ Forecast Lab 33.2 adaptive first-paint contract passed');
