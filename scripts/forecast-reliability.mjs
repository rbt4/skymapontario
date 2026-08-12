import fs from 'node:fs/promises';

const ECCC='https://api.weather.gc.ca';
const OPEN='https://api.open-meteo.com/v1';
const ENSEMBLE='https://ensemble-api.open-meteo.com/v1/ensemble';
const STATE_PATH='verification-reliability/state.json';
const PUBLIC_PATH='verification-reliability/public.json';
const CANDIDATE_PATH='verification-reliability/candidate.json';
const VERSION=1;
const LEADS=[6,12,24,48,72];
const VERIFY_DELAY_HOURS=8;
const MAX_PENDING_AGE_DAYS=10;
const MAX_PENDING=2500;
const WET_MM=.2;
const MEMBER_WET_MM=.10;
const PRIOR_PER_BIN=20;
const MIN_SOURCE_LEAD=500;
const MIN_WET=50;
const MIN_BIN=25;
const MAX_ADJUST_PP=15;
const BASE={gem:.38,ifs:.27,gfs:.19,aifs:.16};
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
const SOURCES=['best_match','weathernext2','model_consensus','eccc_official'];
const PRECIP_CODES=new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
const WEATHER_WORDS=/(rain|drizzle|shower|snow|sleet|freezing|thunder|precip)/i;
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const iso=v=>new Date(v).toISOString();
const roundHour=v=>{const d=new Date(v);d.setUTCMinutes(0,0,0);return d.getTime();};
const season=ms=>{const m=new Date(ms).getUTCMonth()+1;return m<=2||m===12?'winter':m<=5?'spring':m<=8?'summer':'autumn';};
async function fetchText(url,attempts=3,timeout=32000){let last;for(let i=1;i<=attempts;i++){try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,700*i));}}throw last;}
const fetchJson=async(url,attempts=3)=>JSON.parse(await fetchText(url,attempts));
function haversine(a,b){const R=6371,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function timeMs(raw){const n=Number(raw);return Number.isFinite(n)&&n>1e9?n*1000:new Date(raw).getTime();}
function hourIndex(data,target){const times=data?.hourly?.time||[];let best=-1,d=Infinity;for(let i=0;i<times.length;i++){const t=timeMs(times[i]),x=Math.abs(t-target);if(Number.isFinite(t)&&x<d){d=x;best=i;}}return d<=75*60000?best:-1;}
function multi(data,count=LOCATIONS.length){if(Array.isArray(data))return data;if(count===1&&data?.hourly)return[data];throw new Error(`expected ${count} coordinate responses`);}
function common(extra={}){return{latitude:LOCATIONS.map(x=>x.lat).join(','),longitude:LOCATIONS.map(x=>x.lon).join(','),timezone:'UTC',timeformat:'unixtime',forecast_days:'4',...extra};}
function apiUrl(endpoint,params){return `${endpoint}?${new URLSearchParams(params)}`;}
function bestUrl(){return apiUrl(`${OPEN}/forecast`,common({cell_selection:'land',hourly:'precipitation_probability'}));}
function modelUrl(m){return apiUrl(`${OPEN}/${m.endpoint}`,common({models:m.model,hourly:'precipitation,weather_code'}));}
function wnUrl(){return apiUrl(ENSEMBLE,common({models:'google_weathernext2_ensemble',hourly:'precipitation'}));}
function bestProbability(data,target){const i=hourIndex(data,target);if(i<0)return null;const p=finite(data?.hourly?.precipitation_probability?.[i]);return p==null?null:clamp(p,0,100);}
function modelWet(data,target){const i=hourIndex(data,target);if(i<0)return null;const h=data?.hourly||{},p=finite(h.precipitation?.[i]),code=finite(h.weather_code?.[i]);if(p==null&&code==null)return null;return(p!=null&&p>=WET_MM)||(code!=null&&PRECIP_CODES.has(code));}
function memberKeys(h){return Object.keys(h||{}).filter(k=>/^precipitation(?:_member\d+)?$/i.test(k)&&Array.isArray(h[k]));}
function wnProbability(data,target){const i=hourIndex(data,target);if(i<0)return null;const keys=memberKeys(data?.hourly);if(keys.length<24)return null;const vals=keys.map(k=>finite(data.hourly[k]?.[i])).filter(v=>v!=null);if(vals.length<20)return null;return 100*vals.filter(v=>v>=MEMBER_WET_MM).length/vals.length;}
function consensusProbability(modelData,locIndex,target){let wet=0,total=0,count=0;for(const m of MODELS){const one=modelWet(modelData[m.id]?.[locIndex],target);if(one==null)continue;const w=BASE[m.id];total+=w;if(one)wet+=w;count++;}return count>=3&&total>=.65?100*wet/total:null;}
function english(v){return v&&typeof v==='object'&&'en'in v?v.en:v;}
async function officialFeature(loc){const d=.65,q=new URLSearchParams({f:'json',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,limit:'20'}),data=await fetchJson(`${ECCC}/collections/citypageweather-realtime/items?${q}`,2);return(data.features||[]).map(f=>{const c=f.geometry?.coordinates;return{f,d:Array.isArray(c)?haversine(loc,{lat:Number(c[1]),lon:Number(c[0])}):999};}).sort((a,b)=>a.d-b.d)[0]?.f||null;}
function officialProbability(feature,target){const rows=feature?.properties?.hourlyForecastGroup?.hourlyForecasts||[];let best=null,d=Infinity;for(const row of rows){const t=new Date(english(row.timestamp)).getTime(),x=Math.abs(t-target);if(Number.isFinite(t)&&x<d){d=x;best=row;}}if(!best||d>75*60000)return null;const p=finite(english(best.lop?.value));return p==null?null:clamp(p,0,100);}
async function collect(now){const issueAt=roundHour(now),best=multi(await fetchJson(bestUrl(),2)),models={};for(const m of MODELS){models[m.id]=multi(await fetchJson(modelUrl(m),2));await new Promise(r=>setTimeout(r,120));}const wn=multi(await fetchJson(wnUrl(),2)),official=[];for(const loc of LOCATIONS){try{official.push(await officialFeature(loc));}catch{official.push(null);}await new Promise(r=>setTimeout(r,100));}const records=[];for(let i=0;i<LOCATIONS.length;i++)for(const lead of LEADS){const validAt=issueAt+lead*3600000,values={best_match:bestProbability(best[i],validAt),weathernext2:wnProbability(wn[i],validAt),model_consensus:consensusProbability(models,i,validAt),eccc_official:officialProbability(official[i],validAt)};for(const [source,probability]of Object.entries(values))if(probability!=null)records.push({id:`${source}|${LOCATIONS[i].id}|${validAt}|${lead}`,source,locationId:LOCATIONS[i].id,issueAt,validAt,lead,probability:+probability.toFixed(2)});}return{records,weatherNextMembers:memberKeys(wn[0]?.hourly).length};}
async function truth(loc,validAt){const start=validAt-45*60000,end=validAt+45*60000,d=.7,q=new URLSearchParams({f:'json',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,datetime:`${iso(start)}/${iso(end)}`,limit:'250'}),data=await fetchJson(`${ECCC}/collections/climate-hourly/items?${q}`,2),groups=new Map();for(const f of data.features||[]){const p=f.properties||{},c=f.geometry?.coordinates;if(!Array.isArray(c))continue;const mm=finite(p.PRECIP_AMOUNT),desc=String(p.WEATHER_ENG_DESC||''),has=desc&&desc.toUpperCase()!=='NA';if(mm==null&&!has)continue;const id=String(p.CLIMATE_IDENTIFIER||p.STN_ID||p.STATION_NAME||'');if(!id)continue;if(!groups.has(id))groups.set(id,{rows:[],distance:haversine(loc,{lat:Number(c[1]),lon:Number(c[0])})});groups.get(id).rows.push(p);}const best=[...groups.values()].filter(g=>g.rows.length).sort((a,b)=>a.distance-b.distance)[0];if(!best)return null;let wet=false,evidence=0;for(const p of best.rows){const mm=finite(p.PRECIP_AMOUNT),desc=String(p.WEATHER_ENG_DESC||'');if(mm!=null){evidence++;if(mm>=WET_MM)wet=true;}if(desc&&desc.toUpperCase()!=='NA'){evidence++;if(WEATHER_WORDS.test(desc))wet=true;}}return evidence?{wet}:null;}
function binIndex(p){return Math.min(9,Math.max(0,Math.floor(clamp(p,0,100)/10)));}
const metricKey=(source,lead,bucket)=>`${source}|${lead}|${bucket}`;
function emptyMetric(source,lead,bucket){return{source,lead,bucket,samples:0,wet:0,brierSum:0,bins:Array.from({length:10},(_,i)=>({lo:i*10,hi:i===9?100:(i+1)*10,n:0,wet:0,probSum:0}))};}
function addMetric(state,record,observed,bucket){const k=metricKey(record.source,record.lead,bucket),m=state.metrics[k]||emptyMetric(record.source,record.lead,bucket),p=clamp(record.probability,0,100),q=p/100;m.samples++;if(observed.wet)m.wet++;m.brierSum+=(q-(observed.wet?1:0))**2;const b=m.bins[binIndex(p)];b.n++;if(observed.wet)b.wet++;b.probSum+=p;state.metrics[k]=m;}
function summarise(m){let ece=0,rel=0,res=0;const base=m.samples?m.wet/m.samples:0;const bins=m.bins.map(b=>{const mean=b.n?b.probSum/b.n:null,obs=b.n?b.wet/b.n:null;if(b.n){const w=b.n/m.samples;ece+=w*Math.abs(mean/100-obs);rel+=w*(mean/100-obs)**2;res+=w*(obs-base)**2;}return{...b,meanProbability:mean,observedFrequency:obs};});return{source:m.source,lead:m.lead,bucket:m.bucket,samples:m.samples,wet:m.wet,brier:m.samples?m.brierSum/m.samples:null,ece:m.samples?ece:null,reliabilityComponent:m.samples?rel:null,resolution:m.samples?res:null,uncertainty:m.samples?base*(1-base):null,bins};}
function pava(points){const blocks=[];for(const point of points){blocks.push({start:point.i,end:point.i,w:point.w,y:point.y*point.w});while(blocks.length>1){const a=blocks.at(-2),b=blocks.at(-1);if(a.y/a.w<=b.y/b.w)break;blocks.splice(-2,2,{start:a.start,end:b.end,w:a.w+b.w,y:a.y+b.y});}}const out=Array(points.length);for(const b of blocks){const y=b.y/b.w;for(let i=b.start;i<=b.end;i++)out[i]=y;}return out;}
function candidateFor(summary){const ready=summary.samples>=MIN_SOURCE_LEAD&&summary.wet>=MIN_WET,points=summary.bins.map((b,i)=>{const center=i*10+5,prior=center/100,n=b.n,y=(b.wet+PRIOR_PER_BIN*prior)/(b.n+PRIOR_PER_BIN);return{i,w:b.n+PRIOR_PER_BIN,y,center,n};}),isoFit=pava(points),mapping=points.map((p,i)=>{const fit=clamp(isoFit[i]*100,0,100),bounded=clamp(fit,p.center-MAX_ADJUST_PP,p.center+MAX_ADJUST_PP),used=ready&&p.n>=MIN_BIN;return{fromLo:p.center-5,fromHi:p.center===95?100:p.center+5,samples:p.n,rawObserved:summary.bins[i].observedFrequency,shadowTo:used?+bounded.toFixed(1):p.center,activeForReview:used};});return{readyForReview:ready,reason:ready?'Enough source/lead evidence for shadow reliability review; production use still requires a prospective challenger gate.':`Need ${MIN_SOURCE_LEAD} samples and ${MIN_WET} wet truths; currently ${summary.samples}/${summary.wet}.`,mapping};}
function fresh(){return{schema:VERSION,createdAt:iso(Date.now()),updatedAt:null,runs:0,pending:[],metrics:{},lastRun:null};}
async function loadState(){try{const s=JSON.parse(await fs.readFile(STATE_PATH,'utf8'));return s.schema===VERSION?s:fresh();}catch{return fresh();}}
async function verify(state,now){const keep=[],cache=new Map();let verified=0;for(const record of state.pending){if(record.validAt>now-VERIFY_DELAY_HOURS*3600000){keep.push(record);continue;}if(now-record.validAt>MAX_PENDING_AGE_DAYS*86400000)continue;const loc=LOCATIONS.find(x=>x.id===record.locationId);if(!loc)continue;const k=`${loc.id}|${record.validAt}`;if(!cache.has(k)){try{cache.set(k,await truth(loc,record.validAt));}catch{cache.set(k,null);}}const observed=cache.get(k);if(!observed){record.attempts=(record.attempts||0)+1;keep.push(record);continue;}addMetric(state,record,observed,'all');addMetric(state,record,observed,`season:${season(record.validAt)}`);verified++;}state.pending=keep.slice(-MAX_PENDING);return verified;}
function outputs(state){const summaries=Object.values(state.metrics).map(summarise),all=summaries.filter(x=>x.bucket==='all'),candidates={};for(const s of all)candidates[`${s.source}|${s.lead}`]=candidateFor(s);return{public:{schema:1,generatedAt:state.updatedAt,runs:state.runs,pending:state.pending.length,sources:SOURCES,leads:LEADS,note:'Prospective reliability verification. ECE/Brier and observed frequency are calculated only after the forecast valid time passes. Calibration maps use beta-style shrinkage toward the original probability plus monotonic PAVA and are shadow-only.',metrics:summaries},candidate:{schema:1,generatedAt:state.updatedAt,approved:false,autoApplies:false,guardrails:{minimumSamples:MIN_SOURCE_LEAD,minimumWetTruths:MIN_WET,minimumSamplesPerAdjustedBin:MIN_BIN,priorEquivalentSamplesPerBin:PRIOR_PER_BIN,maxAdjustmentPercentagePoints:MAX_ADJUST_PP,activationRequires:'separate prospective champion-vs-challenger improvement'},candidates}};}
async function selfTest(){if(finite(null)!==null||finite('')!==null)throw new Error('null safety failed');const fit=pava([{i:0,w:1,y:.3},{i:1,w:1,y:.2},{i:2,w:1,y:.8}]);if(Math.abs(fit[0]-.25)>.001||Math.abs(fit[1]-.25)>.001||Math.abs(fit[2]-.8)>.001)throw new Error('PAVA failed');const state=fresh(),r={source:'x',lead:24,probability:70,validAt:Date.now()};addMetric(state,r,{wet:true},'all');const s=summarise(state.metrics['x|24|all']);if(s.samples!==1||s.brier==null||s.bins[7].n!==1)throw new Error('reliability scoring failed');console.log('✓ probability reliability self-test passed');}
async function main(){if(process.argv.includes('--self-test'))return selfTest();await fs.mkdir('verification-reliability',{recursive:true});const now=Date.now(),state=await loadState(),verified=await verify(state,now);let added=0,members=0;try{const collected=await collect(now),existing=new Set(state.pending.map(r=>r.id));members=collected.weatherNextMembers;for(const record of collected.records)if(!existing.has(record.id)){state.pending.push(record);existing.add(record.id);added++;}}catch(e){console.warn(`⚠ reliability collection: ${e.message}`);}state.pending=state.pending.slice(-MAX_PENDING);state.runs++;state.updatedAt=iso(now);state.lastRun={at:state.updatedAt,verified,added,weatherNextMembers:members};const out=outputs(state);await fs.writeFile(STATE_PATH,JSON.stringify(state));await fs.writeFile(PUBLIC_PATH,JSON.stringify(out.public,null,2));await fs.writeFile(CANDIDATE_PATH,JSON.stringify(out.candidate,null,2));console.log(`✓ probability reliability: ${verified} cases verified · ${added} sealed · ${state.pending.length} pending · WeatherNext ${members||'—'} arrays`);if(process.argv.includes('--smoke')){if(added<80||members<24)throw new Error(`reliability smoke insufficient: ${added} cases, ${members} WeatherNext arrays`);console.log(`✓ live reliability smoke: ${added} probability forecasts sealed from ${SOURCES.length} source families`);}}
await main();
