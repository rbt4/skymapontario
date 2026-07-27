(() => {
  'use strict';

  const GEOMET = 'https://geo.weather.gc.ca/geomet';
  const RADAR_LAYER = 'RADAR_1KM_RRAI';
  const PLACES = {
    toronto: { name: 'Greater Toronto Area', lat: 43.69, lon: -79.46, zoom: 8 },
    oakville: { name: 'Oakville', lat: 43.4675, lon: -79.6877, zoom: 10 },
    ottawa: { name: 'Ottawa', lat: 45.4215, lon: -75.6972, zoom: 9 }
  };
  const MODES = {
    rain: {
      label: 'Rain',
      kicker: 'RECENT MEASURED RADAR',
      source: 'MEASURED RADAR',
      title: 'Watch the rain area in real geography.',
      copy: 'The latest official precipitation layer is drawn over Ontario, with city labels kept above the weather.',
      primary: { layer: RADAR_LAYER, style: 'RADARURPPRECIPR14-LINEAR', opacity: .8 }
    },
    storm: {
      label: 'Storm',
      kicker: 'RADAR + LIGHTNING CONTEXT',
      source: 'STORM CONTEXT',
      title: 'See precipitation and lightning together.',
      copy: 'Radar stays visible while the official lightning-density layer adds storm context.',
      primary: { layer: RADAR_LAYER, style: 'RADARURPPRECIPR14-LINEAR', opacity: .68 },
      secondary: { layer: 'Lightning_2.5km_Density', style: 'Lightning', opacity: .78 }
    },
    cloud: {
      label: 'Cloud',
      kicker: 'GOES EAST SATELLITE',
      source: 'SATELLITE CONTEXT',
      title: 'Follow the visible cloud front.',
      copy: 'Day-visible and night-infrared satellite imagery shows the broader cloud structure around Ontario.',
      primary: { layer: 'GOES-East_1km_DayVis-NightIR', style: '', opacity: .62 }
    }
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const state = {
    map: null,
    base: null,
    labels: null,
    marker: null,
    mode: 'rain',
    place: PLACES.toronto,
    weatherLayers: [],
    times: [],
    frameIndex: 0,
    timer: null
  };

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value;
  }

  function setMapState(kind, title, detail) {
    const node = $('.map-live-state');
    if (node) node.dataset.mapState = kind;
    setText('#map-state-title', title);
    setText('#map-state-detail', detail);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Latest';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }

  function formatFrame(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Latest official frame';
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      month: 'short',
      day: 'numeric'
    }).format(date);
    return `${day} · ${formatTime(date)}`;
  }

  function parsePeriod(value) {
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value || '');
    if (!match) return 10 * 60 * 1000;
    return (((Number(match[1]) || 0) * 24 + (Number(match[2]) || 0)) * 60 + (Number(match[3]) || 0)) * 60 * 1000;
  }

  function expandTimes(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    if (text.includes(',')) return text.split(',').map(item => item.trim()).filter(Boolean);
    if (!text.includes('/')) return [text];
    const [startValue, endValue, periodValue] = text.split('/');
    const start = new Date(startValue).getTime();
    const end = new Date(endValue).getTime();
    const step = parsePeriod(periodValue);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !step) return [];
    const output = [];
    for (let time = start; time <= end && output.length < 1000; time += step) output.push(new Date(time).toISOString());
    return output;
  }

  function directChildText(node, localName) {
    for (const child of node?.children || []) {
      if (child.localName === localName) return child.textContent?.trim() || '';
    }
    return '';
  }

  function getCapabilitiesTimes(xmlText, layerName) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    for (const layer of xml.getElementsByTagNameNS('*', 'Layer')) {
      if (directChildText(layer, 'Name') !== layerName) continue;
      for (const child of layer.children || []) {
        if ((child.localName === 'Dimension' || child.localName === 'Extent') &&
            String(child.getAttribute('name') || '').toLowerCase() === 'time') {
          return expandTimes(child.textContent).filter(value => Number.isFinite(new Date(value).getTime()));
        }
      }
    }
    return [];
  }

  async function loadTimes(layerName) {
    const query = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetCapabilities',
      LAYERS: layerName,
      layer: layerName,
      lang: 'en',
      _: String(Date.now())
    });
    const response = await fetch(`${GEOMET}?${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`GeoMet HTTP ${response.status}`);
    return getCapabilitiesTimes(await response.text(), layerName);
  }

  function mapboxBase() {
    const token = String(document.querySelector('meta[name="skymap-mapbox-token"]')?.content || '').trim();
    if (!token) return null;
    const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(token)}`;
    return L.tileLayer(url, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 18,
      attribution: '© Mapbox © OpenStreetMap'
    });
  }

  function createBaseMap() {
    const mapbox = mapboxBase();
    if (mapbox) {
      setText('#console-basemap', 'Mapbox Dark');
      return mapbox;
    }
    setText('#console-basemap', 'CARTO Dark');
    return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO'
    });
  }

  function createLabelLayer() {
    return L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      pane: 'label-pane',
      opacity: .94
    });
  }

  function markerIcon() {
    return L.divIcon({
      className: 'site-marker',
      html: '<span><i></i></span>',
      iconSize: [46, 46],
      iconAnchor: [23, 23]
    });
  }

  function clearWeatherLayers() {
    state.weatherLayers.forEach(layer => layer.remove());
    state.weatherLayers = [];
  }

  function addWmsLayer(config, timeValue) {
    const params = {
      layers: config.layer,
      styles: config.style || '',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity: config.opacity,
      pane: 'weather-pane'
    };
    if (timeValue) params.time = timeValue;
    const layer = L.tileLayer.wms(GEOMET, params);
    layer.on('tileload', () => setMapState('ok', `${MODES[state.mode].label} layer live`, 'Environment and Climate Change Canada'));
    layer.on('tileerror', () => setMapState('error', 'Weather tiles are reconnecting', 'The basemap remains available'));
    layer.addTo(state.map);
    state.weatherLayers.push(layer);
  }

  function showFrame(index, userSelected = false) {
    if (!state.times.length) return;
    state.frameIndex = Math.max(0, Math.min(index, state.times.length - 1));
    const time = state.times[state.frameIndex];
    clearWeatherLayers();
    const mode = MODES[state.mode];
    addWmsLayer(mode.primary, time);
    if (mode.secondary) addWmsLayer(mode.secondary, time);
    state.labels.bringToFront();
    $$('#timeline-frames button').forEach((button, buttonIndex) => {
      button.classList.toggle('active', buttonIndex === state.frameIndex);
      button.setAttribute('aria-pressed', String(buttonIndex === state.frameIndex));
    });
    setText('#timeline-time', formatTime(time));
    setText('#console-frame', formatTime(time));
    setText('#timeline-status', userSelected ? 'Selected official frame' : 'Latest available official sequence');
  }

  function renderTimeline() {
    const container = $('#timeline-frames');
    if (!container) return;
    container.innerHTML = '';
    if (!state.times.length) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'active';
      button.disabled = true;
      button.innerHTML = '<i></i><span>Latest</span>';
      container.append(button);
      return;
    }
    state.times.forEach((time, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Show ${formatFrame(time)}`);
      button.setAttribute('aria-pressed', String(index === state.frameIndex));
      button.className = index === state.frameIndex ? 'active' : '';
      button.innerHTML = `<i></i><span>${formatTime(time)}</span>`;
      button.addEventListener('click', () => {
        stopPlayback();
        showFrame(index, true);
      });
      container.append(button);
    });
  }

  function stopPlayback() {
    clearInterval(state.timer);
    state.timer = null;
    const button = $('#timeline-play');
    button?.classList.remove('playing');
    button?.setAttribute('aria-label', 'Play recent weather frames');
  }

  function togglePlayback() {
    if (state.timer) return stopPlayback();
    if (state.times.length < 2) return;
    if (state.frameIndex >= state.times.length - 1) showFrame(0);
    const button = $('#timeline-play');
    button?.classList.add('playing');
    button?.setAttribute('aria-label', 'Pause recent weather frames');
    state.timer = setInterval(() => {
      if (state.frameIndex >= state.times.length - 1) return stopPlayback();
      showFrame(state.frameIndex + 1);
    }, 1050);
  }

  async function setMode(mode) {
    if (!MODES[mode]) return;
    stopPlayback();
    state.mode = mode;
    $$('[data-weather-mode]').forEach(button => {
      const active = button.dataset.weatherMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const copy = MODES[mode];
    setText('#timeline-kicker', copy.kicker);
    setText('#console-source', copy.source);
    setText('#console-title', copy.title);
    setText('#console-copy', copy.copy);
    setText('#timeline-status', 'Resolving official timestamps…');
    setMapState('loading', `Connecting to ${copy.label.toLowerCase()}`, 'Environment and Climate Change Canada');
    try {
      const allTimes = await loadTimes(copy.primary.layer);
      state.times = allTimes.slice(-8);
      state.frameIndex = Math.max(0, state.times.length - 1);
      renderTimeline();
      if (state.times.length) showFrame(state.frameIndex);
      else {
        clearWeatherLayers();
        addWmsLayer(copy.primary);
        if (copy.secondary) addWmsLayer(copy.secondary);
        state.labels.bringToFront();
        setText('#timeline-time', 'LATEST');
        setText('#console-frame', 'Latest');
        setText('#timeline-status', 'Latest official image');
      }
    } catch (_) {
      state.times = [];
      renderTimeline();
      clearWeatherLayers();
      addWmsLayer(copy.primary);
      if (copy.secondary) addWmsLayer(copy.secondary);
      state.labels.bringToFront();
      setText('#timeline-time', 'LATEST');
      setText('#console-frame', 'Latest');
      setText('#timeline-status', 'Timeline unavailable · showing latest');
    }
  }

  function setPlace(key) {
    const place = PLACES[key];
    if (!place) return;
    state.place = place;
    state.map.flyTo([place.lat, place.lon], place.zoom, { duration: .75 });
    state.marker.setLatLng([place.lat, place.lon]);
    setText('#console-location', place.name);
    $$('[data-place]').forEach(button => button.classList.toggle('active', button.dataset.place === key));
  }

  function initMap() {
    if (!window.L) {
      setMapState('error', 'Interactive map unavailable', 'Open the full app to continue');
      return;
    }
    state.map = L.map('home-map', {
      center: [state.place.lat, state.place.lon],
      zoom: state.place.zoom,
      minZoom: 5,
      maxZoom: 15,
      zoomControl: false,
      attributionControl: true
    });
    state.map.createPane('weather-pane');
    state.map.getPane('weather-pane').style.zIndex = '340';
    state.map.createPane('label-pane');
    state.map.getPane('label-pane').style.zIndex = '460';
    L.control.zoom({ position: 'topright' }).addTo(state.map);
    state.base = createBaseMap().addTo(state.map);
    state.labels = createLabelLayer().addTo(state.map);
    state.marker = L.marker([state.place.lat, state.place.lon], {
      icon: markerIcon(),
      interactive: false,
      zIndexOffset: 1000
    }).addTo(state.map);
    void setMode('rain');
  }

  $$('[data-weather-mode]').forEach(button => button.addEventListener('click', () => void setMode(button.dataset.weatherMode)));
  $$('[data-place]').forEach(button => button.addEventListener('click', () => setPlace(button.dataset.place)));
  $('#timeline-play')?.addEventListener('click', togglePlayback);
  document.querySelector('[data-year]').textContent = String(new Date().getFullYear());

  fetch('version.json', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(version => {
      if (!version) return;
      const apk = `download/${version.apkBaseName || 'SkyMap-Ontario'}-v${version.version}.apk`;
      $$('[data-apk]').forEach(link => {
        link.href = apk;
        link.setAttribute('download', '');
      });
      const release = $('[data-release]');
      if (release) release.textContent = `Current release · ${version.version} ${version.releaseName || ''}`.trim();
    })
    .catch(() => {});

  initMap();
})();
