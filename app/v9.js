(()=>{'use strict';
const WMS='https://geo.weather.gc.ca/geomet';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const PLACES=[
 {name:'Toronto',lat:43.6532,lon:-79.3832,zoom:8},{name:'Etobicoke',lat:43.6205,lon:-79.5132,zoom:10},{name:'Ottawa',lat:45.4215,lon:-75.6972,zoom:8},{name:'Hamilton',lat:43.2557,lon:-79.8711,zoom:9},{name:'London',lat:42.9849,lon:-81.2453,zoom:8},{name:'Windsor',lat:42.3149,lon:-83.0364,zoom:8},{name:'Kingston',lat:44.2312,lon:-76.486,zoom:8},{name:'Sudbury',lat:46.4917,lon:-80.993,zoom:7},{name:'Thunder Bay',lat:48.3809,lon:-89.2477,zoom:7},{name:'Barrie',lat:44.3894,lon:-79.6903,zoom:9}];
const H=[
 {id:'now',label:'Now',sub:'Observed',hours:0,q:'observed',zoom:9},
 {id:'30m',label:'+30m',sub:'Nowcast',hours:.5,q:'nowcast',zoom:9},
 {id:'1h',label:'+1h',sub:'Nowcast',hours:1,q:'nowcast',zoom:9},
 {id:'2h',label:'+2h',sub:'Nowcast',hours:2,q:'nowcast',zoom:8},
 {id:'tonight',label:'Tonight',sub:'HRDPS',hours:8,q:'model',zoom:8},
 {id:'tomorrow',label:'Tomorrow',sub:'HRDPS',hours:24,q:'model',zoom:7},
 {id:'3d',label:'3 days',sub:'Blend',hours:72,q:'model',zoom:6},
 {id:'7d',label:'7 days',sub:'Ensemble',hours:168,q:'ensemble',zoom:5},
 {id:'14d',label:'14 days',sub:'Scenario',hours:336,q:'ensemble',zoom:5}
];
const MODE={
 rain:{label:'Precipitation',icon:'◒',layers:h=>h.hours===0?[['RADAR_1KM_RRAI','RADARURPPRECIPR14-LINEAR']]:h.hours<=2?[['Radar_1km_RainPrecipRate-Extrapolation','']]:h.hours<=48?[['HRDPS.CONTINENTAL_PR','']]:h.hours<=120?[['GDPS_15km_PrecipType-Significant1h','SIGPRECIPITATIONTYPE']]:[['GEPS.DIAG.12_PRMM.ERGE10','REPS_PROB-LINEAR']]},
 storm:{label:'Storm signal',icon:'ϟ',layers:h=>h.hours<=1?[['RADAR_1KM_RRAI','RADARURPPRECIPR14-LINEAR'],['Lightning_2.5km_Density','Lightning']]:h.hours<=48?[['HRDPS.CONTINENTAL_PR',''],['HRDPS.CONTINENTAL_CAPE','']]:h.hours<=120?[['GDPS_15km_PrecipType-Significant1h','SIGPRECIPITATIONTYPE']]:[['GEPS.DIAG.12_PRMM.ERGE10','REPS_PROB-LINEAR']]},
 smoke:{label:'Smoke',icon:'≈',layers:h=>h.hours===0?[['AQHI-OBS','default']]:[['RAQDPS.SFC_PM2.5','']]},
 air:{label:'Air quality',icon:'◎',layers:h=>h.hours===0?[['AQHI-OBS','default']]:[['RAQDPS.SFC_PM2.5','']]},
 temp:{label:'Temperature',icon:'°',layers:h=>h.hours<=48?[['HRDPS.CONTINENTAL_TT','']]:[['GDPS_15km_AirTemp_2m','']]}
};
const MODELS=[
 {id:'gem',name:'Canada GEM',endpoint:'https://api.open-meteo.com/v1/gem',model:'gem_seamless',accent:'#61f6bd'},
 {id:'ifs',name:'ECMWF IFS',endpoint:'https://api.open-meteo.com/v1/ecmwf',model:'ecmwf_ifs025',accent:'#5ee8ff'},
 {id:'aifs',name:'ECMWF AIFS',endpoint:'https://api.open-meteo.com/v1/ecmwf',model:'ecmwf_aifs025_single',accent:'#d8ff72'},
 {id:'gfs',name:'NOAA GFS',endpoint:'https://api.open-meteo.com/v1/gfs',model:'gfs_seamless',accent:'#ffc85c'}
];
const state={place:PLACES[0],h:0,mode:'rain',map:null,overlays:[],times:new Map(),forecast:new Map(),alerts:[],busy:false};
const fmtTime=d=>new Intl.DateTimeFormat('en-CA',{weekday:'short',hour:'numeric',minute:'2-digit'}).format(d);
const fmtDay=d=>new Intl.DateTimeFormat('en-CA',{weekday:'long',month:'short',day:'numeric'}).format(d);
const targetDate=h=>new Date(Date.now()+h.hours*3600000);
const nearest=(arr,target)=>arr.reduce((a,b)=>Math.abs(new Date(b)-target)<Math.abs(new Date(a)-target)?b:a,arr[0]);
function weight(id,h){if(h.hours<=48)return{id:'gem',w:.46}[id]? .46:id==='ifs'?.24:id==='aifs'?.12:.18;if(h.hours<=120)return id==='gem'?.34:id==='ifs'?.30:id==='aifs'?.18:.18;if(h.hours<=240)return id==='gem'?.26:id==='ifs'?.31:id==='aifs'?.23:.20;return id==='ifs'?.38:id==='aifs'?.32:id==='gfs'?.30:0}
function weather(code=0){if([95,96,99].includes(code))return{glyph:'ϟ',name:'Thunderstorms'};if([71,73,75,77,85,86].includes(code))return{glyph:'✦',name:'Snow'};if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return{glyph:'◒',name:'Rain'};if([45,48].includes(code))return{glyph:'≈',name:'Fog'};if([1,2,3].includes(code))return{glyph:'◐',name:'Clouds'};return{glyph:'○',name:'Clear'} }
function baseConfidence(h,agreement){const base=h.hours===0?96:h.hours<=2?88:h.hours<=24?82:h.hours<=72?72:h.hours<=168?56:38;return Math.round(Math.max(24,Math.min(97,base*.72+agreement*.28)))}
function sourceMix(h){if(h.hours===0)return[92,8,0,0];if(h.hours<=2)return[48,42,10,0];if(h.hours<=48)return[8,62,30,0];if(h.hours<=120)return[0,42,43,15];if(h.hours<=240)return[0,27,43,30];return[0,8,32,60]}
function showToast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove('show'),2200)}
function openSheet(id){$('#sheet-backdrop').hidden=false;$('#'+id).hidden=false}
function closeSheets(){ $('#sheet-backdrop').hidden=true;$$('.sheet').forEach(x=>x.hidden=true) }
function initMap(){
 state.map=L.map('map',{zoomControl:false,attributionControl:false,minZoom:4,maxZoom:13,doubleClickZoom:true,preferCanvas:true}).setView([state.place.lat,state.place.lon],state.place.zoom);
 L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,opacity:.93}).addTo(state.map);
 L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,pane:'overlayPane',opacity:.78}).addTo(state.map);
 state.map.on('click',e=>{state.place={name:'Map point',lat:e.latlng.lat,lon:e.latlng.lng,zoom:state.map.getZoom()};$('#place-name').textContent='Map point';loadAll()});
}
function parseDuration(s){const m=/PT(?:(\d+)H)?(?:(\d+)M)?/.exec(s||'');return m?((+m[1]||0)*60+(+m[2]||0)):60}
function expandDimension(text){text=(text||'').trim();if(!text)return[];if(text.includes(','))return text.split(',').map(x=>x.trim()).filter(Boolean);if(text.includes('/')){const [a,b,p]=text.split('/');const start=new Date(a),end=new Date(b),step=parseDuration(p);const out=[];for(let d=new Date(start);d<=end&&out.length<800;d=new Date(d.getTime()+step*60000))out.push(d.toISOString());return out}return[text]}
async function getTimes(layer){if(state.times.has(layer))return state.times.get(layer);try{const url=`${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&LAYERS=${encodeURIComponent(layer)}`;const xml=new DOMParser().parseFromString(await(await fetch(url)).text(),'text/xml');let chosen=null;[...xml.querySelectorAll('Layer')].forEach(n=>{if(n.querySelector(':scope > Name')?.textContent===layer)chosen=n});const dim=[...(chosen||xml).querySelectorAll('Dimension,Extent')].find(n=>(n.getAttribute('name')||'').toLowerCase()==='time');const arr=expandDimension(dim?.textContent);state.times.set(layer,arr);return arr}catch(e){state.times.set(layer,[]);return[]}}
async function renderLayer(){
 const h=H[state.h],defs=MODE[state.mode].layers(h);state.overlays.forEach(x=>state.map.removeLayer(x));state.overlays=[];
 for(let i=0;i<defs.length;i++){const [layer,style]=defs[i];const times=await getTimes(layer);const wanted=targetDate(h);const time=times.length?nearest(times,wanted):undefined;const params={layers:layer,format:'image/png',transparent:true,version:'1.3.0',opacity:i?0.72:0.82};if(style)params.styles=style;if(time)params.time=time;const overlay=L.tileLayer.wms(WMS,params).addTo(state.map);state.overlays.push(overlay)}
 $('#map-source').textContent=h.q==='observed'?'ECCC 1 km radar':h.q==='nowcast'?'ECCC radar nowcast':h.hours<=48?'HRDPS 2.5 km':h.hours<=120?'GEM + global blend':'GEPS probability';
}
async function fetchModel(m){const key=`${m.id}:${state.place.lat.toFixed(2)},${state.place.lon.toFixed(2)}`;if(state.forecast.has(key))return state.forecast.get(key);const days=m.id==='gem'?10:16;const q=new URLSearchParams({latitude:state.place.lat,longitude:state.place.lon,timezone:'America/Toronto',forecast_days:String(days),models:m.model,hourly:'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,cloud_cover'});try{const r=await fetch(`${m.endpoint}?${q}`);if(!r.ok)throw Error(r.status);const j=await r.json();state.forecast.set(key,j);return j}catch(e){return null}}
function pointFrom(j,date){if(!j?.hourly?.time?.length)return null;let best=0,delta=Infinity;j.hourly.time.forEach((t,i)=>{const d=Math.abs(new Date(t)-date);if(d<delta){delta=d;best=i}});return{time:new Date(j.hourly.time[best]),temp:j.hourly.temperature_2m?.[best],rain:j.hourly.precipitation?.[best]||0,code:j.hourly.weather_code?.[best]||0,wind:j.hourly.wind_speed_10m?.[best]||0,gust:j.hourly.wind_gusts_10m?.[best]||0,cloud:j.hourly.cloud_cover?.[best]||0}}
async function consensus(h){const date=targetDate(h);const raw=await Promise.all(MODELS.map(async m=>({m,p:pointFrom(await fetchModel(m),date)})));const rows=raw.filter(x=>x.p&&weight(x.m.id,h)>0).map(x=>({...x,w:weight(x.m.id,h)}));if(!rows.length)return null;const total=rows.reduce((a,x)=>a+x.w,0);const avg=k=>rows.reduce((a,x)=>a+x.p[k]*x.w,0)/total;const wet=rows.reduce((a,x)=>a+(x.p.rain>=.12?x.w:0),0)/total;const agreement=Math.round(Math.max(wet,1-wet)*100);const rain=avg('rain'),temp=avg('temp'),wind=avg('wind'),gust=avg('gust'),cloud=avg('cloud');const dominant=rows.sort((a,b)=>b.w-a.w)[0]?.p.code||0;return{rows,agreement,confidence:baseConfidence(h,agreement),rain,temp,wind,gust,cloud,wet:Math.round(wet*100),weather:weather(dominant),date}}
function headline(c,h){if(!c)return['Forecast signal unavailable','The map layer is still available.'];if(state.mode==='temp')return[`${Math.round(c.temp)}° near ${state.place.name}`,`${c.agreement}% model agreement`];if(state.mode==='smoke'||state.mode==='air')return[h.hours===0?'Air conditions now':'Air signal for this window',`${c.agreement}% model agreement · tap for detail`];if(state.mode==='storm'&&c.weather.name==='Thunderstorms')return['Storm signal is active',`${c.wet}% of weighted guidance is wet`];if(c.rain<.08)return['A dry window is favoured',`${c.agreement}% agreement · ${Math.round(c.temp)}°`];if(c.rain<.7)return['Light rain is favoured',`${c.wet}% wet signal · ${Math.round(c.temp)}°`];if(c.rain<2.5)return['A steady rain window is forming',`${c.wet}% wet signal · gusts ${Math.round(c.gust)} km/h`];return['A heavier rain signal is forming',`${c.wet}% wet signal · ${Math.round(c.rain*10)/10} mm/h blend`]}
async function renderSnapshot(index,el){const h=H[index],c=await consensus(h);const [head,sub]=headline(c,h);el.dataset.index=index;el.querySelector('.snapshot-glyph').textContent=c?.weather.glyph||'⌁';el.querySelector('.snapshot-kicker').textContent=h.q==='observed'?'OBSERVED':h.q==='nowcast'?'NOWCAST':h.q==='model'?'MODEL BLEND':'ENSEMBLE SCENARIO';el.querySelector('h2').textContent=head;el.querySelector('p').textContent=sub;el.querySelector('.stat-a').textContent=c?`${Math.round(c.temp)}°`:'—';el.querySelector('.stat-b').textContent=c?`${c.confidence}%`:'—';el.onclick=()=>selectHorizon(index)}
async function renderUI(){
 const h=H[state.h];$('#time-label').textContent=h.label;$('#time-date').textContent=h.hours<3?fmtTime(targetDate(h)):fmtDay(targetDate(h));$('#mode-title').textContent=MODE[state.mode].label;$('#place-name').textContent=state.place.name;
 $$('.time-node').forEach((b,i)=>b.classList.toggle('active',i===state.h));$$('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
 const c=await consensus(h);const [head,sub]=headline(c,h);$('#hero-kicker').textContent=h.q==='observed'?'LIVE OBSERVATION':h.q==='nowcast'?'RADAR NOWCAST':h.q==='model'?'HIGH-RESOLUTION GUIDANCE':'ENSEMBLE SCENARIO';$('#hero-title').textContent=head;$('#hero-sub').textContent=sub;$('#confidence').style.setProperty('--confidence',c?.confidence||30);$('#confidence-value').textContent=c?c.confidence:'—';
 const mix=sourceMix(h);['obs','canada','global','ensemble'].forEach((k,i)=>$('.source-ribbon .'+k).style.flex=mix[i]);
 const ids=[state.h,Math.min(H.length-1,state.h+1),Math.min(H.length-1,state.h+2)];await Promise.all($$('.snapshot').map((el,i)=>renderSnapshot(ids[i],el)));
 renderDeep(c,h);
}
function renderDeep(c,h){$('#deep-title').textContent=`${H[state.h].label} · ${MODE[state.mode].label}`;$('#deep-copy').textContent=c?`SkyMap weights Canadian guidance most heavily in the first 48 hours, then gradually shifts toward ECMWF, AIFS, GFS and ensemble probability. The ${c.confidence}% confidence score combines lead time with whether the available models agree on a wet or dry outcome.`:'Model detail is temporarily unavailable.';const grid=$('#model-grid');grid.innerHTML='';(c?.rows||[]).forEach(x=>{const pct=Math.round(x.w/Math.max(...c.rows.map(r=>r.w))*100);const row=document.createElement('div');row.className='model-row';row.innerHTML=`<span>${x.m.name}</span><div class="model-bar"><i style="width:${pct}%;background:${x.m.accent}"></i></div><b>${Math.round(x.p.temp)}° · ${Math.round(x.p.rain*10)/10}mm</b>`;grid.appendChild(row)});$('#deep-source').textContent=h.q==='observed'?'ECCC radar + lightning':h.q==='nowcast'?'ECCC 1 km extrapolation':h.hours<=48?'HRDPS + GEM + ECMWF':'GEPS + ECMWF + AIFS + GFS'}
async function fetchAlerts(){const p=state.place,bbox=`${p.lon-1.8},${p.lat-1.2},${p.lon+1.8},${p.lat+1.2}`;try{const j=await(await fetch(`https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=30&bbox=${bbox}`)).json();state.alerts=j.features||[];$('#signal').dataset.state=state.alerts.length?'warn':'ok';$('#signal-label').textContent=state.alerts.length?`${state.alerts.length} alert${state.alerts.length===1?'':'s'}`:'Sources live'}catch(e){$('#signal').dataset.state='ok';$('#signal-label').textContent='Sources live'}}
function autoFrame(){const h=H[state.h];state.map.flyTo([state.place.lat,state.place.lon],Math.min(h.zoom,state.place.zoom||h.zoom),{duration:.8})}
async function selectHorizon(i){state.h=i;autoFrame();await Promise.all([renderLayer(),renderUI()])}
async function loadAll(){if(state.busy)return;state.busy=true;try{await Promise.all([renderLayer(),renderUI(),fetchAlerts()]);$('#signal-label').textContent=state.alerts.length?`${state.alerts.length} alerts`:'Sources live'}finally{state.busy=false}}
function buildUI(){
 const tl=$('#timeline');H.forEach((h,i)=>{const b=document.createElement('button');b.className='time-node';b.dataset.quality=h.q;b.innerHTML=`<b>${h.label}</b><small>${h.sub}</small>`;b.onclick=()=>selectHorizon(i);tl.appendChild(b)});
 const pg=$('#place-grid');PLACES.forEach(p=>{const b=document.createElement('button');b.className='place-choice';b.textContent=p.name;b.onclick=()=>{state.place=p;state.forecast.clear();closeSheets();state.map.flyTo([p.lat,p.lon],p.zoom,{duration:1});loadAll()};pg.appendChild(b)});
 $$('.mode').forEach(b=>b.onclick=async()=>{state.mode=b.dataset.mode;await Promise.all([renderLayer(),renderUI()])});
 $('#place-button').onclick=()=>openSheet('place-sheet');$('#signal').onclick=()=>openSheet('deep-sheet');$('#depth-button').onclick=()=>openSheet('deep-sheet');$('#sheet-backdrop').onclick=closeSheets;$$('[data-close]').forEach(b=>b.onclick=closeSheets);
 $('#locate').onclick=()=>navigator.geolocation?.getCurrentPosition(pos=>{state.place={name:'My location',lat:pos.coords.latitude,lon:pos.coords.longitude,zoom:10};state.forecast.clear();state.map.flyTo([state.place.lat,state.place.lon],10,{duration:1});loadAll()},()=>showToast('Location permission was not available'));
 window.SkyMapBack=()=>{if(!$('#sheet-backdrop').hidden){closeSheets();return true}return false}
}
document.addEventListener('DOMContentLoaded',()=>{initMap();buildUI();loadAll();setInterval(fetchAlerts,10*60*1000)});
})();