import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const [source, lab] = await Promise.all([
  fs.readFile('app/lab/accuracy-engine.js', 'utf8'),
  fs.readFile('app/lab/lab.js', 'utf8')
]);
const memory = new Map();
const localStorage = {
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value)),
  removeItem:key=>memory.delete(key)
};
const window = { fetch:async()=>{ throw new Error('network disabled'); } };
const document = { readyState:'loading', addEventListener(){}, querySelector(){ return null; } };
class MutationObserver { observe() {} }

vm.runInNewContext(source, {
  window, document, localStorage, MutationObserver, Headers, Response, URL, URLSearchParams, AbortSignal,
  console, setTimeout, clearTimeout, Date, Math, JSON, Number, Object, Array, Map, Set, Promise, String, RegExp
}, { filename:'accuracy-engine.js' });

const court = window.SkyMapAccuracy?.contract;
assert.ok(court, 'Forecast Court contract missing');

const observationIds = Array.from({length:48},(_,index)=>`hour-${index}`);
const mature = {
  observations:observationIds, wetHours:12, dryHours:36,
  firstObservedAt:Date.UTC(2026,0,1), lastObservedAt:Date.UTC(2026,1,2),
  models:{ gem:{samples:48}, ifs:{samples:48}, gfs:{samples:47} }
};
assert.equal(court.courtEligibility({...mature,observations:observationIds.slice(0,47)},['gem','ifs']).active,false,'47 hours cannot promote weights');
assert.equal(court.courtEligibility({...mature,lastObservedAt:Date.UTC(2026,0,20)},['gem','ifs']).active,false,'short observation span cannot promote weights');
assert.equal(court.courtEligibility({...mature,wetHours:7,dryHours:41},['gem','ifs']).active,false,'unbalanced wet evidence cannot promote weights');
assert.equal(court.courtEligibility(mature,['gem','ifs','gfs']).active,true,'a mature balanced cohort should become eligible');
assert.deepEqual(Array.from(court.courtEligibility(mature,['gem','ifs','gfs']).eligibleModels),['gem','ifs']);

const rows = [
  {model:{id:'gem'},weight:.38,wet:true,precip:.4},
  {model:{id:'ifs'},weight:.27,wet:true,precip:.3},
  {model:{id:'gfs'},weight:.19,wet:false,precip:0},
  {model:{id:'aifs'},weight:.16,wet:false,precip:0}
];
const adjusted = court.boundedCourtWeights(rows,{gem:.98,ifs:.35,gfs:.72,aifs:.72});
const total = Object.values(adjusted).reduce((sum,value)=>sum+value,0);
assert.ok(Math.abs(total-1)<1e-9,'calibrated weights must conserve total influence');
for(const row of rows){
  const ratio=adjusted[row.model.id]/row.weight;
  assert.ok(ratio>=.86-1e-9&&ratio<=1.14+1e-9,`${row.model.id} exceeded the ±14% influence cap`);
}
assert.ok(adjusted.gem>.38,'strong verified GEM quality should receive bounded promotion');
assert.ok(adjusted.ifs<.27,'weak verified IFS quality should receive bounded demotion');

assert.equal(court.forecastRegime(rows),'light-rain');
assert.equal(court.seasonBucket('2026-01-15T00:00:00Z'),'winter');
assert.equal(court.seasonBucket('2026-07-15T00:00:00Z'),'summer');

assert.match(source,/recordCourtObservation\(lat, lon, validAt, group, rate\)/,'ECCC radar verification is not feeding the Forecast Court');
assert.match(source,/valid > now \+ 168 \* 3600000/,'seven-day forecasts are not retained for later verification');
assert.match(source,/now - item\.madeAt < 9 \* 86400000/,'prospective snapshots expire before long-range verification');
assert.match(source,/rain-radar-cannot-verify-snow/,'rain radar is not prevented from grading snow forecasts');
assert.match(source,/group\.some\(row => row\.snow\)/,'mixed snow groups can still be graded by rain radar');
assert.match(lab,/SkyMapAccuracy\?\.courtWeightsAt/,'the raw model blend does not consult eligible Court weights');
assert.match(lab,/w\.weight\?\?w\.model\.weight/,'event confidence ignores Court-adjusted influence');
assert.doesNotMatch(lab,/model\.weight\s*=/,'published base weights must remain immutable');

console.log('✓ Forecast Lab 34 prospective Forecast Court contract passed');
