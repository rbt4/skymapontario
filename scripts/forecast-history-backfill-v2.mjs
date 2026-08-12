import fs from 'node:fs/promises';

const ECCC='https://api.weather.gc.ca';
const PREVIOUS='https://previous-runs-api.open-meteo.com/v1/forecast';
const HISTORICAL='https://historical-forecast-api.open-meteo.com/v1/forecast';
const STATE_PATH='verification-history/state.json';
const PUBLIC_PATH='verification-history/public.json';
const REPORT_PATH='verification-history/report.md';

const VERSION=2;
const FORECAST_START='2024-01-01';
const REGIME_START='2022-01-01';
const SOURCE_CHUNK_DAYS=Number(process.env.HISTORY_SOURCE_CHUNK_DAYS||21);
const REGIME_CHUNK_DAYS=Number(process.env.HISTORY_REGIME_CHUNK_DAYS||28);
const SAFE_LAG_DAYS=8;
const WET_MM=.2;
const SAMPLE_HOURS=[0,6,12,18];
const LEADS=[24,48,72];
const HALF_LIFE_DAYS=365;
const MAX_ANALOGS=12000;
const MIN_TRUTH_LOCATIONS=8;
const MIN_STATION_COVERAGE=.45;
const DAY=86400000;

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
const SOURCES=[
  {id:'best_match',name:'Best Match',model:null},
  {id:'gem',name:'GEM seamless',model:'gem_seamless'},
  {id:'ifs',name:'ECMWF IFS 0.25°',model:'ecmwf_ifs025'},
  {id:'gfs',name:'GFS seamless',model:'gfs_seamless'},
  {id:'aifs',name:'ECMWF AIFS',model:'ecmwf_aifs025_single'}
];
const SENTINELS=[
  {id:'epac',lat:45,lon:-140},{id:'bc',lat:50,lon:-125},{id:'alberta',lat:52,lon:-115},
  {id:'prairies',lat:50,lon:-100},{id:'nw-ontario',lat:49,lon:-90},{id:'great-lakes',lat:45,lon:-82},
  {id:'ohio-valley',lat:40,lon:-82},{id:'gulf',lat:30,lon:-90},{id:'northeast-us',lat:43,lon:-72},
  {id:'hudson-bay',lat:55,lon:-85}
];
const REGIME_FIELDS=['pressure_msl','cape','total_column_integrated_water_vapour','geopotential_height_500hPa','temperature_850hPa','relative_humidity_850hPa','wind_speed_850hPa','wind_direction_850hPa'];
const PRECIP_CODES=new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
const WEATHER_WORDS=/(rain|drizzle|shower|snow|sleet|freezing|thunder|precip)/i;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const iso=v=>new Date(v).toISOString();
const dateOnly=v=>iso(v).slice(0,10);
const roundHour=v=>{const d=new Date(v);d.setUTCMinutes(0,0,0);return d.getTime();};
const startOfDay=v=>new Date(`${dateOnly(v)}T00:00:00Z`).getTime();
const season=ms=>{const m=new Date(ms).getUTCMonth()+1;return m<=2||m===12?'winter':m<=5?'spring':m<=8?'summer':'autumn';};
const recencyWeight=(validAt,now=Date.now())=>Math.pow(.5,Math.max(0,(now-validAt)/DAY)/HALF_LIFE_DAYS);

function utcMs(value){
  if(value===null||value===undefined)return null;
  if(typeof value==='number')return value>1e12?value:value*1000;
  const s=String(value);
  const ms=new Date(s.includes('T')?s+(s.endsWith('Z')||/[+-]\d\d:?\d\d$/.test(s)?'':'Z'):s.replace(' ','T')+'Z').getTime();
  return Number.isFinite(ms)?ms:null;
}
function haversine(a,b){
  const R=6371,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon);
  const q=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}
async function fetchText(url,attempts=3,timeout=45000){
  let last;
  for(let i=1;i<=attempts;i++){
    try{
      const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});
      if(!r.ok)throw new Error(`HTTP ${r.status}: ${await r.text().catch(()=> '')}`);
      return await r.text();
    }catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,900*i));}
  }
  throw last;
}
const fetchJson=async(url,attempts=3,timeout=45000)=>JSON.parse(await fetchText(url,attempts,timeout));

