import fs from 'node:fs/promises';

const ARCHIVE='https://archive-api.open-meteo.com/v1/archive';
const OUT='verification-era5/state.json';
const PUBLIC='verification-era5/public.json';
const VERSION=1;
const START='1940-01-01';
const CHUNK_DAYS=Number(process.env.ERA5_CHUNK_DAYS||120);
const CHUNKS_PER_RUN=Number(process.env.ERA5_CHUNKS_PER_RUN||6);
const SAFE_LAG_DAYS=7;
const DAY=86400000;
const MAX_DAYS=34000;
const SENTINELS=[
  {id:'epac',lat:45,lon:-140},{id:'bc',lat:50,lon:-125},{id:'alberta',lat:52,lon:-115},
  {id:'prairies',lat:50,lon:-100},{id:'nwont',lat:49,lon:-90},{id:'greatlakes',lat:44.8,lon:-82.5},
  {id:'ohio',lat:40,lon:-82},{id:'gulf',lat:29,lon:-90},{id:'northeast',lat:43,lon:-72},{id:'hudson',lat:55,lon:-85}
];
const VARS=['pressure_msl','temperature_2m','dew_point_2m','wind_speed_10m','wind_direction_10m','total_column_integrated_water_vapour'];
const COLUMNS=['date','pacific_pressure','west_pressure','prairie_pressure','great_lakes_pressure','east_pressure','gulf_pressure','west_east_pressure_gradient','gulf_gl_pressure_gradient','gl_temperature','prairie_gl_temperature_contrast','gl_dewpoint','gulf_gl_moisture_gradient','gulf_northward_moisture_flux','ohio_northward_moisture_flux','gl_wind_u','gl_wind_v','gl_cyclone_proxy'];
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const avg=values=>{const x=values.filter(v=>v!=null);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null;};
const q=v=>v==null?null:+v.toFixed(3);
const iso=v=>new Date(v).toISOString();
const dateOnly=v=>iso(v).slice(0,10);
const startDay=v=>new Date(`${dateOnly(v)}T00:00:00Z`).getTime();
function uv(speed,direction){if(speed==null||direction==null)return[null,null];const r=direction*Math.PI/180;return[-speed*Math.sin(r),-speed*Math.cos(r)];}
async function fetchText(url,attempts=3,timeout=50000){let last;for(let i=1;i<=attempts;i++){try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout),headers:{'user-agent':'SkyMap-Ontario-ERA5-Memory/26'}});if(!r.ok)throw new Error(`HTTP ${r.status}: ${(await r.text().catch(()=>'' )).slice(0,160)}`);return await r.text();}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,900*i));}}throw last;}
const fetchJson=async url=>JSON.parse(await fetchText(url));
function chunk(cursor){const start=startDay(new Date(`${cursor}T00:00:00Z`).getTime()),safeEnd=startDay(Date.now()-SAFE_LAG_DAYS*DAY);if(start>safeEnd)return null;const end=Math.min(start+(CHUNK_DAYS-1)*DAY,safeEnd);return{start,end,startDate:dateOnly(start),endDate:dateOnly(end),next:dateOnly(end+DAY)};}
function urlFor(c){const p=new URLSearchParams({latitude:SENTINELS.map(x=>x.lat).join(','),longitude:SENTINELS.map(x=>x.lon).join(','),start_date:c.startDate,end_date:c.endDate,timezone:'UTC',timeformat:'unixtime',models:'era5',hourly:VARS.join(','),cell_selection:'nearest'});return `${ARCHIVE}?${p}`;}
function multi(data){if(Array.isArray(data))return data;if(SENTINELS.length===1&&data?.hourly)return[data];throw new Error(`ERA5 expected ${SENTINELS.length} coordinate responses`);}
function sampleMap(data){const out=new Map(),times=data?.hourly?.time||[];for(let i=0;i<times.length;i++){const raw=Number(times[i]),ms=raw>1e10?raw:raw*1000;if(!Number.isFinite(ms)||new Date(ms).getUTCHours()!==12)continue;const row={};for(const key of VARS)row[key]=finite(data.hourly?.[key]?.[i]);out.set(dateOnly(ms),row);}return out;}
function derive(date,maps){const at=id=>maps.get(id)?.get(date)||{},p=id=>finite(at(id).pressure_msl),t=id=>finite(at(id).temperature_2m),d=id=>finite(at(id).dew_point_2m),w=id=>finite(at(id).wind_speed_10m),dir=id=>finite(at(id).wind_direction_10m),m=id=>finite(at(id).total_column_integrated_water_vapour);const pac=p('epac'),west=avg([p('bc'),p('alberta')]),prairie=avg([p('prairies'),p('nwont')]),gl=p('greatlakes'),east=avg([p('northeast'),p('hudson')]),gulf=p('gulf'),glT=t('greatlakes'),prairieT=avg([t('prairies'),t('nwont')]),glD=d('greatlakes'),gulfM=m('gulf'),glM=m('greatlakes'),[gu,gv]=uv(w('gulf'),dir('gulf')),[ou,ov]=uv(w('ohio'),dir('ohio')),[glu,glv]=uv(w('greatlakes'),dir('greatlakes')),neighbour=avg([p('nwont'),p('ohio'),p('northeast'),p('hudson')]);const required=[pac,west,prairie,gl,east,gulf,glT,prairieT,glD,gulfM,glM,gv,ov,glu,glv,neighbour];if(required.filter(v=>v!=null).length<13)return null;return[date,q(pac),q(west),q(prairie),q(gl),q(east),q(gulf),q(gl-pac),q(gl-gulf),q(glT),q(glT-prairieT),q(glD),q(gulfM-glM),q(gulfM*gv),q(m('ohio')==null||ov==null?null:m('ohio')*ov),q(glu),q(glv),q(gl-neighbour)];}
function fresh(){return{schema:VERSION,createdAt:iso(Date.now()),updatedAt:null,cursor:START,runs:0,columns:COLUMNS,source:{dataset:'ERA5',endpoint:ARCHIVE,resolution:'0.25 degree',sample:'12 UTC daily',sentinels:SENTINELS,variables:VARS},coverage:{chunks:0,failures:0,days:0,lastError:null},days:[]};}
async function load(){try{const s=JSON.parse(await fs.readFile(OUT,'utf8'));return s.schema===VERSION?s:fresh();}catch{return fresh();}}
async function processChunk(state,c){const data=multi(await fetchJson(urlFor(c))),maps=new Map();data.forEach((item,i)=>maps.set(SENTINELS[i].id,sampleMap(item)));const dates=[...maps.get('greatlakes').keys()].sort(),rows=[];for(const date of dates){const row=derive(date,maps);if(row)rows.push(row);}if(rows.length<Math.max(5,Math.floor((c.end-c.start)/DAY)*.7))throw new Error(`ERA5 produced only ${rows.length} complete daily fingerprints`);const existing=new Map(state.days.map(row=>[row[0],row]));for(const row of rows)existing.set(row[0],row);state.days=[...existing.values()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-MAX_DAYS);state.cursor=c.next;state.coverage.chunks++;state.coverage.days=state.days.length;state.coverage.lastError=null;return rows.length;}
function stats(state){const numeric=COLUMNS.slice(1).map((name,i)=>{const vals=state.days.map(r=>finite(r[i+1])).filter(v=>v!=null);const mean=vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:null,variance=vals.length?vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length:null;return{name,n:vals.length,mean:q(mean),sd:q(variance==null?null:Math.sqrt(variance))};});return{schema:1,generatedAt:state.updatedAt,cursor:state.cursor,days:state.days.length,first:state.days[0]?.[0]||null,last:state.days.at(-1)?.[0]||null,columns:COLUMNS,normalisation:numeric,note:'Compact ERA5 analog memory. Raw global grids are intentionally not stored; physically meaningful upstream gradients and transport proxies are retained to reduce noise and overfitting.'};}
async function selfTest(){const maps=new Map();for(const s of SENTINELS)maps.set(s.id,new Map([['2020-01-01',{pressure_msl:1000+s.lon/100,temperature_2m:5+s.lat/20,dew_point_2m:1,total_column_integrated_water_vapour:15+s.lat/20,wind_speed_10m:20,wind_direction_10m:180}]]));const row=derive('2020-01-01',maps);if(!row||row.length!==COLUMNS.length||finite(null)!==null)throw new Error('ERA5 fingerprint self-test failed');console.log('✓ ERA5 compact-memory self-test passed');}
async function main(){if(process.argv.includes('--self-test'))return selfTest();await fs.mkdir('verification-era5',{recursive:true});const state=await load();let done=0;for(let i=0;i<CHUNKS_PER_RUN;i++){const c=chunk(state.cursor);if(!c)break;try{const n=await processChunk(state,c);done+=n;console.log(`✓ ERA5 ${c.startDate}..${c.endDate}: ${n} daily fingerprints`);}catch(e){state.coverage.failures++;state.coverage.lastError=String(e.message||e);console.warn(`⚠ ERA5 ${c.startDate}..${c.endDate}: retry · ${state.coverage.lastError}`);break;}await new Promise(r=>setTimeout(r,300));}state.runs++;state.updatedAt=iso(Date.now());const pub=stats(state);await fs.writeFile(OUT,JSON.stringify(state));await fs.writeFile(PUBLIC,JSON.stringify(pub,null,2));console.log(`✓ ERA5 memory: ${state.days.length} days stored · cursor ${state.cursor} · ${done} added/refreshed this run`);}
await main();
