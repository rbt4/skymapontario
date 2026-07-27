(() => {
  'use strict';

  const GEOMET = 'https://geo.weather.gc.ca/geomet';
  const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
  const MODEL_CACHE_MS = 45 * 60 * 1000;
  const WET_THRESHOLD = 0.12;
  const MODELS = [
    { id:'gem', name:'Canada GEM', endpoint:'https://api.open-meteo.com/v1/gem', model:'gem_seamless', weight:.38, accent:'#76e8ff', role:'Canadian-first local guidance' },
    { id:'ifs', name:'ECMWF IFS', endpoint:'https://api.open-meteo.com/v1/ecmwf', model:'ecmwf_ifs025', weight:.27, accent:'#d8ff79', role:'Independent global physics model' },
    { id:'gfs', name:'NOAA GFS', endpoint:'https://api.open-meteo.com/v1/gfs', model:'gfs_seamless', weight:.19, accent:'#ffd27b', role:'Independent North American guidance' },
    { id:'aifs', name:'ECMWF AIFS', endpoint:'https://api.open-meteo.com/v1/ecmwf', model:'ecmwf_aifs025_single', weight:.16, accent:'#c1a7ff', role:'Independent AI model signal' }
  ];
  const QUICK_PLACES = [
    { name:'Toronto', detail:'Toronto, Ontario', lat:43.6532, lon:-79.3832, zoom:9 },
    { name:'Oakville', detail:'Halton, Ontario', lat:43.4675, lon:-79.6877, zoom:10 },
    { name:'Etobicoke', detail:'Toronto, Ontario', lat:43.6205, lon:-79.5132, zoom:10 },
    { name:'Ottawa', detail:'Ottawa, Ontario', lat:45.4215, lon:-75.6972, zoom:9 },
    { name:'Hamilton', detail:'Hamilton, Ontario', lat:43.2557, lon:-79.8711, zoom:9 },
    { name:'London', detail:'Middlesex, Ontario', lat:42.9849, lon:-81.2453, zoom:9 }
  ];
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const state = {
    place: loadPlace(), map:null, marker:null, overlay:null, frames:[], frameIndex:0, playing:false, playTimer:null,
    models:new Map(), modelErrors:new Map(), timezone:'America/Toronto', consensus:[], events:[],
    searchTimer:null, requestId:0, metadataErrors:[]
  };

  function loadPlace() {
    try {
      const saved = JSON.parse(localStorage.getItem('skymap.lab.place') || localStorage.getItem('skymap.place') || 'null');
      if (saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lon))) return { name:saved.name || 'Saved point', lat:Number(saved.lat), lon:Number(saved.lon), zoom:Number(saved.zoom)||10 };
    } catch (_) {}
    return { ...QUICK_PLACES[0] };
  }
  function savePlace() { try { localStorage.setItem('skymap.lab.place', JSON.stringify(state.place)); } catch (_) {} }
  function text(selector,value) { const el=$(selector); if(el) el.textContent=value; }
  function showToast(message) { const el=$('#toast'); if(!el)return; el.textContent=message; el.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>el.classList.remove('show'),2600); }
  function fmt(value, options={}) { const d=value instanceof Date?value:new Date(value); if(!Number.isFinite(d.getTime()))return '—'; try{return new Intl.DateTimeFormat('en-CA',{timeZone:state.timezone,...options}).format(d)}catch(_){return new Intl.DateTimeFormat('en-CA',options).format(d)} }
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

  function initMap() {
    state.map=L.map('future-map',{zoomControl:false,attributionControl:true,minZoom:4,maxZoom:14,preferCanvas:true,fadeAnimation:false}).setView([state.place.lat,state.place.lon],state.place.zoom||9);
    state.map.attributionControl.setPrefix(false);
    state.map.createPane('weather'); state.map.getPane('weather').style.zIndex=340;
    state.map.createPane('labels'); state.map.getPane('labels').style.zIndex=380;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,opacity:.98,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(state.map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,opacity:.93,pane:'labels'}).addTo(state.map);
    placeMarker();
    state.map.on('click', e => setPlace({name:'Selected point',lat:e.latlng.lat,lon:e.latlng.lng,zoom:Math.max(9,state.map.getZoom())},true));
  }
  function placeMarker() {
    const icon=L.divIcon({className:'skymap-point',html:'<span></span>',iconSize:[22,22],iconAnchor:[11,11]});
    if(!state.marker) state.marker=L.marker([state.place.lat,state.place.lon],{icon,pane:'labels',zIndexOffset:1000}).addTo(state.map);
    else state.marker.setLatLng([state.place.lat,state.place.lon]);
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
  async function layerTimes(layer) {
    const url=`${GEOMET}?service=WMS&request=GetCapabilities&version=1.3.0&lang=en&_=${Date.now()}`;
    const response=await fetch(url,{cache:'no-store'}); if(!response.ok)throw new Error(`GeoMet ${response.status}`);
    const xml=new DOMParser().parseFromString(await response.text(),'application/xml'); const node=findLayer(xml,layer); if(!node)throw new Error(`${layer} unavailable`);
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
      let times=meta.times.filter(v=>{const t=new Date(v).getTime(); if(spec.kind==='observed')return t>=now-75*60000&&t<=now+6*60000; if(spec.kind==='nowcast')return t>=now-8*60000&&t<=now+130*60000; return t>=now+100*60000&&t<=now+49*3600000;});
      times=sampleEvenly(times,spec.kind==='observed'?7:spec.kind==='nowcast'?6:10);
      times.forEach(time=>frames.push({...spec,time,reference:meta.reference}));
    });
    frames.sort((a,b)=>new Date(a.time)-new Date(b.time));
    state.frames=frames;
    if(!frames.length) state.frames=[{...specs[0],time:null,reference:null}];
    const near=state.frames.reduce((best,f,i)=>Math.abs((new Date(f.time||now)).getTime()-now)<Math.abs((new Date(state.frames[best].time||now)).getTime()-now)?i:best,0);
    state.frameIndex=near; renderTimeline(); showFrame(near,false);
  }
  function showFrame(index,pan=true) {
    state.frameIndex=clamp(index,0,state.frames.length-1); const frame=state.frames[state.frameIndex];
    if(state.overlay){try{state.map.removeLayer(state.overlay)}catch(_){}}
    const opts={layers:frame.layer,styles:frame.style||'',format:'image/png',transparent:true,opacity:frame.kind==='guidance'?.62:.76,version:'1.3.0',pane:'weather',uppercase:true};
    if(frame.time)opts.time=frame.time; if(frame.reference)opts.reference_time=frame.reference;
    state.overlay=L.tileLayer.wms(GEOMET,opts).addTo(state.map);
    state.overlay.on('load',()=>setFeedHealth()); state.overlay.on('tileerror',()=>setFeedHealth(true));
    const phase=$('#source-phase'); phase.dataset.phase=frame.kind;
    text('#phase-kicker',frame.kind==='observed'?'OBSERVED':frame.kind==='nowcast'?'PREDICTED':'GUIDANCE');
    text('#phase-title',frame.label);
    text('#time-kind',frame.kind==='observed'?'MEASURED':frame.kind==='nowcast'?'RADAR NOWCAST':'MODEL GUIDANCE');
    text('#time-label',frame.time?fmtTime(frame.time):'LATEST');
    const lead=frame.time?minutesFromNow(frame.time):0;
    text('#time-detail',frame.kind==='observed'?'Measured by ECCC radar':frame.kind==='nowcast'?`${Math.max(0,lead)} minutes ahead · official extrapolation`:`${Math.max(0,Math.round(lead/60))} hours ahead · HRDPS`);
    $('#time-slider').value=String(state.frameIndex);
    $$('.track-node').forEach((el,i)=>el.classList.toggle('active',i===state.frameIndex));
    $('#forecast-beam').classList.toggle('active',frame.kind!=='observed');
    if(pan&&state.marker)state.map.panTo(state.marker.getLatLng(),{animate:true,duration:.35});
  }
  function renderTimeline() {
    const slider=$('#time-slider'),track=$('#time-track'); slider.max=String(Math.max(0,state.frames.length-1)); slider.value=String(state.frameIndex); track.innerHTML='';
    state.frames.forEach((f,i)=>{const node=document.createElement('i');node.className='track-node';node.dataset.kind=f.kind;node.style.left=`${state.frames.length===1?0:i/(state.frames.length-1)*100}%`;track.append(node)});
  }
  function play() {
    if(state.playing){stop();return} state.playing=true; $('#play-button').classList.add('playing');
    state.playTimer=setInterval(()=>{const next=(state.frameIndex+1)%state.frames.length;showFrame(next,false)},950);
  }
  function stop(){state.playing=false;clearInterval(state.playTimer);state.playTimer=null;$('#play-button').classList.remove('playing')}

  function modelUrl(model) {
    const params=new URLSearchParams({latitude:state.place.lat.toFixed(4),longitude:state.place.lon.toFixed(4),timezone:'auto',forecast_days:'8',models:model.model,hourly:'temperature_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m'});
    return `${model.endpoint}?${params}`;
  }
  async function fetchModel(model,requestId) {
    const cacheKey=`skymap.lab.model.${model.id}.${state.place.lat.toFixed(2)}.${state.place.lon.toFixed(2)}`;
    try {
      const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');
      if(cached?.savedAt&&Date.now()-cached.savedAt<MODEL_CACHE_MS&&cached.data?.hourly?.time?.length){state.models.set(model.id,cached.data);return cached.data}
    } catch(_){}
    try {
      const response=await fetch(modelUrl(model),{cache:'no-store'}); if(!response.ok)throw new Error(`HTTP ${response.status}`); const data=await response.json();
      if(requestId!==state.requestId)return null; if(!data?.hourly?.time?.length)throw new Error('No hourly data');
      state.models.set(model.id,data); state.modelErrors.delete(model.id); if(data.timezone)state.timezone=data.timezone;
      try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),data}))}catch(_){} return data;
    } catch(error){state.modelErrors.set(model.id,String(error));return null}
  }
  function pointAt(model,data,target) {
    const hourly=data?.hourly; if(!hourly?.time?.length)return null; const wanted=new Date(target).getTime(); let best=0,delta=Infinity;
    hourly.time.forEach((v,i)=>{const d=Math.abs(modelDate(data,v).getTime()-wanted);if(d<delta){best=i;delta=d}});
    const val=k=>finite(hourly[k]?.[best])??0; const code=val('weather_code'); const precip=Math.max(0,val('precipitation'),val('rain')+val('showers'),val('snowfall')*.7);
    return {model,time:modelDate(data,hourly.time[best]),precip,rain:Math.max(0,val('rain')+val('showers')),snow:Math.max(0,val('snowfall')),code,temp:val('temperature_2m'),cloud:clamp(val('cloud_cover'),0,100),wind:Math.max(0,val('wind_speed_10m')),gust:Math.max(0,val('wind_gusts_10m')),wet:precip>=WET_THRESHOLD||[51,53,55,56,57,61,63,65,71,73,75,77,80,81,82,85,86,95,96,99].includes(code)};
  }
  function blendAt(target) {
    const rows=MODELS.map(model=>{const p=pointAt(model,state.models.get(model.id),target);return p?{...p,weight:model.weight}:null}).filter(Boolean); if(!rows.length)return null;
    const total=rows.reduce((s,r)=>s+r.weight,0); const wetWeight=rows.reduce((s,r)=>s+(r.wet?r.weight:0),0)/total; const precip=rows.reduce((s,r)=>s+r.precip*r.weight,0)/total;
    const snowWeight=rows.reduce((s,r)=>s+(r.snow>0?r.weight:0),0)/total; const wetModels=rows.filter(r=>r.wet).length;
    return {time:new Date(target),rows,wet:Math.round(wetWeight*100),precip,snow:Math.round(snowWeight*100),wetModels,totalModels:rows.length,agreement:Math.round(Math.max(wetWeight,1-wetWeight)*100)};
  }
  function buildConsensus() {
    const now=new Date(); now.setMinutes(0,0,0); const points=[];
    for(let h=0;h<8*24;h++){const point=blendAt(new Date(now.getTime()+h*3600000));if(point)points.push(point)}
    state.consensus=points; state.events=identifyEvents(points); return points;
  }
  function identifyEvents(points) {
    const events=[]; let active=null;
    points.forEach((p,index)=>{
      const wet=p.wet>=42||p.precip>=.11; const next=points[index+1];
      if(wet&&!active)active={start:p.time,end:p.time,points:[p],peak:p};
      else if(wet&&active){active.end=p.time;active.points.push(p);if(p.precip>active.peak.precip)active.peak=p}
      else if(active){const gap=next&&next.wet>=42&&new Date(next.time)-new Date(p.time)<=2*3600000;if(!gap){events.push(finalizeEvent(active));active=null}}
    }); if(active)events.push(finalizeEvent(active)); return events;
  }
  function finalizeEvent(event) {
    event.end=new Date(new Date(event.end).getTime()+3600000); event.maxWet=Math.max(...event.points.map(p=>p.wet)); event.meanWet=Math.round(event.points.reduce((s,p)=>s+p.wet,0)/event.points.length);
    event.total=event.points.reduce((s,p)=>s+p.precip,0); event.snow=Math.max(...event.points.map(p=>p.snow)); event.modelWindows=modelEventWindows(event.start,event.end); return event;
  }
  function modelEventWindows(start,end) {
    return MODELS.map(model=>{
      const data=state.models.get(model.id); if(!data)return {model,error:true}; const times=data.hourly.time.map(v=>modelDate(data,v)); const wet=[];
      times.forEach(t=>{if(t>=new Date(start.getTime()-12*3600000)&&t<=new Date(end.getTime()+12*3600000)){const p=pointAt(model,data,t);if(p?.wet)wet.push(t)}});
      return {model,start:wet[0]||null,end:wet.length?new Date(wet.at(-1).getTime()+3600000):null,wet:Boolean(wet.length)};
    });
  }
  function eventConfidence(event) {
    if(!event)return {label:'No event',timing:'—',state:'dry'}; const lead=(event.start-Date.now())/3600000; const windows=event.modelWindows.filter(w=>w.wet&&w.start); const support=windows.reduce((s,w)=>s+w.model.weight,0); const starts=windows.map(w=>w.start.getTime()); const spread=starts.length>1?(Math.max(...starts)-Math.min(...starts))/3600000:12;
    const eventLabel=support>=.82?'Very high':support>=.64?'High':support>=.45?'Developing':'Watching';
    const timing=lead<=3?'Radar tracking':spread<=2?'Converging':spread<=5?'Broad window':'Unsettled';
    return {label:eventLabel,timing,state:support>=.64?'likely':'uncertain',support,spread,lead};
  }
  function modelWetWindow(model) {
    const data=state.models.get(model.id); if(!data)return null; const now=Date.now(); const points=data.hourly.time.map(v=>pointAt(model,data,modelDate(data,v))).filter(p=>p&&p.time>=now-3600000); const first=points.findIndex(p=>p.wet); if(first<0)return {wet:false}; let end=first; while(end+1<points.length&&points[end+1].wet)end++; return {wet:true,start:points[first].time,end:new Date(points[end].time.getTime()+3600000),peak:points.slice(first,end+1).reduce((a,b)=>a.precip>b.precip?a:b)};
  }
  function predictionMemory(event) {
    const key=`skymap.lab.prediction.${state.place.lat.toFixed(2)}.${state.place.lon.toFixed(2)}`; let previous=null; try{previous=JSON.parse(localStorage.getItem(key)||'null')}catch(_){}
    const current=event?{savedAt:Date.now(),start:event.start.toISOString(),end:event.end.toISOString(),confidence:eventConfidence(event).label}:null; let stability='New reading',change='This is the first forecast stored for this point.';
    if(previous?.start&&event){const shift=Math.round((event.start-new Date(previous.start))/60000); const age=Date.now()-(previous.savedAt||0); if(Math.abs(shift)<=15){stability='Stable';change=`The leading rain window has moved only ${Math.abs(shift)} minutes since the previous saved forecast.`}else if(shift>0){stability='Shifting later';change=`The next event has shifted ${shift} minutes later since the previous saved forecast.`}else{stability='Shifting earlier';change=`The next event has shifted ${Math.abs(shift)} minutes earlier since the previous saved forecast.`} if(age>24*3600000)change+=' The previous comparison is more than a day old.'}
    else if(previous?.start&&!event){stability='Event faded';change='A previously stored precipitation signal is no longer supported strongly enough to declare.'}
    try{localStorage.setItem(key,JSON.stringify(current))}catch(_){} return {stability,change};
  }

  function renderAnswer() {
    const now=Date.now(); const event=state.events.find(e=>e.end>now)||null; const confidence=eventConfidence(event); const memory=predictionMemory(event); const current=blendAt(new Date()); const answer=$('#point-answer');
    text('#place-name',state.place.name); text('#answer-updated',`UPDATED ${fmtTime(new Date())}`); text('#forecast-stability',memory.stability); text('#change-note',memory.change);
    if(!event){answer.dataset.state='dry';text('#answer-title','No meaningful precipitation signal.');text('#answer-copy','The available model families keep this exact point mostly dry through the next seven days. A weak or isolated shower can still develop between forecast updates.');text('#first-possible','None found');text('#main-window','No declared event');text('#likely-end','—');text('#event-confidence','Dry signal');text('#timing-confidence','No window');text('#event-name','No declared rain or snow event');text('#event-state','DRY SIGNAL');text('#event-story','SkyMap found no precipitation event strong enough to declare across the available independent guidance.');renderEvidence(null,current,memory);text('#forecast-stage','No declared event');return}
    const leadHours=(event.start-now)/3600000; const type=event.snow>=45?'snow':event.snow>=20?'mixed precipitation':'rain'; const starts=event.modelWindows.filter(w=>w.wet&&w.start).map(w=>w.start); const early=starts.length?new Date(Math.min(...starts.map(d=>d.getTime()))):event.start;
    answer.dataset.state=confidence.state; text('#answer-eyebrow',leadHours<=3?'TRACKING THIS EXACT POINT':'NEXT EVENT AT THIS EXACT POINT');
    if(leadHours<=0&&event.end>now){text('#answer-title',`${type==='snow'?'Snow':'Rain'} is in your current window.`);text('#answer-copy',`Independent guidance supports precipitation at this point now. The map timeline shows what is measured, extrapolated and modelled separately.`)}
    else if(leadHours<=3){text('#answer-title',`${type==='snow'?'Snow':'Rain'} is approaching this point.`);text('#answer-copy',`The event has entered the near-term tracking window. Official radar extrapolation should increasingly replace broad model timing as it gets closer.`)}
    else if(leadHours<=48){text('#answer-title',`${type==='snow'?'Snow':'Rain'} is ${confidence.label.toLowerCase()} for this point.`);text('#answer-copy',`The event appears across ${event.modelWindows.filter(w=>w.wet).length} of ${MODELS.length} independent forecast families. Its timing will narrow as regional guidance and radar take over.`)}
    else{text('#answer-title',`A ${type} event is developing.`);text('#answer-copy',`The signal persists days ahead, but SkyMap keeps the timing broad instead of drawing fake high-resolution radar this far into the future.`)}
    text('#first-possible',fmtTime(early)); text('#main-window',timeRange(event.start,event.end)); text('#likely-end',fmtTime(event.end)); text('#event-confidence',confidence.label); text('#timing-confidence',confidence.timing);
    text('#event-name',`${fmtDay(event.start)} ${type} event · ${timeRange(event.start,event.end)}`); text('#event-state',leadHours<=3?'TRACKED':confidence.label.toUpperCase());
    text('#event-story',eventStory(event,confidence)); renderEventFlow(event); renderEvidence(event,current,memory); renderForecastStage(event,confidence);
  }
  function eventStory(event,confidence) {
    const support=event.modelWindows.filter(w=>w.wet).length; const shift=confidence.spread<=2?'The model start times are converging.':confidence.spread<=5?'The event is credible, but its exact start remains a broad window.':'The event exists in the guidance, but timing is still moving substantially.';
    return `${support} of ${MODELS.length} forecast families carry this event across the selected point. ${shift}`;
  }
  function renderForecastStage(event,confidence) {
    const lead=confidence.lead; const stage=lead<=2?'Live radar handoff':lead<=12?'High-resolution guidance':lead<=48?'Regional forecast':lead<=120?'Event tracking':'Long-range signal'; text('#forecast-stage',stage);
  }
  function renderEventFlow(event) {
    const wrap=$('#event-flow');wrap.innerHTML=''; const start=new Date(event.start.getTime()-6*3600000); const count=Math.min(36,Math.max(18,Math.ceil((event.end-start)/3600000)+6));
    for(let i=0;i<count;i++){const t=new Date(start.getTime()+i*3600000),p=blendAt(t);const el=document.createElement('i');el.className='flow-step';if(Math.abs(t-Date.now())<1800000)el.classList.add('now');el.style.setProperty('--strength',p?clamp(p.wet,4,100):4);el.title=`${fmtTime(t)} · ${p?.wet||0}% weighted wet support`;wrap.append(el)}
  }
  function renderEvidence(event,current,memory) {
    const sourceGrid=$('#source-grid');sourceGrid.innerHTML=''; const currentFrame=state.frames[state.frameIndex]; const cards=[
      {name:'ECCC radar',role:'Measured precipitation',state:currentFrame?.kind==='observed'?'wet':'ready',value:currentFrame?.kind==='observed'?'Visible on map':'Available in timeline'},
      {name:'ECCC extrapolation',role:'0–2 hour official nowcast',state:state.frames.some(f=>f.kind==='nowcast')?'ready':'error',value:state.frames.some(f=>f.kind==='nowcast')?'Connected':'Unavailable'},
      {name:'HRDPS',role:'2.5 km Canadian map guidance',state:state.frames.some(f=>f.kind==='guidance')?'ready':'error',value:state.frames.some(f=>f.kind==='guidance')?'Connected':'Unavailable'}
    ];
    MODELS.forEach(model=>{const w=modelWetWindow(model);cards.push({name:model.name,role:model.role,state:state.modelErrors.has(model.id)?'error':w?.wet?'wet':'dry',value:state.modelErrors.has(model.id)?'Feed error':w?.wet?`Wet ${fmtTime(w.start)}–${fmtTime(w.end)}`:'No near event'})});
    cards.forEach(card=>{const el=document.createElement('article');el.className='source-card';el.dataset.state=card.state;el.innerHTML=`<span><small>${esc(card.role)}</small><b>${esc(card.name)}</b></span><em>${esc(card.value)}</em>`;sourceGrid.append(el)});
    const support=event?event.modelWindows.filter(w=>w.wet).length:0; text('#evidence-summary',event?`${support} independent forecast families support the next precipitation event. Canadian guidance receives the highest base weight; agreement and timing spread control how confidently SkyMap speaks.`:'No event currently clears the declaration threshold.'); text('#change-note',memory.change);
  }
  function renderRainLine() {
    const wrap=$('#rainline');wrap.innerHTML=''; if(!state.consensus.length){wrap.innerHTML='<div class="rainline-loading">Forecast guidance is unavailable for this point.</div>';return}
    const groups=new Map();state.consensus.forEach(p=>{const key=dateKey(p.time);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p)});
    [...groups.entries()].slice(0,8).forEach(([key,points],dayIndex)=>{
      const maxWet=Math.max(...points.map(p=>p.wet));const wetHours=points.filter(p=>p.wet>=42).length;const first=points.find(p=>p.wet>=42);const last=[...points].reverse().find(p=>p.wet>=42);const line=document.createElement('article');line.className='day-line';line.dataset.state=maxWet>=64?'likely':wetHours?'watching':'dry';line.style.setProperty('--wet',maxWet);
      const ribbon=points.map((p,i)=>{if(p.wet<25)return '';const level=p.wet>=80?4:p.wet>=62?3:p.wet>=42?2:1;return `<i class="hour-cell" data-level="${level}" style="left:${i/points.length*100}%;width:${100/points.length+0.3}%" title="${esc(fmtTime(p.time))}: ${p.wet}% weighted wet support"></i>`}).join('');
      const label=dayIndex===0?'Today':dayIndex===1?'Tomorrow':fmtDay(points[0].time);const status=!wetHours?'No declared event':`${fmtTime(first.time)}–${fmtTime(new Date(last.time.getTime()+3600000))}`;
      line.innerHTML=`<span class="day-label"><b>${esc(label)}</b><small>${esc(fmtDate(points[0].time))}</small></span><div class="day-ribbon">${ribbon}</div><em>${esc(status)}</em>`;wrap.append(line)
    });
  }
  function renderConstellation() {
    const wrap=$('#constellation-grid');wrap.innerHTML='';MODELS.forEach(model=>{const data=state.models.get(model.id),w=modelWetWindow(model);const el=document.createElement('article');el.className='model-card';el.dataset.state=data?'ready':'error';el.style.setProperty('--accent',model.accent);el.innerHTML=`<header><b>${esc(model.name)}</b><i></i></header><p>${data?(w?.wet?`Next wet signal: ${esc(timeRange(w.start,w.end))}`:'No near-term wet signal'):'Source did not respond'} · base influence ${Math.round(model.weight*100)}%</p>`;wrap.append(el)});
  }
  function setFeedHealth(tileError=false) {
    const ready=state.models.size,frames=state.frames.length; const health=$('#feed-health'); let stateName='ready',title='All core systems connected',detail=`${ready}/${MODELS.length} forecast families · ${frames} weather frames`;
    if(tileError||!frames||ready<2){stateName='partial';title='Some weather sources are delayed';detail=`${ready}/${MODELS.length} forecast families · ${state.metadataErrors.length} map feed issue${state.metadataErrors.length===1?'':'s'}`}
    health.dataset.state=stateName;text('#feed-title',title);text('#feed-detail',detail);
  }

  async function refreshAll() {
    const id=++state.requestId; state.models.clear();state.modelErrors.clear();text('#feed-title','Connecting to weather sources');text('#feed-detail','ECCC GeoMet + four forecast families');$('#feed-health').dataset.state='loading';
    const framePromise=buildFrames().catch(error=>{state.metadataErrors.push(String(error));showToast('Radar metadata is delayed; forecast guidance can still load.')});
    await Promise.all(MODELS.map(model=>fetchModel(model,id))); if(id!==state.requestId)return; await framePromise;
    buildConsensus();renderAnswer();renderRainLine();renderConstellation();setFeedHealth();
  }
  async function setPlace(place,fromMap=false) {
    state.place={...state.place,...place};savePlace();placeMarker();text('#place-name',state.place.name);if(!fromMap)state.map.flyTo([state.place.lat,state.place.lon],state.place.zoom||10,{duration:.65});else state.map.panTo([state.place.lat,state.place.lon]);
    closePlaceDialog();stop();await refreshAll();
  }
  function useLocation() {
    if(!navigator.geolocation){showToast('Location is not supported by this browser.');return}
    text('#place-name','Finding your exact point…');navigator.geolocation.getCurrentPosition(position=>setPlace({name:'Your location',lat:position.coords.latitude,lon:position.coords.longitude,zoom:11}),error=>{text('#place-name',state.place.name);showToast(error.code===1?'Location permission was not granted.':'Could not resolve your location.')},{enableHighAccuracy:true,timeout:12000,maximumAge:120000});
  }

  function openPlaceDialog(){const d=$('#place-dialog');if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');$('#place-search').focus()}
  function closePlaceDialog(){const d=$('#place-dialog');if(d.open)d.close()}
  function renderQuickPlaces(){const wrap=$('#quick-places');wrap.innerHTML='';QUICK_PLACES.forEach(place=>{const b=document.createElement('button');b.type='button';b.className='quick-place';b.innerHTML=`<span><b>${esc(place.name)}</b><small>${esc(place.detail)}</small></span><i>↗</i>`;b.addEventListener('click',()=>setPlace(place));wrap.append(b)})}
  async function searchPlaces(query) {
    const wrap=$('#search-results');if(query.trim().length<2){wrap.innerHTML='';return}wrap.innerHTML='<div class="rainline-loading">Searching Ontario…</div>';
    try{const params=new URLSearchParams({name:query,count:'8',language:'en',format:'json',countryCode:'CA'});const response=await fetch(`${GEOCODE}?${params}`);if(!response.ok)throw new Error('Search failed');const data=await response.json();const results=(data.results||[]).filter(r=>r.admin1==='Ontario'||r.latitude>=41.5&&r.latitude<=57&&r.longitude>=-95.5&&r.longitude<=-74);wrap.innerHTML='';results.slice(0,6).forEach(result=>{const b=document.createElement('button');b.type='button';b.className='search-result';b.innerHTML=`<span><b>${esc(result.name)}</b><small>${esc([result.admin2,result.admin1].filter(Boolean).join(', '))}</small></span><i>↗</i>`;b.addEventListener('click',()=>setPlace({name:result.name,lat:result.latitude,lon:result.longitude,zoom:10}));wrap.append(b)});if(!wrap.children.length)wrap.innerHTML='<div class="rainline-loading">No Ontario place found.</div>'}catch(_){wrap.innerHTML='<div class="rainline-loading">Place search is temporarily unavailable.</div>'}
  }
  function toggleEvidence(open){const drawer=$('#evidence-drawer');const next=open??!drawer.classList.contains('open');drawer.classList.toggle('open',next);drawer.setAttribute('aria-hidden',String(!next));$('#why-button').setAttribute('aria-expanded',String(next));$('#why-button span').textContent=next?'−':'＋'}

  function bind() {
    $('#time-slider').addEventListener('input',e=>{stop();showFrame(Number(e.target.value),false)});$('#play-button').addEventListener('click',play);$('#why-button').addEventListener('click',()=>toggleEvidence());$('#evidence-close').addEventListener('click',()=>toggleEvidence(false));
    $('#place-button').addEventListener('click',openPlaceDialog);$('#locate-button').addEventListener('click',useLocation);$('#map-locate').addEventListener('click',()=>state.map.flyTo([state.place.lat,state.place.lon],Math.max(10,state.map.getZoom()),{duration:.5}));$('#map-zoom').addEventListener('click',()=>state.map.flyTo([46.2,-84.2],5,{duration:.7}));
    $('#place-search').addEventListener('input',e=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>searchPlaces(e.target.value),280)});document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleEvidence(false)});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
  }

  async function init() {
    renderQuickPlaces();bind();initMap();text('#place-name',state.place.name);await refreshAll();
    if(!localStorage.getItem('skymap.lab.locationAsked')&&navigator.geolocation){try{localStorage.setItem('skymap.lab.locationAsked','1');useLocation()}catch(_){}}
    setInterval(()=>{if(!document.hidden)refreshAll()},30*60*1000);
  }
  if(window.L)init();else{text('#answer-title','Map library could not load.');text('#answer-copy','Reload the page or use the current SkyMap app.')}
})();