function chunkFrom(cursor,days){
  const start=startOfDay(new Date(`${cursor}T00:00:00Z`).getTime());
  const safeEnd=startOfDay(Date.now()-SAFE_LAG_DAYS*DAY);
  if(start>safeEnd)return null;
  const end=Math.min(start+(days-1)*DAY,safeEnd);
  return{startMs:start,endMs:end,start:dateOnly(start),end:dateOnly(end),next:dateOnly(end+DAY),days:Math.round((end-start)/DAY)+1};
}
function normaliseMulti(data,count){
  if(Array.isArray(data))return data;
  if(count===1&&data?.hourly)return[data];
  throw new Error(`Expected ${count} coordinate responses`);
}
function valueAt(data,key,target){
  const times=data?.hourly?.time||[];let best=-1,delta=Infinity;
  for(let i=0;i<times.length;i++){
    const t=utcMs(times[i]);if(t==null)continue;
    const d=Math.abs(t-target);if(d<delta){best=i;delta=d;}
  }
  if(best<0||delta>75*60000)return null;
  return finite(data.hourly?.[key]?.[best]);
}
function previousUrl(source,start,end){
  const vars=[];
  for(const lead of LEADS){const d=lead/24;vars.push(`precipitation_previous_day${d}`,`weather_code_previous_day${d}`);}
  const q=new URLSearchParams({
    latitude:LOCATIONS.map(x=>x.lat).join(','),longitude:LOCATIONS.map(x=>x.lon).join(','),
    start_date:start,end_date:end,timezone:'UTC',timeformat:'unixtime',hourly:vars.join(','),cell_selection:'land'
  });
  if(source.model)q.set('models',source.model);
  return `${PREVIOUS}?${q}`;
}
function predictionAt(data,lead,target){
  const d=lead/24;
  const amount=valueAt(data,`precipitation_previous_day${d}`,target);
  const code=valueAt(data,`weather_code_previous_day${d}`,target);
  if(amount==null&&code==null)return null;
  return{wet:(amount!=null&&amount>=WET_MM)||(code!=null&&PRECIP_CODES.has(code)),amount:amount==null?null:Math.max(0,amount),code};
}
function countUsable(payloads){
  let n=0;
  for(const data of payloads||[])for(const lead of LEADS){
    const d=lead/24;
    for(const v of data?.hourly?.[`precipitation_previous_day${d}`]||[])if(finite(v)!=null)n++;
    for(const v of data?.hourly?.[`weather_code_previous_day${d}`]||[])if(finite(v)!=null)n++;
  }
  return n;
}
function regimeUrl(start,end){
  const q=new URLSearchParams({
    latitude:SENTINELS.map(x=>x.lat).join(','),longitude:SENTINELS.map(x=>x.lon).join(','),
    start_date:start,end_date:end,timezone:'UTC',timeformat:'unixtime',hourly:REGIME_FIELDS.join(','),models:'ecmwf_ifs025'
  });
  return `${HISTORICAL}?${q}`;
}

