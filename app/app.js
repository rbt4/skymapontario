(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const EMBED = new URLSearchParams(location.search).get('embed') === '1';
  const IS_FILE = location.protocol === 'file:';

  if (EMBED) document.body.classList.add('embed');

  const CONFIG = {
    rain: {
      label: 'Rain', kicker: 'RAIN · NOW + NEXT HOUR', title: 'Know what is happening—and next.', story: 'Recent radar observations plus a clearly labelled 60-minute rain nowcast.',
      source: 'Environment Canada radar', sourceUrl: 'https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en/',
      note: 'Past frames are radar observations. Purple NEXT frames are short-term extrapolations, not long-range forecasts.',
      legend: ['Precipitation rate', 'mm/h', 'rain', ['Light', 'Moderate', 'Heavy']],
      wms: { url: 'https://geo.weather.gc.ca/geomet/', layer: 'RADAR_1KM_RRAI', futureLayer: 'Radar_1km_RainPrecipRate-Extrapolation', style: 'RADARURPPRECIPR14-LINEAR', futureStyle: 'Radar-Rain_14colors', opacity: .84 }, timed: true
    },
    smoke: {
      label: 'Smoke', kicker: 'WILDFIRE SMOKE FORECAST', title: 'See where smoke may travel.', story: 'Modelled wildfire-smoke concentration across Ontario.',
      source: 'Environment Canada RAQDPS', sourceUrl: 'https://eccc-msc.github.io/open-data/msc-data/nwp_raqdps/readme_raqdps_en/',
      note: 'Smoke is a model forecast, not a measurement or public-health instruction.',
      legend: ['Wildfire PM₂.₅', 'µg/m³', 'smoke', ['Lower', 'Elevated', 'Higher']],
      wms: { url: 'https://geo.weather.gc.ca/geomet/', layer: 'RAQDPS.Sfc_PM2.5-WildfireSmokePlume', style: '', opacity: .74 }, timed: true
    },
    air: {
      label: 'Air', kicker: 'OBSERVED AIR QUALITY', title: 'Know the health risk nearby.', story: 'Latest AQHI observations from reporting stations.',
      source: 'Environment Canada AQHI', sourceUrl: 'https://api.weather.gc.ca/',
      note: 'AQHI values are station observations. Conditions between stations can differ.',
      legend: ['AQHI health risk', 'index', 'air', ['Low', 'Moderate', 'High', 'Very high']], timed: false
    },
    fire: {
      label: 'Fires', kicker: 'REPORTED ACTIVE FIRES', title: 'See status—not anonymous heat dots.', story: 'Current Ontario fires reported by fire-management agencies.',
      source: 'NRCan CWFIF', sourceUrl: 'https://cwfis.cfs.nrcan.gc.ca/en/',
      note: 'Locations, sizes and control status are agency reports and can be delayed. Points are not fire boundaries.',
      legend: ['Stage of control', '', 'fire', ['Under control', 'Being held', 'Out of control']], timed: false
    },
    alerts: {
      label: 'Alerts', kicker: 'ACTIVE WEATHER ALERTS', title: 'See warnings that affect Ontario.', story: 'Current warnings, watches and advisories with mapped areas.',
      source: 'Environment Canada alerts', sourceUrl: 'https://weather.gc.ca/warnings/index_e.html?prov=on',
      note: 'Always follow the full alert and instructions from official authorities.',
      legend: ['Alert type', '', 'alerts', ['Advisory', 'Watch', 'Warning']], timed: false
    }
  };

  const PLACES = [
    ['Ontario', 49.65, -84.35, 5, 'Province view'], ['Toronto', 43.653, -79.383, 9, 'Greater Toronto'], ['Ottawa', 45.421, -75.697, 9, 'Eastern Ontario'],
    ['Hamilton', 43.255, -79.871, 10, 'Golden Horseshoe'], ['Niagara', 43.09, -79.08, 10, 'Niagara Region'], ['London', 42.984, -81.245, 9, 'Southwestern Ontario'],
    ['Windsor', 42.314, -83.036, 9, 'Essex County'], ['Kitchener–Waterloo', 43.451, -80.493, 9, 'Waterloo Region'], ['Barrie', 44.389, -79.69, 9, 'Central Ontario'],
    ['Kingston', 44.231, -76.486, 9, 'Lake Ontario'], ['Sudbury', 46.491, -80.993, 8, 'Northeastern Ontario'], ['North Bay', 46.31, -79.46, 8, 'Nipissing'],
    ['Sault Ste. Marie', 46.522, -84.347, 8, 'Algoma'], ['Thunder Bay', 48.381, -89.247, 8, 'Northwestern Ontario'], ['Timmins', 48.475, -81.33, 8, 'Cochrane District'],
    ['Kenora', 49.768, -94.49, 8, 'Lake of the Woods']
  ];

  const DOM = {
    loading: $('loading-screen'), loadingMessage: $('loading-message'), connection: $('connection-label'),
    placeButton: $('place-button'), placeLabel: $('place-label'), placeSheet: $('place-sheet'), placeGrid: $('place-grid'),
    infoSheet: $('info-sheet'), backdrop: $('sheet-backdrop'), menu: $('menu-button'), locate: $('locate-button'), share: $('share-button'),
    modeKicker: $('mode-kicker'), modeTitle: $('mode-title'), mobileKicker: $('mobile-kicker'), mobileStory: $('mobile-story'), restoreLabel: $('restore-label'),
    feedStatus: $('feed-status'), statusText: $('status-text'), statusDetail: $('status-detail'), updatedTime: $('updated-time'),
    sheetStatus: $('sheet-status'), sheetUpdated: $('sheet-updated'), sheetModeTitle: $('sheet-mode-title'), sheetModeCopy: $('sheet-mode-copy'),
    primary: $('primary-card'), primaryValue: $('primary-value'), primaryLabel: $('primary-label'), primaryTitle: $('primary-title'), primaryDetail: $('primary-detail'),
    forecastPlace: $('forecast-place'), forecastEyebrow: $('forecast-eyebrow'), forecastKind: $('forecast-kind'), forecastIcon: $('forecast-icon'),
    forecastHeadline: $('forecast-headline'), forecastCopy: $('forecast-copy'), forecastFacts: $('forecast-facts'), forecastFoot: $('forecast-foot'),
    mobileForecast: $('mobile-forecast'), mobileForecastKind: $('mobile-forecast-kind'), mobileForecastTime: $('mobile-forecast-time'), mobileForecastHeadline: $('mobile-forecast-headline'), mobileForecastCopy: $('mobile-forecast-copy'),
    sheetForecastKind: $('sheet-forecast-kind'), sheetForecastHeadline: $('sheet-forecast-headline'), sheetForecastCopy: $('sheet-forecast-copy'), sheetForecastFacts: $('sheet-forecast-facts'),
    legendTitle: $('legend-title'), legendUnit: $('legend-unit'), legendBar: $('legend-bar'), legendLabels: $('legend-labels'),
    activityTitle: $('activity-title'), activityCount: $('activity-count'), activityList: $('activity-list'),
    source: $('source-link'), dataNote: $('data-note'), alertBadge: $('alert-badge'),
    panel: $('insight-panel'), panelClose: $('panel-close'), panelRestore: $('panel-restore'),
    timeline: $('timeline'), play: $('play-button'), slider: $('time-slider'), progress: $('range-progress'), nowMarker: $('now-marker'),
    relative: $('relative-time'), absolute: $('absolute-time'), rangeStart: $('range-start'), rangeEnd: $('range-end'), refresh: $('refresh-button'),
    mobilePeek: $('mobile-peek'), opacity: $('opacity-slider'), install: $('install-button'),
    error: $('error-banner'), errorTitle: $('error-title'), errorMessage: $('error-message'), errorRetry: $('error-retry'), toast: $('toast')
  };

  const readStorage = (key, fallback = null) => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
  const writeStorage = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const formatClock = date => new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date);
  const formatFrame = date => new Intl.DateTimeFormat('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
  const formatFullFrame = date => new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  const formatWmsTime = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const state = {
    map: null, layer: null, labels: null, mode: CONFIG[readStorage('skymap.mode', 'rain')] ? readStorage('skymap.mode', 'rain') : 'rain',
    place: readStorage('skymap.place', 'Ontario'), opacity: Math.max(.25, Math.min(1, Number(readStorage('skymap.opacity', '82')) / 100 || .82)),
    frames: [], frameMeta: [], frameIndex: 0, playing: false, frameTimer: null, modeToken: 0, installPrompt: null,
    air: [], fires: [], alerts: [], airLoadedAt: 0, firesLoadedAt: 0, alertsLoadedAt: 0, currentFrame: null, currentLayerId: null,
    pendingLayer: null, weather: null, weatherKey: '', weatherLoadedAt: 0, weatherToken: 0, explanationToken: 0, explanationTimer: null
  };

  function showToast(message) {
    DOM.toast.textContent = message;
    DOM.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => DOM.toast.classList.remove('show'), 2600);
  }

  function showError(title, message, retry = true) {
    DOM.errorTitle.textContent = title;
    DOM.errorMessage.textContent = message;
    DOM.errorRetry.hidden = !retry;
    DOM.error.hidden = false;
  }

  function clearError() { DOM.error.hidden = true; }

  function setStatus(message, stateName = 'loading', detail = 'Official public data', updated = null) {
    DOM.feedStatus.dataset.state = stateName;
    DOM.statusText.textContent = message;
    DOM.statusDetail.textContent = detail;
    DOM.updatedTime.textContent = updated ? formatClock(updated) : stateName === 'loading' ? 'Working…' : '—';
    DOM.sheetStatus.textContent = message;
    DOM.sheetUpdated.textContent = updated ? `Updated ${formatClock(updated)} · ${detail}` : detail;
    const dot = DOM.infoSheet.querySelector('.sheet-live > i');
    if (dot) dot.style.background = stateName === 'ok' ? 'var(--green)' : stateName === 'error' ? 'var(--red)' : 'var(--yellow)';
  }

  function setConnection(online) {
    DOM.connection.textContent = online ? 'LIVE PUBLIC DATA' : 'OFFLINE';
    DOM.connection.previousElementSibling?.classList.toggle('offline', !online);
    if (!online) setStatus('You are offline', 'error', 'Cached map content may remain visible');
  }

  async function fetchResponse(url, options = {}, timeout = 18000, attempts = 2) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await wait(650 * (attempt + 1));
      } finally { clearTimeout(timer); }
    }
    throw lastError || new Error('Request failed');
  }

  async function fetchJson(url, timeout, attempts) { return (await fetchResponse(url, {}, timeout, attempts)).json(); }

  const english = value => value && typeof value === 'object' && 'en' in value ? value.en : value;
  const finite = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

  function nearestWeatherSnapshot(target = new Date()) {
    const properties = state.weather?.properties;
    if (!properties) return null;
    const current = properties.currentConditions || {};
    const hourly = properties.hourlyForecastGroup?.hourlyForecasts || [];
    const nearestHour = hourly.reduce((best, item) => {
      const date = new Date(item.timestamp);
      if (Number.isNaN(date.getTime())) return best;
      if (!best) return item;
      return Math.abs(date - target) < Math.abs(new Date(best.timestamp) - target) ? item : best;
    }, null);
    const currentDate = new Date(english(current.timestamp));
    const useCurrent = !Number.isNaN(currentDate.getTime()) && target.getTime() <= Date.now() && Math.abs(currentDate - target) < 4 * 60 * 60 * 1000;
    const item = useCurrent ? current : nearestHour;
    const timestamp = useCurrent ? currentDate : new Date(item?.timestamp || Date.now());
    const wind = item?.wind || {};
    return {
      name: english(properties.name) || state.place || 'Map centre',
      condition: english(item?.condition) || 'Conditions unavailable',
      temperature: finite(english(item?.temperature?.value)),
      precipitation: finite(english(item?.lop?.value)),
      windSpeed: finite(english(wind.speed?.value)),
      windDirection: english(wind.direction?.value) || english(wind.direction?.windDirFull) || 'Variable',
      timestamp,
      isCurrent: useCurrent,
      periodSummary: english(properties.forecastGroup?.forecasts?.[0]?.textSummary)
    };
  }

  function forecastFactsHtml(facts) {
    return facts.map(fact => `<span><small>${escapeHtml(fact.label)}</small><b title="${escapeHtml(fact.value)}">${escapeHtml(fact.value)}</b></span>`).join('');
  }

  function renderForecastModel(model) {
    const facts = model.facts?.length ? model.facts : [{ label: 'MAP VALUE', value: '—' }, { label: 'NEARBY WEATHER', value: '—' }, { label: 'WIND', value: '—' }];
    DOM.forecastEyebrow.textContent = model.eyebrow || 'AT THE MAP CENTRE';
    DOM.forecastPlace.textContent = model.place || state.place || 'Ontario';
    DOM.forecastKind.textContent = model.kind || 'LOCAL PICTURE';
    DOM.forecastKind.dataset.kind = model.kindType || '';
    DOM.forecastIcon.textContent = model.icon || '⌁';
    DOM.forecastHeadline.textContent = model.headline || 'Building your local picture…';
    DOM.forecastCopy.textContent = model.copy || 'Matching the selected map time with official nearby conditions.';
    DOM.forecastFacts.innerHTML = forecastFactsHtml(facts);
    DOM.forecastFoot.textContent = model.foot || 'Move the map or choose a time to update this explanation.';
    DOM.mobileForecastKind.textContent = model.kind || 'LOCAL PICTURE';
    DOM.mobileForecastTime.textContent = model.time || 'Selected map time';
    DOM.mobileForecastHeadline.textContent = model.headline || 'Building your local picture…';
    DOM.mobileForecastCopy.textContent = model.copy || 'Matching official nearby conditions.';
    DOM.sheetForecastKind.textContent = `${model.kind || 'LOCAL PICTURE'} · ${model.time || 'CURRENT VIEW'}`;
    DOM.sheetForecastHeadline.textContent = model.headline || 'Building your local picture…';
    DOM.sheetForecastCopy.textContent = model.copy || 'Matching the map with official nearby conditions.';
    DOM.sheetForecastFacts.innerHTML = facts.map(fact => `<span>${escapeHtml(fact.label)} · ${escapeHtml(fact.value)}</span>`).join('');
  }

  async function loadLocalWeather(force = false) {
    if (!state.map || !navigator.onLine) return state.weather;
    const center = state.map.getCenter();
    const key = `${center.lat.toFixed(1)},${center.lng.toFixed(1)}`;
    if (!force && state.weather && state.weatherKey === key && Date.now() - state.weatherLoadedAt < 10 * 60 * 1000) return state.weather;
    const token = ++state.weatherToken;
    let features = [];
    for (const radius of [0.8, 2.2, 5]) {
      const bbox = [center.lng - radius, center.lat - radius, center.lng + radius, center.lat + radius].map(value => value.toFixed(3)).join(',');
      const url = `https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&bbox=${bbox}&limit=30`;
      const data = await fetchJson(url, 22000, 2);
      if (token !== state.weatherToken) return state.weather;
      features = data.features || [];
      if (features.length) break;
    }
    if (!features.length) throw new Error('No nearby city forecast was returned');
    const feature = features.sort((a, b) => {
      const ac = a.geometry?.coordinates || [999, 999];
      const bc = b.geometry?.coordinates || [999, 999];
      return ((ac[1] - center.lat) ** 2 + (ac[0] - center.lng) ** 2) - ((bc[1] - center.lat) ** 2 + (bc[0] - center.lng) ** 2);
    })[0];
    state.weather = feature;
    state.weatherKey = key;
    state.weatherLoadedAt = Date.now();
    scheduleExplanation(0);
    return feature;
  }

  async function queryMapValue(token) {
    const config = CONFIG[state.mode];
    if (!config.wms || !state.currentFrame || !state.map) return null;
    const bounds = state.map.getBounds();
    const southWest = state.map.options.crs.project(bounds.getSouthWest());
    const northEast = state.map.options.crs.project(bounds.getNorthEast());
    const size = state.map.getSize();
    const point = state.map.latLngToContainerPoint(state.map.getCenter());
    const params = new URLSearchParams({
      service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo', layers: state.currentLayerId || config.wms.layer,
      query_layers: state.currentLayerId || config.wms.layer, styles: state.currentLayerId === config.wms.futureLayer ? config.wms.futureStyle || '' : config.wms.style || '', crs: 'EPSG:3857',
      bbox: [southWest.x, southWest.y, northEast.x, northEast.y].join(','), width: String(Math.max(1, Math.round(size.x))), height: String(Math.max(1, Math.round(size.y))),
      i: String(Math.max(0, Math.round(point.x))), j: String(Math.max(0, Math.round(point.y))), info_format: 'application/json', time: formatWmsTime(state.currentFrame)
    });
    const data = await fetchJson(`${config.wms.url}?${params}`, 18000, 1);
    if (token !== state.explanationToken) return null;
    const properties = data.features?.[0]?.properties;
    const value = finite(properties?.value);
    if (value === null || value < 0) return null;
    return { value, properties };
  }

  function weatherPhrase(snapshot) {
    if (!snapshot) return 'The nearby city forecast is still loading.';
    const temperature = snapshot.temperature === null ? '' : `, ${Math.round(snapshot.temperature)}°C`;
    const rainChance = snapshot.precipitation === null ? '' : `, ${Math.round(snapshot.precipitation)}% precipitation chance`;
    return `Nearby: ${snapshot.condition}${temperature}${rainChance}.`;
  }

  function windFact(snapshot) {
    if (!snapshot || snapshot.windSpeed === null) return 'Not reported';
    return `${snapshot.windDirection || 'Variable'} ${Math.round(snapshot.windSpeed)} km/h`;
  }

  function rainDescription(value, future) {
    if (value === null) return [future ? 'Rain near this point is still resolving' : 'Radar near this point is still resolving', 'The map is visible, but the exact centre-point value was not returned.'];
    if (value < .05) return [future ? 'No rain is projected over this point' : 'No rain was detected over this point', future ? 'The short-range radar nowcast shows no measurable rain at the map centre in this frame.' : 'Radar showed no measurable rain at the map centre in this observed frame.'];
    if (value < .5) return ['A trace of rain is over this point', `${future ? 'The nowcast projects' : 'Radar detected'} spotty or very light rain at the map centre.`];
    if (value < 2.5) return ['Light rain is over this point', `${future ? 'The nowcast projects' : 'Radar detected'} light rain at the map centre.`];
    if (value < 7.5) return ['Steady rain is over this point', `${future ? 'The nowcast projects' : 'Radar detected'} moderate rain at the map centre.`];
    if (value < 15) return ['Heavy rain is over this point', `${future ? 'The nowcast projects' : 'Radar detected'} heavy rain at the map centre. Local drainage and visibility may worsen.`];
    return ['Very heavy rain is over this point', `${future ? 'The nowcast projects' : 'Radar detected'} an intense rain rate at the map centre. Check active warnings before travelling.`];
  }

  function smokeDescription(value) {
    if (value === null) return ['Smoke concentration is still resolving', 'The forecast map loaded, but the exact centre-point model value was not returned.'];
    if (value < 2) return ['Little wildfire smoke is modelled here', 'The model shows a minimal wildfire-smoke signal at the map centre for this hour.'];
    if (value < 10) return ['A light smoke signal is modelled here', 'Some wildfire-related fine particles are projected at the map centre for this hour.'];
    if (value < 25) return ['Wildfire smoke is becoming elevated here', 'The model projects an elevated wildfire-smoke concentration at the map centre. Compare it with the observed AQHI nearby.'];
    if (value < 60) return ['A strong wildfire-smoke signal is modelled here', 'The model projects a substantial wildfire-smoke concentration at the map centre. Check the observed AQHI and any air-quality alerts.'];
    return ['Dense wildfire smoke is modelled here', 'The model projects a very high wildfire-smoke concentration at the map centre. Treat the observed AQHI and official alerts as the health-risk sources.'];
  }

  function renderStaticExplanation() {
    const snapshot = nearestWeatherSnapshot(new Date());
    const place = snapshot?.name || state.place || 'Map centre';
    if (state.mode === 'air') {
      const nearest = nearestAirStations()[0];
      if (!nearest) return renderForecastModel({ place, kind: 'OBSERVED', kindType: 'health', icon: '◎', headline: 'Finding the nearest AQHI station…', copy: weatherPhrase(snapshot), time: 'Latest observation' });
      const [risk] = airRisk(nearest.value);
      const guidance = nearest.value <= 3 ? 'Outdoor activity is generally comfortable for most people.' : nearest.value <= 6 ? 'People who are sensitive should notice symptoms and adjust strenuous outdoor activity if needed.' : nearest.value <= 10 ? 'At-risk people should reduce strenuous outdoor activity and everyone should watch for symptoms.' : 'Reduce strenuous outdoor activity and follow official local air-quality guidance.';
      return renderForecastModel({ place, kind: 'HEALTH INDEX', kindType: 'health', icon: '◎', eyebrow: 'LATEST NEARBY OBSERVATION', time: formatFullFrame(nearest.observed), headline: `${risk} near ${nearest.name}`, copy: `AQHI ${nearest.value > 10 ? '10+' : Math.round(nearest.value)}. ${guidance}`, facts: [{ label: 'AQHI', value: nearest.value > 10 ? '10+' : String(Math.round(nearest.value)) }, { label: 'STATION', value: nearest.name }, { label: 'WEATHER', value: snapshot?.condition || 'Loading' }], foot: 'AQHI is observed at a station; conditions between stations can differ.' });
    }
    if (state.mode === 'fire') {
      const outOfControl = state.fires.filter(feature => feature.properties?.stage_of_control_status === 'OC').length;
      const largest = state.fires.reduce((best, feature) => Math.max(best, finite(feature.properties?.fire_size) ?? 0), 0);
      return renderForecastModel({ place, kind: 'AGENCY REPORTED', icon: '◆', eyebrow: 'CURRENT ACTIVE FIRES · ONTARIO', time: 'Latest agency status', headline: state.fires.length ? `${state.fires.length.toLocaleString('en-CA')} active fires are reported` : 'No active Ontario fires were returned', copy: state.fires.length ? `${outOfControl} are listed as out of control. Markers show reported locations and status—not the area burning.` : 'The official active-fire feed did not return current Ontario records in this refresh.', facts: [{ label: 'ACTIVE', value: String(state.fires.length) }, { label: 'OUT OF CONTROL', value: String(outOfControl) }, { label: 'LARGEST', value: largest ? `${largest.toLocaleString('en-CA')} ha` : 'Not reported' }], foot: 'Agency records can change quickly. Use official provincial fire and emergency information for boundaries and instructions.' });
    }
    if (state.mode === 'alerts') {
      const first = state.alerts[0]?.properties || {};
      const name = first.alert_short_name_en || first.alert_name_en || first.alert_type;
      return renderForecastModel({ place, kind: 'OFFICIAL ALERTS', icon: '!', eyebrow: 'CURRENT ONTARIO FEED', time: 'Updated now', headline: state.alerts.length ? `${state.alerts.length} active mapped alert records` : 'No active Ontario alert areas returned', copy: state.alerts.length ? `${name || 'An active alert'} is among the current records. Select a mapped area for its name, then open the official source for full instructions.` : 'No active alert areas were present in the official feed at this refresh.', facts: [{ label: 'ACTIVE', value: String(state.alerts.length) }, { label: 'FIRST LISTED', value: name || 'None' }, { label: 'NEARBY WEATHER', value: snapshot?.condition || 'Loading' }], foot: 'Alert records can overlap. Always follow the complete official bulletin and local emergency instructions.' });
    }
  }

  async function renderTimedExplanation(token) {
    const result = await queryMapValue(token).catch(() => null);
    if (token !== state.explanationToken || !['rain', 'smoke'].includes(state.mode)) return;
    const snapshot = nearestWeatherSnapshot(state.currentFrame || new Date());
    const place = snapshot?.name || state.place || 'Map centre';
    const frameMeta = state.frameMeta[state.frameIndex] || {};
    if (state.mode === 'rain') {
      const future = frameMeta.kind === 'nowcast';
      const value = result?.value ?? null;
      const [headline, detail] = rainDescription(value, future);
      renderForecastModel({
        place, kind: future ? 'NEXT · NOWCAST' : 'PAST · OBSERVED', kindType: future ? 'forecast' : '', icon: future ? '↗' : '◒',
        eyebrow: future ? 'SHORT-RANGE RADAR EXTRAPOLATION' : 'RADAR OBSERVATION AT MAP CENTRE', time: formatFullFrame(state.currentFrame), headline,
        copy: `${detail} ${weatherPhrase(snapshot)}`, facts: [{ label: 'RAIN RATE', value: value === null ? 'Not returned' : `${value < .05 ? '0' : value.toFixed(value < 10 ? 1 : 0)} mm/h` }, { label: snapshot?.isCurrent ? 'NEARBY NOW' : 'HOURLY FORECAST', value: snapshot ? `${snapshot.condition}${snapshot.temperature === null ? '' : ` · ${Math.round(snapshot.temperature)}°`}` : 'Loading' }, { label: 'WIND', value: windFact(snapshot) }],
        foot: future ? 'NEXT uses radar extrapolation for roughly one hour. It can miss growth, decay or sudden storm changes.' : 'PAST is measured radar imagery. The nearby city weather is contextual and may not be at the exact map point.'
      });
    } else {
      const raw = result?.value ?? null;
      const value = raw === null ? null : raw * 1e9;
      const [headline, detail] = smokeDescription(value);
      const nearest = nearestAirStations()[0];
      const risk = nearest ? airRisk(nearest.value)[0] : 'Loading AQHI';
      renderForecastModel({
        place, kind: 'MODEL FORECAST', kindType: 'forecast', icon: '≈', eyebrow: 'WILDFIRE PM₂.₅ AT MAP CENTRE', time: formatFullFrame(state.currentFrame), headline,
        copy: `${detail} ${weatherPhrase(snapshot)}`, facts: [{ label: 'MODELLED PM₂.₅', value: value === null ? 'Not returned' : `${value.toFixed(value < 10 ? 1 : 0)} µg/m³` }, { label: 'OBSERVED AQHI', value: nearest ? `${nearest.value > 10 ? '10+' : Math.round(nearest.value)} · ${risk}` : 'Loading' }, { label: 'WIND', value: windFact(snapshot) }],
        foot: 'Smoke is an hourly model forecast, not a sensor reading. AQHI is the nearby observed health-risk index.'
      });
    }
  }

  function scheduleExplanation(delay = 320) {
    clearTimeout(state.explanationTimer);
    const token = ++state.explanationToken;
    if (!['rain', 'smoke'].includes(state.mode)) return renderStaticExplanation();
    const frameMeta = state.frameMeta[state.frameIndex] || {};
    const kind = state.mode === 'rain' && frameMeta.kind === 'nowcast' ? 'NEXT · NOWCAST' : state.mode === 'rain' ? 'PAST · OBSERVED' : 'MODEL FORECAST';
    renderForecastModel({ place: english(state.weather?.properties?.name) || state.place || 'Map centre', kind, kindType: frameMeta.kind === 'nowcast' || state.mode === 'smoke' ? 'forecast' : '', icon: state.mode === 'smoke' ? '≈' : frameMeta.kind === 'nowcast' ? '↗' : '◒', time: state.currentFrame ? formatFullFrame(state.currentFrame) : 'Finding available time…', headline: state.playing ? 'Watching the pattern move…' : 'Reading this point…', copy: state.playing ? 'Playback is intentionally calm and will stop on the final frame. The exact local explanation updates when it pauses.' : 'Matching the selected time, the value under the map centre, and the nearest official city forecast.' });
    if (state.playing) return;
    state.explanationTimer = setTimeout(() => renderTimedExplanation(token), delay);
  }

  function restoreView() {
    const hash = /map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)&mode=(\w+)/.exec(location.hash);
    if (hash) {
      if (CONFIG[hash[4]]) state.mode = hash[4];
      return { center: [Number(hash[2]), Number(hash[3])], zoom: Number(hash[1]) };
    }
    try {
      const saved = JSON.parse(readStorage('skymap.view', 'null'));
      if (Number.isFinite(saved?.lat) && Number.isFinite(saved?.lng) && Number.isFinite(saved?.zoom)) return { center: [saved.lat, saved.lng], zoom: saved.zoom };
    } catch (_) {}
    return { center: [49.65, -84.35], zoom: 5 };
  }

  function initMap() {
    if (!window.L) throw new Error('The bundled map engine could not start.');
    const view = restoreView();
    state.map = L.map('map', { ...view, minZoom: 3, maxZoom: 14, preferCanvas: true, zoomControl: false, attributionControl: true });
    state.map.attributionControl.setPrefix(false);
    state.map.createPane('weather'); state.map.getPane('weather').style.zIndex = '320';
    state.map.createPane('alerts'); state.map.getPane('alerts').style.zIndex = '390';
    state.map.createPane('observations'); state.map.getPane('observations').style.zIndex = '420';
    state.map.createPane('labels'); state.map.getPane('labels').style.zIndex = '500'; state.map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, updateWhenIdle: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(state.map);
    state.labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      pane: 'labels', subdomains: 'abcd', maxZoom: 19, updateWhenIdle: true
    }).addTo(state.map);
    state.map.on('moveend', () => {
      const center = state.map.getCenter();
      writeStorage('skymap.view', JSON.stringify({ lat: +center.lat.toFixed(5), lng: +center.lng.toFixed(5), zoom: state.map.getZoom() }));
      updateNearestAir();
      if (state.mode === 'air') renderAirActivity();
      scheduleExplanation(450);
      clearTimeout(loadLocalWeather.timer);
      loadLocalWeather.timer = setTimeout(() => loadLocalWeather().catch(() => scheduleExplanation(0)), 550);
    });
    window.addEventListener('resize', () => state.map.invalidateSize({ pan: false }));
  }

  function removeLayer() {
    if (state.pendingLayer) {
      if (state.pendingLayer._skyTimeout) clearTimeout(state.pendingLayer._skyTimeout);
      state.map.removeLayer(state.pendingLayer);
      state.pendingLayer = null;
    }
    if (!state.layer) return;
    if (state.layer._skyTimeout) clearTimeout(state.layer._skyTimeout);
    state.map.removeLayer(state.layer);
    state.layer = null;
  }

  function setOverlayOpacity() {
    if (!state.layer) return;
    if (typeof state.layer.setOpacity === 'function') state.layer.setOpacity(state.opacity * (CONFIG[state.mode].wms?.opacity || 1));
    if (state.pendingLayer && typeof state.pendingLayer.setOpacity === 'function') state.pendingLayer.setOpacity(state.opacity * (CONFIG[state.mode].wms?.opacity || 1));
    if (typeof state.layer.eachLayer === 'function') {
      state.layer.eachLayer(layer => {
        const base = layer.options?.skyFillOpacity;
        if (Number.isFinite(base) && typeof layer.setStyle === 'function') layer.setStyle({ fillOpacity: base * state.opacity });
      });
    }
  }

  function updateModeUI(mode) {
    const config = CONFIG[mode];
    document.body.dataset.mode = mode;
    all('.layer-button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
    DOM.modeKicker.textContent = config.kicker;
    DOM.modeTitle.textContent = config.title;
    DOM.mobileKicker.textContent = config.kicker;
    DOM.mobileStory.textContent = config.story;
    DOM.restoreLabel.textContent = config.label;
    DOM.sheetModeTitle.textContent = config.label === 'Fires' ? 'Reported active fires' : config.label === 'Air' ? 'Air quality observations' : config.title;
    DOM.sheetModeCopy.textContent = config.story;
    DOM.legendTitle.textContent = config.legend[0];
    DOM.legendUnit.textContent = config.legend[1];
    DOM.legendBar.className = `legend ${config.legend[2]}`;
    DOM.legendLabels.innerHTML = config.legend[3].map(label => `<span>${escapeHtml(label)}</span>`).join('');
    DOM.source.textContent = `${config.source} ↗`;
    DOM.source.href = config.sourceUrl;
    DOM.dataNote.textContent = config.note;
    DOM.timeline.hidden = !config.timed;
    DOM.mobilePeek.hidden = config.timed;
    updatePrimaryForMode();
    renderActivity();
    scheduleExplanation(0);
  }

  function parseDuration(value) {
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value || '');
    if (!match) return 3600000;
    return ((+match[1] || 0) * 86400 + (+match[2] || 0) * 3600 + (+match[3] || 0) * 60 + (+match[4] || 0)) * 1000;
  }

  function parseTimeDimension(text) {
    const value = (text || '').trim();
    if (!value) return [];
    if (value.includes(',')) return value.split(',').map(item => new Date(item.trim())).filter(date => !Number.isNaN(date.getTime()));
    const parts = value.split('/');
    if (parts.length >= 3) {
      const start = new Date(parts[0]);
      const end = new Date(parts[1]);
      const step = parseDuration(parts[2]);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !step) return [];
      const result = [];
      for (let time = start.getTime(), guard = 0; time <= end.getTime() + 1000 && guard < 240; time += step, guard += 1) result.push(new Date(time));
      return result;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? [] : [date];
  }

  function createWmsLayer(config, token, options = {}) {
    const layerId = options.layerId || config.wms.layer;
    const style = layerId === config.wms.futureLayer ? config.wms.futureStyle || '' : config.wms.style;
    const wmsOptions = {
      layers: layerId, styles: style, format: 'image/png', transparent: true, version: '1.3.0',
      pane: 'weather', opacity: options.hidden ? 0 : state.opacity * config.wms.opacity, tileSize: 256, updateWhenIdle: false, updateWhenZooming: false, keepBuffer: 2
    };
    if (options.time) wmsOptions.time = formatWmsTime(options.time);
    const layer = L.tileLayer.wms(config.wms.url, wmsOptions);
    layer._skyLayerId = layerId;
    let loaded = 0;
    let failed = 0;
    const finish = () => {
      if (token !== state.modeToken || (state.layer !== layer && state.pendingLayer !== layer)) return;
      clearTimeout(layer._skyTimeout);
      if (loaded > 0) {
        const time = state.currentFrame || new Date();
        setStatus(`${config.label} data is live`, 'ok', `${loaded} map tiles rendered`, time);
        clearError();
      } else {
        setStatus(`${config.label} feed did not render`, 'error', `${failed || 'No'} usable map tiles`);
        showError(`${config.label} is temporarily unavailable`, 'The official map feed returned no usable tiles. Other layers may still work.', true);
      }
    };
    layer.on('loading', () => {
      loaded = 0; failed = 0;
      setStatus(`Loading ${config.label.toLowerCase()} data…`, 'loading', 'Requesting official map tiles');
      clearTimeout(layer._skyTimeout);
      layer._skyTimeout = setTimeout(finish, 20000);
    });
    layer.on('tileload', () => { loaded += 1; });
    layer.on('tileerror', () => { failed += 1; });
    layer.on('load', finish);
    return layer;
  }

  async function loadTimeFrames(config, token) {
    try {
      const layerIds = [config.wms.layer, config.wms.futureLayer].filter(Boolean);
      const responses = await Promise.allSettled(layerIds.map(layerId => {
        const url = `${config.wms.url}?service=WMS&version=1.3.0&request=GetCapabilities&layer=${encodeURIComponent(layerId)}&_=${Date.now()}`;
        return fetchResponse(url, {}, 18000, 2).then(response => response.text());
      }));
      if (token !== state.modeToken) return;
      if (responses[0].status !== 'fulfilled') throw responses[0].reason || new Error('Primary timeline unavailable');
      const parsed = responses.map(result => {
        if (result.status !== 'fulfilled') return [];
        const xmlText = result.value;
        const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error('Invalid capabilities document');
        const dimensions = [...xml.getElementsByTagName('Dimension')];
        const dimension = dimensions.find(node => (node.getAttribute('name') || '').toLowerCase() === 'time');
        return parseTimeDimension(dimension?.textContent);
      });
      let frames;
      let meta;
      if (state.mode === 'rain' && config.wms.futureLayer && parsed[1]?.length) {
        const observed = parsed[0].slice(-16);
        const boundary = observed[observed.length - 1]?.getTime() || 0;
        const future = parsed[1].filter(date => date.getTime() > boundary).slice(0, 10);
        frames = [...observed, ...future];
        meta = [...observed.map(() => ({ kind: 'observed', layerId: config.wms.layer })), ...future.map(() => ({ kind: 'nowcast', layerId: config.wms.futureLayer }))];
      } else {
        frames = parsed[0];
        if (frames.length > 49) frames = frames.slice(0, 49);
        meta = frames.map(() => ({ kind: state.mode === 'smoke' ? 'forecast' : 'observed', layerId: config.wms.layer }));
      }
      if (!frames.length) throw new Error('No advertised time frames');
      state.frames = frames;
      state.frameMeta = meta;
      const now = Date.now();
      state.frameIndex = frames.reduce((best, date, index) => Math.abs(date.getTime() - now) < Math.abs(frames[best].getTime() - now) ? index : best, 0);
      applyFrame(state.frameIndex, false);
      renderActivity();
    } catch (_) {
      if (token !== state.modeToken) return;
      state.frames = [];
      state.frameMeta = [];
      state.currentFrame = null;
      renderTimeline();
      showToast('Timeline unavailable — showing the feed’s default latest layer.');
    }
  }

  function applyFrame(index, user = true) {
    if (!state.frames.length || !CONFIG[state.mode].wms) return;
    state.frameIndex = Math.max(0, Math.min(index, state.frames.length - 1));
    state.currentFrame = state.frames[state.frameIndex];
    const config = CONFIG[state.mode];
    const frameMeta = state.frameMeta[state.frameIndex] || { layerId: config.wms.layer };
    state.currentLayerId = frameMeta.layerId;
    renderTimeline();
    scheduleExplanation(user ? 260 : 700);
    if (user) setStatus(`Loading ${frameMeta.kind === 'nowcast' ? 'next-hour' : 'timestamped'} frame…`, 'loading', frameMeta.kind === 'nowcast' ? 'Official radar extrapolation' : 'Requesting official map tiles');
    if (state.pendingLayer) {
      if (state.pendingLayer._skyTimeout) clearTimeout(state.pendingLayer._skyTimeout);
      state.map.removeLayer(state.pendingLayer);
      state.pendingLayer = null;
    }
    const previous = state.layer;
    const next = createWmsLayer(config, state.modeToken, { layerId: frameMeta.layerId, time: state.currentFrame, hidden: true });
    state.pendingLayer = next;
    next.once('load', () => {
      if (state.pendingLayer !== next || state.modeToken !== next._skyToken) return;
      state.pendingLayer = null;
      state.layer = next;
      requestAnimationFrame(() => {
        next.setOpacity(state.opacity * config.wms.opacity);
        if (previous && previous !== next && state.map.hasLayer(previous)) previous.setOpacity(0);
      });
      if (previous && previous !== next) setTimeout(() => { if (state.map.hasLayer(previous)) state.map.removeLayer(previous); }, 760);
    });
    next._skyToken = state.modeToken;
    next.addTo(state.map);
  }

  function renderTimeline() {
    const frames = state.frames;
    const max = Math.max(0, frames.length - 1);
    DOM.slider.max = String(max);
    DOM.slider.value = String(Math.min(state.frameIndex, max));
    DOM.progress.style.width = `${max ? (state.frameIndex / max) * 100 : 0}%`;
    if (!frames.length) {
      DOM.relative.textContent = 'LATEST'; DOM.absolute.textContent = 'Using the feed’s current layer';
      DOM.rangeStart.textContent = '—'; DOM.rangeEnd.textContent = '—'; DOM.nowMarker.style.display = 'none';
      return;
    }
    const current = frames[state.frameIndex];
    const minutes = Math.round((current.getTime() - Date.now()) / 60000);
    const frameMeta = state.frameMeta[state.frameIndex] || {};
    const relative = Math.abs(minutes) < 4 ? 'RIGHT NOW' : minutes < 0 ? `${Math.abs(minutes)} MIN AGO` : `IN ${minutes} MIN`;
    DOM.relative.textContent = state.mode === 'rain' ? `${frameMeta.kind === 'nowcast' ? 'NEXT' : 'PAST'} · ${relative}` : `FORECAST · ${relative}`;
    DOM.absolute.textContent = formatFrame(current);
    DOM.rangeStart.textContent = formatClock(frames[0]);
    DOM.rangeEnd.textContent = formatClock(frames[max]);
    const nearest = frames.reduce((best, date, index) => Math.abs(date.getTime() - Date.now()) < Math.abs(frames[best].getTime() - Date.now()) ? index : best, 0);
    DOM.nowMarker.style.display = max ? '' : 'none';
    DOM.nowMarker.style.left = `${max ? (nearest / max) * 100 : 0}%`;
  }

  function startPlayback() {
    if (state.frames.length < 2) return showToast('This layer has no animation frames right now.');
    if (state.frameIndex >= state.frames.length - 1) applyFrame(0, false);
    state.playing = true;
    DOM.play.classList.add('playing'); DOM.play.textContent = 'Ⅱ'; DOM.play.setAttribute('aria-label', 'Pause animation');
    const advance = () => {
      if (!state.playing) return;
      if (state.frameIndex >= state.frames.length - 1) return stopPlayback();
      applyFrame(state.frameIndex + 1, false);
      state.frameTimer = setTimeout(advance, state.mode === 'rain' ? 1900 : 2300);
    };
    state.frameTimer = setTimeout(advance, state.mode === 'rain' ? 1900 : 2300);
  }

  function stopPlayback() {
    state.playing = false;
    clearInterval(state.frameTimer); state.frameTimer = null;
    DOM.play.classList.remove('playing'); DOM.play.textContent = '▶'; DOM.play.setAttribute('aria-label', 'Play animation');
    scheduleExplanation(180);
  }

  function airRisk(value) {
    if (value <= 3) return ['Low risk', '#58e49e'];
    if (value <= 6) return ['Moderate risk', '#ffd36a'];
    if (value <= 10) return ['High risk', '#ff946d'];
    return ['Very high risk', '#d95fff'];
  }

  function normalizeAir(feature) {
    const properties = feature.properties || {};
    const coordinates = feature.geometry?.coordinates || [];
    const value = Number(properties.aqhi ?? properties.AQHI ?? properties.value ?? properties.observed_value);
    const lat = Number(coordinates[1]);
    const lng = Number(coordinates[0]);
    if (!Number.isFinite(value) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      value, lat, lng,
      name: properties.location_name_en || properties.station_name || properties.name_en || properties.name || 'Ontario reporting station',
      observed: new Date(properties.observation_datetime || properties.observation_datetime_utc || properties.observation_time || feature.properties?.datetime || Date.now())
    };
  }

  async function loadAir(force = false) {
    if (!force && state.air.length && Date.now() - state.airLoadedAt < 10 * 60 * 1000) return state.air;
    const url = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&latest=true&bbox=-95.5,41.4,-73.8,57.6&limit=300';
    const data = await fetchJson(url, 18000, 2);
    const stations = (data.features || []).map(normalizeAir).filter(Boolean);
    if (!stations.length) throw new Error('No AQHI observations returned');
    state.air = stations;
    state.airLoadedAt = Date.now();
    updateNearestAir();
    return stations;
  }

  function nearestAirStations() {
    if (!state.map || !state.air.length) return [];
    const center = state.map.getCenter();
    return [...state.air].sort((a, b) => ((a.lat - center.lat) ** 2 + (a.lng - center.lng) ** 2) - ((b.lat - center.lat) ** 2 + (b.lng - center.lng) ** 2));
  }

  function updateNearestAir() {
    if (!state.air.length) return;
    const nearest = nearestAirStations()[0];
    const [risk, colour] = airRisk(nearest.value);
    DOM.primaryValue.textContent = nearest.value > 10 ? '10+' : String(Math.round(nearest.value));
    DOM.primaryValue.style.color = colour; DOM.primaryValue.style.borderColor = colour;
    if (['rain', 'smoke', 'air'].includes(state.mode)) {
      DOM.primaryLabel.textContent = 'NEAREST AQHI'; DOM.primaryTitle.textContent = risk; DOM.primaryDetail.textContent = nearest.name;
    }
  }

  function renderAirLayer() {
    const group = L.layerGroup();
    state.air.forEach(station => {
      const [risk, colour] = airRisk(station.value);
      const marker = L.circleMarker([station.lat, station.lng], { pane: 'observations', radius: 8, color: '#07121c', weight: 2, fillColor: colour, fillOpacity: .88 * state.opacity, skyFillOpacity: .88 });
      marker.bindTooltip(`<b>${escapeHtml(station.name)}</b><br>AQHI ${escapeHtml(station.value > 10 ? '10+' : Math.round(station.value))} · ${escapeHtml(risk)}`, { direction: 'top' });
      group.addLayer(marker);
    });
    return group;
  }

  function renderAirActivity() {
    const nearest = nearestAirStations().slice(0, 4);
    DOM.activityTitle.textContent = 'Stations near the map centre'; DOM.activityCount.textContent = `${state.air.length} LIVE`;
    DOM.activityList.innerHTML = nearest.length ? nearest.map(station => {
      const [risk] = airRisk(station.value);
      return `<div class="activity-item"><span><b>${escapeHtml(station.name)}</b><small>${escapeHtml(risk)}</small></span><em>AQHI ${escapeHtml(station.value > 10 ? '10+' : Math.round(station.value))}</em></div>`;
    }).join('') : '<p>No AQHI stations were returned.</p>';
  }

  async function loadFires(force = false) {
    if (!force && state.firesLoadedAt && Date.now() - state.firesLoadedAt < 10 * 60 * 1000) return state.fires;
    const base = 'https://geoserver.cwfif.nrcan.gc.ca/geoserver/ows';
    const now = formatWmsTime(new Date());
    const params = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'public:cwfif_national_activefires', outputFormat: 'application/json', srsName: 'EPSG:4326', CQL_FILTER: `agency_code='ON' AND record_end > '${now}'`, propertyName: 'geometry,national_fire_id,agency_fire_id,stage_of_control_status,fire_size,response_type,national_fire_cause,situation_report_date,status_date,region_code', count: '1000' });
    const data = await fetchJson(`${base}?${params}`, 26000, 2);
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid active-fire response');
    const unique = new Map();
    data.features.filter(feature => feature.geometry?.type === 'Point').forEach(feature => {
      const key = feature.properties?.national_fire_id || feature.properties?.agency_fire_id || feature.id;
      const previous = unique.get(key);
      if (!previous || new Date(feature.properties?.status_date || 0) > new Date(previous.properties?.status_date || 0)) unique.set(key, feature);
    });
    state.fires = [...unique.values()];
    state.firesLoadedAt = Date.now();
    return state.fires;
  }

  function fireStatus(code) {
    if (code === 'OC') return ['Out of control', '#ff4f58'];
    if (code === 'BH') return ['Being held', '#ff9b68'];
    if (code === 'UC') return ['Under control', '#58e49e'];
    return ['Status not reported', '#ffd36a'];
  }

  function renderFireLayer() {
    return L.geoJSON({ type: 'FeatureCollection', features: state.fires }, {
      pane: 'observations',
      pointToLayer: (feature, latlng) => {
        const properties = feature.properties || {};
        const [status, colour] = fireStatus(properties.stage_of_control_status);
        const size = Math.max(0, Number(properties.fire_size) || 0);
        const radius = Math.max(4, Math.min(10, 4 + Math.log10(size + 1) * 1.8));
        const marker = L.circleMarker(latlng, { pane: 'observations', radius, color: '#220a0b', weight: 1, fillColor: colour, fillOpacity: .82 * state.opacity, skyFillOpacity: .82 });
        marker.bindTooltip(`<b>${escapeHtml(properties.agency_fire_id || 'Reported active fire')}</b><br>${escapeHtml(status)} · ${size ? `${escapeHtml(size.toLocaleString('en-CA'))} ha` : 'Size not reported'}`, { direction: 'top' });
        return marker;
      }
    });
  }

  function renderFireActivity() {
    const priority = { OC: 0, BH: 1, UC: 2 };
    const important = [...state.fires].sort((a, b) => (priority[a.properties?.stage_of_control_status] ?? 3) - (priority[b.properties?.stage_of_control_status] ?? 3) || Number(b.properties?.fire_size || 0) - Number(a.properties?.fire_size || 0)).slice(0, 4);
    DOM.activityTitle.textContent = 'Priority reported fires'; DOM.activityCount.textContent = `${state.fires.length.toLocaleString('en-CA')} ACTIVE`;
    DOM.activityList.innerHTML = important.map(feature => {
      const properties = feature.properties || {};
      const [status] = fireStatus(properties.stage_of_control_status);
      const size = finite(properties.fire_size);
      return `<div class="activity-item"><span><b>${escapeHtml(properties.agency_fire_id || properties.national_fire_id || 'Active fire')}</b><small>${escapeHtml(status)}</small></span><em>${size === null ? 'SIZE —' : `${escapeHtml(size.toLocaleString('en-CA'))} HA`}</em></div>`;
    }).join('') || '<p>No active Ontario fires were returned.</p>';
  }

  async function loadAlerts(force = false) {
    if (!force && state.alerts.length && Date.now() - state.alertsLoadedAt < 10 * 60 * 1000) return state.alerts;
    const properties = 'id,alert_code,alert_type,alert_name_en,alert_short_name_en,publication_datetime,expiration_datetime,risk_colour_en,feature_name_en,province,status_en';
    const url = `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&province=ON&limit=250&sortby=-publication_datetime&properties=${encodeURIComponent(properties)}`;
    const data = await fetchJson(url, 26000, 2);
    const unique = new Map();
    (data.features || []).forEach(feature => {
      const item = feature.properties || {};
      const key = `${item.alert_code || item.alert_name_en || 'alert'}|${item.feature_name_en || item.id || feature.id || unique.size}`;
      if (!unique.has(key)) unique.set(key, feature);
    });
    state.alerts = [...unique.values()];
    state.alertsLoadedAt = Date.now();
    DOM.alertBadge.hidden = state.alerts.length === 0;
    DOM.alertBadge.textContent = state.alerts.length > 99 ? '99+' : String(state.alerts.length);
    return state.alerts;
  }

  function alertColour(feature) {
    const properties = feature.properties || {};
    const text = `${properties.alert_type || ''} ${properties.alert_name_en || ''} ${properties.alert_short_name_en || ''}`.toLowerCase();
    if (text.includes('warning')) return '#ff5b64';
    if (text.includes('watch')) return '#ff9b68';
    return '#ffd36a';
  }

  function renderAlertLayer() {
    return L.geoJSON({ type: 'FeatureCollection', features: state.alerts }, {
      pane: 'alerts',
      style: feature => ({ pane: 'alerts', color: alertColour(feature), weight: 1.5, opacity: .95, fillColor: alertColour(feature), fillOpacity: .17 * state.opacity, skyFillOpacity: .17 }),
      onEachFeature: (feature, layer) => {
        const properties = feature.properties || {};
        const title = properties.alert_short_name_en || properties.alert_name_en || properties.alert_type || 'Weather alert';
        const area = properties.feature_name_en || 'Ontario';
        layer.bindTooltip(`<b>${escapeHtml(title)}</b><br>${escapeHtml(area)}`, { sticky: true });
      }
    });
  }

  function renderAlertActivity() {
    DOM.activityTitle.textContent = 'Current Ontario alerts'; DOM.activityCount.textContent = `${state.alerts.length} ACTIVE`;
    DOM.activityList.innerHTML = state.alerts.slice(0, 4).map(feature => {
      const properties = feature.properties || {};
      const title = properties.alert_short_name_en || properties.alert_name_en || properties.alert_type || 'Weather alert';
      const area = properties.feature_name_en || 'Ontario';
      return `<div class="activity-item"><span><b>${escapeHtml(title)}</b><small>${escapeHtml(area)}</small></span><em>ACTIVE</em></div>`;
    }).join('') || '<p>No active Ontario alerts were returned by the official feed.</p>';
  }

  function updatePrimaryForMode() {
    DOM.primary.hidden = false;
    if (state.mode === 'fire') {
      DOM.primaryValue.textContent = state.fires.length ? state.fires.length.toLocaleString('en-CA') : '—';
      DOM.primaryValue.style.color = 'var(--orange)'; DOM.primaryValue.style.borderColor = 'var(--orange)';
      DOM.primaryLabel.textContent = 'ONTARIO ACTIVE FIRES'; DOM.primaryTitle.textContent = state.fires.length ? 'Reported by fire agencies' : 'Loading active-fire reports…'; DOM.primaryDetail.textContent = 'NRCan national active-fire feed';
    } else if (state.mode === 'alerts') {
      DOM.primaryValue.textContent = state.alerts.length ? String(state.alerts.length) : '0';
      DOM.primaryValue.style.color = state.alerts.length ? 'var(--yellow)' : 'var(--green)'; DOM.primaryValue.style.borderColor = state.alerts.length ? 'var(--yellow)' : 'var(--green)';
      DOM.primaryLabel.textContent = 'ACTIVE ALERT AREAS'; DOM.primaryTitle.textContent = state.alerts.length ? 'Review official instructions' : 'No active alerts returned'; DOM.primaryDetail.textContent = 'Environment Canada Ontario feed';
    } else if (state.air.length) updateNearestAir();
    else {
      DOM.primaryValue.textContent = '—'; DOM.primaryValue.style.color = 'var(--green)'; DOM.primaryValue.style.borderColor = 'var(--green)';
      DOM.primaryLabel.textContent = 'NEAREST AQHI'; DOM.primaryTitle.textContent = 'Finding a station…'; DOM.primaryDetail.textContent = 'Ontario';
    }
  }

  function renderActivity() {
    if (state.mode === 'air') return renderAirActivity();
    if (state.mode === 'fire') return renderFireActivity();
    if (state.mode === 'alerts') return renderAlertActivity();
    const observed = state.frameMeta.filter(frame => frame.kind === 'observed').length;
    const next = state.frameMeta.filter(frame => frame.kind === 'nowcast').length;
    DOM.activityTitle.textContent = state.mode === 'rain' ? 'What the timeline means' : 'Forecast timeline';
    DOM.activityCount.textContent = state.frames.length ? `${state.frames.length} TIMES` : 'LIVE';
    DOM.activityList.innerHTML = state.frames.length
      ? `<p>${state.mode === 'rain' ? `<b>PAST</b> is ${observed} observed radar frames. <b>NEXT</b> is ${next} short-range extrapolated frames. Choose any time to get a local explanation above.` : `Choose any of ${state.frames.length} hourly smoke-forecast times. The card above explains the model value, nearby observed AQHI and wind.`}</p>`
      : `<p>The ${escapeHtml(CONFIG[state.mode].label.toLowerCase())} feed is loading its available timestamps.</p>`;
  }

  async function setMode(mode, { force = false } = {}) {
    if (!CONFIG[mode]) mode = 'rain';
    if (!force && mode === state.mode && state.layer) return;
    stopPlayback(); clearError(); removeLayer();
    const token = ++state.modeToken;
    state.mode = mode; state.frames = []; state.frameMeta = []; state.currentFrame = null; state.currentLayerId = null;
    writeStorage('skymap.mode', mode);
    renderTimeline(); updateModeUI(mode);
    const config = CONFIG[mode];
    try {
      if (config.wms) {
        state.layer = createWmsLayer(config, token).addTo(state.map);
        await loadTimeFrames(config, token);
      } else if (mode === 'air') {
        setStatus('Loading AQHI observations…', 'loading', 'Environment Canada station feed');
        await loadAir(force);
        if (token !== state.modeToken) return;
        state.layer = renderAirLayer().addTo(state.map);
        updatePrimaryForMode(); renderAirActivity();
        const newest = state.air.map(item => item.observed).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => b - a)[0] || new Date();
        setStatus('AQHI observations are live', 'ok', `${state.air.length} Ontario stations rendered`, newest);
      } else if (mode === 'fire') {
        setStatus('Loading reported active fires…', 'loading', 'NRCan CWFIF agency feed');
        await loadFires(force);
        if (token !== state.modeToken) return;
        state.layer = renderFireLayer().addTo(state.map);
        updatePrimaryForMode(); renderFireActivity();
        setStatus(state.fires.length ? 'Reported active fires are live' : 'No active Ontario fires returned', 'ok', `${state.fires.length.toLocaleString('en-CA')} agency records rendered`, new Date());
      } else if (mode === 'alerts') {
        setStatus('Loading Ontario alert areas…', 'loading', 'Environment Canada alert feed');
        await loadAlerts(force);
        if (token !== state.modeToken) return;
        state.layer = renderAlertLayer().addTo(state.map);
        updatePrimaryForMode(); renderAlertActivity();
        setStatus(state.alerts.length ? 'Ontario alert areas are live' : 'No active alert areas returned', 'ok', `${state.alerts.length} mapped alert records`, new Date());
      }
      setOverlayOpacity();
      scheduleExplanation(0);
      loadLocalWeather().catch(() => {});
    } catch (error) {
      if (token !== state.modeToken) return;
      setStatus(`${config.label} feed is unavailable`, 'error', error.message || 'Public data request failed');
      showError(`${config.label} did not load`, 'The official public feed could not be reached. Try again or choose another layer.', true);
    }
  }

  function renderPlaces() {
    DOM.placeGrid.innerHTML = '';
    PLACES.forEach(([name, lat, lng, zoom, region]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `place-option${name === state.place ? ' active' : ''}`;
      button.innerHTML = `<b>${escapeHtml(name)}</b><span>${escapeHtml(region)}</span>`;
      button.addEventListener('click', () => {
        state.place = name; writeStorage('skymap.place', name); DOM.placeLabel.textContent = name; DOM.placeButton.setAttribute('aria-label', `Choose map location, currently ${name}`);
        all('.place-option').forEach(item => item.classList.toggle('active', item === button));
        closeSheets(); state.map.flyTo([lat, lng], zoom, { duration: 1.05 }); showToast(`Viewing ${name}`);
      });
      DOM.placeGrid.appendChild(button);
    });
  }

  function openSheet(sheet) {
    closeSheets(false);
    sheet.hidden = false; DOM.backdrop.hidden = false; document.body.dataset.sheetOpen = 'true';
    requestAnimationFrame(() => sheet.querySelector('button,a,input')?.focus());
  }

  function closeSheets(restoreFocus = true) {
    DOM.placeSheet.hidden = true; DOM.infoSheet.hidden = true; DOM.backdrop.hidden = true; delete document.body.dataset.sheetOpen;
    if (restoreFocus) DOM.menu.focus({ preventScroll: true });
  }

  function locateUser() {
    if (!navigator.geolocation) return showError('Location is unavailable', 'This browser does not provide location access.', false);
    DOM.locate.textContent = '…';
    navigator.geolocation.getCurrentPosition(position => {
      DOM.locate.textContent = '◎'; state.place = 'My location'; DOM.placeLabel.textContent = 'My location'; DOM.placeButton.setAttribute('aria-label', 'Choose map location, currently My location');
      state.map.flyTo([position.coords.latitude, position.coords.longitude], 9, { duration: 1.05 }); showToast('Centred on your location');
    }, error => {
      DOM.locate.textContent = '◎';
      showError('Location was not available', error.code === 1 ? 'Location permission was not granted.' : 'Your position could not be determined.', false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  async function shareView() {
    const center = state.map.getCenter();
    const url = new URL(IS_FILE ? 'https://rbt4.github.io/skymapontario/app/' : location.href);
    url.searchParams.delete('embed');
    url.hash = `map=${state.map.getZoom()}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}&mode=${state.mode}`;
    try {
      if (navigator.share) await navigator.share({ title: 'SkyMap Ontario', text: CONFIG[state.mode].story, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); showToast('Map link copied'); }
    } catch (error) { if (error.name !== 'AbortError') showToast('The map link could not be shared.'); }
  }

  function bindEvents() {
    all('.layer-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    DOM.placeButton.addEventListener('click', () => openSheet(DOM.placeSheet));
    DOM.menu.addEventListener('click', () => openSheet(DOM.infoSheet));
    document.querySelector('[data-open="info-sheet"]')?.addEventListener('click', () => openSheet(DOM.infoSheet));
    DOM.mobilePeek.addEventListener('click', () => openSheet(DOM.infoSheet));
    DOM.mobileForecast.addEventListener('click', () => openSheet(DOM.infoSheet));
    DOM.backdrop.addEventListener('click', () => closeSheets());
    all('[data-close]').forEach(button => button.addEventListener('click', () => closeSheets()));
    DOM.locate.addEventListener('click', locateUser); DOM.share.addEventListener('click', shareView);
    DOM.play.addEventListener('click', () => state.playing ? stopPlayback() : startPlayback());
    DOM.slider.addEventListener('input', () => { stopPlayback(); applyFrame(Number(DOM.slider.value)); renderActivity(); });
    DOM.refresh.addEventListener('click', () => setMode(state.mode, { force: true }));
    DOM.errorRetry.addEventListener('click', () => { clearError(); setMode(state.mode, { force: true }); });
    DOM.opacity.value = String(Math.round(state.opacity * 100));
    DOM.opacity.addEventListener('input', () => { state.opacity = Number(DOM.opacity.value) / 100; writeStorage('skymap.opacity', DOM.opacity.value); setOverlayOpacity(); });
    DOM.panelClose.addEventListener('click', () => { DOM.panel.classList.add('collapsed'); DOM.panelRestore.hidden = false; DOM.timeline.style.right = '20px'; });
    DOM.panelRestore.addEventListener('click', () => { DOM.panel.classList.remove('collapsed'); DOM.panelRestore.hidden = true; DOM.timeline.style.right = ''; });
    window.addEventListener('online', () => { setConnection(true); setMode(state.mode, { force: true }); });
    window.addEventListener('offline', () => setConnection(false));
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; DOM.install.hidden = false; });
    DOM.install.addEventListener('click', async () => { if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; DOM.install.hidden = true; });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !DOM.backdrop.hidden) closeSheets();
      if (event.code === 'Space' && !/INPUT|BUTTON|A/.test(document.activeElement?.tagName || '')) { event.preventDefault(); state.playing ? stopPlayback() : startPlayback(); }
    });
    window.SkyMapBack = () => { if (!DOM.backdrop.hidden) { closeSheets(false); return true; } return false; };
  }

  async function registerServiceWorker() {
    if (!IS_FILE && 'serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); } catch (_) {}
    }
  }

  async function start() {
    try {
      bindEvents(); renderPlaces(); setConnection(navigator.onLine);
      DOM.loadingMessage.textContent = 'Starting the bundled map engine…';
      initMap();
      const savedPlace = PLACES.find(place => place[0] === state.place);
      DOM.placeLabel.textContent = savedPlace?.[0] || state.place;
      DOM.placeButton.setAttribute('aria-label', `Choose map location, currently ${savedPlace?.[0] || state.place}`);
      updateModeUI(state.mode);
      DOM.loadingMessage.textContent = 'Connecting to official Ontario data…';
      const background = Promise.allSettled([
        state.mode === 'air' ? Promise.resolve() : loadAir(),
        state.mode === 'alerts' ? Promise.resolve() : loadAlerts(),
        loadLocalWeather(),
        registerServiceWorker()
      ]);
      await setMode(state.mode, { force: true });
      await background;
      updatePrimaryForMode(); if (state.mode === 'air') renderAirActivity(); if (state.mode === 'alerts') renderAlertActivity(); scheduleExplanation(0);
      await wait(250); DOM.loading.classList.add('done'); setTimeout(() => DOM.loading.remove(), 650);
      setInterval(async () => {
        if (!navigator.onLine || state.playing) return;
        await Promise.allSettled([loadAir(true), loadAlerts(true)]);
        if (state.mode === 'air' || state.mode === 'alerts') setMode(state.mode, { force: true });
        else updatePrimaryForMode();
      }, 10 * 60 * 1000);
      setInterval(() => { if (navigator.onLine && !state.playing && CONFIG[state.mode].timed) setMode(state.mode, { force: true }); }, 10 * 60 * 1000);
    } catch (error) {
      DOM.loading.classList.add('done');
      setStatus('Map startup failed', 'error', error.message || 'Unexpected startup error');
      showError('SkyMap Ontario could not start', error.message || 'Refresh the app and try again.', true);
    }
  }

  start();
})();
