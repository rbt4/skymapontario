import fs from 'node:fs/promises';

const ECCC='https://api.weather.gc.ca';
const PREVIOUS='https://previous-runs-api.open-meteo.com/v1/forecast';
const CONTEXT_PATH='verification-history/context.json';
const STATE_PATH='verification-history/regime-skill.json';
const CHALLENGER_PATH='verification-history/challenger.json';
const VERSION=1;
const START='2024-01-01';
const CHUNK_DAYS=Number(process.env.REGIME_SKILL_CHUNK_DAYS||14);
const SAFE_LAG_DAYS=8;
const WET_MM=.2;
const LEADS=[24,48,72];
const SAMPLE_HOURS=[0,6,12,18];
const DAY=86400000;
const HALF_LIFE_DAYS=365;
const MIN_TRUTH_LOCATIONS=8;
const BASE_WEIGHTS={gem:.38,ifs:.27,gfs:.19,aifs:.16};
const SOURCES=[
  {id:'best_match',model:null},
  {id:'gem',model:'gem_seamless'},
  {id:'ifs',model:'ecmwf_ifs025'},
  {id:'gfs',model:'gfs_seamless'},
  {id:'aifs',model:'ecmwf_aifs025_single'}
];
const LOCATIONS=[
  {id:'toronto',name:'Toronto',region:'GTA',lat:43.6532,lon:-79.3832},
  {id:'ottawa',name:'Ottawa',region:'Eastern Ontario',lat:45.4215,lon:-75.6972},
  {id:'hamilton',name:'Hamilton',region:'Golden Horseshoe',lat:43.2557,lon:-79.8711},
  {id:'london',name:'London',region:'Southwestern Ontario',lat:42.9849,lon:-81.2453},
  {id:'windsor',name:'Windsor',region:'Southwestern Ontario',lat:42.3149,lon:-83.0364},
  {id:'kingston',name:'Kingston',region:'Eastern Ontario',lat:44.2312,lon:-76.4860},
  {id:'sudbury',name:'Greater Sudbury',region:'Northeastern Ontario',lat:46.4917,lon:-80.9930},
  {id:'thunder-bay',name:'Thunder Bay',region:'Northwestern Ontario',lat:48.3809,lon:-89.2477},
  {id:'sault-ste-marie',name:'Sault Ste. Marie',region:'Northern Great Lakes',lat:46.5219,lon:-84.3461},
  {id:'north-bay',name:'North Bay',region:'Northeastern Ontario',lat:46.3091,lon:-79.4608},
  {id:'timmins',name:'Timmins',region:'Northeastern Ontario',lat:48.4758,lon:-81.3305},
  {id:'kenora',name:'Kenora',region:'Northwestern Ontario',lat:49.7670,lon:-94.4890}
];
const PRECIP_CODES=new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
const WEATHER_WORDS=/(rain|drizzle|shower|snow|sleet|freezing|thunder|precip)/i;
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const iso=v=>new Date(v).toISOString();
const dateOnly=v=>iso(v).slice(0,10);
const startDay=v=>new Date(`${dateOnly(v)}T00:00:00Z`).getTime();
const season=ms=>{const m=new Date(ms).getUTCMonth()+1;return m<=2||m===12?'winter':m<=5?'spring':m<=8?'summer':'autumn';};
const recencyWeight=(validAt,now=Date.now())=>Math.pow(.5,Math.max(0,(now-validAt)/DAY)/HALF_LIFE_DAYS);

