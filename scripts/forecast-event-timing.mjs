import fs from 'node:fs/promises';

const ECCC='https://api.weather.gc.ca';
const OPEN='https://api.open-meteo.com/v1';
const ENSEMBLE='https://ensemble-api.open-meteo.com/v1/ensemble';
const STATE_PATH='verification-timing/state.json';
const PUBLIC_PATH='verification-timing/public.json';
const VERSION=1;
const HORIZON_START_H=6;
const HORIZON_END_H=72;
const VERIFY_LAG_H=8;
const MAX_PENDING_AGE_DAYS=10;
const WET_MM=.2;
const MEMBER_WET_MM=.10;
const MAX_PENDING=48;
const LOCATIONS=[
  {id:'toronto',name:'Toronto',lat:43.6532,lon:-79.3832},
  {id:'ottawa',name:'Ottawa',lat:45.4215,lon:-75.6972},
  {id:'hamilton',name:'Hamilton',lat:43.2557,lon:-79.8711},
  {id:'london',name:'London',lat:42.9849,lon:-81.2453},
  {id:'windsor',name:'Windsor',lat:42.3149,lon:-83.0364},
  {id:'kingston',name:'Kingston',lat:44.2312,lon:-76.4860},
  {id:'sudbury',name:'Greater Sudbury',lat:46.4917,lon:-80.9930},
  {id:'thunder-bay',name:'Thunder Bay',lat:48.3809,lon:-89.2477}
];
const MODELS=[
  {id:'gem',endpoint:'gem',model:'gem_seamless'},
  {id:'ifs',endpoint:'ecmwf',model:'ecmwf_ifs025'},
  {id:'gfs',endpoint:'gfs',model:'gfs_seamless'},
  {id:'aifs',endpoint:'ecmwf',model:'ecmwf_aifs025_single'}
];
const SOURCES=['best_match','gem','ifs','gfs','aifs','weathernext2'];
const PRECIP_CODES=new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
const WEATHER_WORDS=/(rain|drizzle|shower|snow|sleet|freezing|thunder|precip)/i;
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const iso=v=>new Date(v).toISOString();
const roundHour=v=>{const d=new Date(v);d.setUTCMinutes(0,0,0);return d.getTime();};
const hours=(a,b)=>(a-b)/3600000;

