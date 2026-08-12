import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const DAY=86400000;
const cursor=new Date(Date.now()-12*DAY).toISOString().slice(0,10);
await fs.rm('verification-history',{recursive:true,force:true});
await fs.mkdir('verification-history',{recursive:true});
await fs.writeFile('verification-history/state.json',JSON.stringify({
  version:1,createdAt:new Date().toISOString(),updatedAt:null,cursor,
  metrics:{},stations:{},analogs:[],chunks:0,lastChunk:null
}));

const run=spawnSync(process.execPath,['scripts/forecast-history-backfill.mjs'],{
  stdio:'inherit',
  env:{...process.env,HISTORY_CHUNK_DAYS:'3'}
});
if(run.status!==0)process.exit(run.status||1);

const state=JSON.parse(await fs.readFile('verification-history/state.json','utf8'));
const last=state.lastChunk||{};
if((last.scored||0)<100)throw new Error(`Historical smoke scored too few pairs: ${last.scored||0}`);
if((last.archiveModels||0)<4)throw new Error(`Historical smoke loaded too few model archives: ${last.archiveModels||0}`);
if((last.truthLocations||0)<8)throw new Error(`Historical smoke found too few observation locations: ${last.truthLocations||0}`);
if((state.analogs?.length||0)<2)throw new Error(`Historical smoke produced too few atmospheric analogs: ${state.analogs?.length||0}`);
console.log(`✓ end-to-end historical smoke passed: ${last.scored} scored pairs, ${last.archiveModels} archives, ${last.truthLocations} truth locations, ${state.analogs.length} atmospheric analogs`);
await fs.rm('verification-history',{recursive:true,force:true});
