import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile('app/lab/accuracy-engine.js', 'utf8');
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
assert.equal(engine?.version, '32.0.0');
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

assert.doesNotMatch(source, /const finite = value => Number\.isFinite\(Number\(value\)\)/, 'legacy null-to-zero finite helper returned');
assert.doesNotMatch(source, /if \(av == null && bv == null\) return 0/, 'legacy missing-to-dry mixer returned');
assert.doesNotMatch(source, /new Array\(hourly\.time\.length\)\.fill\(0\)/, 'missing model arrays are being fabricated');

console.log('✓ Forecast Lab 32 truth contract passed');