async function fetchText(url,attempts=3,timeout=35000){let last;for(let i=1;i<=attempts;i++){try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,750*i));}}throw last;}
const fetchJson=async(url,attempts=3)=>JSON.parse(await fetchText(url,attempts));
function haversine(a,b){const R=6371,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function multi(data){if(Array.isArray(data))return data;if(LOCATIONS.length===1&&data?.hourly)return[data];throw new Error(`expected ${LOCATIONS.length} coordinate responses`);}
function multiBase(params){return{latitude:LOCATIONS.map(x=>x.lat).join(','),longitude:LOCATIONS.map(x=>x.lon).join(','),timezone:'UTC',timeformat:'unixtime',forecast_days:'4',...params};}
function url(endpoint,params){return `${endpoint}?${new URLSearchParams(params)}`;}
function modelUrl(m){return url(`${OPEN}/${m.endpoint}`,multiBase({models:m.model,hourly:'precipitation,rain,showers,snowfall,weather_code'}));}
function bestUrl(){return url(`${OPEN}/forecast`,multiBase({cell_selection:'land',hourly:'precipitation_probability,precipitation,rain,showers,snowfall,weather_code'}));}
function wnUrl(){return url(ENSEMBLE,multiBase({models:'google_weathernext2_ensemble',hourly:'precipitation'}));}
function timeMs(raw){const n=Number(raw);return Number.isFinite(n)&&n>1e9?n*1000:new Date(raw).getTime();}
function memberKeys(hourly){return Object.keys(hourly||{}).filter(k=>/^precipitation(?:_member\d+)?$/i.test(k)&&Array.isArray(hourly[k]));}

function rowsModel(data,kind){const h=data?.hourly||{},times=h.time||[],out=[];for(let i=0;i<times.length;i++){const t=timeMs(times[i]);if(!Number.isFinite(t))continue;const p=finite(h.precipitation?.[i]),rain=finite(h.rain?.[i]),showers=finite(h.showers?.[i]),snow=finite(h.snowfall?.[i]),code=finite(h.weather_code?.[i]),pop=kind==='best_match'?finite(h.precipitation_probability?.[i]):null;if([p,rain,showers,snow,code,pop].every(v=>v==null))continue;const amounts=[];if(p!=null)amounts.push(Math.max(0,p));if(rain!=null||showers!=null)amounts.push(Math.max(0,(rain||0)+(showers||0)));if(snow!=null)amounts.push(Math.max(0,snow*.7));const amount=amounts.length?Math.max(...amounts):null;const probability=pop==null?null:clamp(pop,0,100),wet=(amount!=null&&amount>=WET_MM)||(code!=null&&PRECIP_CODES.has(code))||(probability!=null&&probability>=50);out.push({t,wet,amount,probability});}return out;}
function rowsWeatherNext(data){const h=data?.hourly||{},times=h.time||[],keys=memberKeys(h),out=[];if(keys.length<24)return out;for(let i=0;i<times.length;i++){const t=timeMs(times[i]);if(!Number.isFinite(t))continue;const vals=keys.map(k=>finite(h[k]?.[i])).filter(v=>v!=null).map(v=>Math.max(0,v));if(vals.length<20)continue;const probability=100*vals.filter(v=>v>=MEMBER_WET_MM).length/vals.length,amount=vals.reduce((s,v)=>s+v,0)/vals.length;out.push({t,wet:probability>=50,amount:+amount.toFixed(3),probability:+probability.toFixed(2)});}return out;}
function buildEvents(rows,start,end){const x=rows.filter(r=>r.t>=start&&r.t<=end).sort((a,b)=>a.t-b.t),events=[];let cur=null,lastWet=null;for(const row of x){if(row.wet){if(!cur){cur={start:row.t,end:row.t,peakProbability:row.probability,totalAmount:row.amount??0,hours:1};}else if(lastWet!=null&&row.t-lastWet<=2*3600000){cur.end=row.t;cur.hours++;cur.totalAmount+=(row.amount??0);if(row.probability!=null)cur.peakProbability=Math.max(cur.peakProbability??0,row.probability);}else{events.push(cur);cur={start:row.t,end:row.t,peakProbability:row.probability,totalAmount:row.amount??0,hours:1};}lastWet=row.t;}else if(cur&&lastWet!=null&&row.t-lastWet>3600000){events.push(cur);cur=null;lastWet=null;}}if(cur)events.push(cur);return events.map(e=>({...e,end:e.end+3600000,totalAmount:+e.totalAmount.toFixed(3),peakProbability:e.peakProbability==null?null:+e.peakProbability.toFixed(1)}));}

async function loadForecasts(issueAt){const start=issueAt+HORIZON_START_H*3600000,end=issueAt+HORIZON_END_H*3600000,all={};const best=multi(await fetchJson(bestUrl(),2));all.best_match=best.map(data=>buildEvents(rowsModel(data,'best_match'),start,end));console.log(`✓ timing best_match: ${best.length} points`);for(const m of MODELS){const payload=multi(await fetchJson(modelUrl(m),2));all[m.id]=payload.map(data=>buildEvents(rowsModel(data,m.id),start,end));console.log(`✓ timing ${m.id}: ${payload.length} points`);await new Promise(r=>setTimeout(r,150));}const wn=multi(await fetchJson(wnUrl(),2));all.weathernext2=wn.map(data=>buildEvents(rowsWeatherNext(data),start,end));console.log(`✓ timing weathernext2: ${wn.length} points · ${memberKeys(wn[0]?.hourly).length} precip arrays`);return{start,end,all};}

async function truthRows(loc,start,end){const d=.7,q=new URLSearchParams({f:'json',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,datetime:`${iso(start)}/${iso(end)}`,limit:'5000'}),data=await fetchJson(`${ECCC}/collections/climate-hourly/items?${q}`,2),groups=new Map();for(const f of data.features||[]){const p=f.properties||{},coords=f.geometry?.coordinates,t=timeMs(p.UTC_DATE);if(!Array.isArray(coords)||!Number.isFinite(t))continue;const mm=finite(p.PRECIP_AMOUNT),desc=String(p.WEATHER_ENG_DESC||''),has=desc&&desc.toUpperCase()!=='NA';if(mm==null&&!has)continue;const id=String(p.CLIMATE_IDENTIFIER||p.STN_ID||p.STATION_NAME||'');if(!id)continue;if(!groups.has(id))groups.set(id,{rows:[],station:p.STATION_NAME||id,distance:haversine(loc,{lat:Number(coords[1]),lon:Number(coords[0])})});groups.get(id).rows.push({t,wet:(mm!=null&&mm>=WET_MM)||WEATHER_WORDS.test(desc),amount:mm==null?null:Math.max(0,mm)});}const best=[...groups.values()].filter(g=>g.rows.length>=20).sort((a,b)=>a.distance-b.distance)[0];return best?{...best,events:buildEvents(best.rows,start,end)}:null;}
function gapHours(a,b){if(a.end<b.start)return hours(b.start,a.end);if(b.end<a.start)return hours(a.start,b.end);return 0;}
function pairCost(a,b){const gap=gapHours(a,b);if(gap>8)return Infinity;const start=Math.abs(hours(a.start,b.start)),end=Math.abs(hours(a.end,b.end));if(start>14&&end>14)return Infinity;return start+end+gap*1.5;}
function matchEvents(predicted,truth){const candidates=[];for(let i=0;i<predicted.length;i++)for(let j=0;j<truth.length;j++){const cost=pairCost(predicted[i],truth[j]);if(Number.isFinite(cost))candidates.push({i,j,cost});}candidates.sort((a,b)=>a.cost-b.cost);const pi=new Set(),tj=new Set(),pairs=[];for(const c of candidates){if(pi.has(c.i)||tj.has(c.j))continue;pi.add(c.i);tj.add(c.j);pairs.push([predicted[c.i],truth[c.j]]);}return{pairs,falseAlarms:predicted.filter((_,i)=>!pi.has(i)),misses:truth.filter((_,j)=>!tj.has(j))};}
function leadBucket(issueAt,event){const h=hours(event.start,issueAt);return h<12?'6-12h':h<24?'12-24h':h<48?'24-48h':'48-72h';}
function emptyMetric(source,bucket){return{source,bucket,hits:0,falseAlarms:0,misses:0,startAbsH:0,startSignedH:0,endAbsH:0,endSignedH:0,durationAbsH:0,timingN:0};}
const key=(source,bucket)=>`${source}|${bucket}`;
function ensure(state,source,bucket){const k=key(source,bucket);return state.metrics[k]||(state.metrics[k]=emptyMetric(source,bucket));}
function scoreLocation(state,source,issueAt,predicted,truth){const match=matchEvents(predicted,truth);for(const [p,t] of match.pairs){const bucket=leadBucket(issueAt,t),m=ensure(state,source,bucket),sd=hours(p.start,t.start),ed=hours(p.end,t.end),pd=hours(p.end,p.start),td=hours(t.end,t.start);m.hits++;m.startAbsH+=Math.abs(sd);m.startSignedH+=sd;m.endAbsH+=Math.abs(ed);m.endSignedH+=ed;m.durationAbsH+=Math.abs(pd-td);m.timingN++;}for(const p of match.falseAlarms)ensure(state,source,leadBucket(issueAt,p)).falseAlarms++;for(const t of match.misses)ensure(state,source,leadBucket(issueAt,t)).misses++;return match;}
function summarise(m){const den=m.hits+m.falseAlarms+m.misses;return{...m,pod:m.hits+m.misses?m.hits/(m.hits+m.misses):null,far:m.hits+m.falseAlarms?m.falseAlarms/(m.hits+m.falseAlarms):null,csi:den?m.hits/den:null,startMAEHours:m.timingN?m.startAbsH/m.timingN:null,startBiasHours:m.timingN?m.startSignedH/m.timingN:null,endMAEHours:m.timingN?m.endAbsH/m.timingN:null,endBiasHours:m.timingN?m.endSignedH/m.timingN:null,durationMAEHours:m.timingN?m.durationAbsH/m.timingN:null};}
function fresh(){return{schema:VERSION,createdAt:iso(Date.now()),updatedAt:null,runs:0,pending:[],metrics:{},lastRun:null};}
async function loadState(){try{const s=JSON.parse(await fs.readFile(STATE_PATH,'utf8'));return s.schema===VERSION?s:fresh();}catch{return fresh();}}
async function verify(state,now){const keep=[];let snapshots=0,locations=0;for(const snap of state.pending){if(snap.horizonEnd>now-VERIFY_LAG_H*3600000){keep.push(snap);continue;}if(now-snap.horizonEnd>MAX_PENDING_AGE_DAYS*86400000)continue;let complete=0;for(const loc of LOCATIONS){let truth=null;try{truth=await truthRows(loc,snap.horizonStart,snap.horizonEnd);}catch{}if(!truth)continue;const idx=LOCATIONS.findIndex(x=>x.id===loc.id);for(const source of SOURCES)scoreLocation(state,source,snap.issueAt,snap.events[source]?.[idx]||[],truth.events);complete++;locations++;}if(complete>=6)snapshots++;else{snap.attempts=(snap.attempts||0)+1;keep.push(snap);}}state.pending=keep.slice(-MAX_PENDING);return{snapshots,locations};}
function publicPayload(state){const metrics=Object.values(state.metrics).map(summarise).sort((a,b)=>a.source.localeCompare(b.source)||a.bucket.localeCompare(b.bucket));return{schema:1,generatedAt:state.updatedAt,runs:state.runs,pendingSnapshots:state.pending.length,horizon:`+${HORIZON_START_H}h to +${HORIZON_END_H}h`,sources:SOURCES,locations:LOCATIONS.map(({id,name})=>({id,name})),matching:{mergeDryGapHours:1,maxEventGapHours:8,maxTimingWindowHours:14},note:'Prospective event-object verification: forecast start/end windows are stored before outcomes exist, then matched to ECCC observed precipitation events. Start/end signed bias distinguishes forecasts that are systematically early or late.',metrics};}
async function selfTest(){if(finite(null)!==null||finite('')!==null)throw new Error('null safety failed');const t0=Date.UTC(2026,0,1),rows=[0,1,2,3,4].map((h,i)=>({t:t0+h*3600000,wet:i===1||i===2,amount:i===1||i===2?.3:0})),events=buildEvents(rows,t0,t0+5*3600000);if(events.length!==1||events[0].start!==t0+3600000||events[0].end!==t0+3*3600000)throw new Error('event builder failed');const match=matchEvents([{start:t0+2*3600000,end:t0+4*3600000}],[{start:t0+3*3600000,end:t0+5*3600000}]);if(match.pairs.length!==1)throw new Error('event matcher failed');console.log('✓ event-timing verifier self-test passed');}
async function main(){if(process.argv.includes('--self-test'))return selfTest();await fs.mkdir('verification-timing',{recursive:true});const now=Date.now(),state=await loadState(),verified=await verify(state,now);const issueAt=roundHour(now);let added=0;if(!state.pending.some(s=>s.issueAt===issueAt)){try{const f=await loadForecasts(issueAt);const counts=Object.fromEntries(SOURCES.map(s=>[s,(f.all[s]||[]).reduce((n,x)=>n+x.length,0)]));state.pending.push({issueAt,horizonStart:f.start,horizonEnd:f.end,events:f.all,counts});added=1;console.log(`✓ timing snapshot sealed · ${JSON.stringify(counts)}`);}catch(e){console.warn(`⚠ timing collection failed: ${e.message}`);}}state.pending=state.pending.slice(-MAX_PENDING);state.runs++;state.updatedAt=iso(now);state.lastRun={at:state.updatedAt,verified,added};await fs.writeFile(STATE_PATH,JSON.stringify(state));await fs.writeFile(PUBLIC_PATH,JSON.stringify(publicPayload(state),null,2));console.log(`✓ event timing: ${verified.snapshots} mature snapshots / ${verified.locations} locations scored · ${added} new snapshot · ${state.pending.length} pending`);if(process.argv.includes('--smoke')){const snap=state.pending.find(s=>s.issueAt===issueAt);if(!snap)throw new Error('smoke snapshot missing');const sourceCoverage=SOURCES.filter(s=>(snap.events[s]||[]).length===LOCATIONS.length);if(sourceCoverage.length<SOURCES.length)throw new Error(`smoke only covered ${sourceCoverage.length}/${SOURCES.length} sources`);console.log(`✓ live event-timing smoke: ${sourceCoverage.length}/${SOURCES.length} sources across ${LOCATIONS.length} Ontario points`);}}
await main();
