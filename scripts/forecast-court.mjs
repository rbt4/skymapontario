import fs from 'node:fs/promises';

const ECCC='https://api.weather.gc.ca';
const OPEN='https://api.open-meteo.com/v1';
const STATE_PATH='verification-court/state.json';
const PUBLIC_PATH='verification-court/public.json';
const CHALLENGER_PATH='verification-court/challenger.json';
const VERSION=1;
const VERIFY_DELAY_HOURS=8;
const MAX_PENDING_AGE_DAYS=10;
const WET_MM=.2;
const LEADS=[24,48,72];
const MAX_PENDING=1800;
const BASE={gem:.38,ifs:.27,gfs:.19,aifs:.16};
const MODELS=[
  {id:'gem',endpoint:'gem',model:'gem_seamless'},
  {id:'ifs',endpoint:'ecmwf',model:'ecmwf_ifs025'},
  {id:'gfs',endpoint:'gfs',model:'gfs_seamless'},
  {id:'aifs',endpoint:'ecmwf',model:'ecmwf_aifs025_single'}
];
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
const PRECIP_CODES=new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
const WEATHER_WORDS=/(rain|drizzle|shower|snow|sleet|freezing|thunder|precip)/i;
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const iso=v=>new Date(v).toISOString();
const roundHour=v=>{const d=new Date(v);d.setUTCMinutes(0,0,0);return d.getTime();};

