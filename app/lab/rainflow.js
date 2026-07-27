(() => {
  'use strict';

  const GEOMET = 'https://geo.weather.gc.ca/geomet';
  const MODEL_CACHE_MS = 45 * 60 * 1000;
  const WET_THRESHOLD = 0.12;
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MODELS = [
    { id:'gem', name:'Canada GEM', endpoint:'https://api.open-meteo.com/v1/gem', model:'gem_seamless', weight:.38 },
    { id:'ifs', name:'ECMWF IFS', endpoint:'https://api.open-meteo.com/v1/ecmwf', model:'ecmwf_ifs025', weight:.27 },
    { id:'gfs', name:'NOAA GFS', endpoint:'https://api.open-meteo.com/v1/gfs', model:'gfs_seamless', weight:.19 },
    { id:'aifs', name:'ECMWF AIFS', endpoint:'https://api.open-meteo.com/v1/ecmwf', model:'ecmwf_aifs025_single', weight:.16 }
  ];
  const PRECIP_CODES = new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
  const $ = selector => document.querySelector(selector);
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const svgEl = (name,attrs={}) => {
    const el=document.createElementNS(SVG_NS,name);
    Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));
    return el;
  };

  const state = {
    place:null,
    models:new Map(),
    points:[],
    events:[],
    frames:[],
    start:null,
    end:null,
    selectedTime:new Date(),
    history:[],
    calm:null,
    dragging:false,
    requestId:0,
    refreshTimer:null,
    lastSliderValue:null,
    timezone:'America/Toronto'
  };

  function loadPlace() {
    try {
      const saved=JSON.parse(localStorage.getItem('skymap.lab.place')||localStorage.getItem('skymap.place')||'null');
      if(saved&&Number.isFinite(Number(saved.lat))&&Number.isFinite(Number(saved.lon))) {
        return {name:saved.name||'Selected point',lat:Number(saved.lat),lon:Number(saved.lon)};
      }
    } catch(_) {}
    return {name:'Toronto',lat:43.6532,lon:-79.3832};
  }

  function fmt(value,options={}) {
    const date=value instanceof Date?value:new Date(value);
    if(!Number.isFinite(date.getTime()))return '—';
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:state.timezone,...options}).format(date);}catch(_){return new Intl.DateTimeFormat('en-CA',options).format(date);}
  }
  const fmtTime=value=>fmt(value,{hour:'numeric',minute:'2-digit'});
  const fmtDay=value=>fmt(value,{weekday:'short'});
  const fmtDate=value=>fmt(value,{month:'short',day:'numeric'});
  const modelDate=(data,value)=>{
    const number=Number(value);
    return value!==''&&Number.isFinite(number)&&number>1e8?new Date(number*(number<1e12?1000:1)):new Date(value);
  };

  function modelUrl(model) {
    const params=new URLSearchParams({
      latitude:state.place.lat.toFixed(4),longitude:state.place.lon.toFixed(4),timezone:'auto',forecast_days:'8',models:model.model,
      hourly:'temperature_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m'
    });
    return `${model.endpoint}?${params}`;
  }

  async function fetchModel(model,requestId) {
    const key=`skymap.lab.model.${model.id}.${state.place.lat.toFixed(2)}.${state.place.lon.toFixed(2)}`;
    try {
      const cached=JSON.parse(localStorage.getItem(key)||'null');
      if(cached?.data?.hourly?.time?.length&&Date.now()-(cached.savedAt||0)<MODEL_CACHE_MS) {
        state.models.set(model.id,cached.data);
        if(cached.data.timezone)state.timezone=cached.data.timezone;
        return cached.data;
      }
    } catch(_) {}
    try {
      const response=await fetch(modelUrl(model),{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(requestId!==state.requestId||!data?.hourly?.time?.length)return null;
      state.models.set(model.id,data);
      if(data.timezone)state.timezone=data.timezone;
      try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));}catch(_){}
      return data;
    } catch(_) { return null; }
  }

  function pointAt(model,data,target) {
    const hourly=data?.hourly;
    if(!hourly?.time?.length)return null;
    const wanted=new Date(target).getTime();
    let best=0,delta=Infinity;
    hourly.time.forEach((value,index)=>{
      const distance=Math.abs(modelDate(data,value).getTime()-wanted);
      if(distance<delta){best=index;delta=distance;}
    });
    const val=key=>finite(hourly[key]?.[best]);
    const code=val('weather_code');
    const snow=Math.max(0,val('snowfall'));
    const rain=Math.max(0,val('rain')+val('showers'));
    const precip=Math.max(0,val('precipitation'),rain,snow*.7);
    return {model,time:modelDate(data,hourly.time[best]),precip,rain,snow,code,wet:precip>=WET_THRESHOLD||PRECIP_CODES.has(code)};
  }

  function blendAt(target) {
    const rows=MODELS.map(model=>{
      const point=pointAt(model,state.models.get(model.id),target);
      return point?{...point,weight:model.weight}:null;
    }).filter(Boolean);
    if(!rows.length)return null;
    const total=rows.reduce((sum,row)=>sum+row.weight,0);
    const wet=rows.reduce((sum,row)=>sum+(row.wet?row.weight:0),0)/total;
    const precip=rows.reduce((sum,row)=>sum+row.precip*row.weight,0)/total;
    const snow=rows.reduce((sum,row)=>sum+(row.snow>0?row.weight:0),0)/total;
    return {
      time:new Date(target),rows,precip,
      wet:Math.round(wet*100),snow:Math.round(snow*100),
      agreement:Math.round(Math.max(wet,1-wet)*100)
    };
  }

  function buildConsensus() {
    const start=new Date();
    start.setMinutes(0,0,0);
    state.start=new Date(start.getTime()-3*HOUR);
    state.end=new Date(start.getTime()+7*DAY);
    const points=[];
    for(let hour=-3;hour<=7*24;hour+=1){
      const point=blendAt(new Date(start.getTime()+hour*HOUR));
      if(point)points.push(point);
    }
    state.points=points;
    state.events=identifyEvents(points);
    state.calm=findCalmWindow(points);
  }

  function identifyEvents(points) {
    const events=[];
    let active=null;
    points.forEach((point,index)=>{
      const wet=point.wet>=42||point.precip>=.11;
      const next=points[index+1];
      if(wet&&!active)active={start:point.time,end:point.time,points:[point],peak:point};
      else if(wet&&active){active.end=point.time;active.points.push(point);if(point.precip>active.peak.precip)active.peak=point;}
      else if(active){
        const closes=!(next&&next.wet>=42&&new Date(next.time)-new Date(point.time)<=2*HOUR);
        if(closes){events.push(finalizeEvent(active));active=null;}
      }
    });
    if(active)events.push(finalizeEvent(active));
    return events;
  }

  function finalizeEvent(event) {
    event.end=new Date(new Date(event.end).getTime()+HOUR);
    event.total=event.points.reduce((sum,point)=>sum+point.precip,0);
    event.meanWet=Math.round(event.points.reduce((sum,point)=>sum+point.wet,0)/event.points.length);
    event.snow=Math.max(...event.points.map(point=>point.snow));
    event.modelWindows=modelWindows(event.start,event.end);
    const starts=event.modelWindows.filter(window=>window.start).map(window=>window.start.getTime());
    const ends=event.modelWindows.filter(window=>window.end).map(window=>window.end.getTime());
    event.earlyStart=starts.length?new Date(Math.min(...starts)):event.start;
    event.lateStart=starts.length?new Date(Math.max(...starts)):event.start;
    event.earlyEnd=ends.length?new Date(Math.min(...ends)):event.end;
    event.lateEnd=ends.length?new Date(Math.max(...ends)):event.end;
    return event;
  }

  function modelWindows(start,end) {
    return MODELS.map(model=>{
      const data=state.models.get(model.id);
      if(!data)return {model,start:null,end:null,points:[]};
      const candidates=data.hourly.time.map(value=>pointAt(model,data,modelDate(data,value))).filter(point=>point&&point.time>=new Date(start.getTime()-12*HOUR)&&point.time<=new Date(end.getTime()+12*HOUR));
      const segments=[]; let active=[];
      candidates.forEach(point=>{
        if(point.wet)active.push(point);
        else if(active.length){segments.push(active);active=[];}
      });
      if(active.length)segments.push(active);
      const centre=(start.getTime()+end.getTime())/2;
      const wet=segments.sort((a,b)=>Math.abs((a[0].time.getTime()+a.at(-1).time.getTime())/2-centre)-Math.abs((b[0].time.getTime()+b.at(-1).time.getTime())/2-centre))[0]||[];
      return {model,start:wet[0]?.time||null,end:wet.length?new Date(wet.at(-1).time.getTime()+HOUR):null,points:wet};
    });
  }

  function findCalmWindow(points) {
    const limit=Date.now()+48*HOUR;
    let active=null,best=null;
    points.forEach(point=>{
      if(point.time<Date.now()||point.time>limit)return;
      const dry=point.wet<28&&point.precip<.05;
      if(dry&&!active)active={start:point.time,end:new Date(point.time.getTime()+HOUR)};
      else if(dry&&active)active.end=new Date(point.time.getTime()+HOUR);
      else if(active){if(!best||active.end-active.start>best.end-best.start)best=active;active=null;}
    });
    if(active&&(!best||active.end-active.start>best.end-best.start))best=active;
    return best&&best.end-best.start>=2*HOUR?best:null;
  }

  function historyKey(){return `skymap.lab.rainflow.history.${state.place.lat.toFixed(2)}.${state.place.lon.toFixed(2)}`;}
  function loadHistory() {
    try {
      const parsed=JSON.parse(localStorage.getItem(historyKey())||'[]');
      state.history=Array.isArray(parsed)?parsed.filter(item=>item?.start&&item?.end).slice(-8):[];
    } catch(_) {state.history=[];}
  }
  function saveSnapshot() {
    const event=state.events.find(item=>item.end>Date.now());
    if(!event)return;
    const snapshot={savedAt:Date.now(),start:event.start.toISOString(),end:event.end.toISOString(),wet:event.meanWet,snow:event.snow};
    const last=state.history.at(-1);
    const shifted=!last||Math.abs(new Date(last.start)-event.start)>10*60000||Math.abs(new Date(last.end)-event.end)>10*60000;
    if(!last||Date.now()-(last.savedAt||0)>45*60000||shifted){
      state.history=[...state.history,snapshot].slice(-8);
      try{localStorage.setItem(historyKey(),JSON.stringify(state.history));}catch(_){}
    }
  }

  function xForTime(value) {
    const ratio=(new Date(value)-state.start)/(state.end-state.start);
    return 46+clamp(ratio,0,1)*908;
  }
  function timeForX(x) {
    const ratio=clamp((x-46)/908,0,1);
    return new Date(state.start.getTime()+ratio*(state.end-state.start));
  }
  function svgPoint(event) {
    const rect=event.currentTarget.getBoundingClientRect();
    return {x:(event.clientX-rect.left)/rect.width*1000,y:(event.clientY-rect.top)/rect.height*260};
  }

  function bandPath(samples,{baseY=138,amplitude=1,spread=0}={}) {
    if(samples.length===1)samples=[samples[0],{...samples[0],time:new Date(samples[0].time.getTime()+HOUR)}];
    if(samples.length<2)return '';
    const top=[],bottom=[];
    samples.forEach((sample,index)=>{
      const x=xForTime(sample.time);
      const strength=clamp(sample.precip*7+sample.wet*.12,5,34);
      const wave=Math.sin(index*.72)*amplitude;
      const half=strength/2+spread;
      top.push([x,baseY+wave-half]);
      bottom.push([x,baseY+wave+half]);
    });
    const line=points=>points.map((point,index)=>`${index?'L':'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
    return `${line(top)} ${line(bottom.reverse()).replace(/^M/,'L')} Z`;
  }

  function uncertaintyPath(event) {
    const start=event.earlyStart,end=event.lateEnd;
    const x1=xForTime(start),x2=xForTime(end);
    const center=138;
    const leadSpread=clamp((event.lateStart-event.earlyStart)/HOUR*3,5,24);
    const endSpread=clamp((event.lateEnd-event.earlyEnd)/HOUR*3,5,24);
    return `M${x1},${center} C${x1+18},${center-leadSpread} ${x2-18},${center-endSpread} ${x2},${center} C${x2-18},${center+endSpread} ${x1+18},${center+leadSpread} ${x1},${center} Z`;
  }

  function clearGroup(selector){const group=$(selector);while(group?.firstChild)group.removeChild(group.firstChild);}
  function addText(group,x,y,content,className,anchor='middle'){
    const el=svgEl('text',{x,y,'text-anchor':anchor,class:className});el.textContent=content;group.append(el);return el;
  }

  function renderGrid() {
    const group=$('#rainflow-grid');clearGroup('#rainflow-grid');
    const baseline=svgEl('line',{x1:46,y1:138,x2:954,y2:138,class:'flow-baseline'});group.append(baseline);
    const startDay=new Date(state.start);startDay.setHours(0,0,0,0);
    for(let day=0;day<=8;day++){
      const date=new Date(startDay.getTime()+day*DAY);
      if(date<state.start||date>state.end)continue;
      const x=xForTime(date);
      group.append(svgEl('line',{x1:x,y1:26,x2:x,y2:229,class:'flow-day-line'}));
      addText(group,x+6,18,day===0?'Today':fmtDay(date),'flow-day-label','start');
      addText(group,x+6,34,fmtDate(date),'flow-date-label','start');
    }
  }

  function renderBranches() {
    clearGroup('#rainflow-branches');
    const group=$('#rainflow-branches');
    const next=state.events.find(event=>event.end>Date.now());
    if(!next)return;
    next.modelWindows.forEach((window,index)=>{
      if(!window.start||!window.end)return;
      const x1=xForTime(window.start),x2=xForTime(window.end);
      const y=138+(index-1.5)*8;
      const path=svgEl('path',{d:`M${x1},${y} C${x1+22},${y-7} ${x2-22},${y+7} ${x2},${y}`,class:`flow-branch branch-${index}`});
      path.dataset.model=window.model.name;
      group.append(path);
    });
  }

  function renderGhosts() {
    clearGroup('#rainflow-ghosts');
    const group=$('#rainflow-ghosts');
    state.history.slice(0,-1).forEach((snapshot,index,array)=>{
      const x1=xForTime(snapshot.start),x2=xForTime(snapshot.end);
      const opacity=.08+(index+1)/Math.max(array.length,1)*.16;
      const y=138+(array.length-index)*2.2;
      const path=svgEl('path',{d:`M${x1},${y} C${x1+22},${y-10} ${x2-22},${y+10} ${x2},${y}`,class:'flow-ghost'});
      path.style.opacity=String(opacity);
      group.append(path);
    });
  }

  function renderEvents() {
    clearGroup('#rainflow-main');
    const group=$('#rainflow-main');
    state.events.forEach((event,index)=>{
      const envelope=svgEl('path',{d:uncertaintyPath(event),class:'flow-envelope'});
      envelope.style.opacity=String(clamp(event.meanWet/160,.14,.48));
      group.append(envelope);
      const main=svgEl('path',{d:bandPath(event.points,{baseY:138,amplitude:2.4}),class:`flow-river ${event.snow>=40?'snow':''}`});
      main.dataset.event=String(index);
      group.append(main);
      const x1=xForTime(event.start),x2=xForTime(event.end);
      addText(group,(x1+x2)/2,100,event.snow>=40?'Snow event':'Rain event','flow-event-title');
      addText(group,(x1+x2)/2,116,`${fmtDay(event.start)} · ${fmtTime(event.start)}–${fmtTime(event.end)}`,'flow-event-time');
    });
  }

  function renderCalm() {
    clearGroup('#rainflow-calm');
    const group=$('#rainflow-calm');
    if(!state.calm)return;
    const x1=xForTime(state.calm.start),x2=xForTime(state.calm.end);
    group.append(svgEl('rect',{x:x1,y:202,width:Math.max(4,x2-x1),height:12,rx:6,class:'flow-calm-band'}));
    addText(group,(x1+x2)/2,226,`Best dry gap · ${fmtTime(state.calm.start)}–${fmtTime(state.calm.end)}`,'flow-calm-label');
  }

  function updateGate(value,{syncMap=false}={}) {
    if(!state.start||!state.end)return;
    state.selectedTime=new Date(clamp(new Date(value).getTime(),state.start.getTime(),state.end.getTime()));
    const x=xForTime(state.selectedTime);
    const group=$('#rainflow-gate');clearGroup('#rainflow-gate');
    group.append(svgEl('line',{x1:x,y1:42,x2:x,y2:215,class:'flow-gate-line'}));
    group.append(svgEl('circle',{cx:x,cy:138,r:7,class:'flow-gate-node'}));
    group.append(svgEl('circle',{cx:x,cy:138,r:14,class:'flow-gate-pulse'}));
    addText(group,x,53,isNearNow(state.selectedTime)?'YOU · NOW':'YOUR GATE','flow-gate-title');
    addText(group,x,69,`${fmtDay(state.selectedTime)} ${fmtTime(state.selectedTime)}`,'flow-gate-time');
    const label=$('#flow-gate-label');
    if(label){label.style.left=`${x/10}%`;label.textContent=isNearNow(state.selectedTime)?'YOU · NOW':`${fmtDay(state.selectedTime)} ${fmtTime(state.selectedTime)}`;}
    renderGateAnswer();
    if(syncMap)syncMapToTime(state.selectedTime);
  }

  function isNearNow(value){return Math.abs(new Date(value)-Date.now())<15*60000;}
  function nearestPoint(value){return state.points.reduce((best,point)=>!best||Math.abs(point.time-value)<Math.abs(best.time-value)?point:best,null);}
  function eventAt(value){return state.events.find(event=>new Date(value)>=event.start&&new Date(value)<event.end)||null;}
  function nextEventAfter(value){return state.events.find(event=>event.end>new Date(value))||null;}

  function condition(point) {
    if(!point)return {label:'No guidance',impact:'Unavailable',state:'unknown'};
    if(point.snow>=40)return {label:'Snow possible',impact:point.precip>=1?'Snow may affect travel':'Light snow signal',state:'snow'};
    if(point.precip<.03&&point.wet<25)return {label:'Dry',impact:'No meaningful precipitation at this time',state:'dry'};
    if(point.precip<.18)return {label:'A few drops',impact:'Probably manageable without changing plans',state:'drizzle'};
    if(point.precip<1.5)return {label:'Light rain',impact:'An umbrella would be useful',state:'rain'};
    if(point.precip<5)return {label:'Steady rain',impact:'You are likely to get wet outside',state:'rain'};
    return {label:'Heavy rain',impact:'A downpour could interrupt plans',state:'heavy'};
  }

  function lockState(event) {
    if(!event)return 'No active event';
    const lead=(event.start-Date.now())/HOUR;
    const windows=event.modelWindows.filter(window=>window.start);
    const starts=windows.map(window=>window.start.getTime());
    const spread=starts.length>1?(Math.max(...starts)-Math.min(...starts))/HOUR:12;
    if(lead<=2)return 'Radar handoff';
    if(lead<=24&&spread<=2)return 'Timing locking';
    if(spread<=4)return 'Event locked';
    return 'Still branching';
  }

  function renderGateAnswer() {
    const point=nearestPoint(state.selectedTime);
    const active=eventAt(state.selectedTime);
    const upcoming=nextEventAfter(state.selectedTime);
    const result=condition(point);
    const answer=$('#flow-answer');
    if(answer){
      answer.dataset.state=result.state;
      $('#flow-answer-kicker').textContent=isNearNow(state.selectedTime)?'AT YOUR PINPOINT NOW':'AT YOUR SELECTED GATE';
      $('#flow-answer-title').textContent=result.label;
      $('#flow-answer-copy').textContent=active?`${result.impact}. This event continues until about ${fmtTime(active.end)}.`:upcoming?`${result.impact}. Next event: ${fmtDay(upcoming.start)} ${fmtTime(upcoming.start)}.`:result.impact;
    }
    const relevant=active||upcoming;
    $('#flow-lock').textContent=lockState(relevant);
    $('#flow-branches-count').textContent=`${relevant?.modelWindows.filter(window=>window.start).length||0} model paths`;
    $('#flow-memory-count').textContent=state.history.length>1?`${state.history.length-1} forecast ghosts`:'Ghosts build over time';
    $('#flow-calm').textContent=state.calm?`Dry gap ${fmtTime(state.calm.start)}–${fmtTime(state.calm.end)}`:'No long dry gap';
  }

  async function buildFrames() {
    const specs=[
      {layer:'RADAR_1KM_RRAI',kind:'observed'},
      {layer:'Radar_1km_RainPrecipRate-Extrapolation',kind:'nowcast'},
      {layer:'HRDPS.CONTINENTAL.DIAG_PR_PT1H',kind:'guidance'}
    ];
    try {
      const response=await fetch(`${GEOMET}?service=WMS&request=GetCapabilities&version=1.3.0&lang=en&_=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)return;
      const xml=new DOMParser().parseFromString(await response.text(),'application/xml');
      const direct=(node,name)=>[...(node.children||[])].find(child=>child.localName===name)?.textContent?.trim()||'';
      const expand=value=>{
        const raw=(value||'').trim();if(!raw)return [];
        if(raw.includes(','))return raw.split(',').map(item=>new Date(item.trim()).toISOString());
        if(!raw.includes('/'))return [new Date(raw).toISOString()];
        const [a,b,p]=raw.split('/');
        const match=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(p||'');
        const minutes=match?((+match[1]||0)*1440+(+match[2]||0)*60+(+match[3]||0)):60;
        const out=[];for(let time=new Date(a).getTime();time<=new Date(b).getTime()&&out.length<1500;time+=minutes*60000)out.push(new Date(time).toISOString());return out;
      };
      const now=Date.now(),frames=[];
      specs.forEach(spec=>{
        const layer=[...xml.getElementsByTagNameNS('*','Layer')].find(node=>direct(node,'Name')===spec.layer);
        const dimension=[...(layer?.getElementsByTagNameNS('*','Dimension')||[])].find(node=>(node.getAttribute('name')||'').toLowerCase()==='time');
        let times=expand(dimension?.textContent).filter(value=>{
          const time=new Date(value).getTime();
          if(spec.kind==='observed')return time>=now-90*60000&&time<=now+7*60000;
          if(spec.kind==='nowcast')return time>=now-8*60000&&time<=now+130*60000;
          return time>=now+100*60000&&time<=now+49*HOUR;
        });
        const max=spec.kind==='observed'?9:spec.kind==='nowcast'?8:12;
        if(times.length>max)times=Array.from({length:max},(_,index)=>times[Math.round(index*(times.length-1)/(max-1))]);
        times.forEach(time=>frames.push({time:new Date(time),kind:spec.kind}));
      });
      state.frames=frames.sort((a,b)=>a.time-b.time);
    } catch(_) {state.frames=[];}
  }

  function syncMapToTime(value) {
    const slider=$('#time-slider');
    if(!slider||!state.frames.length)return;
    const target=new Date(value);
    const maximum=state.frames.at(-1)?.time;
    if(target>maximum){
      const label=$('#flow-map-note');if(label)label.textContent='Map detail ends near 48 hours; RainFlow continues through the week.';
      return;
    }
    let best=0,delta=Infinity;
    state.frames.forEach((frame,index)=>{const distance=Math.abs(frame.time-target);if(distance<delta){best=index;delta=distance;}});
    slider.value=String(best);
    slider.dispatchEvent(new Event('input',{bubbles:true}));
    const label=$('#flow-map-note');if(label)label.textContent='RainFlow and the radar map are synchronized.';
  }

  function syncGateFromMap() {
    if(state.dragging||!state.start||!state.end)return;
    const slider=$('#time-slider');
    if(!slider||!state.frames.length)return;
    const value=Number(slider.value);
    if(value===state.lastSliderValue)return;
    state.lastSliderValue=value;
    const frame=state.frames[value];
    if(frame)updateGate(frame.time,{syncMap:false});
  }

  function render() {
    if(!$('#rainflow-svg'))return;
    renderGrid();renderCalm();renderGhosts();renderBranches();renderEvents();
    const selected=state.selectedTime>=state.start&&state.selectedTime<=state.end?state.selectedTime:new Date();
    updateGate(selected,{syncMap:false});
    $('#flow-place').textContent=state.place.name;
    $('#flow-status').textContent=state.events.length?`${state.events.length} weather event${state.events.length===1?'':'s'} tracked`:'No strong event tracked';
  }

  function bind() {
    const svg=$('#rainflow-svg');
    if(!svg)return;
    const select=event=>{
      const point=svgPoint(event);
      updateGate(timeForX(point.x),{syncMap:true});
    };
    svg.addEventListener('pointerdown',event=>{state.dragging=true;svg.setPointerCapture?.(event.pointerId);select(event);});
    svg.addEventListener('pointermove',event=>{if(state.dragging)select(event);});
    svg.addEventListener('pointerup',event=>{state.dragging=false;svg.releasePointerCapture?.(event.pointerId);});
    svg.addEventListener('pointercancel',()=>{state.dragging=false;});
    svg.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;
      event.preventDefault();
      const target=event.key==='Home'?new Date():new Date(state.selectedTime.getTime()+(event.key==='ArrowRight'?HOUR:-HOUR));
      updateGate(target,{syncMap:true});
    });
    const observer=new MutationObserver(()=>{
      clearTimeout(state.refreshTimer);
      state.refreshTimer=setTimeout(refresh,450);
    });
    const placeName=$('#place-name');if(placeName)observer.observe(placeName,{childList:true,characterData:true,subtree:true});
    setInterval(syncGateFromMap,180);
  }

  async function refresh() {
    const requestId=++state.requestId;
    state.place=loadPlace();
    state.models.clear();
    $('#flow-status').textContent='Building the living forecast…';
    await Promise.all(MODELS.map(model=>fetchModel(model,requestId)));
    if(requestId!==state.requestId)return;
    buildConsensus();loadHistory();saveSnapshot();render();
  }

  async function init() {
    state.place=loadPlace();
    bind();
    await Promise.all([refresh(),buildFrames()]);
    syncGateFromMap();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
