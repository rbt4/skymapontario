(() => {
  'use strict';

  const GEOMET = 'https://geo.weather.gc.ca/geomet';
  const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
  const MODEL_CACHE_MS = 45 * 60 * 1000;
  const WET_THRESHOLD = 0.12;
  const SPEEDS = [1, 2, 4];
  const PRECIP_CODES = new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
  const MODELS = [
    { id:'gem', name:'Canada GEM', endpoint:'https://api.open-meteo.com/v1/gem', model:'gem_seamless', weight:.38, accent:'#71e4ff', role:'Canadian-first local guidance' },
    { id:'ifs', name:'ECMWF IFS', endpoint:'https://api.open-meteo.com/v1/ecmwf', model:'ecmwf_ifs025', weight:.27, accent:'#8ff3c1', role:'Independent global physics model' },
    { id:'gfs', name:'NOAA GFS', endpoint:'https://api.open-meteo.com/v1/gfs', model:'gfs_seamless', weight:.19, accent:'#ffd47e', role:'Independent North American guidance' },
    { id:'aifs', name:'ECMWF AIFS', endpoint:'https://api.open-meteo.com/v1/ecmwf', model:'ecmwf_aifs025_single', weight:.16, accent:'#c4a8ff', role:'Independent AI forecast signal' }
  ];
  const capabilitiesCache = { savedAt:0, xml:null, promise:null };
  const QUICK_PLACES = [
    { name:'Toronto', detail:'Toronto, Ontario', lat:43.6532, lon:-79.3832, zoom:10 },
    { name:'Oakville', detail:'Halton, Ontario', lat:43.4675, lon:-79.6877, zoom:11 },
    { name:'Etobicoke', detail:'Toronto, Ontario', lat:43.6205, lon:-79.5132, zoom:11 },
    { name:'Mississauga', detail:'Peel, Ontario', lat:43.5890, lon:-79.6441, zoom:10 },
    { name:'Ottawa', detail:'Ottawa, Ontario', lat:45.4215, lon:-75.6972, zoom:10 },
    { name:'Hamilton', detail:'Hamilton, Ontario', lat:43.2557, lon:-79.8711, zoom:10 }
  ];

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const finite = value => value === null || value === undefined || value === '' || value === '__skymap_missing__' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const state = {
    place: loadPlace(), map:null, marker:null, overlay:null, frames:[], frameIndex:0,
    playing:false, playTimer:null, speedIndex:0, loopCount:0,
    models:new Map(), modelErrors:new Map(), modelStale:new Map(), evidenceReady:new Set(), timezone:'America/Toronto', consensus:[], events:[],
    searchTimer:null, requestId:0, metadataErrors:[], frameReading:null, liveRadarReading:null,
    pointReadoutFrame:0
  };

  function loadPlace() {
    try {
      const saved = JSON.parse(localStorage.getItem('skymap.lab.place') || localStorage.getItem('skymap.place') || 'null');
      if (saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lon))) {
        return { name:saved.name || 'Saved point', lat:Number(saved.lat), lon:Number(saved.lon), zoom:Number(saved.zoom)||10 };
      }
    } catch (_) {}
    return { ...QUICK_PLACES[0] };
  }
  function savePlace() { try { localStorage.setItem('skymap.lab.place', JSON.stringify(state.place)); } catch (_) {} }
  function text(selector,value) { const el=$(selector); if(el) el.textContent=value; }
  function showToast(message) {
    const el=$('#toast'); if(!el)return; el.textContent=message; el.classList.add('show');
    clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>el.classList.remove('show'),2800);
  }
  function fmt(value, options={}) {
    const d=value instanceof Date?value:new Date(value); if(!Number.isFinite(d.getTime()))return '—';
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:state.timezone,...options}).format(d)}catch(_){return new Intl.DateTimeFormat('en-CA',options).format(d)}
  }
  function fmtTime(value) { return fmt(value,{hour:'numeric',minute:'2-digit'}); }
  function fmtDay(value) { return fmt(value,{weekday:'short'}); }
  function fmtDate(value) { return fmt(value,{month:'short',day:'numeric'}); }
  function dateKey(value) {
    const d=value instanceof Date?value:new Date(value);
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:state.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const part=type=>parts.find(item=>item.type===type)?.value||'';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function modelDate(data,value) { const n=Number(value); return value!==''&&Number.isFinite(n)&&n>1e8?new Date(n*(n<1e12?1000:1)):new Date(value); }
  function minutesFromNow(value) { return Math.round((new Date(value).getTime()-Date.now())/60000); }
  function timeRange(start,end) { return `${fmtTime(start)}–${fmtTime(end)}`; }
  function roundedMinutes(minutes) {
    const amount=Math.abs(Math.round(minutes));
    if(amount<2)return 'now';
    if(amount<60)return `${amount} min`;
    const hours=Math.floor(amount/60), remainder=amount%60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  function initMap() {
    state.map=L.map('future-map',{zoomControl:false,attributionControl:true,minZoom:4,maxZoom:15,preferCanvas:true,fadeAnimation:true,zoomAnimation:true}).setView([state.place.lat,state.place.lon],state.place.zoom||10);
    state.map.attributionControl.setPrefix(false);
    state.map.createPane('weather'); state.map.getPane('weather').style.zIndex=340;
    state.map.createPane('labels'); state.map.getPane('labels').style.zIndex=380;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,opacity:.98,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(state.map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,opacity:.92,pane:'labels'}).addTo(state.map);
    placeMarker();
    state.map.on('click', e => {
      const name=`Pinned point · ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`;
      setPlace({name,lat:e.latlng.lat,lon:e.latlng.lng,zoom:Math.max(10,state.map.getZoom())},true);
    });
    state.map.on('contextmenu', e => {
      const name=`Pinned point · ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`;
      setPlace({name,lat:e.latlng.lat,lon:e.latlng.lng,zoom:Math.max(11,state.map.getZoom())},true);
    });
    state.map.on('move zoom resize',()=>requestPointReadoutPosition());
  }

  function pointIcon(stateName='loading') {
    return L.divIcon({
      className:'skymap-point',
      html:`<div class="point-anchor" data-state="${esc(stateName)}"><span class="point-ring"></span><span class="point-dot"></span></div>`,
      iconSize:[28,28],iconAnchor:[14,14]
    });
  }
  function placeMarker(stateName) {
    if(!state.map)return;
    if(!state.marker) state.marker=L.marker([state.place.lat,state.place.lon],{icon:pointIcon(stateName),pane:'labels',zIndexOffset:1000,keyboard:true,title:'Exact SkyMap forecast point'}).addTo(state.map);
    else { state.marker.setLatLng([state.place.lat,state.place.lon]); if(stateName)state.marker.setIcon(pointIcon(stateName)); }
    requestPointReadoutPosition();
  }
  function requestPointReadoutPosition() {
    cancelAnimationFrame(state.pointReadoutFrame);
    state.pointReadoutFrame=requestAnimationFrame(positionPointReadout);
  }
  function positionPointReadout() {
    const el=$('#point-readout'), stage=$('.map-stage');
    if(!el||!stage||!state.map)return;
    const point=state.map.latLngToContainerPoint([state.place.lat,state.place.lon]);
    const flip=point.x>stage.clientWidth-el.offsetWidth-36;
    el.classList.toggle('flip',flip);
    el.style.left=`${clamp(point.x+(flip?-18:18),12,stage.clientWidth-12)}px`;
    el.style.top=`${clamp(point.y-18,el.offsetHeight+18,stage.clientHeight-230)}px`;
  }

  function directChildText(node,name) { for(const child of node.children||[]) if(child.localName===name)return child.textContent?.trim()||''; return ''; }
  function findLayer(xml,name) { for(const node of xml.getElementsByTagNameNS('*','Layer')) if(directChildText(node,'Name')===name)return node; return null; }
  function durationMinutes(value) { const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value||''); return m?((+m[1]||0)*1440+(+m[2]||0)*60+(+m[3]||0)):60; }
  function expandTimes(value) {
    const raw=(value||'').trim(); if(!raw)return [];
    if(raw.includes(','))return raw.split(',').map(v=>new Date(v.trim()).toISOString()).filter(Boolean);
    if(!raw.includes('/'))return [new Date(raw).toISOString()];
    const [a,b,p]=raw.split('/'); const start=new Date(a).getTime(),end=new Date(b).getTime(),step=durationMinutes(p)*60000; const out=[];
    if(!Number.isFinite(start)||!Number.isFinite(end)||!step)return out;
    for(let t=start;t<=end&&out.length<1500;t+=step)out.push(new Date(t).toISOString()); return out;
  }
  async function geometCapabilities() {
    if(capabilitiesCache.xml&&Date.now()-capabilitiesCache.savedAt<10*60*1000)return capabilitiesCache.xml;
    if(capabilitiesCache.promise)return capabilitiesCache.promise;
    const url=`${GEOMET}?service=WMS&request=GetCapabilities&version=1.3.0&lang=en`;
    capabilitiesCache.promise=fetch(url,{cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error(`GeoMet ${response.status}`);
      const xml=new DOMParser().parseFromString(await response.text(),'application/xml'); capabilitiesCache.xml=xml; capabilitiesCache.savedAt=Date.now(); capabilitiesCache.promise=null; return xml;
    }).catch(error=>{capabilitiesCache.promise=null;throw error;});
    return capabilitiesCache.promise;
  }
  async function layerTimes(layer) {
    const xml=await geometCapabilities(); const node=findLayer(xml,layer); if(!node)throw new Error(`${layer} unavailable`);
    const dims=[...(node.getElementsByTagNameNS('*','Dimension')||[])];
    const time=dims.find(d=>(d.getAttribute('name')||'').toLowerCase()==='time');
    const ref=dims.find(d=>(d.getAttribute('name')||'').toLowerCase()==='reference_time');
    return {times:expandTimes(time?.textContent),reference:expandTimes(ref?.textContent).at(-1)||null};
  }
  function sampleEvenly(values,max) { if(values.length<=max)return values; const out=[]; for(let i=0;i<max;i++)out.push(values[Math.round(i*(values.length-1)/(max-1))]); return [...new Set(out)]; }

  async function buildFrames() {
    state.metadataErrors=[]; const now=Date.now();
    const specs=[
      {layer:'RADAR_1KM_RRAI',style:'RADARURPPRECIPR14-LINEAR',kind:'observed',label:'Measured radar'},
      {layer:'Radar_1km_RainPrecipRate-Extrapolation',style:'',kind:'nowcast',label:'Official radar extrapolation'},
      {layer:'HRDPS.CONTINENTAL.DIAG_PR_PT1H',style:'RDPA-WXO',kind:'guidance',label:'HRDPS 2.5 km guidance'}
    ];
    const results=await Promise.allSettled(specs.map(s=>layerTimes(s.layer)));
    const frames=[];
    results.forEach((result,index)=>{
      const spec=specs[index];
      if(result.status!=='fulfilled'){state.metadataErrors.push(spec.label);return;}
      const meta=result.value;
      let times=meta.times.filter(v=>{
        const t=new Date(v).getTime();
        if(spec.kind==='observed')return t>=now-90*60000&&t<=now+7*60000;
        if(spec.kind==='nowcast')return t>=now-8*60000&&t<=now+130*60000;
        return t>=now+100*60000&&t<=now+49*3600000;
      });
      times=sampleEvenly(times,spec.kind==='observed'?9:spec.kind==='nowcast'?8:spec.kind==='guidance'?12:8);
      times.forEach(time=>frames.push({...spec,time,reference:meta.reference}));
    });
    frames.sort((a,b)=>new Date(a.time)-new Date(b.time));
    state.frames=frames.length?frames:[{...specs[0],time:null,reference:null}];
    state.frameIndex=nearestFrameIndex(new Date());
    renderTimeline();
    showFrame(state.frameIndex,false);
    const liveFrame=state.frames.filter(f=>f.kind==='observed').reduce((best,f)=>!best||new Date(f.time)>new Date(best.time)?f:best,null);
    if(liveFrame) queryPointValue(liveFrame,true).catch(()=>{});
  }

  function nearestFrameIndex(target,kind) {
    const wanted=new Date(target).getTime(); let best=0,delta=Infinity;
    state.frames.forEach((frame,index)=>{
      if(kind&&frame.kind!==kind)return;
      const t=new Date(frame.time||Date.now()).getTime(); const d=Math.abs(t-wanted);
      if(d<delta){delta=d;best=index;}
    });
    return best;
  }

  function showFrame(index,pan=true) {
    state.frameIndex=clamp(index,0,state.frames.length-1); const frame=state.frames[state.frameIndex];
    if(state.overlay){try{state.map.removeLayer(state.overlay)}catch(_){} }
    const opts={
      layers:frame.layer,styles:frame.style||'',format:'image/png',transparent:true,
      opacity:frame.kind==='guidance'?.56:frame.kind==='nowcast'?.68:.74,
      version:'1.3.0',pane:'weather',uppercase:true,className:`weather-${frame.kind}`
    };
    if(frame.time)opts.time=frame.time; if(frame.reference)opts.reference_time=frame.reference;
    state.overlay=L.tileLayer.wms(GEOMET,opts).addTo(state.map);
    state.overlay.on('load',()=>setFeedHealth()); state.overlay.on('tileerror',()=>setFeedHealth(true));
    const phase=$('#source-phase'); phase.dataset.phase=frame.kind;
    text('#phase-kicker',frame.kind==='observed'?'OBSERVED':frame.kind==='nowcast'?'PREDICTED':'GUIDANCE');
    text('#phase-title',frame.label);
    text('#time-kind',frame.kind==='observed'?'MEASURED':frame.kind==='nowcast'?'NEAR FUTURE':'LATER GUIDANCE');
    text('#time-label',frame.time?fmtTime(frame.time):'LATEST');
    const lead=frame.time?minutesFromNow(frame.time):0;
    text('#time-detail',frame.kind==='observed'?'Measured by ECCC radar':frame.kind==='nowcast'?`${Math.max(0,lead)} min ahead · official extrapolation`:`${Math.max(0,Math.round(lead/60))} hr ahead · HRDPS`);
    $('#time-slider').value=String(state.frameIndex);
    $$('.track-node').forEach((el,i)=>el.classList.toggle('active',i===state.frameIndex));
    if(pan&&state.marker)state.map.panTo(state.marker.getLatLng(),{animate:true,duration:.35});
    queryPointValue(frame,false).catch(()=>{});
    updateJumpState(frame);
  }

  function renderTimeline() {
    const slider=$('#time-slider'),track=$('#time-track'); slider.max=String(Math.max(0,state.frames.length-1)); slider.value=String(state.frameIndex); track.innerHTML='';
    state.frames.forEach((f,i)=>{
      const node=document.createElement('i'); node.className='track-node'; node.dataset.kind=f.kind;
      node.style.left=`${state.frames.length===1?0:i/(state.frames.length-1)*100}%`; track.append(node);
    });
    renderEventWindow();
  }
  function renderEventWindow() {
    const el=$('#event-window'); if(!el||!state.events.length||state.frames.length<2){if(el)el.style.opacity='0';return;}
    const event=state.events.find(e=>e.end>Date.now()); if(!event){el.style.opacity='0';return;}
    const startIndex=nearestFrameIndex(event.start), endIndex=nearestFrameIndex(event.end);
    const max=state.frames.length-1;
    const left=clamp(startIndex/max*100,0,100), right=clamp(endIndex/max*100,0,100);
    el.style.left=`${Math.min(left,right)}%`; el.style.width=`${Math.max(2,Math.abs(right-left))}%`; el.style.opacity='1';
  }

  function updateJumpState(frame) {
    const lead=frame.time?minutesFromNow(frame.time):0;
    $$('[data-jump]').forEach(button=>{
      const value=button.dataset.jump; let active=false;
      if(value==='now')active=Math.abs(lead)<=10;
      else if(value==='tomorrow')active=Math.abs(lead-1440)<=90;
      else active=Math.abs(lead-Number(value))<=20;
      button.classList.toggle('active',active);
    });
  }

  function play() {
    if(state.playing){stop();return;}
    state.playing=true; state.loopCount=0; $('#play-button').classList.add('playing');
    $('#play-button b').textContent='PAUSE'; scheduleNextFrame(120);
  }
  function stop() {
    state.playing=false; clearTimeout(state.playTimer); state.playTimer=null;
    $('#play-button').classList.remove('playing'); $('#play-button b').textContent='PLAY';
  }
  function scheduleNextFrame(delay) {
    clearTimeout(state.playTimer);
    state.playTimer=setTimeout(()=>{
      if(!state.playing)return;
      const current=state.frames[state.frameIndex]; let next=state.frameIndex+1;
      let loopPause=0;
      if(next>=state.frames.length){next=0;state.loopCount++;loopPause=1000;}
      const nextFrame=state.frames[next]; showFrame(next,false);
      const speed=SPEEDS[state.speedIndex];
      let base=nextFrame.kind==='observed'?520:nextFrame.kind==='nowcast'?800:960;
      const event=state.events.find(e=>e.end>Date.now());
      if(event&&current?.time&&nextFrame?.time){
        const a=new Date(current.time).getTime(),b=new Date(nextFrame.time).getTime();
        if((event.start>=a&&event.start<=b)||(event.end>=a&&event.end<=b))base+=850;
      }
      scheduleNextFrame((base+loopPause)/speed);
    },delay);
  }
  function cycleSpeed() {
    state.speedIndex=(state.speedIndex+1)%SPEEDS.length;
    text('#speed-button',`${SPEEDS[state.speedIndex]}×`);
    if(state.playing)scheduleNextFrame(80);
  }
  function jumpTo(value) {
    stop(); let target;
    if(value==='now')target=new Date();
    else if(value==='tomorrow')target=new Date(Date.now()+24*3600000);
    else target=new Date(Date.now()+Number(value)*60000);
    showFrame(nearestFrameIndex(target),false);
  }

  function modelUrl(model) {
    const params=new URLSearchParams({
      latitude:state.place.lat.toFixed(4),longitude:state.place.lon.toFixed(4),timezone:'auto',forecast_days:'8',models:model.model,
      hourly:'temperature_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m'
    });
    return `${model.endpoint}?${params}`;
  }
  async function fetchModel(model,requestId) {
    const cacheKey=`skymap.lab.model.${model.id}.${state.place.lat.toFixed(2)}.${state.place.lon.toFixed(2)}`;
    let cached=null;
    try {
      cached=JSON.parse(localStorage.getItem(cacheKey)||'null');
      if(cached?.savedAt&&Date.now()-cached.savedAt<MODEL_CACHE_MS&&cached.data?.hourly?.time?.length){state.models.set(model.id,cached.data);return cached.data;}
    } catch(_){}
    try {
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000); let response;
      try{response=await fetch(modelUrl(model),{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timeout);}
      if(!response.ok)throw new Error(`HTTP ${response.status}`); const data=await response.json();
      if(requestId!==state.requestId)return null; if(!data?.hourly?.time?.length)throw new Error('No hourly data');
      state.models.set(model.id,data); state.modelErrors.delete(model.id); state.modelStale.delete(model.id); if(data.timezone)state.timezone=data.timezone;
      try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),data}))}catch(_){} return data;
    } catch(error){
      if(requestId!==state.requestId)return null;
      if(cached?.savedAt&&Date.now()-cached.savedAt<6*3600000&&cached.data?.hourly?.time?.length){state.models.set(model.id,cached.data);state.modelStale.set(model.id,Date.now()-cached.savedAt);state.modelErrors.delete(model.id);return cached.data;}
      state.modelErrors.set(model.id,String(error));return null;
    }
  }
  function pointAt(model,data,target) {
    const hourly=data?.hourly; if(!hourly?.time?.length)return null; const wanted=new Date(target).getTime(); let best=0,delta=Infinity;
    hourly.time.forEach((v,i)=>{const d=Math.abs(modelDate(data,v).getTime()-wanted);if(d<delta){best=i;delta=d;}});
    const val=k=>finite(hourly[k]?.[best]); const code=val('weather_code');
    const rainValue=val('rain'),showersValue=val('showers'),snowfallValue=val('snowfall'),precipitationValue=val('precipitation');
    const rainParts=[rainValue,showersValue].filter(value=>value!=null); const rain=rainParts.length?Math.max(0,rainParts.reduce((sum,value)=>sum+value,0)):null;
    const precipCandidates=[precipitationValue,rain,snowfallValue==null?null:snowfallValue*.7].filter(value=>value!=null);
    const precip=precipCandidates.length?Math.max(0,...precipCandidates):null; const snow=snowfallValue==null?null:Math.max(0,snowfallValue);
    const temp=val('temperature_2m'),cloud=val('cloud_cover'),wind=val('wind_speed_10m'),gust=val('wind_gusts_10m'),direction=val('wind_direction_10m');
    const wetKnown=precip!=null||code!=null;
    return {
      model,time:modelDate(data,hourly.time[best]),precip,rain,snow,code,temp,cloud:cloud==null?null:clamp(cloud,0,100),
      wind:wind==null?null:Math.max(0,wind),gust:gust==null?null:Math.max(0,gust),direction:direction==null?null:clamp(direction,0,360),
      wetKnown,wet:wetKnown&&(precip>=WET_THRESHOLD||PRECIP_CODES.has(code))
    };
  }
  function blendAt(target) {
    const rows=MODELS.map(model=>{const p=pointAt(model,state.models.get(model.id),target);return p?{...p,weight:model.weight}:null;}).filter(Boolean); if(!rows.length)return null;
    const average=key=>{const known=rows.filter(row=>finite(row[key])!=null);const total=known.reduce((sum,row)=>sum+row.weight,0);return total?known.reduce((sum,row)=>sum+row[key]*row.weight,0)/total:null;};
    const wetRows=rows.filter(row=>row.wetKnown),wetTotal=wetRows.reduce((sum,row)=>sum+row.weight,0),wetWeight=wetTotal?wetRows.reduce((sum,row)=>sum+(row.wet?row.weight:0),0)/wetTotal:null;
    const snowRows=rows.filter(row=>row.snow!=null||SNOW_CODES.has(row.code)),snowTotal=snowRows.reduce((sum,row)=>sum+row.weight,0),snowWeight=snowTotal?snowRows.reduce((sum,row)=>sum+((row.snow>0||SNOW_CODES.has(row.code))?row.weight:0),0)/snowTotal:null;
    const directionRows=rows.filter(row=>row.direction!=null),sin=directionRows.reduce((sum,row)=>sum+Math.sin(row.direction*Math.PI/180)*row.weight,0),cos=directionRows.reduce((sum,row)=>sum+Math.cos(row.direction*Math.PI/180)*row.weight,0);
    const direction=directionRows.length?(Math.atan2(sin,cos)*180/Math.PI+360)%360:null;
    const codeWeights=new Map(); rows.forEach(row=>{if(row.code!=null)codeWeights.set(row.code,(codeWeights.get(row.code)||0)+row.weight);}); let code=null,codeWeight=-1; for(const [candidate,weight] of codeWeights)if(weight>codeWeight){code=candidate;codeWeight=weight;}
    const base={time:new Date(target),rows,wet:wetWeight==null?null:Math.round(wetWeight*100),precip:average('precip'),snow:snowWeight==null?null:Math.round(snowWeight*100),code,wetModels:wetRows.filter(row=>row.wet).length,totalModels:wetRows.length,agreement:wetWeight==null?null:Math.round(Math.max(wetWeight,1-wetWeight)*100),direction};
    return window.SkyMapEvidenceRouter?.route(base,{target,place:state.place})||base;
  }
  function buildConsensus() {
    const now=new Date(); now.setMinutes(0,0,0); const points=[];
    for(let h=0;h<8*24;h++){const point=blendAt(new Date(now.getTime()+h*3600000));if(point)points.push(point);}
    state.consensus=points; state.events=identifyEvents(points); return points;
  }
  function identifyEvents(points) {
    const events=[]; let active=null;
    points.forEach((p,index)=>{
      const wet=p.wet>=42||p.precip>=.11; const next=points[index+1];
      if(wet&&!active)active={start:p.time,end:p.time,points:[p],peak:p};
      else if(wet&&active){active.end=p.time;active.points.push(p);if(p.precip>active.peak.precip)active.peak=p;}
      else if(active){const gap=next&&next.wet>=42&&new Date(next.time)-new Date(p.time)<=2*3600000;if(!gap){events.push(finalizeEvent(active));active=null;}}
    });
    if(active)events.push(finalizeEvent(active)); return events;
  }
  function finalizeEvent(event) {
    event.end=new Date(new Date(event.end).getTime()+3600000); event.maxWet=Math.max(...event.points.map(p=>p.wet)); event.meanWet=Math.round(event.points.reduce((s,p)=>s+p.wet,0)/event.points.length);
    const amounts=event.points.map(point=>finite(point.precip)).filter(value=>value!=null),snowChances=event.points.map(point=>finite(point.snow)).filter(value=>value!=null);
    event.total=amounts.length?amounts.reduce((sum,value)=>sum+value,0):null; event.snow=snowChances.length?Math.max(...snowChances):null; event.modelWindows=modelEventWindows(event.start,event.end); return event;
  }
  function modelEventWindows(start,end) {
    return MODELS.map(model=>{
      const data=state.models.get(model.id); if(!data)return {model,error:true}; const times=data.hourly.time.map(v=>modelDate(data,v)); const wet=[];
      times.forEach(t=>{if(t>=new Date(start.getTime()-12*3600000)&&t<=new Date(end.getTime()+12*3600000)){const p=pointAt(model,data,t);if(p?.wet)wet.push(t);}});
      return {model,start:wet[0]||null,end:wet.length?new Date(wet.at(-1).getTime()+3600000):null,wet:Boolean(wet.length)};
    });
  }
  function eventConfidence(event) {
    if(!event)return {label:'No event',timing:'No window',state:'dry',support:0,spread:0,lead:Infinity};
    const lead=(event.start-Date.now())/3600000; const windows=event.modelWindows.filter(w=>w.wet&&w.start); const support=windows.reduce((s,w)=>s+w.model.weight,0); const starts=windows.map(w=>w.start.getTime()); const spread=starts.length>1?(Math.max(...starts)-Math.min(...starts))/3600000:12;
    const eventLabel=support>=.82?'Very strong':support>=.64?'Strong':support>=.45?'Developing':'Watching';
    const timing=lead<=3?'Radar handoff':spread<=2?'Narrowing':spread<=5?'Broad window':'Too early';
    return {label:eventLabel,timing,state:support>=.64?'likely':'uncertain',support,spread,lead};
  }
  function modelWetWindow(model) {
    const data=state.models.get(model.id); if(!data)return null; const now=Date.now(); const points=data.hourly.time.map(v=>pointAt(model,data,modelDate(data,v))).filter(p=>p&&p.time>=now-3600000); const scorable=points.filter(point=>point.wetKnown); if(!scorable.length)return {wet:null}; const first=points.findIndex(p=>p.wet); if(first<0)return {wet:false}; let end=first; while(end+1<points.length&&points[end+1].wet)end++; return {wet:true,start:points[first].time,end:new Date(points[end].time.getTime()+3600000),peak:points.slice(first,end+1).reduce((a,b)=>(finite(a.precip)??-1)>(finite(b.precip)??-1)?a:b)};
  }
  function predictionMemory(event) {
    const key=`skymap.lab.prediction.${state.place.lat.toFixed(2)}.${state.place.lon.toFixed(2)}`; let previous=null; try{previous=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
    const current=event?{savedAt:Date.now(),start:event.start.toISOString(),end:event.end.toISOString(),confidence:eventConfidence(event).label}:null; let stability='New reading',change='This is the first forecast stored for this point.';
    if(previous?.start&&event){
      const shift=Math.round((event.start-new Date(previous.start))/60000); const age=Date.now()-(previous.savedAt||0);
      if(Math.abs(shift)<=15){stability='Stable';change=`The leading window moved only ${Math.abs(shift)} minutes since the previous saved forecast.`;}
      else if(shift>0){stability='Shifting later';change=`The next event shifted ${shift} minutes later since the previous saved forecast.`;}
      else{stability='Shifting earlier';change=`The next event shifted ${Math.abs(shift)} minutes earlier since the previous saved forecast.`;}
      if(age>24*3600000)change+=' The previous comparison is more than a day old.';
    } else if(previous?.start&&!event){stability='Event faded';change='A previously stored precipitation signal is no longer strong enough to declare.';}
    try{localStorage.setItem(key,JSON.stringify(current));}catch(_){} return {stability,change};
  }

  function classifyCondition(precip,snow=0,code=0) {
    const amount=finite(precip),snowAmount=finite(snow),weatherCode=finite(code);
    if((snowAmount!=null&&snowAmount>.05)||(weatherCode!=null&&[71,73,75,77,85,86].includes(weatherCode)))return {label:(snowAmount??0)>=1?'Steady snow':'Light snow',short:'Snow',state:'snow'};
    if(amount==null&&weatherCode==null)return {label:'Checking now',short:'Checking',state:'loading'};
    if(amount!=null&&amount<.03&&(weatherCode==null||!PRECIP_CODES.has(weatherCode)))return {label:'Dry now',short:'Dry',state:'dry'};
    if(amount==null)return {label:'Precipitation signal',short:'Precipitation',state:'uncertain'};
    if(amount<.18)return {label:'A few drops',short:'Few drops',state:'uncertain'};
    if(amount<1.5)return {label:'Light rain',short:'Light rain',state:'wet'};
    if(amount<5)return {label:'Steady rain',short:'Rain',state:'wet'};
    return {label:'Heavy rain',short:'Heavy rain',state:'wet'};
  }
  function currentCondition() {
    const radar=state.liveRadarReading;
    if(radar&&Number.isFinite(radar.rate))return classifyCondition(radar.rate,0,0);
    const current=blendAt(new Date());
    return current?classifyCondition(current.precip,current.snow>40?.3:0,current.code):{label:'Checking now',short:'Checking',state:'loading'};
  }

  async function queryPointValue(frame,live=false) {
    if(!frame?.layer||!frame.time)return null;
    const requestToken=`${frame.layer}|${frame.time}|${state.place.lat.toFixed(4)}|${state.place.lon.toFixed(4)}`;
    queryPointValue.latest=requestToken;
    try {
      const d=.08; const params=new URLSearchParams({
        service:'WMS',request:'GetFeatureInfo',version:'1.1.1',layers:frame.layer,query_layers:frame.layer,styles:frame.style||'',
        srs:'EPSG:4326',bbox:`${state.place.lon-d},${state.place.lat-d},${state.place.lon+d},${state.place.lat+d}`,width:'101',height:'101',x:'50',y:'50',
        info_format:'application/json',feature_count:'1',time:frame.time
      });
      if(frame.reference)params.set('reference_time',frame.reference);
      const response=await fetch(`${GEOMET}?${params}`,{cache:'no-store'}); if(!response.ok)throw new Error(`Point query ${response.status}`);
      const data=await response.json(); const feature=data?.features?.[0];
      let rate=null;
      if(feature?.properties){
        const plausible=([key,value])=>!/(time|date|lat|lon|x|y|id|index)/i.test(key)&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=500;
        const entries=Object.entries(feature.properties);
        const preferred=entries.find(([key,value])=>/^(value|val)$|precip|rain.*rate|rate|band_?1|pixel/i.test(key)&&plausible([key,value]));
        const fallback=entries.find(plausible);
        const candidate=finite(preferred?.[1]??fallback?.[1]); if(candidate!=null)rate=Math.max(0,candidate);
      }
      if(rate==null){if(queryPointValue.latest===requestToken){state.frameReading=null;if(live)state.liveRadarReading=null;renderPointReadout();}return null;}
      const reading={rate,frame,time:frame.time};
      if(queryPointValue.latest===requestToken){
        state.frameReading=reading;
        if(live){state.liveRadarReading=reading;applyLiveCondition();}
        renderPointReadout();
      }
      return reading;
    } catch(_){
      if(queryPointValue.latest===requestToken){state.frameReading=null;renderPointReadout();}
      return null;
    }
  }

  function renderPointReadout() {
    const event=state.events.find(e=>e.end>Date.now())||null; const nowCondition=currentCondition(); const frame=state.frames[state.frameIndex];
    let stateName=nowCondition.state, title=nowCondition.label, copy='At your exact pinpoint';
    if(frame&&frame.time&&Math.abs(minutesFromNow(frame.time))>15){
      const selectedReading=state.frameReading?.time===frame.time&&state.frameReading?.frame?.layer===frame.layer?state.frameReading:null;
      const point=blendAt(frame.time);
      const condition=selectedReading?classifyCondition(selectedReading.rate):point?classifyCondition(point.precip,point.snow>40?.3:0,point.code):null;
      title=condition?condition.label:'Forecast point'; stateName=condition?.state||'loading'; copy=`${fmtTime(frame.time)} · ${frame.kind==='nowcast'?'near-future':'model guidance'}`;
    } else if(event){
      const lead=Math.round((event.start-Date.now())/60000);
      if(nowCondition.state==='dry'&&lead>0&&lead<=180){title=`Rain in about ${roundedMinutes(lead)}`;copy=`Most likely ${timeRange(event.start,event.end)}`;stateName=event.snow>=45?'snow':'wet';}
      else if(nowCondition.state==='dry'){copy=`Next event ${fmtDay(event.start)} · ${timeRange(event.start,event.end)}`;}
      else copy=`Likely easing around ${fmtTime(event.end)}`;
    } else if(nowCondition.state==='dry'){copy='No strong rain signal in the near window';}
    const el=$('#point-readout'); el.dataset.state=stateName;
    text('#point-readout-kicker',frame?.kind==='observed'?'AT THIS POINT':frame?.kind==='nowcast'?'PREDICTED HERE':'GUIDANCE HERE');
    text('#point-readout-title',title); text('#point-readout-copy',copy); placeMarker(stateName); requestPointReadoutPosition();
  }

  function applyLiveCondition() {
    if(!state.liveRadarReading)return;
    const condition=currentCondition();
    text('#now-condition',condition.short);
    if(!['wet','snow','uncertain'].includes(condition.state))return;
    const rail=$('#rail-status');
    rail.dataset.state=condition.state==='snow'?'likely':condition.state;
    text('#answer-eyebrow','LIVE AT THIS EXACT POINT');
    text('#answer-title',condition.label);
    text('#answer-copy','Live ECCC radar is detecting precipitation at the pinpoint. The broader event window remains separate below.');
    if($('#first-possible')?.textContent==='None found')text('#first-possible','Now');
  }

  function renderAnswer() {
    const now=Date.now(); const event=state.events.find(e=>e.end>now)||null; const confidence=eventConfidence(event); const memory=predictionMemory(event); const current=blendAt(new Date()); const rail=$('#rail-status'); const condition=currentCondition();
    text('#place-name',state.place.name); text('#answer-updated',fmtTime(new Date())); text('#forecast-stability',memory.stability); text('#change-note',memory.change); text('#now-condition',condition.short);
    if(!event){
      const hasEvidence=state.consensus.some(point=>point.wet!=null||point.precip!=null);
      rail.dataset.state=hasEvidence?'dry':'loading'; text('#answer-eyebrow','AT THIS EXACT POINT'); text('#answer-title',hasEvidence?'No strong precipitation event found':'Forecast guidance is incomplete');
      text('#answer-copy',hasEvidence?'The available guidance keeps this point mostly dry. SkyMap will update when a reliable rain or snow signal appears.':'SkyMap will not translate missing precipitation values into a dry forecast.');
      text('#first-possible',hasEvidence?'None found':'—'); text('#main-window',hasEvidence?'No declared event':'Awaiting evidence'); text('#likely-end','—'); text('#event-confidence',hasEvidence?'Dry signal':'Unknown'); text('#timing-confidence','No window');
      text('#event-name',hasEvidence?'No declared rain or snow event':'Forecast evidence unavailable'); text('#event-state',hasEvidence?'DRY SIGNAL':'UNKNOWN'); text('#event-story',hasEvidence?'No precipitation event currently clears SkyMap’s declaration threshold across the available independent guidance.':'The truth firewall withheld a dry declaration because the forecast fields are missing.');
      renderEventFlow(null); renderEvidence(null,current,memory); text('#forecast-stage','No declared event'); renderPointReadout(); renderEventWindow(); return;
    }
    const leadHours=(event.start-now)/3600000; const type=event.snow>=45?'snow':event.snow>=20?'mixed precipitation':'rain'; const starts=event.modelWindows.filter(w=>w.wet&&w.start).map(w=>w.start); const early=starts.length?new Date(Math.min(...starts.map(d=>d.getTime()))):event.start;
    rail.dataset.state=confidence.state;
    text('#answer-eyebrow',leadHours<=3?'TRACKING THIS POINT':'NEXT EVENT AT THIS POINT');
    if(leadHours<=0&&event.end>now){text('#answer-title',`${type==='snow'?'Snow':'Rain'} is in the current window`);text('#answer-copy',`The selected point is inside the active event window. Follow the map and ending time rather than a generic hourly icon.`);}
    else if(leadHours<=3){text('#answer-title',`${type==='snow'?'Snow':'Rain'} is approaching`);text('#answer-copy',`The event is entering the near-term handoff where radar movement matters more than broad model timing.`);}
    else if(leadHours<=48){text('#answer-title',`${type==='snow'?'Snow':'Rain'} is ${confidence.label.toLowerCase()}`);text('#answer-copy',`${event.modelWindows.filter(w=>w.wet).length} of ${MODELS.length} independent forecast families carry this event across the pinpoint.`);}
    else{text('#answer-title',`A ${type} event is developing`);text('#answer-copy','The signal persists days ahead, but exact timing remains intentionally broad until the guidance converges.');}
    text('#first-possible',fmtTime(early)); text('#main-window',timeRange(event.start,event.end)); text('#likely-end',fmtTime(event.end)); text('#event-confidence',confidence.label); text('#timing-confidence',confidence.timing);
    text('#event-name',`${fmtDay(event.start)} ${type} · ${timeRange(event.start,event.end)}`); text('#event-state',leadHours<=3?'TRACKED':confidence.label.toUpperCase());
    text('#event-story',eventStory(event,confidence)); renderEventFlow(event); renderEvidence(event,current,memory); renderForecastStage(event,confidence); renderPointReadout(); renderEventWindow();
  }
  function eventStory(event,confidence) {
    const support=event.modelWindows.filter(w=>w.wet).length;
    const shift=confidence.spread<=2?'The start times are narrowing.':confidence.spread<=5?'The event is credible, but the exact start remains broad.':'The event exists in the guidance, but timing is still moving substantially.';
    return `${support} of ${MODELS.length} forecast families carry this event across the pinpoint. ${shift}`;
  }
  function renderForecastStage(event,confidence) {
    const lead=confidence.lead; const stage=lead<=2?'Live radar handoff':lead<=12?'High-resolution guidance':lead<=48?'Regional forecast':lead<=120?'Event tracking':'Long-range signal'; text('#forecast-stage',stage);
  }
  function renderEventFlow(event) {
    const wrap=$('#event-flow'); wrap.innerHTML='';
    if(!event){for(let i=0;i<24;i++){const el=document.createElement('i');el.className='flow-step';el.style.setProperty('--strength',4);wrap.append(el);}return;}
    const start=new Date(event.start.getTime()-6*3600000); const count=Math.min(42,Math.max(20,Math.ceil((event.end-start)/3600000)+6));
    for(let i=0;i<count;i++){
      const t=new Date(start.getTime()+i*3600000),p=blendAt(t); const el=document.createElement('i'); el.className='flow-step';
      if(Math.abs(t-Date.now())<1800000)el.classList.add('now'); const wet=finite(p?.wet); el.style.setProperty('--strength',wet==null?4:clamp(wet,4,100)); el.title=`${fmtTime(t)} · ${wet==null?'unknown':`${wet}% weighted wet support`}`; wrap.append(el);
    }
  }
  function renderEvidence(event,current,memory) {
    const sourceGrid=$('#source-grid'); sourceGrid.innerHTML=''; const cards=[
      {name:'ECCC radar',role:'Measured precipitation',state:state.frames.some(f=>f.kind==='observed')?'ready':'error',value:state.liveRadarReading?`${classifyCondition(state.liveRadarReading.rate).short} at pinpoint`:'Available on map'},
      {name:'ECCC extrapolation',role:'0–2 hour official nowcast',state:state.frames.some(f=>f.kind==='nowcast')?'ready':'error',value:state.frames.some(f=>f.kind==='nowcast')?'Connected':'Unavailable'},
      {name:'HRDPS',role:'2.5 km Canadian map guidance',state:state.frames.some(f=>f.kind==='guidance')?'ready':'error',value:state.frames.some(f=>f.kind==='guidance')?'Connected':'Unavailable'}
    ];
    MODELS.forEach(model=>{const w=modelWetWindow(model),stale=state.modelStale.get(model.id);cards.push({name:model.name,role:model.role,state:state.modelErrors.has(model.id)?'error':w?.wet?'wet':w?.wet===false?'dry':'ready',value:state.modelErrors.has(model.id)?'Feed error':stale?`Cached ${Math.max(1,Math.round(stale/60000))} min old`:w?.wet?`Wet ${fmtTime(w.start)}–${fmtTime(w.end)}`:w?.wet===false?'No near event':'Precipitation fields unavailable'});});
    cards.forEach(card=>{const el=document.createElement('article');el.className='source-card';el.dataset.state=card.state;el.innerHTML=`<span><small>${esc(card.role)}</small><b>${esc(card.name)}</b></span><em>${esc(card.value)}</em>`;sourceGrid.append(el);});
    const support=event?event.modelWindows.filter(w=>w.wet).length:0;
    text('#evidence-summary',event?`${support} independent forecast families support the next event. Canadian guidance receives the highest base influence; agreement and timing spread control how strongly SkyMap speaks.`:'No event currently clears the declaration threshold.');
    text('#change-note',memory.change);
  }
  function renderRainLine() {
    const wrap=$('#rainline'); wrap.innerHTML=''; if(!state.consensus.length){wrap.innerHTML='<div class="rainline-loading">Forecast guidance is unavailable for this point.</div>';return;}
    const groups=new Map(); state.consensus.forEach(p=>{const key=dateKey(p.time);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
    [...groups.entries()].slice(0,8).forEach(([key,points],dayIndex)=>{
      const known=points.map(point=>finite(point.wet)).filter(value=>value!=null),maxWet=known.length?Math.max(...known):null; const wetHours=points.filter(p=>finite(p.wet)!=null&&p.wet>=42).length; const first=points.find(p=>finite(p.wet)!=null&&p.wet>=42); const last=[...points].reverse().find(p=>finite(p.wet)!=null&&p.wet>=42);
      const line=document.createElement('article'); line.className='day-line'; line.dataset.state=maxWet==null?'unknown':maxWet>=64?'likely':wetHours?'watching':'dry'; line.style.setProperty('--wet',maxWet??4);
      const ribbon=points.map((p,i)=>{const wet=finite(p.wet);if(wet==null||wet<25)return '';const level=wet>=80?4:wet>=62?3:wet>=42?2:1;return `<i class="hour-cell" data-level="${level}" style="left:${i/points.length*100}%;width:${100/points.length+.3}%" title="${esc(fmtTime(p.time))}: ${wet}% weighted wet support"></i>`;}).join('');
      const label=dayIndex===0?'Today':dayIndex===1?'Tomorrow':fmtDay(points[0].time); const status=maxWet==null?'Guidance unavailable':!wetHours?'No strong event':`${fmtTime(first.time)}–${fmtTime(new Date(last.time.getTime()+3600000))}`;
      line.innerHTML=`<span class="day-label"><b>${esc(label)}</b><small>${esc(fmtDate(points[0].time))}</small></span><div class="day-ribbon">${ribbon}</div><em>${esc(status)}</em>`; wrap.append(line);
    });
  }
  function renderConstellation() {
    const wrap=$('#constellation-grid'); wrap.innerHTML=''; MODELS.forEach(model=>{
      const data=state.models.get(model.id),w=modelWetWindow(model); const el=document.createElement('article'); el.className='model-card'; el.dataset.state=data?'ready':'error'; el.style.setProperty('--accent',model.accent);
      const stale=state.modelStale.get(model.id); el.innerHTML=`<header><b>${esc(model.name)}</b><i></i></header><p>${data?(stale?`Cached guidance · ${Math.max(1,Math.round(stale/60000))} min old`:w?.wet?`Next wet signal: ${esc(timeRange(w.start,w.end))}`:w?.wet===false?'No near-term wet signal':'Precipitation fields unavailable'):'Source did not respond'} · base influence ${Math.round(model.weight*100)}%</p>`; wrap.append(el);
    });
  }
  function setFeedHealth(tileError=false) {
    const ready=state.models.size,frames=state.frames.length,evidence=state.evidenceReady.size; const health=$('#feed-health'); let stateName='ready',title=ready>=2?'Core forecast ready':'Connecting forecast families',detail=`${ready}/${MODELS.length} forecast families · ${frames} time frames · ${evidence}/3 evidence layers`;
    if(tileError||ready<2){stateName='partial';title='Some forecast sources are delayed';detail=`${ready}/${MODELS.length} forecast families · ${state.metadataErrors.length} map issue${state.metadataErrors.length===1?'':'s'}`;}
    else if(!frames){detail=`${ready}/${MODELS.length} forecast families · radar timeline loading · ${evidence}/3 evidence layers`;}
    health.dataset.state=stateName; text('#feed-title',title); text('#feed-detail',detail);
  }

  function renderForecastProducts() {
    if(state.models.size<1)return;
    buildConsensus(); renderAnswer(); renderRainLine(); renderConstellation(); setFeedHealth();
  }

  function scheduleForecastRender(delay=80) {
    clearTimeout(scheduleForecastRender.timer);
    scheduleForecastRender.timer=setTimeout(renderForecastProducts,delay);
  }

  function warmEvidence() {
    const {lat,lon}=state.place;
    void window.SkyMapAccuracy?.warm?.(lat,lon);
    void window.SkyMapForecastIQ25?.warm?.(lat,lon);
  }

  async function refreshAll() {
    const id=++state.requestId; state.models.clear(); state.modelErrors.clear(); state.modelStale.clear(); state.evidenceReady.clear(); state.frameReading=null; state.liveRadarReading=null;
    text('#feed-title','Connecting weather sources'); text('#feed-detail','ECCC + four forecast families'); $('#feed-health').dataset.state='loading';
    warmEvidence();
    void buildFrames().then(()=>{if(id===state.requestId)setFeedHealth();}).catch(error=>{state.metadataErrors.push(String(error));showToast('Radar metadata is delayed; forecast guidance can still load.');});
    const tasks=MODELS.map(async model=>{await fetchModel(model,id);if(id===state.requestId&&state.models.size>=2)scheduleForecastRender();});
    await Promise.allSettled(tasks); if(id!==state.requestId)return;
    renderForecastProducts();
  }
  async function setPlace(place,fromMap=false) {
    state.place={...state.place,...place}; savePlace(); placeMarker('loading'); text('#place-name',state.place.name);
    if(!fromMap)state.map.flyTo([state.place.lat,state.place.lon],state.place.zoom||10,{duration:.7}); else state.map.panTo([state.place.lat,state.place.lon],{animate:true,duration:.45});
    closePlaceDialog(); stop(); await refreshAll();
  }
  function useLocation() {
    if(!navigator.geolocation){showToast('Location is not supported by this browser.');return;}
    text('#place-name','Finding your exact point…');
    navigator.geolocation.getCurrentPosition(position=>setPlace({name:'Your exact location',lat:position.coords.latitude,lon:position.coords.longitude,zoom:12}),error=>{
      text('#place-name',state.place.name); showToast(error.code===1?'Location permission was not granted.':'Could not resolve your location.');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:90000});
  }

  function openPlaceDialog(){const d=$('#place-dialog');if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');setTimeout(()=>$('#place-search')?.focus(),40);}
  function closePlaceDialog(){const d=$('#place-dialog');if(d.open)d.close();}
  function renderQuickPlaces(){
    const wrap=$('#quick-places'); wrap.innerHTML=''; QUICK_PLACES.forEach(place=>{
      const b=document.createElement('button'); b.type='button'; b.className='quick-place'; b.innerHTML=`<span><b>${esc(place.name)}</b><small>${esc(place.detail)}</small></span><i>↗</i>`; b.addEventListener('click',()=>setPlace(place)); wrap.append(b);
    });
  }
  async function searchPlaces(query) {
    const wrap=$('#search-results'); if(query.trim().length<2){wrap.innerHTML='';return;} wrap.innerHTML='<div class="rainline-loading">Searching Ontario…</div>';
    try{
      const params=new URLSearchParams({name:query,count:'10',language:'en',format:'json',countryCode:'CA'}); const response=await fetch(`${GEOCODE}?${params}`); if(!response.ok)throw new Error('Search failed'); const data=await response.json();
      const results=(data.results||[]).filter(r=>r.admin1==='Ontario'||(r.latitude>=41.5&&r.latitude<=57&&r.longitude>=-95.5&&r.longitude<=-74)); wrap.innerHTML='';
      results.slice(0,7).forEach(result=>{
        const b=document.createElement('button'); b.type='button'; b.className='search-result'; b.innerHTML=`<span><b>${esc(result.name)}</b><small>${esc([result.admin2,result.admin1].filter(Boolean).join(', '))}</small></span><i>↗</i>`;
        b.addEventListener('click',()=>setPlace({name:result.name,lat:result.latitude,lon:result.longitude,zoom:11})); wrap.append(b);
      });
      if(!wrap.children.length)wrap.innerHTML='<div class="rainline-loading">No Ontario place found.</div>';
    }catch(_){wrap.innerHTML='<div class="rainline-loading">Place search is temporarily unavailable.</div>';}
  }
  function toggleEvidence(open) {
    const drawer=$('#evidence-drawer'); const next=open??!drawer.classList.contains('open'); drawer.classList.toggle('open',next); drawer.setAttribute('aria-hidden',String(!next));
    $('#why-button').setAttribute('aria-expanded',String(next)); $('#why-button span').textContent=next?'−':'＋';
  }

  function bind() {
    $('#time-slider').addEventListener('input',e=>{stop();showFrame(Number(e.target.value),false);});
    $('#play-button').addEventListener('click',play); $('#speed-button').addEventListener('click',cycleSpeed);
    $$('[data-jump]').forEach(button=>button.addEventListener('click',()=>jumpTo(button.dataset.jump)));
    $('#why-button').addEventListener('click',()=>toggleEvidence()); $('#evidence-close').addEventListener('click',()=>toggleEvidence(false));
    $('#place-button').addEventListener('click',openPlaceDialog); $('#locate-button').addEventListener('click',useLocation); $('#dialog-locate').addEventListener('click',useLocation);
    $('#map-locate').addEventListener('click',()=>state.map.flyTo([state.place.lat,state.place.lon],Math.max(11,state.map.getZoom()),{duration:.55}));
    $('#map-zoom').addEventListener('click',()=>state.map.flyTo([46.2,-84.2],5,{duration:.75}));
    $('#place-search').addEventListener('input',e=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>searchPlaces(e.target.value),240);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleEvidence(false);}); document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
    window.addEventListener('resize',requestPointReadoutPosition);
    window.addEventListener('skymap:evidence-ready',event=>{
      const key=`${state.place.lat.toFixed(2)},${state.place.lon.toFixed(2)}`; if(event.detail?.placeKey!==key)return;
      state.evidenceReady.add(event.detail.source); scheduleForecastRender(120);
    });
  }

  async function init() {
    renderQuickPlaces(); bind(); initMap(); text('#place-name',state.place.name); await refreshAll();
    if(!localStorage.getItem('skymap.lab.locationAsked')&&navigator.geolocation){try{localStorage.setItem('skymap.lab.locationAsked','1');useLocation();}catch(_){} }
    setInterval(()=>{if(!document.hidden)refreshAll();},30*60*1000);
  }

  if(window.L)init(); else {text('#point-readout-title','Map library could not load');text('#point-readout-copy','Reload the page or use the current SkyMap app.');text('#answer-title','Map unavailable');}
})();
