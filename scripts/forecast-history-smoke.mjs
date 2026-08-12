import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const DAY=86400000;
const cursor=new Date(Date.now()-12*DAY).toISOString().slice(0,10);
await fs.rm('verification-history',{recursive:true,force:true});
await fs.mkdir('verification-history',{recursive:true});
await fs.writeFile('verification-history/state.json',JSON.stringify({
  version:2,createdAt:new Date().toISOString(),updatedAt:null,
  sourceCursors:{best_match:cursor,gem:cursor,ifs:cursor,gfs:cursor,aifs:cursor},
  regimeCursor:cursor,metrics:{},coverage:{},stations:{},analogs:[],runs:0,lastRun:null
}));

const run=spawnSync(process.execPath,['scripts/forecast-history-backfill-v2.mjs'],{
  stdio:'inherit',
  env:{...process.env,HISTORY_SOURCE_CHUNK_DAYS:'3',HISTORY_REGIME_CHUNK_DAYS:'3'}
});
if(run.status!==0)process.exit(run.status||1);

const state=JSON.parse(await fs.readFile('verification-history/state.json','utf8'));
const totalScored=Object.entries(state.coverage||{}).filter(([k])=>k!=='regime').reduce((n,[,v])=>n+(v.scoredPairs||0),0);
const successfulSources=Object.entries(state.coverage||{}).filter(([k,v])=>k!=='regime'&&(v.successChunks||0)>0).length;
if(totalScored<500)throw new Error(`Historical smoke scored too few pairs: ${totalScored}`);
if(successfulSources<4)throw new Error(`Historical smoke advanced too few forecast archives: ${successfulSources}`);
if(Object.keys(state.stations||{}).length<8)throw new Error(`Historical smoke found too few observation locations: ${Object.keys(state.stations||{}).length}`);
if((state.analogs?.length||0)<2)throw new Error(`Historical smoke produced too few atmospheric analogs: ${state.analogs?.length||0}`);
for(const source of ['best_match','gem','ifs','gfs','aifs']){
  const c=state.coverage?.[source];
  if(c?.successChunks&&c.scoredPairs===0&&c.emptyChunks===0)throw new Error(`${source} advanced without real data`);
}
console.log(`✓ lossless end-to-end smoke passed: ${totalScored} scored pairs, ${successfulSources} source archives, ${Object.keys(state.stations).length} truth locations, ${state.analogs.length} atmospheric analogs`);
await fs.rm('verification-history',{recursive:true,force:true});