async function stationCandidates(loc,start,end){
  const d=1.25;
  const q=new URLSearchParams({f:'json',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,limit:'500'});
  const data=await fetchJson(`${ECCC}/collections/climate-stations/items?${q}`,2,30000);
  const startMs=new Date(`${start}T00:00:00Z`).getTime(),endMs=new Date(`${end}T23:59:59Z`).getTime(),out=[];
  for(const f of data.features||[]){
    const p=f.properties||{},c=f.geometry?.coordinates;
    if(!Array.isArray(c)||!p.CLIMATE_IDENTIFIER)continue;
    const first=utcMs(p.HLY_FIRST_DATE),last=utcMs(p.HLY_LAST_DATE);
    if(first==null||last==null||first>startMs||last<Math.min(endMs,Date.now()-DAY))continue;
    const candidate={id:String(p.CLIMATE_IDENTIFIER),name:String(p.STATION_NAME||p.CLIMATE_IDENTIFIER),lat:Number(c[1]),lon:Number(c[0])};
    candidate.distanceKm=haversine(loc,candidate);out.push(candidate);
  }
  return out.sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,10);
}
async function stationHours(station,start,end){
  const out=new Map();let offset=0;
  while(true){
    const q=new URLSearchParams({f:'json',CLIMATE_IDENTIFIER:station.id,datetime:`${start}T00:00:00Z/${end}T23:59:59Z`,limit:'10000',offset:String(offset)});
    const data=await fetchJson(`${ECCC}/collections/climate-hourly/items?${q}`,2,30000);
    for(const f of data.features||[]){
      const p=f.properties||{},ms=utcMs(p.UTC_DATE);if(ms==null)continue;
      const mm=finite(p.PRECIP_AMOUNT),desc=String(p.WEATHER_ENG_DESC||'');
      const hasWeather=desc&&desc.toUpperCase()!=='NA';
      if(mm==null&&!hasWeather)continue;
      out.set(roundHour(ms),{wet:(mm!=null&&mm>=WET_MM)||WEATHER_WORDS.test(desc),amount:mm==null?null:Math.max(0,mm),desc});
    }
    const n=data.features?.length||0;if(n<10000)break;offset+=n;
  }
  return out;
}
async function truthForLocation(loc,start,end,expectedHours){
  const candidates=await stationCandidates(loc,start,end);
  let best=null;
  for(const station of candidates){
    try{
      const hours=await stationHours(station,start,end);
      const quality=hours.size/Math.max(1,expectedHours);
      if(!best||hours.size>best.hours.size)best={station,hours,quality};
      if(quality>=MIN_STATION_COVERAGE)return{station,hours,quality};
    }catch{}
  }
  return best&&best.hours.size?best:null;
}
async function loadTruthRange(state,chunk){
  const map=new Map(),expected=chunk.days*24;
  for(const loc of LOCATIONS){
    try{
      const result=await truthForLocation(loc,chunk.start,chunk.end,expected);
      if(!result){console.warn(`⚠ truth ${loc.name}: no usable station`);continue;}
      map.set(loc.id,result.hours);
      state.stations[loc.id]={...result.station,quality:+result.quality.toFixed(3)};
      console.log(`✓ truth ${loc.name}: ${result.station.name} (${result.station.distanceKm.toFixed(1)} km), ${result.hours.size} usable hours`);
    }catch(e){console.warn(`⚠ truth ${loc.name}: ${e.message}`);}
  }
  return map;
}

function emptyMetric(source,lead,bucket='all'){
  return{source,lead,bucket,samples:0,hits:0,misses:0,falseAlarms:0,correctDry:0,amountAbsSum:0,amountN:0,weightedSamples:0,weightedHits:0,weightedMisses:0,weightedFalseAlarms:0,weightedCorrectDry:0};
}
const metricKey=(source,lead,bucket)=>`${source}|${lead}|${bucket}`;
function scoreMetric(m,p,t,w){
  m.samples++;m.weightedSamples+=w;
  if(p.wet&&t.wet){m.hits++;m.weightedHits+=w;}
  else if(p.wet&&!t.wet){m.falseAlarms++;m.weightedFalseAlarms+=w;}
  else if(!p.wet&&t.wet){m.misses++;m.weightedMisses+=w;}
  else{m.correctDry++;m.weightedCorrectDry+=w;}
  if(p.amount!=null&&t.amount!=null){m.amountAbsSum+=Math.abs(p.amount-t.amount);m.amountN++;}
}
function addScore(state,source,lead,bucket,p,t,w){
  const k=metricKey(source,lead,bucket),m=state.metrics[k]||emptyMetric(source,lead,bucket);
  scoreMetric(m,p,t,w);state.metrics[k]=m;
}
function summarise(m){
  const den=m.hits+m.misses+m.falseAlarms,wden=m.weightedHits+m.weightedMisses+m.weightedFalseAlarms;
  return{...m,
    accuracy:m.samples?(m.hits+m.correctDry)/m.samples:null,
    pod:m.hits+m.misses?m.hits/(m.hits+m.misses):null,
    far:m.hits+m.falseAlarms?m.falseAlarms/(m.hits+m.falseAlarms):null,
    csi:den?m.hits/den:null,
    weightedAccuracy:m.weightedSamples?(m.weightedHits+m.weightedCorrectDry)/m.weightedSamples:null,
    weightedCsi:wden?m.weightedHits/wden:null,
    amountMAE:m.amountN?m.amountAbsSum/m.amountN:null
  };
}

