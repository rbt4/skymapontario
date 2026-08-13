import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const [source,lab,historyCourt,sealedCourt] = await Promise.all([
  fs.readFile('app/lab/accuracy-engine.js','utf8'),
  fs.readFile('app/lab/lab.js','utf8'),
  fs.readFile('scripts/forecast-regime-skill.mjs','utf8'),
  fs.readFile('scripts/forecast-court.mjs','utf8')
]);
const memory=new Map();
const localStorage={getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
const window={fetch:async()=>{throw new Error('network disabled');}};
const document={readyState:'loading',addEventListener(){},querySelector(){return null;}};
class MutationObserver{observe(){}}

vm.runInNewContext(source,{window,document,localStorage,MutationObserver,Headers,Response,URL,URLSearchParams,AbortSignal,console,setTimeout,clearTimeout,Date,Math,JSON,Number,Object,Array,Map,Set,Promise,String,RegExp},{filename:'accuracy-engine.js'});

const api=window.SkyMapAccuracy,contract=api?.contract;
assert.ok(contract,'personal shadow contract missing');
assert.equal(contract.personalShadowRules.autoPromotion,false,'personal evidence must never auto-promote');
assert.equal(contract.personalShadowRules.activationAuthority,'sealed-ontario-court-plus-explicit-code-release');

const observationIds=Array.from({length:48},(_,index)=>`hour-${index}`);
const mature={observations:observationIds,wetHours:12,dryHours:36,firstObservedAt:Date.UTC(2026,0,1),lastObservedAt:Date.UTC(2026,1,2),models:{gem:{samples:48},ifs:{samples:48},gfs:{samples:47}}};
assert.equal(contract.courtEligibility({...mature,observations:observationIds.slice(0,47)},['gem','ifs']).active,false,'47 hours cannot mature a shadow cohort');
assert.equal(contract.courtEligibility({...mature,lastObservedAt:Date.UTC(2026,0,20)},['gem','ifs']).active,false,'short observation span cannot mature a shadow cohort');
assert.equal(contract.courtEligibility({...mature,wetHours:7,dryHours:41},['gem','ifs']).active,false,'unbalanced evidence cannot mature a shadow cohort');
assert.equal(contract.courtEligibility(mature,['gem','ifs','gfs']).active,true,'mature balanced evidence should make a shadow cohort review-ready');
assert.deepEqual(Array.from(contract.courtEligibility(mature,['gem','ifs','gfs']).eligibleModels),['gem','ifs']);

const rows=[
  {model:{id:'gem'},weight:.38,wet:true,precip:.4},
  {model:{id:'ifs'},weight:.27,wet:true,precip:.3},
  {model:{id:'gfs'},weight:.19,wet:false,precip:0},
  {model:{id:'aifs'},weight:.16,wet:false,precip:0}
];
const adjusted=contract.boundedCourtWeights(rows,{gem:.98,ifs:.35,gfs:.72,aifs:.72});
assert.ok(Math.abs(Object.values(adjusted).reduce((sum,value)=>sum+value,0)-1)<1e-9,'shadow weights must conserve total influence');
for(const row of rows){const ratio=adjusted[row.model.id]/row.weight;assert.ok(ratio>=.86-1e-9&&ratio<=1.14+1e-9,`${row.model.id} exceeded the diagnostic ±14% cap`);}

assert.equal(contract.forecastRegime(rows),'light-rain');
assert.equal(contract.seasonBucket('2026-01-15T00:00:00Z'),'winter');
assert.match(source,/skymap\.accuracy\.personal-shadow\.v1/,'personal evidence storage is not explicitly separated from the sealed Court');
assert.match(source,/recordCourtObservation\(lat, lon, validAt, group, rate\)/,'ECCC radar verification is not feeding personal shadow evidence');
assert.match(source,/valid > now \+ 168 \* 3600000/,'seven-day forecasts are not retained for later verification');
assert.match(source,/now - item\.madeAt < 9 \* 86400000/,'prospective snapshots expire before long-range verification');
assert.match(source,/rain-radar-cannot-verify-snow/,'rain radar is not prevented from grading snow forecasts');
assert.match(source,/group\.some\(row => row\.snow\)/,'mixed snow groups can still be graded by rain radar');

const modelRowsSection=lab.slice(lab.indexOf('function modelRowsAt'),lab.indexOf('function blendAt'));
assert.match(modelRowsSection,/SkyMapAccuracy\?\.personalShadowAt/,'the UI does not compute personal shadow diagnostics');
assert.match(modelRowsSection,/weight:model\.weight,baseWeight:model\.weight/,'live rows do not start from immutable base influence');
assert.doesNotMatch(modelRowsSection,/row\.weight\s*=/,'personal evidence can mutate a live model row');
assert.match(lab,/w\.weight\?\?w\.model\.weight/,'event confidence no longer uses the live row influence');
assert.equal((lab.match(/approvedForBoundedIntegrationReview/g)||[]).length,1,'the public Court verdict must be display-only');
assert.match(lab,/data\.verdict\.autoPromotes!==false/,'the Lab accepts a public Court payload without a no-auto-promotion contract');
assert.doesNotMatch(lab,/model\.weight\s*=/,'published base weights must remain immutable');

assert.match(historyCourt,/const evidence=all\?\.samples\|\|0/,'historical evidence still inflates samples with correlated regime buckets');
assert.match(historyCourt,/unsupportedSources:'frozen at champion weight'/,'historically unsupported sources are not frozen');
assert.match(historyCourt,/row\.aifs\.weight!==BASE_WEIGHTS\.aifs/,'the AIFS zero-evidence regression is not executable');
assert.match(sealedCourt,/function historicalCoverage\(/,'sealed Court lacks model-aware historical coverage');
assert.match(sealedCourt,/supportedModels\.length>=3&&unsupportedModelsFrozen/,'sealed Court does not require three honest historical models');
assert.match(sealedCourt,/unsupportedModelsFrozen:history\.unsupportedModelsFrozen/,'unsupported-model freeze is absent from the verdict checks');
assert.match(sealedCourt,/autoPromotes:false/,'sealed Court can auto-promote');

console.log('✓ Forecast Lab 34 shadow evidence and sealed Court boundary passed');