function utcMs(v){if(v===null||v===undefined)return null;if(typeof v==='number')return v>1e12?v:v*1000;const s=String(v);const ms=new Date(s.includes('T')?s+(s.endsWith('Z')||/[+-]\d\d:?\d\d$/.test(s)?'':'Z'):s.replace(' ','T')+'Z').getTime();return Number.isFinite(ms)?ms:null;}
function roundHour(v){const d=new Date(v);d.setUTCMinutes(0,0,0);return d.getTime();}
function haversine(a,b){const R=6371,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
async function fetchText(url,attempts=3,timeout=40000){let last;for(let i=1;i<=attempts;i++){try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,800*i));}}throw last;}
const fetchJson=async(url,attempts=3,timeout=40000)=>JSON.parse(await fetchText(url,attempts,timeout));
function chunk(cursor){const start=startDay(new Date(`${cursor}T00:00:00Z`).getTime()),safeEnd=startDay(Date.now()-SAFE_LAG_DAYS*DAY);if(start>safeEnd)return null;const end=Math.min(start+(CHUNK_DAYS-1)*DAY,safeEnd);return{startMs:start,endMs:end,start:dateOnly(start),end:dateOnly(end),next:dateOnly(end+DAY),days:Math.round((end-start)/DAY)+1};}
function normaliseMulti(data,count){if(Array.isArray(data))return data;if(count===1&&data?.hourly)return[data];throw new Error(`Expected ${count} coordinate responses`);}
function valueAt(data,key,target){const times=data?.hourly?.time||[];let best=-1,delta=Infinity;for(let i=0;i<times.length;i++){const t=utcMs(times[i]);if(t==null)continue;const d=Math.abs(t-target);if(d<delta){delta=d;best=i;}}if(best<0||delta>75*60000)return null;return finite(data.hourly?.[key]?.[best]);}
function previousUrl(source,start,end){const vars=[];for(const lead of LEADS){const d=lead/24;vars.push(`precipitation_previous_day${d}`,`weather_code_previous_day${d}`);}const q=new URLSearchParams({latitude:LOCATIONS.map(x=>x.lat).join(','),longitude:LOCATIONS.map(x=>x.lon).join(','),start_date:start,end_date:end,timezone:'UTC',timeformat:'unixtime',hourly:vars.join(','),cell_selection:'land'});if(source.model)q.set('models',source.model);return `${PREVIOUS}?${q}`;}
function predictionAt(data,lead,target){const d=lead/24,amount=valueAt(data,`precipitation_previous_day${d}`,target),code=valueAt(data,`weather_code_previous_day${d}`,target);if(amount==null&&code==null)return null;return{wet:(amount!=null&&amount>=WET_MM)||(code!=null&&PRECIP_CODES.has(code)),amount:amount==null?null:Math.max(0,amount)};}

async function stationCandidates(loc,start,end){const d=1.25,q=new URLSearchParams({f:'json',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,limit:'500'}),data=await fetchJson(`${ECCC}/collections/climate-stations/items?${q}`,2,30000),startMs=new Date(`${start}T00:00:00Z`).getTime(),endMs=new Date(`${end}T23:59:59Z`).getTime(),out=[];for(const f of data.features||[]){const p=f.properties||{},c=f.geometry?.coordinates;if(!Array.isArray(c)||!p.CLIMATE_IDENTIFIER)continue;const first=utcMs(p.HLY_FIRST_DATE),last=utcMs(p.HLY_LAST_DATE);if(first==null||last==null||first>startMs||last<Math.min(endMs,Date.now()-DAY))continue;const candidate={id:String(p.CLIMATE_IDENTIFIER),name:String(p.STATION_NAME||p.CLIMATE_IDENTIFIER),lat:Number(c[1]),lon:Number(c[0])};candidate.distanceKm=haversine(loc,candidate);out.push(candidate);}return out.sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,10);}
async function stationHours(station,start,end){const out=new Map();let offset=0;while(true){const q=new URLSearchParams({f:'json',CLIMATE_IDENTIFIER:station.id,datetime:`${start}T00:00:00Z/${end}T23:59:59Z`,limit:'10000',offset:String(offset)}),data=await fetchJson(`${ECCC}/collections/climate-hourly/items?${q}`,2,30000);for(const f of data.features||[]){const p=f.properties||{},ms=utcMs(p.UTC_DATE);if(ms==null)continue;const mm=finite(p.PRECIP_AMOUNT),desc=String(p.WEATHER_ENG_DESC||''),has=desc&&desc.toUpperCase()!=='NA';if(mm==null&&!has)continue;out.set(roundHour(ms),{wet:(mm!=null&&mm>=WET_MM)||WEATHER_WORDS.test(desc),amount:mm==null?null:Math.max(0,mm)});}const n=data.features?.length||0;if(n<10000)break;offset+=n;}return out;}
async function truthFor(loc,start,end,expected){const candidates=await stationCandidates(loc,start,end);let best=null;for(const station of candidates){try{const hours=await stationHours(station,start,end);if(!best||hours.size>best.hours.size)best={station,hours};if(hours.size/Math.max(1,expected)>=.45)return{station,hours};}catch{}}return best?.hours?.size?best:null;}
async function loadTruth(c){const map=new Map(),expected=c.days*24;for(const loc of LOCATIONS){try{const r=await truthFor(loc,c.start,c.end,expected);if(r)map.set(loc.id,r.hours);}catch{}}return map;}

