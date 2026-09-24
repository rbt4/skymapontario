/* Official conditions around the forecast point: Environment Canada alerts and
   the nearest observed AQHI station. Both are read-only context; neither
   changes the precipitation forecast. */
(() => {
  'use strict';
  const WEATHER_API = 'https://api.weather.gc.ca';
  const REFRESH_MS = 15 * 60 * 1000;
  const ALERT_RANK = { warning: 3, watch: 2, advisory: 1, statement: 0 };
  const AIR_WORDS = [
    [3, 'Low health risk', 'Air quality is good. Normal outdoor activity is fine for most people.'],
    [6, 'Moderate health risk', 'Consider easing off strenuous outdoor activity if you notice coughing or throat irritation.'],
    [10, 'High health risk', 'Reduce or reschedule strenuous outdoor activity, especially with heart or breathing conditions.'],
    [Infinity, 'Very high health risk', 'Avoid strenuous outdoor activity. Keep windows closed if smoke is nearby.']
  ];
  const $ = selector => document.querySelector(selector);
  const text = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  const finite = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const state = { alerts: [], air: null, token: 0, timer: null };

  async function fetchJson(url, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function readAlert(feature) {
    const p = feature?.properties || {};
    const type = String(p.alert_type || 'statement').toLowerCase();
    return {
      type,
      rank: ALERT_RANK[type] ?? 0,
      name: p.alert_name_en || p.alert_short_name_en || 'Weather alert',
      area: p.feature_name_en || '',
      text: String(p.alert_text_en || '').trim(),
      ends: new Date(p.event_end_datetime || p.expiration_datetime || 0),
      expires: new Date(p.expiration_datetime || p.event_end_datetime || 0)
    };
  }

  async function fetchAlerts(place) {
    const bbox = `${place.lon - 1.6},${place.lat - 1.1},${place.lon + 1.6},${place.lat + 1.1}`;
    const data = await fetchJson(`${WEATHER_API}/collections/weather-alerts/items?f=json&limit=40&bbox=${bbox}`);
    const now = Date.now();
    const seen = new Set();
    return (data.features || [])
      .map(readAlert)
      // An expired bulletin is not an alert, even though the feed still carries it.
      .filter(alert => !Number.isFinite(alert.expires.getTime()) || alert.expires.getTime() === 0 || alert.expires.getTime() > now)
      .filter(alert => { const key = `${alert.name}|${alert.text.slice(0, 60)}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a, b) => b.rank - a.rank || a.ends - b.ends);
  }

  async function fetchAirQuality(place) {
    for (const radius of [0.6, 1.6, 3.5]) {
      const bbox = `${place.lon - radius},${place.lat - radius},${place.lon + radius},${place.lat + radius}`;
      const data = await fetchJson(`${WEATHER_API}/collections/aqhi-observations-realtime/items?f=json&limit=20&bbox=${bbox}`);
      const features = (data.features || []).filter(item => finite(item.properties?.aqhi) !== null);
      if (!features.length) continue;
      const distance = item => { const c = item.geometry?.coordinates || [999, 999]; return (c[1] - place.lat) ** 2 + (c[0] - place.lon) ** 2; };
      const nearest = features.sort((a, b) => distance(a) - distance(b))[0];
      return {
        index: Number(nearest.properties.aqhi),
        station: nearest.properties.location_name_en || 'Nearby station',
        observed: new Date(nearest.properties.observation_datetime || Date.now())
      };
    }
    return null;
  }

  const sentenceCase = value => value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  const fmtTime = value => window.SkyMap?.fmtTime?.(value) || new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // Warnings are stated plainly: no sirens, no shouting, no red screen.
  function renderAlerts() {
    const [first, ...rest] = state.alerts;
    const banner = $('#alert-banner');
    if (banner) {
      banner.hidden = !first;
      banner.dataset.type = first?.type || '';
      if (first) {
        text('#alert-headline', sentenceCase(first.name));
        const until = Number.isFinite(first.ends.getTime()) && first.ends.getTime() > Date.now() ? ` · until ${fmtTime(first.ends)}` : '';
        text('#alert-detail', `Environment Canada${first.area ? ` · ${first.area}` : ''}${until}${rest.length ? ` · ${rest.length} more nearby` : ''}`);
      }
    }
    text('#alerts-count', state.alerts.length ? `${state.alerts.length} active` : 'None active');
    const chip = $('#alerts-open'); if (chip) chip.dataset.state = state.alerts.length ? (first.rank >= 2 ? 'warning' : 'notice') : 'clear';
    const list = $('#alert-list');
    if (!list) return;
    list.innerHTML = '';
    if (!state.alerts.length) {
      const empty = document.createElement('article');
      empty.innerHTML = '<h3>Nothing active nearby</h3><p>Environment Canada has no warnings, watches or statements in effect for this area right now.</p>';
      list.append(empty);
      return;
    }
    state.alerts.forEach(alert => {
      const article = document.createElement('article');
      article.dataset.type = alert.type;
      const small = document.createElement('small');
      small.textContent = `${alert.type.toUpperCase()}${alert.area ? ` · ${alert.area}` : ''}`;
      const heading = document.createElement('h3');
      heading.textContent = sentenceCase(alert.name);
      const body = document.createElement('p');
      body.textContent = alert.text || 'Open weather.gc.ca for the full bulletin.';
      const footer = document.createElement('footer');
      footer.textContent = `${Number.isFinite(alert.ends.getTime()) && alert.ends.getTime() > Date.now() ? `In effect until ${fmtTime(alert.ends)}` : 'In effect now'} · Environment Canada`;
      article.append(small, heading, body, footer);
      list.append(article);
    });
  }

  function renderAir() {
    const card = $('#air-card');
    if (!state.air) {
      if (card) card.dataset.level = 'unknown';
      text('#air-index', '—');
      text('#air-label', 'Air quality unavailable');
      text('#air-copy', 'No nearby AQHI station reported recently.');
      return;
    }
    const [, label, copy] = AIR_WORDS.find(([ceiling]) => state.air.index <= ceiling) || AIR_WORDS.at(-1);
    if (card) card.dataset.level = state.air.index <= 3 ? 'low' : state.air.index <= 6 ? 'moderate' : 'high';
    text('#air-index', String(Math.round(state.air.index)));
    text('#air-label', label);
    text('#air-copy', `${copy} ${state.air.station} · observed ${fmtTime(state.air.observed)}.`.replace(/\.\.$/, '.'));
  }

  async function refresh(place = window.SkyMap?.place) {
    if (!place) return;
    const token = ++state.token;
    const [alerts, air] = await Promise.allSettled([fetchAlerts(place), fetchAirQuality(place)]);
    if (token !== state.token) return;
    state.alerts = alerts.status === 'fulfilled' ? alerts.value : [];
    state.air = air.status === 'fulfilled' ? air.value : null;
    renderAlerts();
    renderAir();
  }

  function openAlerts() {
    const dialog = $('#alerts-dialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function schedule(place) {
    clearInterval(state.timer);
    void refresh(place);
    state.timer = setInterval(() => { if (!document.hidden) void refresh(); }, REFRESH_MS);
  }

  $('#alert-banner')?.addEventListener('click', openAlerts);
  $('#alerts-open')?.addEventListener('click', openAlerts);
  window.addEventListener('skymap:ready', event => schedule(event.detail?.place));
  window.addEventListener('skymap:place', event => schedule(event.detail?.place));
})();
