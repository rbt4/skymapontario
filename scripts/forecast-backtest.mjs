import fs from 'node:fs/promises';

const ECCC = 'https://api.weather.gc.ca';
const GEOMET = 'https://geo.weather.gc.ca/geomet';
const OPEN_METEO = 'https://api.open-meteo.com/v1';
const STATE_PATH = 'verification-data/state.json';
const PUBLIC_PATH = 'verification-data/public.json';
const REPORT_PATH = 'verification-data/report.md';
const VERSION = 1;
const WET_MM = 0.2;
const VERIFY_DELAY_HOURS = 8;
const MAX_PENDING_AGE_DAYS = 10;
const LEADS = [6, 12, 24, 48, 72];
const LOCATIONS = [
  { id:'toronto', name:'Toronto', lat:43.6532, lon:-79.3832 },
  { id:'ottawa', name:'Ottawa', lat:45.4215, lon:-75.6972 },
  { id:'hamilton', name:'Hamilton', lat:43.2557, lon:-79.8711 },
  { id:'london', name:'London', lat:42.9849, lon:-81.2453 },
  { id:'windsor', name:'Windsor', lat:42.3149, lon:-83.0364 },
  { id:'kingston', name:'Kingston', lat:44.2312, lon:-76.4860 },
  { id:'sudbury', name:'Greater Sudbury', lat:46.4917, lon:-80.9930 },
  { id:'thunder-bay', name:'Thunder Bay', lat:48.3809, lon:-89.2477 }
];
const MODELS = [
  { id:'gem', name:'GEM', endpoint:'gem', model:'gem_seamless' },
  { id:'ifs', name:'ECMWF IFS', endpoint:'ecmwf', model:'ecmwf_ifs025' },
  { id:'gfs', name:'GFS', endpoint:'gfs', model:'gfs_seamless' },
  { id:'aifs', name:'ECMWF AIFS', endpoint:'ecmwf', model:'ecmwf_aifs025_single' }
];
const PRECIP_CODES = new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
const WEATHER_WORDS = /(rain|drizzle|shower|snow|sleet|freezing|thunder|precip)/i;

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const finite = v => Number.isFinite(Number(v)) ? Number(v) : null;
const roundHour = value => { const d=new Date(value); d.setUTCMinutes(0,0,0); return d.getTime(); };
const iso = value => new Date(value).toISOString();
const english = value => value && typeof value === 'object' && 'en' in value ? value.en : value;