function indexMap(rows){return new Map((rows||[]).map(row=>[String(row[0]),row]));}
function nearestPentad(rows,date){const target=new Date(`${date}T00:00:00Z`).getTime();let best=null,delta=Infinity;for(const row of rows||[]){const t=new Date(`${row[0]}T00:00:00Z`).getTime(),d=Math.abs(t-target);if(Number.isFinite(t)&&d<delta){delta=d;best=row;}}return delta<=4*DAY?best:null;}
function phase(v,t=.65){return v==null?'unknown':v>=t?'positive':v<=-t?'negative':'neutral';}
function ensoPhase(v){return v==null?'unknown':v>=.5?'el-nino':v<=-.5?'la-nina':'neutral';}
function mjoPhase(row){if(!row)return'unknown';const values=row.slice(1).map(finite);let idx=-1,amp=0;values.forEach((v,i)=>{if(v!=null&&Math.abs(v)>amp){amp=Math.abs(v);idx=i;}});return idx<0?'unknown':amp<1?'quiet':`zone-${idx+1}`;}
function contextAccessor(context){const r=context?.results||{};const pna=indexMap(r.pna?.data),nao=indexMap(r.nao?.data),ao=indexMap(r.ao?.data),nino=indexMap(r.nino34?.data),mjo=r.mjo?.data||[];return date=>{const month=date.slice(0,7);return{pna:phase(finite(pna.get(date)?.[1])),nao:phase(finite(nao.get(date)?.[1])),ao:phase(finite(ao.get(date)?.[1])),enso:ensoPhase(finite(nino.get(month)?.[1])),mjo:mjoPhase(nearestPentad(mjo,date))};};}
function bucketsFor(loc,t,ctx){const s=season(t);return['all',`region:${loc.region}`,`season:${s}`,`pna:${ctx.pna}`,`nao:${ctx.nao}`,`ao:${ctx.ao}`,`enso:${ctx.enso}`,`mjo:${ctx.mjo}`,`combo:${ctx.pna}|${ctx.nao}|${ctx.enso}|${s}`];}
function emptyMetric(source,lead,bucket){return{source,lead,bucket,samples:0,hits:0,misses:0,falseAlarms:0,correctDry:0,weightedSamples:0,weightedHits:0,weightedMisses:0,weightedFalseAlarms:0,weightedCorrectDry:0};}
const metricKey=(source,lead,bucket)=>`${source}|${lead}|${bucket}`;
function scoreMetric(m,p,t,w){m.samples++;m.weightedSamples+=w;if(p.wet&&t.wet){m.hits++;m.weightedHits+=w;}else if(p.wet&&!t.wet){m.falseAlarms++;m.weightedFalseAlarms+=w;}else if(!p.wet&&t.wet){m.misses++;m.weightedMisses+=w;}else{m.correctDry++;m.weightedCorrectDry+=w;}}
function addScore(state,source,lead,bucket,p,t,w){const k=metricKey(source,lead,bucket),m=state.metrics[k]||emptyMetric(source,lead,bucket);scoreMetric(m,p,t,w);state.metrics[k]=m;}
function summary(m){const den=m.weightedHits+m.weightedMisses+m.weightedFalseAlarms;return{...m,weightedAccuracy:m.weightedSamples?(m.weightedHits+m.weightedCorrectDry)/m.weightedSamples:null,weightedCsi:den?m.weightedHits/den:null,weightedPod:m.weightedHits+m.weightedMisses?m.weightedHits/(m.weightedHits+m.weightedMisses):null,weightedFar:m.weightedHits+m.weightedFalseAlarms?m.weightedFalseAlarms/(m.weightedHits+m.weightedFalseAlarms):null};}
function eventSkill(m){const s=summary(m);if(s.weightedCsi==null)return null;const pod=s.weightedPod??0,precision=1-(s.weightedFar??1);return clamp(.55*s.weightedCsi+.25*pod+.20*precision,0,1);}
function fresh(){return{version:VERSION,createdAt:iso(Date.now()),updatedAt:null,sourceCursors:Object.fromEntries(SOURCES.map(s=>[s.id,START])),metrics:{},coverage:{},runs:0,lastRun:null};}
async function loadState(){try{const s=JSON.parse(await fs.readFile(STATE_PATH,'utf8'));return s.version===VERSION?s:fresh();}catch{return fresh();}}
function cov(state,id){return state.coverage[id]||(state.coverage[id]={attempts:0,success:0,empty:0,failures:0,pairs:0,lastError:null});}
async function processSource(state,source,getCtx,truthCache){const c=chunk(state.sourceCursors[source.id]);if(!c)return{source:source.id,status:'caught-up',pairs:0};const coverage=cov(state,source.id);coverage.attempts++;let payloads;try{payloads=normaliseMulti(await fetchJson(previousUrl(source,c.start,c.end),3,45000),LOCATIONS.length);}catch(e){coverage.failures++;coverage.lastError=String(e.message||e);return{source:source.id,status:'retry',error:coverage.lastError,pairs:0};}let usable=0;for(const data of payloads)for(const lead of LEADS){const d=lead/24;for(const v of data?.hourly?.[`precipitation_previous_day${d}`]||[])if(finite(v)!=null)usable++;for(const v of data?.hourly?.[`weather_code_previous_day${d}`]||[])if(finite(v)!=null)usable++;}if(!usable){coverage.empty++;coverage.success++;coverage.lastError=null;state.sourceCursors[source.id]=c.next;return{source:source.id,status:'empty',pairs:0};}const tk=`${c.start}|${c.end}`;if(!truthCache.has(tk))truthCache.set(tk,await loadTruth(c));const truth=truthCache.get(tk);if(truth.size<MIN_TRUTH_LOCATIONS){coverage.failures++;coverage.lastError=`only ${truth.size} truth locations`;return{source:source.id,status:'retry',error:coverage.lastError,pairs:0};}let pairs=0;for(let li=0;li<LOCATIONS.length;li++){const loc=LOCATIONS[li],obsMap=truth.get(loc.id),data=payloads[li];if(!obsMap||!data)continue;for(let t=c.startMs;t<=c.endMs;t+=3600000){if(!SAMPLE_HOURS.includes(new Date(t).getUTCHours()))continue;const obs=obsMap.get(t);if(!obs)continue;const date=dateOnly(t),ctx=getCtx(date),buckets=bucketsFor(loc,t,ctx);for(const lead of LEADS){const pred=predictionAt(data,lead,t);if(!pred)continue;const w=recencyWeight(t);for(const bucket of buckets)addScore(state,source.id,lead,bucket,pred,obs,w);pairs++;}}}if(!pairs){coverage.failures++;coverage.lastError='zero regime pairs';return{source:source.id,status:'retry',pairs:0};}coverage.success++;coverage.pairs+=pairs;coverage.lastError=null;state.sourceCursors[source.id]=c.next;return{source:source.id,status:'success',pairs};}
function currentContext(context){const r=context?.results||{},latest=rows=>rows?.length?rows.at(-1):null,pna=latest(r.pna?.data),nao=latest(r.nao?.data),ao=latest(r.ao?.data),nino=latest(r.nino34?.data),mjo=latest(r.mjo?.data);return{asOf:[pna?.[0],nao?.[0],ao?.[0],nino?.[0],mjo?.[0]].filter(Boolean).sort().at(-1)||null,pna:phase(finite(pna?.[1])),nao:phase(finite(nao?.[1])),ao:phase(finite(ao?.[1])),enso:ensoPhase(finite(nino?.[1])),mjo:mjoPhase(mjo)};}
function candidateWeights(state,context){const active=currentContext(context),out={};for(const lead of LEADS){const raw={};for(const id of Object.keys(BASE_WEIGHTS)){const base=BASE_WEIGHTS[id],all=state.metrics[metricKey(id,lead,'all')],buckets=[`pna:${active.pna}`,`nao:${active.nao}`,`ao:${active.ao}`,`enso:${active.enso}`,`mjo:${active.mjo}`];let score=all?eventSkill(all):null,totalWeight=all?Math.min(1,all.weightedSamples/180):0;if(score==null)score=.48;let blended=score*totalWeight+.48*(1-totalWeight),evidence=all?.samples||0;for(const bucket of buckets){const m=state.metrics[metricKey(id,lead,bucket)];if(!m||m.samples<35)continue;const s=eventSkill(m);if(s==null)continue;const w=Math.min(.22,m.samples/500);blended=blended*(1-w)+s*w;evidence+=m.samples;}const relative=clamp(1+(blended-.48)*.75,.82,1.18);raw[id]={value:base*relative,evidence,skill:+blended.toFixed(4)};}const sum=Object.values(raw).reduce((s,x)=>s+x.value,0)||1;out[lead]=Object.fromEntries(Object.entries(raw).map(([id,x])=>[id,{weight:+(x.value/sum).toFixed(4),samples:x.evidence,skill:x.skill}]));}const minEvidence=Math.min(...Object.values(out[24]||{}).map(x=>x.samples||0));return{schema:1,generatedAt:iso(Date.now()),mode:'shadow-only',approved:false,reason:minEvidence<500?'Gathering regime-conditioned evidence; no production weight change is allowed yet.':'Evidence threshold reached, but champion-vs-challenger case-level verification is still required before activation.',currentRegime:active,baselineWeights:BASE_WEIGHTS,proposedByLead:out,guardrails:{maxRelativeWeightShift:'18%',minimumEvidenceBeforeReview:500,activationRequires:'out-of-sample champion-vs-challenger improvement'}};}
async function selfTest(){if(finite(null)!==null||finite('')!==null||phase(.8)!=='positive'||phase(-.9)!=='negative'||ensoPhase(.6)!=='el-nino')throw new Error('regime self-test failed');const m=emptyMetric('x',24,'all');scoreMetric(m,{wet:true},{wet:true},1);scoreMetric(m,{wet:true},{wet:false},1);if(m.hits!==1||m.falseAlarms!==1)throw new Error('metric self-test failed');console.log('✓ regime-aware shadow learner self-test passed');}
async function main(){if(process.argv.includes('--self-test'))return selfTest();const context=JSON.parse(await fs.readFile(CONTEXT_PATH,'utf8')),getCtx=contextAccessor(context),state=await loadState(),truthCache=new Map(),results=[];for(const source of SOURCES){const r=await processSource(state,source,getCtx,truthCache);results.push(r);console.log(`${r.status==='success'||r.status==='empty'||r.status==='caught-up'?'✓':'⚠'} regime ${source.id}: ${r.status}${r.pairs?` · ${r.pairs} pairs`:''}${r.error?` · ${r.error}`:''}`);await new Promise(r=>setTimeout(r,250));}state.runs++;state.updatedAt=iso(Date.now());state.lastRun={at:state.updatedAt,results};await fs.writeFile(STATE_PATH,JSON.stringify(state));const challenger=candidateWeights(state,context);await fs.writeFile(CHALLENGER_PATH,JSON.stringify(challenger,null,2));console.log(`✓ shadow challenger written · ${challenger.reason}`);}
await main();
