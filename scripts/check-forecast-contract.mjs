import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile('app/accuracy-engine.js', 'utf8');
const memory = new Map();
const localStorage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key)
};
const window = { fetch: async () => { throw new Error('network disabled in contract test'); } };
const document = {
  readyState: 'loading',
  addEventListener() {},
  querySelector() { return null; }
};
class MutationObserver { observe() {} disconnect() {} }

vm.runInNewContext(source, {
  window,
  document,
  localStorage,
  MutationObserver,
  Headers,
  Response,
  URL,
  URLSearchParams,
  AbortSignal,
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  Number,
  Object,
  Array,
  Map,
  Set,
  Promise,
  String,
  RegExp
}, { filename: 'accuracy-engine.js' });

const engine = window.SkyMapAccuracy;
assert.equal(engine?.version, '34.0.0');
assert.match(engine?.mode || '', /truth-firewall/);
const contract = engine?.contract;
assert.ok(contract, 'forecast contract export missing');

assert.equal(contract.finite(null), null, 'null must remain missing');
assert.equal(contract.finite(undefined), null, 'undefined must remain missing');
assert.equal(contract.finite(''), null, 'blank must remain missing');
assert.equal(contract.finite('__skymap_missing__'), null, 'guard sentinel must remain missing');
assert.equal(contract.finite('0'), 0, 'explicit numeric zero must remain zero');
assert.equal(contract.mix(null, null, 0.5), null, 'two missing inputs cannot create dry weather');
assert.equal(contract.mix(null, 2, 0.5), 2, 'one known input remains known');
assert.equal(contract.dryWeatherCode(null), null, 'missing weather code cannot become clear weather');
assert.equal(contract.hasExplicitForecastEvidence(null, null), false, 'missing model hour is not scorable');
assert.equal(contract.hasExplicitForecastEvidence(0, null), true, 'explicit zero precipitation is scorable');
assert.equal(contract.hasExplicitForecastEvidence(null, 3), true, 'explicit weather code is scorable');
assert.equal(contract.personalShadowRules.minimumSamples, 48, 'personal shadow sample floor weakened');
assert.equal(contract.personalShadowRules.minimumSpanDays, 30, 'personal shadow observation span weakened');
assert.equal(contract.personalShadowRules.maxFactorShift, 0.14, 'personal shadow diagnostic cap changed');
assert.equal(contract.personalShadowRules.autoPromotion, false, 'personal evidence can auto-promote');

assert.doesNotMatch(source, /const finite = value => Number\.isFinite\(Number\(value\)\)/, 'legacy null-to-zero finite helper returned');
assert.doesNotMatch(source, /if \(av == null && bv == null\) return 0/, 'legacy missing-to-dry mixer returned');
assert.doesNotMatch(source, /new Array\(hourly\.time\.length\)\.fill\(0\)/, 'missing model arrays are being fabricated');

// Upgrade migrations run against a storage that behaves like the real one (enumerable keys).
function makeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return new Proxy({}, {
    get: (_, name) => name === 'getItem' ? key => data.has(key) ? data.get(key) : null
      : name === 'setItem' ? (key, value) => { data.set(key, String(value)); }
      : name === 'removeItem' ? key => { data.delete(key); } : undefined,
    ownKeys: () => [...data.keys()],
    getOwnPropertyDescriptor: (_, key) => data.has(key) ? { enumerable: true, configurable: true, value: data.get(key) } : undefined
  });
}
function bootEngine(storage) {
  const context = { window: { fetch: async () => { throw new Error('network disabled'); } }, document, localStorage: storage, MutationObserver, Headers, Response, URL, URLSearchParams, AbortSignal, console, setTimeout, clearTimeout, Date, Math, JSON, Number, Object, Array, Map, Set, Promise, String, RegExp };
  vm.runInNewContext(source, context, { filename: 'accuracy-engine.js' });
  return context.window.SkyMapAccuracy;
}
const nowMs = Date.now();
const snapshot = (id, extra = {}) => ({ id, modelId: 'gem', madeAt: nowMs - 3600000, validAt: nowMs + 3600000, leadBucket: '0-3h', wet: false, ...extra });
const upgraded = makeStorage({
  'skymap.accuracy.version': '33.0.0',                                   // existing user: version key set, cache-schema key absent
  'skymap.lab.model.gem.43.65.-79.38': '{"stale":true}',
  'skymap.accuracy.skill.v21.43.65,-79.38': '{"gem":{"score":0.9,"samples":500}}',
  'skymap.accuracy.skill.43.65,-79.38': '{"gem":{"score":0.95,"samples":900}}',
  'skymap.accuracy.snapshots.43.65,-79.38': JSON.stringify([snapshot('unversioned'), snapshot('v31', { contractVersion: '31.0.0' }), snapshot('v34', { contractVersion: '34.0.0' })])
});
bootEngine(upgraded);
assert.equal(upgraded.getItem('skymap.lab.model.gem.43.65.-79.38'), null, 'stale model cache survived a schema change for an existing user');
assert.equal(upgraded.getItem('skymap.accuracy.model-cache-schema'), '2');
assert.equal(Object.keys(upgraded).filter(key => /^skymap\.accuracy\.skill\.(v21\.|\d)/.test(key)).length, 0, 'skill scores trained before the truth contract are still stored');
assert.deepEqual(JSON.parse(upgraded.getItem('skymap.accuracy.snapshots.43.65,-79.38')).map(row => row.id), ['v34'], 'snapshots from before the truth contract were kept');
assert.equal(upgraded.getItem('skymap.accuracy.truth-contract'), '32');
// A second load must not touch data learned under the current contract.
upgraded.setItem('skymap.accuracy.skill.v34.43.65,-79.38', '{"gem":{"score":0.8,"samples":3}}');
bootEngine(upgraded);
assert.equal(upgraded.getItem('skymap.accuracy.skill.v34.43.65,-79.38'), '{"gem":{"score":0.8,"samples":3}}', 'current-contract learning was deleted on a later load');
assert.doesNotMatch(source, /skymap\.accuracy\.skill\.v21\./, 'the contaminated skill namespace is read again');

console.log('✓ Forecast Lab 34 truth contract passed');