async function fetchText(url, attempts=3) {
  let last;
  for (let i=1;i<=attempts;i++) {
    try {
      const r = await fetch(url, { cache:'no-store', signal:AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      last=e; if (i<attempts) await new Promise(r=>setTimeout(r, i*700));
    }
  }
  throw last;
}
async function fetchJson(url, attempts=3) { return JSON.parse(await fetchText(url, attempts)); }
function haversine(a,b) {
  const R=6371, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const q=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}
function hourIndex(data, target) {
  const times=data?.hourly?.time||[]; let best=-1, delta=Infinity;
  times.forEach((t,i)=>{ const ms=Number(t)>1e9 ? Number(t)*1000 : new Date(t).getTime(); const d=Math.abs(ms-target); if(d<delta){best=i;delta=d;} });
  return delta<=75*60*1000 ? best : -1;
}
function meteoUrl(endpoint, model, loc) {
  const q=new URLSearchParams({
    latitude:String(loc.lat), longitude:String(loc.lon), timezone:'UTC', timeformat:'unixtime',
    forecast_days:'4', models:model,
    hourly:'precipitation,rain,showers,snowfall,weather_code'
  });
  return `${OPEN_METEO}/${endpoint}?${q}`;
}
function bestMatchUrl(loc) {
  const q=new URLSearchParams({
    latitude:String(loc.lat), longitude:String(loc.lon), timezone:'UTC', timeformat:'unixtime',
    forecast_days:'4', cell_selection:'land',
    hourly:'precipitation_probability,precipitation,rain,showers,snowfall,weather_code'
  });
  return `${OPEN_METEO}/forecast?${q}`;
}
function parseModel(data,target) {
  const i=hourIndex(data,target); if(i<0) return null;
  const h=data.hourly, code=finite(h.weather_code?.[i])??0;
  const precip=Math.max(0, finite(h.precipitation?.[i])??0, (finite(h.rain?.[i])??0)+(finite(h.showers?.[i])??0), (finite(h.snowfall?.[i])??0)*0.7);
  return { wet:precip>=WET_MM||PRECIP_CODES.has(code), amount:+precip.toFixed(3), probability:null, windowHours:1 };
}
function parseBest(data,target) {
  const p=parseModel(data,target); if(!p) return null;
  const i=hourIndex(data,target), pop=finite(data.hourly?.precipitation_probability?.[i]);
  return {...p, probability:pop==null?null:clamp(pop,0,100)};
}
function parseOfficialFeature(feature, loc) {
  if(!feature) return null;
  const coords=feature.geometry?.coordinates;
  const distance=Array.isArray(coords)?haversine(loc,{lat:Number(coords[1]),lon:Number(coords[0])}):999;
  return {feature,distance};
}
async function getOfficial(loc) {
  const d=.55;
  const q=new URLSearchParams({f:'json',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,limit:'12'});
  const data=await fetchJson(`${ECCC}/collections/citypageweather-realtime/items?${q}`,2);
  return (data.features||[]).map(f=>parseOfficialFeature(f,loc)).filter(Boolean).sort((a,b)=>a.distance-b.distance)[0]?.feature||null;
}
function officialAt(feature,target) {
  const hours=feature?.properties?.hourlyForecastGroup?.hourlyForecasts||[];
  let best=null,delta=Infinity;
  for(const h of hours){
    const t=new Date(english(h.timestamp)).getTime(); if(!Number.isFinite(t))continue;
    const d=Math.abs(t-target); if(d<delta){best=h;delta=d;}
  }
  if(!best||delta>75*60*1000)return null;
  const pop=finite(english(best.lop?.value));
  const condition=String(english(best.condition)||'');
  const prob=pop==null?null:clamp(pop,0,100);
  return {wet:WEATHER_WORDS.test(condition)||(prob!=null&&prob>=50),amount:null,probability:prob,windowHours:1};
}
function layerBlock(xml, layer) {
  const idx=xml.indexOf(`<Name>${layer}</Name>`); if(idx<0)return '';
  const start=xml.lastIndexOf('<Layer',idx), end=xml.indexOf('</Layer>',idx);
  return start>=0&&end>idx?xml.slice(start,end+8):'';
}
function timeDimension(xml,layer){
  return layerBlock(xml,layer).match(/<(?:Dimension|Extent)\b[^>]*name=["']time["'][^>]*>([^<]+)<\/(?:Dimension|Extent)>/i)?.[1]?.trim()||'';
}
function nearestLayerTime(dimension,target,stepHours=1){
  if(!dimension)return null;
  if(dimension.includes(',')){
    const vals=dimension.split(',').map(s=>s.trim()).filter(Boolean);
    return vals.reduce((best,v)=>Math.abs(new Date(v)-target)<Math.abs(new Date(best)-target)?v:best,vals[0]);
  }
  const [start,end,period]=dimension.split('/');
  const s=new Date(start).getTime(), e=new Date(end).getTime();
  if(!Number.isFinite(s)||!Number.isFinite(e))return null;
  const match=period?.match(/PT(\d+)H/);
  const step=(match?Number(match[1]):stepHours)*3600000;
  const ms=clamp(s+Math.round((target-s)/step)*step,s,e);
  return iso(ms).replace('.000Z','Z');
}
async function capability(layer){
  const q=new URLSearchParams({service:'WMS',version:'1.3.0',request:'GetCapabilities'});
  const xml=await fetchText(`${GEOMET}?${q}`,2);
  return timeDimension(xml,layer);
}
function extractFeatureValue(data){
  const props=data?.features?.[0]?.properties; if(!props)return null;
  const entries=Object.entries(props);
  const good=([k,v])=>!/(time|date|lat|lon|x|y|id|index)/i.test(k)&&Number.isFinite(Number(v));
  const pref=entries.find(e=>/(value|prob|precip|rain|band|pixel)/i.test(e[0])&&good(e));
  return finite((pref||entries.find(good))?.[1]);
}
async function geometPoint(layer,style,dimension,loc,target,stepHours=1){
  const time=nearestLayerTime(dimension,target,stepHours); if(!time)return null;
  const d=.08, q=new URLSearchParams({
    service:'WMS',request:'GetFeatureInfo',version:'1.1.1',layers:layer,query_layers:layer,styles:style||'',
    srs:'EPSG:4326',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,width:'101',height:'101',x:'50',y:'50',
    info_format:'application/json',feature_count:'1',time
  });
  const data=await fetchJson(`${GEOMET}?${q}`,2);
  return extractFeatureValue(data);
}
async function loadState(){
  try { const s=JSON.parse(await fs.readFile(STATE_PATH,'utf8')); return s.version===VERSION?s:null; } catch { return null; }
}
function freshState(){return {version:VERSION,createdAt:iso(Date.now()),updatedAt:null,pending:[],metrics:{},runs:0,lastRun:null};}
function metricKey(source,lead){return `${source}|${lead}`;}
function emptyMetric(source,lead){return {source,lead,samples:0,hits:0,misses:0,falseAlarms:0,correctDry:0,brierSum:0,brierN:0,amountAbsSum:0,amountN:0};}
function score(metric,pred,truth){
  metric.samples++;
  if(pred.wet&&truth.wet)metric.hits++; else if(pred.wet&&!truth.wet)metric.falseAlarms++; else if(!pred.wet&&truth.wet)metric.misses++; else metric.correctDry++;
  if(pred.probability!=null){const p=pred.probability/100;metric.brierSum+=(p-(truth.wet?1:0))**2;metric.brierN++;}
  if(pred.amount!=null&&truth.amount!=null){metric.amountAbsSum+=Math.abs(pred.amount-truth.amount);metric.amountN++;}
}
function summarise(m){
  const acc=m.samples?(m.hits+m.correctDry)/m.samples:null;
  const pod=(m.hits+m.misses)?m.hits/(m.hits+m.misses):null;
  const far=(m.hits+m.falseAlarms)?m.falseAlarms/(m.hits+m.falseAlarms):null;
  const csi=(m.hits+m.misses+m.falseAlarms)?m.hits/(m.hits+m.misses+m.falseAlarms):null;
  return {...m,accuracy:acc,brier:m.brierN?m.brierSum/m.brierN:null,pod,far,csi,amountMAE:m.amountN?m.amountAbsSum/m.amountN:null};
}
async function climateTruth(loc,validAt,windowHours=1){
  const start=validAt-(windowHours-1)*3600000-45*60000, end=validAt+45*60000, d=.7;
  const q=new URLSearchParams({
    f:'json',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,
    datetime:`${iso(start)}/${iso(end)}`,limit:'250'
  });
  const data=await fetchJson(`${ECCC}/collections/climate-hourly/items?${q}`,2);
  const groups=new Map();
  for(const f of data.features||[]){
    const p=f.properties||{}, coords=f.geometry?.coordinates;
    if(!Array.isArray(coords))continue;
    const sid=String(p.CLIMATE_IDENTIFIER||p.STN_ID||p.STATION_NAME||'');
    if(!sid)continue;
    if(!groups.has(sid))groups.set(sid,{rows:[],distance:haversine(loc,{lat:Number(coords[1]),lon:Number(coords[0])}),station:p.STATION_NAME||sid});
    groups.get(sid).rows.push(p);
  }
  const choices=[...groups.values()].filter(g=>g.rows.length>=Math.max(1,windowHours-1)).sort((a,b)=>a.distance-b.distance);
  const best=choices[0]; if(!best)return null;
  let amount=0, amountN=0, wet=false;
  for(const p of best.rows){
    const mm=finite(p.PRECIP_AMOUNT); if(mm!=null){amount+=Math.max(0,mm);amountN++;}
    if((mm!=null&&mm>=WET_MM)||WEATHER_WORDS.test(String(p.WEATHER_ENG_DESC||'')))wet=true;
  }
  return {wet,amount:amountN?+amount.toFixed(3):null,station:best.station,distanceKm:+best.distance.toFixed(1),rows:best.rows.length};
}
async function verifyPending(state, now){
  const keep=[]; let verified=0;
  for(const record of state.pending){
    if(record.validAt>now-VERIFY_DELAY_HOURS*3600000){keep.push(record);continue;}
    if(now-record.validAt>MAX_PENDING_AGE_DAYS*86400000)continue;
    const loc=LOCATIONS.find(x=>x.id===record.locationId); if(!loc)continue;
    const truthCache=new Map(); let any=false;
    for(const [source,pred] of Object.entries(record.sources||{})){
      if(!pred)continue;
      const wh=pred.windowHours||1;
      if(!truthCache.has(wh)){
        try{truthCache.set(wh,await climateTruth(loc,record.validAt,wh));}catch{truthCache.set(wh,null);}
      }
      const truth=truthCache.get(wh); if(!truth)continue;
      const key=metricKey(source,record.lead); const metric=state.metrics[key]||emptyMetric(source,record.lead);
      score(metric,pred,truth); state.metrics[key]=metric; any=true;
    }
    if(any){verified++;} else {record.attempts=(record.attempts||0)+1;keep.push(record);}
  }
  state.pending=keep.slice(-3000);
  return verified;
}
async function collectLocation(loc, now, dimensions){
  const [best, official, ...modelData]=await Promise.all([
    fetchJson(bestMatchUrl(loc),2),
    getOfficial(loc).catch(()=>null),
    ...MODELS.map(m=>fetchJson(meteoUrl(m.endpoint,m.model,loc),2).catch(()=>null))
  ]);
  const records=[];
  for(const lead of LEADS){
    const target=roundHour(now+lead*3600000), sources={};
    sources.best_match=parseBest(best,target);
    MODELS.forEach((m,i)=>{sources[m.id]=modelData[i]?parseModel(modelData[i],target):null;});
    sources.official=officialAt(official,target);
    if(lead<=48){
      const v=await geometPoint('HRDPS.CONTINENTAL.DIAG_PR_PT1H','RDPA-WXO',dimensions.hrdps,loc,target,1).catch(()=>null);
      if(v!=null)sources.hrdps={wet:v>=WET_MM,amount:+Math.max(0,v).toFixed(3),probability:null,windowHours:1};
    }
    if(lead>=12&&lead<=72){
      const v=await geometPoint('REPS.DIAG.3_PRMM.ERGE1','REPS_PROB-LINEAR',dimensions.reps,loc,target,3).catch(()=>null);
      if(v!=null)sources.reps={wet:v>=50,amount:null,probability:clamp(v,0,100),windowHours:3};
    }
    records.push({id:`${loc.id}|${target}|${lead}`,madeAt:now,validAt:target,lead,locationId:loc.id,sources});
  }
  return records;
}
function publicPayload(state){
  const metrics=Object.values(state.metrics).map(summarise);
  const byLead={};
  for(const lead of LEADS){
    byLead[lead]=metrics.filter(m=>m.lead===lead).sort((a,b)=>{
      const score=x=>x.samples<20?-1:(x.brier!=null?1-x.brier:(x.csi??0));
      return score(b)-score(a);
    });
  }
  return {
    schema:1,generatedAt:state.updatedAt,runs:state.runs,pending:state.pending.length,
    locations:LOCATIONS.map(({id,name})=>({id,name})),leads:LEADS,
    note:'Experimental verification. Rankings are withheld until a source/lead pair has at least 20 verified samples. Station observations and gridded forecasts are not spatially identical.',
    byLead
  };
}
function report(publicData, verified, added){
  const lines=['# SkyMap Forecast Verification','',`Updated: ${publicData.generatedAt}`,`Runs: ${publicData.runs} · verified this run: ${verified} · predictions added: ${added} · pending: ${publicData.pending}`,''];
  for(const lead of LEADS){
    lines.push(`## +${lead} h`,'','| Source | N | Accuracy | POD | FAR | CSI | Brier | Amount MAE |','|---|---:|---:|---:|---:|---:|---:|---:|');
    for(const m of publicData.byLead[lead]){
      const pct=v=>v==null?'—':`${(v*100).toFixed(1)}%`;
      lines.push(`| ${m.source} | ${m.samples} | ${pct(m.accuracy)} | ${pct(m.pod)} | ${pct(m.far)} | ${pct(m.csi)} | ${m.brier==null?'—':m.brier.toFixed(3)} | ${m.amountMAE==null?'—':m.amountMAE.toFixed(2)+' mm'} |`);
    }
    lines.push('');
  }
  lines.push('Metrics: POD = probability of detection; FAR = false alarm ratio; CSI = critical success index. Brier is only calculated for probabilistic sources.');
  return lines.join('\n');
}
async function selfTest(){
  const m=emptyMetric('x',24);
  score(m,{wet:true,probability:80,amount:1,windowHours:1},{wet:true,amount:.5});
  score(m,{wet:true,probability:70,amount:.2,windowHours:1},{wet:false,amount:0});
  const s=summarise(m);
  if(m.hits!==1||m.falseAlarms!==1||m.samples!==2)throw new Error('confusion test failed');
  if(Math.abs(s.brier-(.04+.49)/2)>.0001)throw new Error('brier test failed');
  if(Math.abs(s.amountMAE-.35)>.0001)throw new Error('amount MAE test failed');
  console.log('✓ forecast backtester self-test passed');
}
async function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  await fs.mkdir('verification-data',{recursive:true});
  const now=Date.now(), state=(await loadState())||freshState();
  const verified=await verifyPending(state,now);
  const [hrdps,reps]=await Promise.all([
    capability('HRDPS.CONTINENTAL.DIAG_PR_PT1H'),
    capability('REPS.DIAG.3_PRMM.ERGE1')
  ]);
  let added=0;
  for(const loc of LOCATIONS){
    try{
      const records=await collectLocation(loc,now,{hrdps,reps});
      const existing=new Set(state.pending.map(r=>r.id));
      for(const r of records)if(!existing.has(r.id)){state.pending.push(r);added++;}
      console.log(`✓ ${loc.name}: ${records.length} lead windows collected`);
    }catch(e){console.warn(`⚠ ${loc.name}: ${e.message}`);}
    await new Promise(r=>setTimeout(r,250));
  }
  state.runs=(state.runs||0)+1; state.updatedAt=iso(now); state.lastRun={at:state.updatedAt,verified,added};
  const pub=publicPayload(state), md=report(pub,verified,added);
  await fs.writeFile(STATE_PATH,JSON.stringify(state));
  await fs.writeFile(PUBLIC_PATH,JSON.stringify(pub,null,2));
  await fs.writeFile(REPORT_PATH,md);
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,md+'\n');
  console.log(`✓ verification run complete: ${verified} verified, ${added} added, ${state.pending.length} pending`);
}
await main();