function coverageFor(state,id){
  return state.coverage[id]||(state.coverage[id]={attempts:0,successChunks:0,emptyChunks:0,failures:0,usableValues:0,scoredPairs:0,lastSuccess:null,lastError:null});
}
async function processSource(state,source,truthCache){
  const cursor=state.sourceCursors[source.id],chunk=chunkFrom(cursor,SOURCE_CHUNK_DAYS);
  if(!chunk)return{source:source.id,status:'caught-up',scored:0};
  const cov=coverageFor(state,source.id);cov.attempts++;
  let payloads;
  try{
    payloads=normaliseMulti(await fetchJson(previousUrl(source,chunk.start,chunk.end),3,40000),LOCATIONS.length);
  }catch(e){cov.failures++;cov.lastError=String(e.message||e);return{source:source.id,status:'retry',error:cov.lastError,scored:0};}
  const usable=countUsable(payloads);cov.usableValues+=usable;
  if(usable===0){
    cov.emptyChunks++;cov.successChunks++;cov.lastSuccess=iso(Date.now());cov.lastError=null;
    state.sourceCursors[source.id]=chunk.next;
    return{source:source.id,status:'empty-archive',scored:0,chunk};
  }
  const truthKey=`${chunk.start}|${chunk.end}`;
  if(!truthCache.has(truthKey))truthCache.set(truthKey,await loadTruthRange(state,chunk));
  const truthByLoc=truthCache.get(truthKey);
  if(truthByLoc.size<MIN_TRUTH_LOCATIONS){
    cov.failures++;cov.lastError=`only ${truthByLoc.size} truth locations`;
    return{source:source.id,status:'retry',error:cov.lastError,scored:0};
  }
  let scored=0;
  for(let li=0;li<LOCATIONS.length;li++){
    const loc=LOCATIONS[li],truth=truthByLoc.get(loc.id),data=payloads[li];if(!truth||!data)continue;
    for(let t=chunk.startMs;t<=chunk.endMs;t+=3600000){
      if(!SAMPLE_HOURS.includes(new Date(t).getUTCHours()))continue;
      const obs=truth.get(t);if(!obs)continue;
      for(const lead of LEADS){
        const pred=predictionAt(data,lead,t);if(!pred)continue;
        const w=recencyWeight(t);
        addScore(state,source.id,lead,'all',pred,obs,w);
        addScore(state,source.id,lead,`season:${season(t)}`,pred,obs,w);
        addScore(state,source.id,lead,`region:${loc.region}`,pred,obs,w);
        scored++;
      }
    }
  }
  if(scored===0){cov.failures++;cov.lastError='archive had values but produced zero scored pairs';return{source:source.id,status:'retry',scored:0};}
  cov.successChunks++;cov.scoredPairs+=scored;cov.lastSuccess=iso(Date.now());cov.lastError=null;
  state.sourceCursors[source.id]=chunk.next;
  return{source:source.id,status:'success',scored,usable,chunk};
}

