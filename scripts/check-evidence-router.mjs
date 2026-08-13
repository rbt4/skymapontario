import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const [routerSource, accuracySource, weatherNextSource, labSource] = await Promise.all([
  fs.readFile('app/lab/evidence-router.js', 'utf8'),
  fs.readFile('app/lab/accuracy-engine.js', 'utf8'),
  fs.readFile('app/lab/forecast-intelligence-25.js', 'utf8'),
  fs.readFile('app/lab/lab.js', 'utf8')
]);
const window = {};
vm.runInNewContext(routerSource, { window, Date, Math, Number, Object, Array, Map, Set, String }, { filename:'evidence-router.js' });

const router = window.SkyMapEvidenceRouter;
assert.equal(router?.version, '34.0.0');
assert.equal(router?.mode, 'governed-single-pass');
assert.ok(router?.contract, 'router contract export missing');

const now = Date.now();
const target = hours => new Date(now + hours * 3600000);
const base = { time:target(8), wet:50, precip:0.2, snow:0, code:3, rows:[{ code:3, weight:1, snow:0 }] };
const evidence = {
  exactPop:80, exactPrecip:0.5, exactCode:61, officialPop:70, repsPop:75,
  nowcastRate:null, neighbours:{ meanPop:65 }
};
const weatherNext = { probability:85, mean:0.4, spread:0.5, members:50 };
const routed = router.route(base, { target:target(8), evidence, weatherNext });

assert.equal(routed.routing.horizon, 'short-range');
assert.ok(routed.wet > base.wet, 'strong single-pass occurrence evidence should raise support');
assert.ok(routed.precip > base.precip, 'strong single-pass amount evidence should raise amount');
assert.equal(new Set(routed.routing.appliedSources).size, routed.routing.appliedSources.length, 'a source may be applied only once');
assert.deepEqual(Array.from(routed.routing.appliedFamilies), ['shared-occurrence-guidance', 'independent-ai-ensemble']);
assert.ok(routed.routing.budget.total <= 0.8, 'correction budget must stay bounded');
assert.equal(routed.routing.rawModelRowsMutated, 0);

const missing = router.route({ time:target(18), wet:null, precip:null, snow:null, code:null, rows:[] }, { target:target(18), evidence:null, weatherNext:null });
assert.equal(missing.wet, null, 'missing occurrence cannot become dry');
assert.equal(missing.precip, null, 'missing amount cannot become zero');
assert.deepEqual(Array.from(missing.routing.appliedSources), []);

const near = router.route(base, {
  target:target(1),
  evidence:{ ...evidence, nowcastRate:0 },
  weatherNext
});
assert.equal(near.routing.horizon, 'radar-handoff');
assert.ok(near.wet < base.wet, 'explicit dry nowcast should suppress near-term wet support');
assert.ok(near.routing.appliedSources.includes('eccc-radar-nowcast'));
assert.ok(near.routing.withheldSources.includes('google-weathernext2-ensemble:horizon'));

const duplicate = router.contract.dedupeContributors([
  { id:'eccc-guidance-family', value:60, weight:.4 },
  { id:'eccc-guidance-family', value:90, weight:.4 },
  { id:'open-meteo-best-match-family', value:70, weight:.6 }
]);
assert.equal(duplicate.rows.length, 2);
assert.equal(duplicate.duplicates, 1);

assert.equal(router.contract.governanceLocks.learnedModelWeights, false);
assert.equal(router.contract.governanceLocks.shadowModelWeights, 'collect-only');
assert.equal(router.contract.governanceLocks.promotion, 'explicit-release-after-sealed-court');
assert.equal(router.contract.governanceLocks.timingOffsets, false);
assert.equal(router.contract.governanceLocks.spatialOffsets, false);
assert.equal(router.contract.governanceLocks.probabilityCalibration, false);

assert.doesNotMatch(accuracySource, /function calibrateModel\b|calibrateModel\(/, 'shared evidence is still being injected into each model');
assert.match(accuracySource, /model_rows_mutated:\s*0/);
assert.doesNotMatch(weatherNextSource, /hourly\.(?:precipitation|rain|showers|snowfall|weather_code)\s*\[[^\]]+\]\s*=/, 'WeatherNext is still mutating model arrays');
assert.match(weatherNextSource, /weathernext-ensemble-single-pass-sidecar/);
assert.equal((labSource.match(/SkyMapEvidenceRouter\?\.route/g) || []).length, 1, 'router must run exactly once after raw consensus');
assert.doesNotMatch(labSource, /const val=k=>finite\(hourly\[k\]\?\.\[best\]\)\?\?0/, 'visible consensus still fabricates zeroes');

console.log('✓ Forecast Lab 34 governed evidence router passed');
