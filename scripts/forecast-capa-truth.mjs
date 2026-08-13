import fs from 'node:fs/promises';

const ECCC='https://api.weather.gc.ca';
const PREVIOUS='https://previous-runs-api.open-meteo.com/v1/forecast';
const COLLECTION='weather:rdpa:10km:6f';
const STATE_PATH='verification-capa/state.json';
const PUBLIC_PATH='verification-capa/public.json';
const VERSION=2;
const START='2024-01-01';
const CHUNK_DAYS=Number(process.env.CAPA_CHUNK_DAYS||14);
const SAFE_LAG_DAYS=10;
const LEADS=[24,48,72];
const DAY=86400000;
const HALF_LIFE_DAYS=365;
const WET_MM=.5;
const HEAVY_MM=5;
const ONTARIO_BBOX='-95.5,41.3,-73.0,50.5';
const LOCATIONS=[
  {id:'toronto',name:'Toronto',region:'GTA',lat:43.6532,lon:-79.3832},
  {id:'ottawa',name:'Ottawa',region:'Eastern Ontario',lat:45.4215,lon:-75.6972},
  {id:'hamilton',name:'Hamilton',region:'Golden Horseshoe',lat:43.2557,lon:-79.8711},
  {id:'london',name:'London',region:'Southwestern Ontario',lat:42.9849,lon:-81.2453},
  {id:'windsor',name:'Windsor',region:'Southwestern Ontario',lat:42.3149,lon:-83.0364},
  {id:'kingston',name:'Kingston',region:'Eastern Ontario',lat:44.2312,lon:-76.4860},
  {id:'sudbury',name:'Greater Sudbury',region:'Northeastern Ontario',lat:46.4917,lon:-80.9930},
  {id:'thunder-bay',name:'Thunder Bay',region:'Northwestern Ontario',lat:48.3809,lon:-89.2477}
];
const SOURCES=[
  {id:'best_match',model:null},
  {id:'gem',model:'gem_seamless'},
  {id:'ifs',model:'ecmwf_ifs025'},
  {id:'gfs',model:'gfs_seamless'},
  {id:'aifs',model:'ecmwf_aifs025_single'}
];
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const iso=v=>new Date(v).toISOString();
const dateOnly=v=>iso(v).slice(0,10);
const startDay=v=>new Date(`${dateOnly(v)}T00:00:00Z`).getTime();
const season=ms=>{const m=new Date(ms).getUTCMonth()+1;return m<=2||m===12?'winter':m<=5?'spring':m<=8?'summer':'autumn';};
const recencyWeight=(validAt,now=Date.now())=>Math.pow(.5,Math.max(0,(now-validAt)/DAY)/HALF_LIFE_DAYS);
async function fetchText(url,attempts=3,timeout=50000){let last;for(let i=1;i<=attempts;i++){try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout),headers:{'user-agent':'SkyMap-Ontario-CaPA-Truth/30'}});if(!r.ok)throw new Error(`HTTP ${r.status}: ${(await r.text().catch(()=>'' )).slice(0,220)}`);return await r.text();}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,900*i));}}throw last;}
const fetchJson=async(url,attempts=3,timeout=50000)=>JSON.parse(await fetchText(url,attempts,timeout));
function utcMs(v){if(v===null||v===undefined)return null;if(typeof v==='number')return v>1e12?v:v*1000;const n=Number(v);if(Number.isFinite(n)&&n>1e9)return n*1000;const ms=new Date(v).getTime();return Number.isFinite(ms)?ms:null;}
function chunk(cursor){const start=startDay(new Date(`${cursor}T00:00:00Z`).getTime()),safeEnd=startDay(Date.now()-SAFE_LAG_DAYS*DAY);if(start>safeEnd)return null;const end=Math.min(start+(CHUNK_DAYS-1)*DAY,safeEnd);return{startMs:start,endMs:end,start:dateOnly(start),end:dateOnly(end),next:dateOnly(end+DAY)};}
function analysisTimes(c){const out=[];for(let t=c.startMs;t<=c.endMs;t+=6*3600000)out.push(t);return out;}
function previousUrl(source,c){const vars=LEADS.map(l=>`precipitation_previous_day${l/24}`),q=new URLSearchParams({latitude:LOCATIONS.map(x=>x.lat).join(','),longitude:LOCATIONS.map(x=>x.lon).join(','),start_date:c.start,end_date:c.end,timezone:'UTC',timeformat:'unixtime',hourly:vars.join(','),cell_selection:'land'});if(source.model)q.set('models',source.model);return `${PREVIOUS}?${q}`;}
function multi(data){if(Array.isArray(data))return data;if(LOCATIONS.length===1&&data?.hourly)return[data];throw new Error(`expected ${LOCATIONS.length} coordinate responses`);}
function hourlyMap(data,key){const out=new Map(),times=data?.hourly?.time||[],vals=data?.hourly?.[key]||[];for(let i=0;i<times.length;i++){const t=utcMs(times[i]),v=finite(vals[i]);if(t!=null&&v!=null)out.set(t,Math.max(0,v));}return out;}
function sixHourTotal(map,end){let sum=0;for(let h=5;h>=0;h--){const v=map.get(end-h*3600000);if(v==null)return null;sum+=v;}return+sum.toFixed(3);}
function axisValues(axis){if(!axis)return[];if(Array.isArray(axis.values))return axis.values;if(axis.start!==undefined&&axis.stop!==undefined&&finite(axis.num)!=null&&Number(axis.num)>0){const n=Number(axis.num),a=finite(axis.start),b=finite(axis.stop);if(a!=null&&b!=null)return n===1?[a]:Array.from({length:n},(_,i)=>a+(b-a)*i/(n-1));const ta=utcMs(axis.start),tb=utcMs(axis.stop);if(ta!=null&&tb!=null)return n===1?[axis.start]:Array.from({length:n},(_,i)=>iso(ta+(tb-ta)*i/(n-1)));}return[];}
function coverage(data){if(data?.type==='Coverage')return data;if(data?.type==='CoverageCollection'&&data.coverages?.length)return data.coverages[0];if(data?.domain&&data?.ranges)return data;throw new Error(`unsupported CoverageJSON ${data?.type||'unknown'}`);}
function axisKey(axes,kind){const keys=Object.keys(axes||{});if(kind==='t')return keys.find(k=>/^(t|time)$/i.test(k))||keys.find(k=>/time/i.test(k));if(kind==='x')return keys.find(k=>/^(x|lon|longitude)$/i.test(k))||keys.find(k=>/lon/i.test(k));return keys.find(k=>/^(y|lat|latitude)$/i.test(k))||keys.find(k=>/lat/i.test(k));}
function nearest(values,target,time=false){let best=-1,d=Infinity;for(let i=0;i<values.length;i++){const v=time?utcMs(values[i]):finite(values[i]);if(v==null)continue;const x=Math.abs(v-target);if(x<d){d=x;best=i;}}return best;}
function flatten(names,shape,indices){let idx=0;for(let i=0;i<names.length;i++){let stride=1;for(let j=i+1;j<shape.length;j++)stride*=shape[j];idx+=(indices[names[i]]||0)*stride;}return idx;}
function rangeEntry(ranges,kind){
  const entries=Object.entries(ranges||{});
  const scored=entries.map(([key,value])=>{
    const label=`${key} ${JSON.stringify(value?.parameter||{})}`.toLowerCase();
    const score=kind==='precip'
      ?(/(^|[^a-z])apcp([^a-z]|$)|precip|rain/.test(label)?3:0)
      :(/quality|confidence|quality index|(^|[^a-z])qi([^a-z]|$)/.test(label)?3:0);
    return{key,value,score};
  }).sort((a,b)=>b.score-a.score);
  if(scored[0]?.score>0)return scored[0].value;
  return kind==='precip'&&entries.length===1?entries[0][1]:null;
}
function distanceKm(loc,x,y){
  const lon=finite(x),lat=finite(y);
  if(lon==null||lat==null||Math.abs(lon)>180||Math.abs(lat)>90)return Infinity;
  const dx=(lon-loc.lon)*111.32*Math.cos(loc.lat*Math.PI/180),dy=(lat-loc.lat)*111.32;
  return Math.hypot(dx,dy);
}
function confidenceValue(quality,indices,axes){
  if(!quality?.values)return null;
  const names=quality.axisNames||[],shape=quality.shape||names.map(k=>axisValues(axes[k]).length);
  const raw=finite(quality.values[flatten(names,shape,indices)]);
  if(raw==null)return null;
  if(raw>=0&&raw<=1.5)return clamp(raw,0,1);
  if(raw>=0&&raw<=100)return clamp(raw/100,0,1);
  return null;
}
function gridSeries(data,loc,c){
  const out=new Map(),targets=analysisTimes(c),coverages=data?.type==='CoverageCollection'?(data.coverages||[]):[coverage(data)];
  for(const cov of coverages){
    const axes=cov.domain?.axes||{},tk=axisKey(axes,'t'),xk=axisKey(axes,'x'),yk=axisKey(axes,'y');
    if(!xk||!yk)continue;
    const xv=axisValues(axes[xk]),yv=axisValues(axes[yk]),tv=tk?axisValues(axes[tk]):[];
    if(!xv.length||!yv.length)continue;
    const precip=rangeEntry(cov.ranges,'precip'),quality=rangeEntry(cov.ranges,'quality');
    if(!precip?.values)continue;
    const names=precip.axisNames||[tk,yk,xk].filter(Boolean),shape=precip.shape||names.map(k=>axisValues(axes[k]).length);
    for(const validAt of targets){
      const ti=tk?nearest(tv,validAt,true):0;
      if(tk&&(ti<0||Math.abs((utcMs(tv[ti])??Infinity)-validAt)>3*3600000))continue;
      let best=null;
      for(let yi=0;yi<yv.length;yi++)for(let xi=0;xi<xv.length;xi++){
        const indices={[xk]:xi,[yk]:yi};
        if(tk)indices[tk]=ti;
        const amount=finite(precip.values[flatten(names,shape,indices)]);
        if(amount==null)continue;
        const km=distanceKm(loc,xv[xi],yv[yi]);
        if(!best||km<best.km)best={amount:Math.max(0,amount),confidence:confidenceValue(quality,indices,axes),km};
      }
      if(best&&best.km<=30)out.set(validAt,best);
    }
  }
  return out;
}
function pointTruthUrl(loc,validAt){
  const radius=.18,bbox=[loc.lon-radius,loc.lat-radius,loc.lon+radius,loc.lat+radius].map(v=>v.toFixed(4)).join(',');
  const datetime=iso(validAt).replace('.000Z','Z');
  return `${ECCC}/collections/${COLLECTION}/coverage?${new URLSearchParams({f:'json',bbox,datetime})}`;
}
async function loadTruth(c){
  const out=new Map(),times=analysisTimes(c),minimum=Math.max(2,Math.floor(times.length*.5));
  let accepted=0,failed=0;
  for(const loc of LOCATIONS){
    const series=new Map();
    let requestFailures=0;
    for(let i=0;i<times.length;i+=3){
      const batch=times.slice(i,i+3);
      const rows=await Promise.all(batch.map(async validAt=>{
        try{
          const payload=await fetchJson(pointTruthUrl(loc,validAt),3,55000);
          return[validAt,gridSeries(payload,loc,{startMs:validAt,endMs:validAt}).get(validAt)||null,null];
        }catch(e){return[validAt,null,String(e.message||e)];}
      }));
      for(const [validAt,value,error]of rows){
        if(value)series.set(validAt,value);
        else if(error){requestFailures++;if(requestFailures<=2)console.warn(`⚠ RDPA ${loc.id} ${iso(validAt)}: ${error}`);}
      }
      await new Promise(r=>setTimeout(r,180));
    }
    if(series.size>=minimum){out.set(loc.id,series);accepted++;}
    else{failed++;console.warn(`⚠ RDPA ${loc.id}: only ${series.size}/${times.length} usable analyses · ${requestFailures} request failures`);}
  }
  console.log(`✓ RDPA point truth: ${accepted}/${LOCATIONS.length} locations usable · ${failed} failed`);
  return out;
}
function emptyMetric(source,lead,bucket){return{source,lead,bucket,samples:0,weightedSamples:0,absErrSum:0,weightedAbsErrSum:0,sqErrSum:0,biasSum:0,weightedBiasSum:0,hits:0,misses:0,falseAlarms:0,correctDry:0,heavyHits:0,heavyMisses:0,heavyFalseAlarms:0,heavyCorrectDry:0};}
const metricKey=(s,l,b)=>`${s}|${l}|${b}`;
function scoreMetric(m,fcst,truth,w){const err=fcst-truth;m.samples++;m.weightedSamples+=w;m.absErrSum+=Math.abs(err);m.weightedAbsErrSum+=Math.abs(err)*w;m.sqErrSum+=err*err;m.biasSum+=err;m.weightedBiasSum+=err*w;const fw=fcst>=WET_MM,tw=truth>=WET_MM;if(fw&&tw)m.hits++;else if(fw&&!tw)m.falseAlarms++;else if(!fw&&tw)m.misses++;else m.correctDry++;const fh=fcst>=HEAVY_MM,th=truth>=HEAVY_MM;if(fh&&th)m.heavyHits++;else if(fh&&!th)m.heavyFalseAlarms++;else if(!fh&&th)m.heavyMisses++;else m.heavyCorrectDry++;}
function addScore(state,source,lead,bucket,fcst,truth,w){const k=metricKey(source,lead,bucket),m=state.metrics[k]||emptyMetric(source,lead,bucket);scoreMetric(m,fcst,truth,w);state.metrics[k]=m;}
function summarise(m){const csiD=m.hits+m.misses+m.falseAlarms,hcsiD=m.heavyHits+m.heavyMisses+m.heavyFalseAlarms;return{...m,mae:m.samples?m.absErrSum/m.samples:null,weightedMAE:m.weightedSamples?m.weightedAbsErrSum/m.weightedSamples:null,rmse:m.samples?Math.sqrt(m.sqErrSum/m.samples):null,bias:m.samples?m.biasSum/m.samples:null,weightedBias:m.weightedSamples?m.weightedBiasSum/m.weightedSamples:null,csi:csiD?m.hits/csiD:null,pod:m.hits+m.misses?m.hits/(m.hits+m.misses):null,far:m.hits+m.falseAlarms?m.falseAlarms/(m.hits+m.falseAlarms):null,heavyCsi:hcsiD?m.heavyHits/hcsiD:null};}
function fresh(){return{schema:VERSION,createdAt:iso(Date.now()),updatedAt:null,runs:0,sourceCursors:Object.fromEntries(SOURCES.map(s=>[s.id,START])),coverage:{},metrics:{},lastRun:null};}
async function loadState(){try{const s=JSON.parse(await fs.readFile(STATE_PATH,'utf8'));return s.schema===VERSION?s:fresh();}catch{return fresh();}}
function cov(state,id){return state.coverage[id]||(state.coverage[id]={attempts:0,success:0,empty:0,failures:0,pairs:0,lastError:null});}
async function processSource(state,source,truthCache){const c=chunk(state.sourceCursors[source.id]);if(!c)return{source:source.id,status:'caught-up',pairs:0};const coverage=cov(state,source.id);coverage.attempts++;let payload;try{payload=multi(await fetchJson(previousUrl(source,c),3,50000));}catch(e){coverage.failures++;coverage.lastError=String(e.message||e);return{source:source.id,status:'retry',pairs:0,error:coverage.lastError};}let usable=0;for(const data of payload)for(const lead of LEADS)usable+=hourlyMap(data,`precipitation_previous_day${lead/24}`).size;if(!usable){coverage.empty++;coverage.success++;coverage.lastError=null;state.sourceCursors[source.id]=c.next;return{source:source.id,status:'empty',pairs:0};}const tk=`${c.start}|${c.end}`;if(!truthCache.has(tk))truthCache.set(tk,await loadTruth(c));const truth=truthCache.get(tk);if(truth.size<6){coverage.failures++;coverage.lastError=`RDPA truth usable for only ${truth.size}/${LOCATIONS.length} locations`;return{source:source.id,status:'retry',pairs:0,error:coverage.lastError};}let pairs=0;for(let li=0;li<LOCATIONS.length;li++){const loc=LOCATIONS[li],series=truth.get(loc.id),data=payload[li];if(!series||!data)continue;const maps=Object.fromEntries(LEADS.map(lead=>[lead,hourlyMap(data,`precipitation_previous_day${lead/24}`)]));for(const [validAt,obs]of series){for(const lead of LEADS){const fcst=sixHourTotal(maps[lead],validAt);if(fcst==null)continue;const confidenceWeight=obs.confidence==null?1:(.5+.5*obs.confidence),w=recencyWeight(validAt)*confidenceWeight;for(const bucket of ['all',`region:${loc.region}`,`season:${season(validAt)}`])addScore(state,source.id,lead,bucket,fcst,obs.amount,w);pairs++;}}}if(!pairs){coverage.failures++;coverage.lastError='zero RDPA/model amount pairs';return{source:source.id,status:'retry',pairs:0,error:coverage.lastError};}coverage.success++;coverage.pairs+=pairs;coverage.lastError=null;state.sourceCursors[source.id]=c.next;return{source:source.id,status:'success',pairs};}
function publicPayload(state){const all=Object.values(state.metrics).map(summarise);return{schema:2,generatedAt:state.updatedAt,runs:state.runs,sourceCursors:state.sourceCursors,truth:{name:'ECCC RDPA/CaPA final six-hour precipitation analysis',collection:COLLECTION,resolutionKm:10,wetThresholdMm6h:WET_MM,heavyThresholdMm6h:HEAVY_MM,method:'one small geographic coverage requested per Ontario verification point for each chunk; all explicit 00/06/12/18 UTC final-analysis times sampled from that response',note:'Regional amount truth only. Exact-point presence/timing remains radar/station verified.'},coverage:state.coverage,byLead:Object.fromEntries(LEADS.map(lead=>[lead,all.filter(m=>m.bucket==='all'&&m.lead===lead).sort((a,b)=>(a.weightedMAE??Infinity)-(b.weightedMAE??Infinity))])),seasonal:all.filter(m=>m.bucket.startsWith('season:')),regional:all.filter(m=>m.bucket.startsWith('region:'))};}
async function selfTest(){if(finite(null)!==null||finite('')!==null)throw new Error('null safety failed');const synthetic={type:'Coverage',domain:{axes:{t:{values:['2024-01-01T00:00:00Z']},y:{values:[43.5,43.65,43.8]},x:{values:[-79.6,-79.38,-79.2]}}},ranges:{APCP:{axisNames:['t','y','x'],shape:[1,3,3],values:Array.from({length:9},(_,i)=>i)},QUALITY:{axisNames:['t','y','x'],shape:[1,3,3],values:Array(9).fill(80)}}},sampleChunk={startMs:Date.parse('2024-01-01T00:00:00Z'),endMs:Date.parse('2024-01-01T00:00:00Z')},vals=gridSeries(synthetic,LOCATIONS[0],sampleChunk);if(vals.size!==1||vals.values().next().value?.amount==null)throw new Error('RDPA CoverageJSON point sampler failed');const map=new Map();for(let h=0;h<6;h++)map.set(h*3600000,1);if(sixHourTotal(map,5*3600000)!==6)throw new Error('6h forecast accumulator failed');const c={startMs:Date.parse('2024-01-01T00:00:00Z'),endMs:Date.parse('2024-01-02T00:00:00Z')};if(analysisTimes(c).length!==5)throw new Error('analysis clock failed');console.log('✓ CaPA/RDPA truth engine v2 self-test passed');}
async function main(){if(process.argv.includes('--self-test'))return selfTest();await fs.mkdir('verification-capa',{recursive:true});const state=await loadState(),truthCache=new Map(),results=[];for(const source of SOURCES){const r=await processSource(state,source,truthCache);results.push(r);console.log(`${r.status==='success'||r.status==='empty'||r.status==='caught-up'?'✓':'⚠'} CaPA ${source.id}: ${r.status}${r.pairs?` · ${r.pairs} pairs`:''}${r.error?` · ${r.error}`:''}`);await new Promise(r=>setTimeout(r,180));}state.runs++;state.updatedAt=iso(Date.now());state.lastRun={at:state.updatedAt,results};await fs.writeFile(STATE_PATH,JSON.stringify(state));await fs.writeFile(PUBLIC_PATH,JSON.stringify(publicPayload(state),null,2));console.log('✓ CaPA/RDPA precipitation truth run complete');if(process.argv.includes('--smoke')){const total=results.reduce((s,r)=>s+(r.pairs||0),0),success=results.filter(r=>r.status==='success').length;if(success<3||total<100)throw new Error(`CaPA smoke insufficient: ${success} sources, ${total} pairs`);console.log(`✓ live CaPA smoke: ${success} forecast archives · ${total} six-hour RDPA pairs`);}}
await main();