async function fetchText(url,attempts=3,timeout=35000){let last;for(let i=1;i<=attempts;i++){try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,800*i));}}throw last;}
const fetchJson=async(url,attempts=3)=>JSON.parse(await fetchText(url,attempts));
function haversine(a,b){const R=6371,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function hourIndex(data,target){const times=data?.hourly?.time||[];let best=-1,delta=Infinity;for(let i=0;i<times.length;i++){const raw=times[i],n=Number(raw),ms=Number.isFinite(n)&&n>1e9?n*1000:new Date(raw).getTime(),d=Math.abs(ms-target);if(Number.isFinite(ms)&&d<delta){best=i;delta=d;}}return delta<=75*60000?best:-1;}
function modelUrl(model){const q=new URLSearchParams({latitude:LOCATIONS.map(x=>x.lat).join(','),longitude:LOCATIONS.map(x=>x.lon).join(','),timezone:'UTC',timeformat:'unixtime',forecast_days:'4',models:model.model,hourly:'precipitation,rain,showers,snowfall,weather_code'});return `${OPEN}/${model.endpoint}?${q}`;}
function normaliseMulti(data){if(Array.isArray(data))return data;if(LOCATIONS.length===1&&data?.hourly)return[data];throw new Error(`expected ${LOCATIONS.length} coordinate responses`);}
function parseModel(data,target){const i=hourIndex(data,target);if(i<0)return null;const h=data?.hourly||{},p=finite(h.precipitation?.[i]),rain=finite(h.rain?.[i]),showers=finite(h.showers?.[i]),snow=finite(h.snowfall?.[i]),code=finite(h.weather_code?.[i]);if([p,rain,showers,snow,code].every(v=>v==null))return null;const amounts=[];if(p!=null)amounts.push(Math.max(0,p));if(rain!=null||showers!=null)amounts.push(Math.max(0,(rain||0)+(showers||0)));if(snow!=null)amounts.push(Math.max(0,snow*.7));const amount=amounts.length?Math.max(...amounts):null;return{wet:(amount!=null&&amount>=WET_MM)||(code!=null&&PRECIP_CODES.has(code)),amount:amount==null?null:+amount.toFixed(3),code};}

function saneWeights(raw){if(!raw||typeof raw!=='object')return null;const out={};for(const id of Object.keys(BASE)){const item=raw[id],v=finite(item?.weight??item);if(v==null||v<=0)return null;const lo=BASE[id]*.80,hi=BASE[id]*1.20;if(v<lo||v>hi)return null;out[id]=v;}const sum=Object.values(out).reduce((s,v)=>s+v,0);if(sum<.95||sum>1.05)return null;for(const id of Object.keys(out))out[id]/=sum;return out;}
function weightsFor(challenger,lead){return saneWeights(challenger?.proposedByLead?.[String(lead)]||challenger?.proposedByLead?.[lead])||BASE;}
function evidenceFor(challenger,lead){const row=challenger?.proposedByLead?.[String(lead)]||challenger?.proposedByLead?.[lead]||{};return Math.min(...Object.keys(BASE).map(id=>finite(row[id]?.samples)||0));}
function historicalCoverage(challenger){
  const rows=Object.fromEntries(LEADS.map(lead=>[lead,challenger?.proposedByLead?.[String(lead)]||challenger?.proposedByLead?.[lead]||{}]));
  const supportedModels=Object.keys(BASE).filter(id=>LEADS.every(lead=>(finite(rows[lead][id]?.samples)||0)>=500));
  const unsupportedModels=Object.keys(BASE).filter(id=>!supportedModels.includes(id));
  const weights=Object.fromEntries(LEADS.map(lead=>[lead,weightsFor(challenger,lead)]));
  const unsupportedModelsFrozen=unsupportedModels.every(id=>LEADS.every(lead=>Math.abs(weights[lead][id]-BASE[id])<=.003));
  const evidence=supportedModels.flatMap(id=>LEADS.map(lead=>finite(rows[lead][id]?.samples)||0));
  const minimumSupportedEvidence=evidence.length?Math.min(...evidence):0;
  return{ready:supportedModels.length>=3&&unsupportedModelsFrozen,supportedModels,unsupportedModels,unsupportedModelsFrozen,minimumSupportedEvidence};
}
function blend(inputs,weights){const ids=Object.keys(BASE).filter(id=>inputs[id]);if(ids.length<3)return null;let p=0,weightSeen=0,amount=0,amountWeight=0;for(const id of ids){const w=weights[id]||0,one=inputs[id];weightSeen+=w;if(one.wet)p+=w;if(one.amount!=null){amount+=one.amount*w;amountWeight+=w;}}if(weightSeen<.65)return null;const probability=100*p/weightSeen;return{wet:probability>=50,probability:+probability.toFixed(2),amount:amountWeight>0?+(amount/amountWeight).toFixed(3):null,models:ids.length};}
function weightsDifferent(a,b=BASE){return Object.keys(BASE).some(id=>Math.abs((a[id]||0)-b[id])>.003);}

async function loadChallenger(){try{return JSON.parse(await fs.readFile(CHALLENGER_PATH,'utf8'));}catch{return{generatedAt:null,approved:false,proposedByLead:{},reason:'challenger unavailable'};}}
function fresh(){return{schema:VERSION,createdAt:iso(Date.now()),updatedAt:null,runs:0,pending:[],metrics:{champion:{},challenger:{}},lastRun:null};}
async function loadState(){try{const x=JSON.parse(await fs.readFile(STATE_PATH,'utf8'));return x.schema===VERSION?x:fresh();}catch{return fresh();}}
function emptyMetric(lead){return{lead,samples:0,truthWet:0,hits:0,misses:0,falseAlarms:0,correctDry:0,brierSum:0,brierN:0,amountAbsSum:0,amountN:0};}
function addMetric(m,p,t){m.samples++;if(t.wet)m.truthWet++;if(p.wet&&t.wet)m.hits++;else if(p.wet&&!t.wet)m.falseAlarms++;else if(!p.wet&&t.wet)m.misses++;else m.correctDry++;const prob=finite(p.probability);if(prob!=null){const q=clamp(prob,0,100)/100;m.brierSum+=(q-(t.wet?1:0))**2;m.brierN++;}if(p.amount!=null&&t.amount!=null){m.amountAbsSum+=Math.abs(p.amount-t.amount);m.amountN++;}}
function summary(m){const csiD=m.hits+m.misses+m.falseAlarms,wetD=m.hits+m.misses,alarmD=m.hits+m.falseAlarms;return{...m,accuracy:m.samples?(m.hits+m.correctDry)/m.samples:null,pod:wetD?m.hits/wetD:null,missRate:wetD?m.misses/wetD:null,far:alarmD?m.falseAlarms/alarmD:null,csi:csiD?m.hits/csiD:null,brier:m.brierN?m.brierSum/m.brierN:null,amountMAE:m.amountN?m.amountAbsSum/m.amountN:null};}
function combined(metrics){const out=emptyMetric('all');for(const m of Object.values(metrics)){for(const k of ['samples','truthWet','hits','misses','falseAlarms','correctDry','brierSum','brierN','amountAbsSum','amountN'])out[k]+=m[k]||0;}return out;}
async function climateTruth(loc,validAt){const start=validAt-45*60000,end=validAt+45*60000,d=.7,q=new URLSearchParams({f:'json',bbox:`${loc.lon-d},${loc.lat-d},${loc.lon+d},${loc.lat+d}`,datetime:`${iso(start)}/${iso(end)}`,limit:'250'}),data=await fetchJson(`${ECCC}/collections/climate-hourly/items?${q}`,2),groups=new Map();for(const f of data.features||[]){const p=f.properties||{},coords=f.geometry?.coordinates;if(!Array.isArray(coords))continue;const mm=finite(p.PRECIP_AMOUNT),desc=String(p.WEATHER_ENG_DESC||''),has=desc&&desc.toUpperCase()!=='NA';if(mm==null&&!has)continue;const id=String(p.CLIMATE_IDENTIFIER||p.STN_ID||p.STATION_NAME||'');if(!id)continue;if(!groups.has(id))groups.set(id,{rows:[],distance:haversine(loc,{lat:Number(coords[1]),lon:Number(coords[0])}),station:p.STATION_NAME||id});groups.get(id).rows.push(p);}const best=[...groups.values()].filter(g=>g.rows.length).sort((a,b)=>a.distance-b.distance)[0];if(!best)return null;let amount=0,n=0,wet=false,evidence=0;for(const p of best.rows){const mm=finite(p.PRECIP_AMOUNT),desc=String(p.WEATHER_ENG_DESC||'');if(mm!=null){amount+=Math.max(0,mm);n++;evidence++;if(mm>=WET_MM)wet=true;}if(desc&&desc.toUpperCase()!=='NA'){evidence++;if(WEATHER_WORDS.test(desc))wet=true;}}return evidence?{wet,amount:n?+amount.toFixed(3):null,station:best.station,distanceKm:+best.distance.toFixed(1)}:null;}
async function verify(state,now){const keep=[];let verified=0;for(const record of state.pending){if(record.validAt>now-VERIFY_DELAY_HOURS*3600000){keep.push(record);continue;}if(now-record.validAt>MAX_PENDING_AGE_DAYS*86400000)continue;const loc=LOCATIONS.find(x=>x.id===record.locationId);if(!loc)continue;let truth=null;try{truth=await climateTruth(loc,record.validAt);}catch{}if(!truth){record.attempts=(record.attempts||0)+1;keep.push(record);continue;}for(const side of ['champion','challenger']){const prediction=record[side];if(!prediction)continue;const key=String(record.lead),m=state.metrics[side][key]||emptyMetric(record.lead);addMetric(m,prediction,truth);state.metrics[side][key]=m;}verified++;}state.pending=keep.slice(-MAX_PENDING);return verified;}
async function fetchRawModels(){const out={};for(const model of MODELS){const data=normaliseMulti(await fetchJson(modelUrl(model),2));out[model.id]=data;console.log(`✓ court raw ${model.id}: ${data.length} Ontario points`);await new Promise(r=>setTimeout(r,180));}return out;}
function collectCases(raw,challenger,now){const issueAt=roundHour(now),records=[];for(let i=0;i<LOCATIONS.length;i++){const loc=LOCATIONS[i];for(const lead of LEADS){const validAt=issueAt+lead*3600000,inputs={};for(const model of MODELS){const p=parseModel(raw[model.id]?.[i],validAt);if(p)inputs[model.id]=p;}const cWeights=weightsFor(challenger,lead),champion=blend(inputs,BASE),candidate=blend(inputs,cWeights);if(!champion||!candidate)continue;records.push({id:`${loc.id}|${issueAt}|${lead}`,issueAt,validAt,lead,locationId:loc.id,champion,challenger:candidate,challengerWeights:cWeights,challengerEvidence:evidenceFor(challenger,lead),challengerGeneratedAt:challenger?.generatedAt||null,currentRegime:challenger?.currentRegime||null});}}return records;}
function pctImprovement(oldValue,newValue){return oldValue==null||newValue==null||oldValue===0?null:(oldValue-newValue)/oldValue;}
function courtVerdict(state,challenger){
  const champ=summary(combined(state.metrics.champion)),cand=summary(combined(state.metrics.challenger)),perLead={};
  for(const lead of LEADS)perLead[lead]={champion:summary(state.metrics.champion[String(lead)]||emptyMetric(lead)),challenger:summary(state.metrics.challenger[String(lead)]||emptyMetric(lead))};
  const cWeights=Object.fromEntries(LEADS.map(lead=>[lead,weightsFor(challenger,lead)])),distinct=LEADS.some(lead=>weightsDifferent(cWeights[lead])),history=historicalCoverage(challenger),freshMs=challenger?.generatedAt?Date.now()-new Date(challenger.generatedAt).getTime():Infinity,brierGain=pctImprovement(champ.brier,cand.brier),csiGain=(cand.csi??0)-(champ.csi??0),missDelta=(cand.missRate??1)-(champ.missRate??1),farDelta=(cand.far??1)-(champ.far??1),enough=champ.samples>=300&&champ.truthWet>=45&&LEADS.every(lead=>perLead[lead].champion.samples>=60),stableLeads=LEADS.every(lead=>{const a=perLead[lead].champion,b=perLead[lead].challenger;return a.brier==null||b.brier==null||b.brier<=a.brier*1.03;}),contextFresh=freshMs<=72*3600000;
  const checks={candidateDistinct:distinct,historicalEvidence:history.ready,unsupportedModelsFrozen:history.unsupportedModelsFrozen,challengerFresh:contextFresh,prospectiveSample:enough,brierImprovement:brierGain!=null&&brierGain>=.02,csiNonDegradation:csiGain>=-.005,missRateNonDegradation:missDelta<=.015,falseAlarmNonDegradation:farDelta<=.02,noBadLead:stableLeads};
  const passed=Object.values(checks).every(Boolean);let reason='';
  if(!distinct)reason='Candidate weights are still effectively the champion weights.';
  else if(history.supportedModels.length<3)reason=`Historical regime evidence supports only ${history.supportedModels.length}/3 required models at every lead; unsupported models remain frozen.`;
  else if(!history.unsupportedModelsFrozen)reason=`An unsupported model moved away from its champion weight (${history.unsupportedModels.join(', ')}); the challenger is rejected.`;
  else if(!enough)reason=`Court is accumulating prospective outcomes (${champ.samples} scored, ${champ.truthWet} wet truths).`;
  else if(!passed)reason='Challenger has enough evidence but has not beaten every promotion guardrail.';
  else reason='Challenger passed the statistical gate for a bounded integration review. Live production still requires an explicit code release; the court cannot self-promote.';
  return{generatedAt:iso(Date.now()),mode:'sealed-prospective-champion-vs-challenger',approvedForBoundedIntegrationReview:passed,autoPromotes:false,reason,checks,minimums:{historicalEvidencePerSupportedModelLead:500,historicallySupportedModels:3,unsupportedModels:'must remain at champion weight',prospectiveSamples:300,wetTruths:45,perLeadSamples:60,brierImprovement:'>=2%',csiDelta:'>=-0.5 percentage points',missRateDelta:'<=+1.5 percentage points',farDelta:'<=+2 percentage points',badLeadBrier:'no lead >3% worse'},observed:{historicalEvidenceMinimum:history.minimumSupportedEvidence,historicallySupportedModels:history.supportedModels,frozenUnsupportedModels:history.unsupportedModels,champion:champ,challenger:cand,brierRelativeImprovement:brierGain,csiDelta:csiGain,missRateDelta:missDelta,farDelta,perLead},candidate:{generatedAt:challenger?.generatedAt||null,currentRegime:challenger?.currentRegime||null,weightsByLead:cWeights}};
}
function publicPayload(state,verdict){return{schema:1,generatedAt:state.updatedAt,runs:state.runs,pending:state.pending.length,locations:LOCATIONS.map(({id,name})=>({id,name})),leads:LEADS,championWeights:BASE,verdict,note:'The court stores champion and challenger forecasts before observations exist, then scores both against the same ECCC truth. It cannot change live production by itself.'};}
async function selfTest(){
  if(finite(null)!==null||finite('')!==null)throw new Error('null safety failed');const inputs={gem:{wet:true,amount:.4},ifs:{wet:true,amount:.2},gfs:{wet:false,amount:0},aifs:{wet:false,amount:0}},p=blend(inputs,BASE);if(!p||Math.abs(p.probability-65)>.01||!p.wet)throw new Error('blend failed');const m=emptyMetric(24);addMetric(m,{wet:true,probability:65,amount:.3},{wet:true,amount:.2});if(m.hits!==1||m.brierN!==1)throw new Error('score failed');const bad=saneWeights({gem:.9,ifs:.05,gfs:.03,aifs:.02});if(bad!==null)throw new Error('weight guard failed');
  const proposedByLead=Object.fromEntries(LEADS.map(lead=>[lead,{gem:{weight:.40,samples:800},ifs:{weight:.25,samples:800},gfs:{weight:.19,samples:800},aifs:{weight:.16,samples:0}}]));
  const coverage=historicalCoverage({proposedByLead});if(!coverage.ready||coverage.supportedModels.length!==3||coverage.unsupportedModels[0]!=='aifs')throw new Error('supported-model history gate failed');
  proposedByLead[24].aifs.weight=.17;if(historicalCoverage({proposedByLead}).ready)throw new Error('unsupported model was allowed to move');
  console.log('✓ Forecast Court self-test passed');
}
async function main(){if(process.argv.includes('--self-test'))return selfTest();await fs.mkdir('verification-court',{recursive:true});const now=Date.now(),state=await loadState(),challenger=await loadChallenger(),verified=await verify(state,now);let records=[];try{records=collectCases(await fetchRawModels(),challenger,now);}catch(e){console.warn(`⚠ court collection: ${e.message}`);}const existing=new Set(state.pending.map(r=>r.id));let added=0;for(const r of records)if(!existing.has(r.id)){state.pending.push(r);existing.add(r.id);added++;}state.pending=state.pending.slice(-MAX_PENDING);state.runs++;state.updatedAt=iso(now);const verdict=courtVerdict(state,challenger);state.lastRun={at:state.updatedAt,verified,added,verdict:verdict.reason};await fs.writeFile(STATE_PATH,JSON.stringify(state));await fs.writeFile(PUBLIC_PATH,JSON.stringify(publicPayload(state,verdict),null,2));console.log(`✓ Forecast Court: ${verified} outcomes scored · ${added} sealed cases added · ${state.pending.length} pending`);console.log(`✓ verdict: ${verdict.approvedForBoundedIntegrationReview?'PASS FOR REVIEW':'HOLD'} · ${verdict.reason}`);if(process.argv.includes('--smoke')){if(records.length<LOCATIONS.length*2)throw new Error(`live court smoke produced only ${records.length} cases`);console.log(`✓ live Forecast Court smoke: ${records.length} sealed champion/challenger cases`);}}
await main();