function regimeVector(payloads,target){
  const vector=[];
  for(let i=0;i<SENTINELS.length;i++)for(const key of REGIME_FIELDS){
    const v=valueAt(payloads[i],key,target);vector.push(v==null?null:+v.toFixed(3));
  }
  const present=vector.filter(v=>v!=null).length;
  return present>=Math.ceil(vector.length*.7)?vector:null;
}
function outcomeSummary(truthByLoc,target){
  let wet=0,total=0,amount=0,amountN=0;
  for(const loc of LOCATIONS){
    const t=truthByLoc.get(loc.id)?.get(target);if(!t)continue;total++;if(t.wet)wet++;
    if(t.amount!=null){amount+=t.amount;amountN++;}
  }
  return total>=MIN_TRUTH_LOCATIONS?{stations:total,wetFraction:+(wet/total).toFixed(3),meanAmount:amountN?+(amount/amountN).toFixed(3):null}:null;
}
async function processRegime(state,truthCache){
  const chunk=chunkFrom(state.regimeCursor,REGIME_CHUNK_DAYS);if(!chunk)return{status:'caught-up',added:0};
  const cov=coverageFor(state,'regime');cov.attempts++;
  let payloads;
  try{payloads=normaliseMulti(await fetchJson(regimeUrl(chunk.start,chunk.end),3,45000),SENTINELS.length);}
  catch(e){cov.failures++;cov.lastError=String(e.message||e);return{status:'retry',error:cov.lastError,added:0};}
  const truthKey=`${chunk.start}|${chunk.end}`;
  if(!truthCache.has(truthKey))truthCache.set(truthKey,await loadTruthRange(state,chunk));
  const truthByLoc=truthCache.get(truthKey);
  if(truthByLoc.size<MIN_TRUTH_LOCATIONS){cov.failures++;cov.lastError=`only ${truthByLoc.size} truth locations`;return{status:'retry',added:0};}
  const known=new Set(state.analogs.map(a=>a.id));let added=0;
  for(let t=chunk.startMs;t<=chunk.endMs;t+=12*3600000){
    const vector=regimeVector(payloads,t),outcome=outcomeSummary(truthByLoc,t),id=String(t);
    if(!vector||!outcome||known.has(id))continue;
    state.analogs.push({id,at:t,season:season(t),vector,outcome});known.add(id);added++;
  }
  if(added===0){cov.failures++;cov.lastError='no complete atmospheric fingerprints';return{status:'retry',added:0};}
  state.analogs.sort((a,b)=>a.at-b.at);state.analogs=state.analogs.slice(-MAX_ANALOGS);
  cov.successChunks++;cov.scoredPairs+=added;cov.lastSuccess=iso(Date.now());cov.lastError=null;
  state.regimeCursor=chunk.next;
  return{status:'success',added,chunk};
}

function freshState(){
  return{
    version:VERSION,createdAt:iso(Date.now()),updatedAt:null,
    sourceCursors:Object.fromEntries(SOURCES.map(s=>[s.id,FORECAST_START])),regimeCursor:REGIME_START,
    metrics:{},coverage:{},stations:{},analogs:[],runs:0,lastRun:null
  };
}
async function loadState(){
  try{const state=JSON.parse(await fs.readFile(STATE_PATH,'utf8'));return state.version===VERSION?state:null;}catch{return null;}
}
function publicPayload(state){
  const summaries=Object.values(state.metrics).map(summarise),overall=summaries.filter(x=>x.bucket==='all'),byLead={};
  for(const lead of LEADS)byLead[lead]=overall.filter(x=>x.lead===lead).sort((a,b)=>(b.weightedCsi??-1)-(a.weightedCsi??-1));
  return{
    schema:2,generatedAt:state.updatedAt,runs:state.runs,sourceCursors:state.sourceCursors,regimeCursor:state.regimeCursor,
    analogCount:state.analogs.length,coverage:state.coverage,
    locations:LOCATIONS.map(({id,name,region})=>({id,name,region})),leads:LEADS,
    methodology:{forecastStart:FORECAST_START,regimeStart:REGIME_START,sourceChunkDays:SOURCE_CHUNK_DAYS,regimeChunkDays:REGIME_CHUNK_DAYS,recencyHalfLifeDays:HALF_LIFE_DAYS,sampleHoursUtc:SAMPLE_HOURS,truth:'ECCC climate-hourly',forecastArchive:'Open-Meteo Previous Runs',patternArchive:'Open-Meteo Historical Forecast ECMWF IFS'},
    note:'Missing archive values are never converted to dry forecasts. Each source advances independently only after a successful or genuinely empty archive chunk; failed downloads are retried.',
    byLead,seasonal:summaries.filter(x=>x.bucket.startsWith('season:')),regional:summaries.filter(x=>x.bucket.startsWith('region:'))
  };
}
const pct=v=>v==null?'—':`${(v*100).toFixed(1)}%`;
function report(pub,last){
  const lines=['# SkyMap Historical Forecast Intelligence — lossless v2','',`Updated: ${pub.generatedAt}`,`Runs: ${pub.runs} · atmospheric analogs: ${pub.analogCount}`,'','## Archive progress','', '| Source | Cursor | Successful chunks | Empty chunks | Failures | Scored pairs |','|---|---|---:|---:|---:|---:|'];
  for(const source of SOURCES){const c=pub.coverage[source.id]||{};lines.push(`| ${source.name} | ${pub.sourceCursors[source.id]} | ${c.successChunks||0} | ${c.emptyChunks||0} | ${c.failures||0} | ${c.scoredPairs||0} |`);}
  const rc=pub.coverage.regime||{};lines.push(`| Atmospheric analogs | ${pub.regimeCursor} | ${rc.successChunks||0} | ${rc.emptyChunks||0} | ${rc.failures||0} | ${rc.scoredPairs||0} |`,'');
  for(const lead of LEADS){
    lines.push(`## +${lead} h historical skill`,'','| Source | N | Accuracy | POD | FAR | CSI | Recency-weighted accuracy | Recency-weighted CSI | Amount MAE |','|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for(const m of pub.byLead[lead])lines.push(`| ${m.source} | ${m.samples} | ${pct(m.accuracy)} | ${pct(m.pod)} | ${pct(m.far)} | ${pct(m.csi)} | ${pct(m.weightedAccuracy)} | ${pct(m.weightedCsi)} | ${m.amountMAE==null?'—':m.amountMAE.toFixed(2)+' mm'} |`);
    lines.push('');
  }
  lines.push('Missing values are not interpreted as zero. A source that is absent from an early archive period contributes no score for that period. Network/API failures do not advance that source cursor, so the missing chunk is retried later.');
  if(last)lines.push('',`Last run: ${JSON.stringify(last)}`);
  return lines.join('\n');
}
async function selfTest(){
  if(finite(null)!==null||finite(undefined)!==null||finite('')!==null||finite(0)!==0)throw new Error('null-safety failed');
  const fake={hourly:{time:[1704067200],precipitation_previous_day1:[null],weather_code_previous_day1:[null]}};
  if(predictionAt(fake,24,1704067200000)!==null)throw new Error('missing forecast became dry');
  const m=emptyMetric('x',24);scoreMetric(m,{wet:true,amount:1},{wet:true,amount:.5},1);scoreMetric(m,{wet:true,amount:.2},{wet:false,amount:0},.5);
  const s=summarise(m);if(m.samples!==2||m.hits!==1||m.falseAlarms!==1)throw new Error('confusion matrix failed');
  if(Math.abs(s.weightedAccuracy-(1/1.5))>.0001)throw new Error('weighted accuracy failed');
  console.log('✓ lossless historical self-test passed');
}
async function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  await fs.mkdir('verification-history',{recursive:true});
  const state=(await loadState())||freshState(),truthCache=new Map(),sourceResults=[];
  for(const source of SOURCES){
    const result=await processSource(state,source,truthCache);sourceResults.push(result);
    console.log(`${result.status==='success'||result.status==='empty-archive'?'✓':'⚠'} ${source.name}: ${result.status}${result.scored?` · ${result.scored} pairs`:''}${result.error?` · ${result.error}`:''}`);
    await new Promise(r=>setTimeout(r,300));
  }
  const regime=await processRegime(state,truthCache);
  console.log(`${regime.status==='success'?'✓':'⚠'} atmospheric analogs: ${regime.status}${regime.added?` · ${regime.added} added`:''}${regime.error?` · ${regime.error}`:''}`);
  state.runs=(state.runs||0)+1;state.updatedAt=iso(Date.now());state.lastRun={at:state.updatedAt,sources:sourceResults,regime};
  const pub=publicPayload(state),md=report(pub,state.lastRun);
  await fs.writeFile(STATE_PATH,JSON.stringify(state));await fs.writeFile(PUBLIC_PATH,JSON.stringify(pub,null,2));await fs.writeFile(REPORT_PATH,md);
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,md+'\n');
  console.log('✓ lossless historical run complete');
}
await main();
