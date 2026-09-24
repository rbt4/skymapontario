/* SkyMap visit check.
   Choose an exact arrival and departure time, then check that window against
   measured radar, the official radar extrapolation, HRDPS 2.5 km guidance, the
   REPS ensemble and SkyMap's evidence-routed point blend. The answer can be
   shared as a large PNG or a short GIF built from the official frames. */
(() => {
  'use strict';

  const LAYERS = {
    observed: { layer: 'RADAR_1KM_RRAI', style: 'RADARURPPRECIPR14-LINEAR', tolerance: 18 },
    nowcast: { layer: 'Radar_1km_RainPrecipRate-Extrapolation', style: '', tolerance: 35 },
    guidance: { layer: 'HRDPS.CONTINENTAL.DIAG_PR_PT1H', style: 'RDPA-WXO', tolerance: 95 }
  };
  const REPS_SIGNALS = [
    { id: 'any', layer: 'REPS.DIAG.3_PRMM.ERGE1', style: 'REPS_PROB-LINEAR' },
    { id: 'heavy', layer: 'REPS.DIAG.3_PRMM.ERGE5', style: 'REPS_PROB-LINEAR' }
  ];
  const DIRECTIONS = [
    { name: 'north', dx: 0, dy: 1 }, { name: 'northeast', dx: 1, dy: 1 },
    { name: 'east', dx: 1, dy: 0 }, { name: 'southeast', dx: 1, dy: -1 },
    { name: 'south', dx: 0, dy: -1 }, { name: 'southwest', dx: -1, dy: -1 },
    { name: 'west', dx: -1, dy: 0 }, { name: 'northwest', dx: -1, dy: 1 }
  ];
  const WET_RATE = .08;
  const HORIZON_MS = 48 * 3600000;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
  const sky = () => window.SkyMap;

  const state = { zone: null, draft: null, result: null, token: 0, sharing: false };

  // --- Time in the forecast point's own zone ---------------------------------
  const forecastZone = () => state.zone || sky()?.timezone || 'America/Toronto';
  function formatInZone(value, options) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: forecastZone(), ...options }).format(date); }
    catch (_) { return new Intl.DateTimeFormat('en-CA', options).format(date); }
  }
  const fmtTime = value => formatInZone(value, { hour: 'numeric', minute: '2-digit' });
  const dayName = value => formatInZone(value, { weekday: 'short' });
  const monthDay = value => formatInZone(value, { month: 'short', day: 'numeric' });
  function dateKeyInZone(value, timeZone = forecastZone()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  const dateFromKey = key => new Date(`${key}T12:00:00Z`);
  function forecastDayKeys(count = 3) {
    const first = dateFromKey(dateKeyInZone(new Date()));
    return Array.from({ length: count }, (_, index) => dateKeyInZone(new Date(first.getTime() + index * 86400000), 'UTC'));
  }
  function zoneOffset(value) {
    const date = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: forecastZone(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const part = type => Number(parts.find(item => item.type === type)?.value || 0);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - date.getTime();
  }
  function forecastDateAt(key, minutesAfterMidnight) {
    const [year, month, day] = key.split('-').map(Number);
    const wallClock = Date.UTC(year, month - 1, day, Math.floor(minutesAfterMidnight / 60), minutesAfterMidnight % 60, 0, 0);
    let result = new Date(wallClock);
    result = new Date(wallClock - zoneOffset(result));
    return new Date(wallClock - zoneOffset(result));
  }
  function minutesInForecastDay(value) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: forecastZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
    const part = type => Number(parts.find(item => item.type === type)?.value || 0);
    return part('hour') * 60 + part('minute');
  }
  function frameStamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    const label = dateKeyInZone(date) === dateKeyInZone(new Date()) ? 'Today' : `${dayName(date)} ${monthDay(date)}`;
    return `${label} · ${fmtTime(date)}`;
  }

  // --- Draft window -----------------------------------------------------------
  function bounds() {
    const now = Date.now();
    const step = 30 * 60000;
    return { min: Math.ceil((now + 5 * 60000) / step) * step, max: now + HORIZON_MS };
  }
  function ensureDraft(force = false) {
    const b = bounds();
    if (!force && state.draft && state.draft.end > b.min && state.draft.start < b.max) return state.draft;
    state.draft = { start: b.min, end: Math.min(b.max, b.min + 2 * 3600000) };
    return state.draft;
  }
  function normalizeDraft({ preserveDuration = false } = {}) {
    const draft = ensureDraft();
    const b = bounds();
    const duration = clamp(draft.end - draft.start, 30 * 60000, 8 * 3600000);
    draft.start = clamp(draft.start, b.min, b.max - 30 * 60000);
    if (preserveDuration) draft.end = draft.start + duration;
    draft.end = clamp(draft.end, draft.start + 30 * 60000, Math.min(b.max, draft.start + 8 * 3600000));
    return draft;
  }

  function visitSampleTimes(start, end) {
    const output = [start];
    const halfHour = 30 * 60000;
    for (let time = Math.ceil(start / halfHour) * halfHour; time < end; time += halfHour) {
      if (time > start + 2 * 60000) output.push(time);
    }
    output.push(end);
    return [...new Set(output.map(value => Math.round(value / 60000) * 60000))].sort((a, b) => a - b).slice(0, 17);
  }

  // --- Evidence per sample ----------------------------------------------------
  async function frameAt(target) {
    const now = Date.now();
    const order = target <= now + 125 * 60000 ? (target <= now + 5 * 60000 ? ['observed', 'nowcast'] : ['nowcast', 'observed']) : ['guidance'];
    for (const kind of order) {
      const spec = LAYERS[kind];
      try {
        const meta = await sky().layerTimes(spec.layer);
        const candidates = kind === 'observed' ? meta.times.filter(time => new Date(time).getTime() <= now + 5 * 60000) : meta.times;
        const time = sky().nearestTime(candidates, target);
        if (time && Math.abs(new Date(time).getTime() - target) <= spec.tolerance * 60000) {
          return { kind, layer: spec.layer, style: spec.style, time, reference: meta.reference };
        }
      } catch (_) {}
    }
    return null;
  }

  async function ensembleAt(target) {
    const signal = { any: null, heavy: null };
    await Promise.all(REPS_SIGNALS.map(async config => {
      try {
        const meta = await sky().layerTimes(config.layer);
        const time = sky().nearestTime(meta.times, target);
        if (!time || Math.abs(new Date(time).getTime() - target) > 3 * 3600000) return;
        signal[config.id] = finite(await sky().featureValue({ layer: config.layer, style: config.style, time, reference: meta.reference }));
      } catch (_) {}
    }));
    return signal;
  }

  function visitSignalAt(target, frame, pointValue, ensemble, blend) {
    const date = new Date(target);
    const guidanceAmount = frame?.kind === 'guidance' && Number.isFinite(pointValue) ? Math.max(0, pointValue) : null;
    const modelAmount = guidanceAmount ?? Math.max(0, finite(blend?.precip) || 0);
    const observedRate = frame && frame.kind !== 'guidance' && Number.isFinite(pointValue) ? Math.max(0, pointValue) : null;
    const ensembleAny = finite(ensemble?.any);
    const support = finite(blend?.wet);
    const wet = (observedRate !== null && observedRate >= WET_RATE)
      || modelAmount >= .12
      || (ensembleAny !== null && ensembleAny >= 50)
      || (support !== null && support >= 55);
    return { time: date, frame, pointValue: finite(pointValue), modelAmount, observedRate, ensembleAny, ensembleHeavy: finite(ensemble?.heavy), support, wet };
  }

  function likelihoodLabel(peak) {
    return peak >= 80 ? 'Very likely' : peak >= 60 ? 'Likely' : peak >= 40 ? 'Possible' : peak >= 20 ? 'Low chance' : 'Unlikely';
  }
  function visitLikelihood(samples) {
    if (samples.some(sample => sample.frame?.kind === 'observed' && sample.observedRate >= WET_RATE)) {
      return { score: 100, value: 'NOW', label: 'Rain is present', source: 'Measured ECCC radar detects precipitation at the destination.' };
    }
    if (samples.some(sample => sample.frame?.kind === 'nowcast' && sample.observedRate >= WET_RATE)) {
      return { score: 88, value: 'HIGH', label: 'Rain likely', source: 'The official radar-motion nowcast reaches the destination during this visit.' };
    }
    const ensemble = samples.map(sample => sample.ensembleAny).filter(Number.isFinite);
    if (ensemble.length) {
      const peak = Math.round(Math.max(...ensemble));
      return { score: peak, value: `${peak}%`, label: likelihoodLabel(peak), source: 'Official REPS probability of at least 1 mm in a three-hour period near this visit.' };
    }
    const support = samples.map(sample => sample.support).filter(Number.isFinite);
    const peak = support.length ? Math.round(Math.max(...support)) : 0;
    return {
      score: peak,
      value: peak >= 70 ? 'WET' : peak >= 45 ? 'MIXED' : 'LOW',
      label: peak >= 70 ? 'Guidance leans wet' : peak >= 45 ? 'Mixed guidance' : 'Mostly dry',
      source: peak ? 'Weighted forecast-family support; this is model agreement, not a calibrated probability.' : 'No strong rain signal is available from the connected guidance.'
    };
  }

  function visitConfidence(samples, start) {
    const lead = Math.max(0, (start - Date.now()) / 3600000);
    if (samples.some(sample => sample.frame?.kind === 'observed' && sample.pointValue !== null)) return { label: 'High for what is happening now', short: 'High', level: 'high' };
    if (samples.some(sample => sample.frame?.kind === 'nowcast' && sample.pointValue !== null)) return { label: 'High to medium · radar motion', short: 'Med–high', level: 'high' };
    const peak = values => values.length ? Math.max(...values) : null;
    const votes = [];
    const point = peak(samples.map(sample => sample.pointValue).filter(Number.isFinite));
    const reps = peak(samples.map(sample => sample.ensembleAny).filter(Number.isFinite));
    const support = peak(samples.map(sample => sample.support).filter(Number.isFinite));
    if (point !== null) votes.push(point >= .12);
    if (reps !== null) votes.push(reps >= 50);
    if (support !== null) votes.push(support >= 50);
    const wetVotes = votes.filter(Boolean).length;
    const aligned = votes.length ? Math.max(wetVotes, votes.length - wetVotes) / votes.length : 0;
    if (lead > 32) return { label: aligned >= .75 ? 'Medium · longer lead, sources align' : 'Guarded · longer lead or mixed sources', short: aligned >= .75 ? 'Medium' : 'Guarded', level: 'guarded' };
    if (votes.length >= 3 && aligned >= .75) return { label: 'Medium-high · independent sources align', short: 'Med–high', level: 'high' };
    if (votes.length >= 2) return { label: 'Medium · useful but still movable', short: 'Medium', level: 'medium' };
    return { label: 'Guarded · limited source agreement', short: 'Guarded', level: 'guarded' };
  }

  const sampleStrength = sample => Math.max(sample.observedRate || 0, sample.modelAmount || 0, (sample.ensembleAny || 0) / 60);
  const visitPeakSample = samples => samples.reduce((best, sample) => sampleStrength(sample) > sampleStrength(best) ? sample : best, samples[0]);

  function ringPoint(place, direction, distanceKm = 30) {
    const latScale = distanceKm / 111;
    const lonScale = distanceKm / Math.max(35, 111 * Math.cos(place.lat * Math.PI / 180));
    const diagonal = direction.dx && direction.dy ? Math.SQRT1_2 : 1;
    return { lat: place.lat + direction.dy * latScale * diagonal, lon: place.lon + direction.dx * lonScale * diagonal };
  }
  function visitDirectionFromVector(x, y) {
    if (Math.hypot(x, y) < .01) return '';
    const angle = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
    return DIRECTIONS[Math.round(angle / 45) % 8].name;
  }
  function longestCircularWetRun(entries) {
    const flags = entries.map(entry => entry.wet);
    let best = 0, run = 0;
    [...flags, ...flags].slice(0, flags.length + Math.max(0, flags.length - 1)).forEach(flag => {
      run = flag ? run + 1 : 0;
      best = Math.max(best, Math.min(run, flags.length));
    });
    return best;
  }

  // A bounded eight-direction check tells an organized band from an isolated cell.
  // "Approaching" is only used when an earlier frame of the same source is wet
  // around the point before the later frame is wet at it.
  async function analyzeRainArea(samples, place) {
    const usable = samples.filter(sample => sample.frame);
    if (!usable.length) return { label: 'Rain-area detail unavailable', detail: 'The point forecast is available, but the surrounding official weather layer did not resolve.' };
    const peak = visitPeakSample(usable);
    const target = peak.time.getTime();
    const lookback = peak.frame.kind === 'guidance' ? 60 * 60000 : 20 * 60000;
    let ringFrame = peak.frame;
    try {
      const earlier = await frameAt(target - lookback);
      if (earlier && earlier.kind === peak.frame.kind && new Date(earlier.time).getTime() < target - 5 * 60000) ringFrame = earlier;
    } catch (_) {}
    const movingWindow = ringFrame !== peak.frame;
    const ring = await Promise.all(DIRECTIONS.map(async direction => ({ ...direction, value: finite(await sky().featureValue(ringFrame, ringPoint(place, direction))) })));
    if (ring.filter(item => item.value !== null).length < 4) return { label: 'Rain-area detail limited', detail: 'Not enough surrounding point reads returned to classify a nearby rain band honestly.' };
    const entries = ring.map(item => ({ ...item, wet: item.value !== null && item.value >= WET_RATE }));
    const wetEntries = entries.filter(item => item.wet);
    if (!wetEntries.length) return { label: 'No organized rain band nearby', detail: 'The surrounding official layer does not show a meaningful wet area around the destination at the checked time.' };
    const total = wetEntries.reduce((sum, item) => sum + Math.max(WET_RATE, item.value), 0);
    const direction = visitDirectionFromVector(
      wetEntries.reduce((sum, item) => sum + item.dx * Math.max(WET_RATE, item.value), 0) / total,
      wetEntries.reduce((sum, item) => sum + item.dy * Math.max(WET_RATE, item.value), 0) / total
    );
    const organized = wetEntries.length >= 3 && longestCircularWetRun(entries) >= 2;
    const movingToward = movingWindow && (peak.wet || (peak.pointValue !== null && peak.pointValue >= WET_RATE));
    if (organized) {
      return {
        label: movingToward && direction ? `Rain band approaching from the ${direction}` : direction ? `Rain area strongest to the ${direction}` : 'Organized rain area nearby',
        detail: movingToward
          ? `The official ${peak.frame.kind === 'guidance' ? 'HRDPS' : 'radar-motion'} layer places a broader wet area ${direction ? `${direction} of` : 'near'} the destination before precipitation reaches the point.`
          : `Several surrounding official point reads form a broader wet area${direction ? `, strongest to the ${direction}` : ''}.`
      };
    }
    return { label: direction ? `Scattered cell to the ${direction}` : 'Scattered rain nearby', detail: 'The surrounding signal is isolated rather than a broad, organized rain band.' };
  }

  function buildVisitResult(start, end, samples, band, place = sky()?.place) {
    const likelihood = visitLikelihood(samples);
    const confidence = visitConfidence(samples, start);
    const wetSamples = samples.filter(sample => sample.wet);
    const firstWet = wetSamples[0] || null;
    const lastWet = wetSamples.at(-1) || null;
    const peak = visitPeakSample(samples);
    const raining = samples.some(sample => sample.frame?.kind === 'observed' && sample.observedRate >= WET_RATE);
    const risk = likelihood.score >= 65 || samples.some(sample => sample.observedRate >= WET_RATE) ? 'high' : likelihood.score >= 35 || wetSamples.length ? 'medium' : 'low';
    let title, copy;
    if (raining) {
      title = 'It is raining at the destination.';
      copy = `Measured radar is wet at ${place.name}; the rest of the ${fmtTime(start)}–${fmtTime(end)} window is checked below.`;
    } else if (risk === 'high') {
      title = 'Plan for rain during this visit.';
      copy = firstWet
        ? `The strongest rain signal reaches ${place.name} around ${fmtTime(firstWet.time)}${lastWet && lastWet !== firstWet ? ` and remains relevant toward ${fmtTime(lastWet.time)}` : ''}.`
        : `Multiple forecast signals raise the rain risk during ${fmtTime(start)}–${fmtTime(end)}.`;
    } else if (risk === 'medium') {
      title = 'A shower could interrupt this visit.';
      copy = firstWet ? `The rain signal is most relevant near ${fmtTime(firstWet.time)}, but placement or timing can still shift.` : 'Some guidance supports rain, but no decisive wet period is fixed over the destination.';
    } else {
      title = 'This visit currently looks mostly dry.';
      copy = `No strong rain signal is fixed over ${place.name} from ${fmtTime(start)} to ${fmtTime(end)}.`;
    }
    const arrivalFact = firstWet ? (firstWet.time.getTime() <= start + 20 * 60000 ? 'Wet near arrival' : `Around ${fmtTime(firstWet.time)}`) : 'No wet period identified';
    const peakAmount = Math.max(peak.observedRate || 0, peak.modelAmount || 0);
    const peakFact = peakAmount >= .05
      ? `${fmtTime(peak.time)} · ${peakAmount.toFixed(peakAmount < 10 ? 1 : 0)} ${peak.frame?.kind === 'guidance' || !peak.frame ? 'mm this hour' : 'mm/h'}`
      : `${fmtTime(peak.time)} · no meaningful amount`;
    const evidence = [];
    if (samples.some(sample => sample.frame?.kind === 'observed')) evidence.push('measured radar');
    if (samples.some(sample => sample.frame?.kind === 'nowcast')) evidence.push('official radar motion');
    if (samples.some(sample => sample.frame?.kind === 'guidance')) evidence.push('HRDPS 2.5 km');
    if (samples.some(sample => sample.ensembleAny !== null)) evidence.push('REPS ensemble');
    if (samples.some(sample => sample.support !== null)) evidence.push('SkyMap forecast-family blend');
    copy = copy.replace(/\.\.$/, '.');
    return {
      start, end, place: { ...place }, createdAt: Date.now(), timeLabel: `${frameStamp(start)}–${fmtTime(end)}`,
      risk, title, copy, likelihood, confidence, band, samples, firstWet, lastWet, peak, arrivalFact, peakFact,
      evidence: `Checked with ${evidence.length ? evidence.join(', ') : 'the available guidance'}. ${band.detail}`
    };
  }

  // --- Interface --------------------------------------------------------------
  function openDialog() {
    const dialog = $('#visit-dialog');
    if (!dialog) return;
    if (!dialog.open) { if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
  }
  function setView(showResult) {
    const form = $('#visit-form'), result = $('#visit-result');
    if (form) form.hidden = showResult;
    if (result) result.hidden = !showResult;
  }
  function open(showResult = false) {
    ensureDraft();
    renderForm();
    if (showResult && state.result) renderResult(state.result);
    setView(Boolean(showResult && state.result));
    openDialog();
  }

  function renderForm() {
    const draft = normalizeDraft();
    text('#visit-place-name', sky()?.place?.name || 'Choose a place');
    const activeKey = dateKeyInZone(new Date(draft.start));
    const strip = $('#visit-date-strip');
    if (strip) {
      strip.innerHTML = '';
      forecastDayKeys(3).forEach((key, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = key === activeKey ? 'active' : '';
        button.setAttribute('aria-pressed', String(key === activeKey));
        button.innerHTML = `${index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : esc(dayName(dateFromKey(key)))}<span>${esc(monthDay(dateFromKey(key)))}</span>`;
        button.addEventListener('click', () => {
          const current = ensureDraft();
          const duration = current.end - current.start;
          current.start = forecastDateAt(key, minutesInForecastDay(new Date(current.start))).getTime();
          current.end = current.start + duration;
          normalizeDraft({ preserveDuration: true });
          state.result = null;
          renderForm();
        });
        strip.append(button);
      });
    }
    text('#visit-start-time', fmtTime(new Date(draft.start)));
    text('#visit-end-time', fmtTime(new Date(draft.end)));
    const minutes = Math.round((draft.end - draft.start) / 60000);
    $$('[data-visit-duration]').forEach(button => {
      const active = Number(button.dataset.visitDuration) === minutes;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function adjust(which, deltaMinutes) {
    const draft = ensureDraft();
    const delta = Number(deltaMinutes) * 60000;
    if (which === 'start') {
      const duration = draft.end - draft.start;
      draft.start += delta;
      draft.end = draft.start + duration;
      normalizeDraft({ preserveDuration: true });
    } else {
      draft.end += delta;
      normalizeDraft();
    }
    state.result = null;
    renderForm();
  }

  function setDuration(minutes) {
    const draft = ensureDraft();
    draft.end = draft.start + Number(minutes) * 60000;
    normalizeDraft();
    state.result = null;
    renderForm();
  }

  function renderPending(draft) {
    const node = $('#visit-result');
    if (node) node.dataset.risk = 'pending';
    text('#visit-result-kicker', `${(sky()?.place?.name || '').toUpperCase()} · ${fmtTime(draft.start)}–${fmtTime(draft.end)}`);
    text('#visit-result-title', 'Checking your exact window');
    text('#visit-result-copy', 'Reading the destination, nearby rain area, official futurecast and the ensemble signal.');
    ['#visit-likelihood-label', '#visit-arrival-fact', '#visit-peak-fact', '#visit-band-fact', '#visit-confidence-fact'].forEach(selector => text(selector, 'Resolving'));
    text('#visit-likelihood-value', '—');
    text('#visit-likelihood-source', 'Waiting for the strongest official signal.');
    text('#visit-evidence', '');
    const meter = $('#visit-likelihood-meter'); if (meter) meter.style.width = '2%';
    const track = $('#visit-window-track'); if (track) track.innerHTML = '';
    $$('#visit-result .visit-actions button').forEach(button => { button.disabled = true; });
  }

  async function run() {
    if (!sky()) return;
    const draft = normalizeDraft();
    const token = ++state.token;
    const place = sky().place;
    const action = $('#visit-check-action');
    if (action) { action.disabled = true; action.textContent = 'Checking radar and guidance…'; }
    setView(true);
    renderPending(draft);
    try {
      const samples = await Promise.all(visitSampleTimes(draft.start, draft.end).map(async target => {
        const frame = await frameAt(target);
        const [pointValue, ensemble] = await Promise.all([
          frame ? sky().featureValue(frame, place) : Promise.resolve(undefined),
          frame?.kind === 'guidance' ? ensembleAt(target) : Promise.resolve(null)
        ]);
        let blend = null;
        try { blend = sky().blendAt(new Date(target)); } catch (_) {}
        return visitSignalAt(target, frame, pointValue, ensemble, blend);
      }));
      if (token !== state.token) return;
      const band = await analyzeRainArea(samples, place).catch(() => ({ label: 'Rain-area detail unavailable', detail: 'The point forecast completed, but the surrounding spatial check did not.' }));
      if (token !== state.token) return;
      state.result = buildVisitResult(draft.start, draft.end, samples, band, place);
      renderResult(state.result);
      renderHero(state.result);
    } catch (_) {
      if (token !== state.token) return;
      setView(false);
      sky()?.showToast?.('The visit check did not finish. Your forecast is still available.');
    } finally {
      if (action) { action.disabled = false; action.textContent = 'Check this time window'; }
    }
  }

  function renderTrack(result) {
    const track = $('#visit-window-track');
    if (!track) return;
    track.innerHTML = '';
    const values = result.samples.map(sample => Math.max(sample.observedRate || 0, sample.modelAmount || 0));
    const max = Math.max(.25, ...values);
    result.samples.forEach((sample, index) => {
      const value = values[index];
      const bar = document.createElement('span');
      const support = sample.ensembleAny ?? sample.support ?? 30;
      bar.style.setProperty('--visit-rain', `${(value < .05 ? 3 : 7 + Math.sqrt(value / max) * 47).toFixed(1)}px`);
      bar.style.setProperty('--visit-support', clamp(.3 + support / 140, .3, 1).toFixed(2));
      bar.innerHTML = `<i aria-hidden="true"></i><b>${esc(fmtTime(sample.time))}</b><small>${value < .05 ? 'dry' : `${esc(value.toFixed(value < 10 ? 1 : 0))} ${sample.frame?.kind === 'guidance' || !sample.frame ? 'mm' : 'mm/h'}`}</small>`;
      track.append(bar);
    });
  }

  function renderResult(result) {
    const node = $('#visit-result');
    if (node) node.dataset.risk = result.risk;
    text('#visit-result-kicker', `${result.place.name.toUpperCase()} · ${result.timeLabel}`);
    text('#visit-result-title', result.title);
    text('#visit-result-copy', result.copy);
    text('#visit-likelihood-label', result.likelihood.label);
    text('#visit-likelihood-value', result.likelihood.value);
    text('#visit-likelihood-source', result.likelihood.source);
    const meter = $('#visit-likelihood-meter'); if (meter) meter.style.width = `${clamp(result.likelihood.score, 2, 100)}%`;
    text('#visit-arrival-fact', result.arrivalFact);
    text('#visit-peak-fact', result.peakFact);
    text('#visit-band-fact', result.band.label);
    text('#visit-confidence-fact', result.confidence.label);
    text('#visit-evidence', result.evidence);
    renderTrack(result);
    $$('#visit-result .visit-actions button').forEach(button => { button.disabled = false; });
    setView(true);
  }

  function renderHero(result) {
    const hero = $('#visit-hero');
    if (!hero) return;
    if (!result) {
      hero.dataset.risk = '';
      text('#visit-hero-kicker', 'VISIT CHECK');
      text('#visit-hero-title', 'Will rain reach your plans?');
      text('#visit-hero-copy', 'Pick an arrival and departure time in the next 48 hours. SkyMap checks only that window, then makes a large image you can share.');
      text('#visit-hero-button', 'Check a visit window');
      const quick = $('#visit-share-quick'); if (quick) quick.hidden = true;
      return;
    }
    hero.dataset.risk = result.risk;
    text('#visit-hero-kicker', `${result.place.name.toUpperCase()} · ${fmtTime(result.start)}–${fmtTime(result.end)}`);
    text('#visit-hero-title', result.title);
    text('#visit-hero-copy', `${result.copy} ${result.band.label}.`.replace(/\.\.$/, '.'));
    text('#visit-hero-button', 'Change visit');
    const quick = $('#visit-share-quick'); if (quick) quick.hidden = false;
  }

  // --- Share card -------------------------------------------------------------
  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
  function wrapLines(ctx, value, maxWidth, maxLines) {
    const words = String(value || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:]?$/, '')}…`;
      return kept;
    }
    return lines;
  }
  function drawLines(ctx, value, x, y, maxWidth, lineHeight, maxLines = 3) {
    const lines = wrapLines(ctx, value, maxWidth, maxLines);
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
    return y + lines.length * lineHeight;
  }

  async function shareBitmap(frame, place, width, height) {
    if (!frame) return null;
    const radiusKm = frame.kind === 'guidance' ? 90 : 65;
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / Math.max(35, 111 * Math.cos(place.lat * Math.PI / 180));
    const query = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: frame.layer, STYLES: frame.style || '', CRS: 'EPSG:4326',
      BBOX: `${place.lat - latDelta},${place.lon - lonDelta},${place.lat + latDelta},${place.lon + lonDelta}`,
      WIDTH: String(width), HEIGHT: String(height), FORMAT: 'image/png', TRANSPARENT: 'TRUE'
    });
    if (frame.time) query.set('TIME', frame.time);
    if (frame.reference) query.set('DIM_REFERENCE_TIME', frame.reference);
    try {
      const response = await sky().geometFetch(query, { timeout: 15000 });
      if (!(response.headers.get('content-type') || '').includes('image')) return null;
      const blob = await response.blob();
      if (blob.size < 250) return null;
      if ('createImageBitmap' in window) return await createImageBitmap(blob);
      const url = URL.createObjectURL(blob);
      try {
        return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; });
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (_) { return null; }
  }

  const riskColour = result => result.risk === 'high' ? '#ffad83' : result.risk === 'medium' ? '#ffd47e' : '#8ff3c1';

  function drawCard(canvas, result, bitmap = null, activeIndex = -1) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const { width, height } = canvas;
    const s = width / 1080;
    const px = value => value * s;
    const font = (weight, size) => `${weight} ${px(size)}px Inter, "Segoe UI", system-ui, sans-serif`;
    const accent = riskColour(result);
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#0b1d29');
    background.addColorStop(.55, '#061520');
    background.addColorStop(1, '#030c13');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#71e4ff';
    ctx.font = font(800, 25);
    ctx.fillText('SKYMAP ONTARIO', px(60), px(68));
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.fillText('VISIT CHECK', px(1020), px(68));
    ctx.textAlign = 'left';

    ctx.fillStyle = '#f4fbff';
    ctx.font = font(700, 63);
    drawLines(ctx, result.place.name, px(60), px(145), px(960), px(62), 1);
    ctx.fillStyle = '#9eb1ba';
    ctx.font = font(600, 36);
    ctx.fillText(`${frameStamp(result.start)} – ${fmtTime(result.end)}`, px(60), px(196));

    ctx.fillStyle = accent;
    ctx.font = font(700, 66);
    const titleBottom = drawLines(ctx, result.title, px(60), px(275), px(760), px(66), 2);

    roundedRect(ctx, px(840), px(234), px(180), px(108), px(24));
    ctx.fillStyle = 'rgba(3, 12, 18, .7)';
    ctx.fill();
    ctx.strokeStyle = `${accent}88`;
    ctx.lineWidth = px(2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9eb1ba';
    ctx.font = font(800, 21);
    ctx.fillText('RAIN', px(930), px(266));
    ctx.fillStyle = accent;
    ctx.font = font(700, 46);
    ctx.fillText(result.likelihood.value, px(930), px(314));
    ctx.textAlign = 'left';

    const mapX = px(60), mapY = px(Math.max(385, titleBottom / s + 32)), mapW = px(960), mapH = px(400);
    roundedRect(ctx, mapX, mapY, mapW, mapH, px(27));
    ctx.save();
    ctx.clip();
    const mapGradient = ctx.createRadialGradient(mapX + mapW / 2, mapY + mapH / 2, 0, mapX + mapW / 2, mapY + mapH / 2, mapW * .64);
    mapGradient.addColorStop(0, '#12303f');
    mapGradient.addColorStop(1, '#06141e');
    ctx.fillStyle = mapGradient;
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.globalAlpha = .18;
    ctx.strokeStyle = '#b8cbd3';
    for (let step = 1; step < 6; step += 1) { ctx.beginPath(); ctx.arc(mapX + mapW / 2, mapY + mapH / 2, px(step * 58), 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (bitmap) ctx.drawImage(bitmap, mapX, mapY, mapW, mapH);
    const cx = mapX + mapW / 2, cy = mapY + mapH / 2;
    const direction = DIRECTIONS.find(item => result.band.label.toLowerCase().includes(item.name)) || null;
    if (direction) {
      const diagonal = direction.dx && direction.dy ? Math.SQRT1_2 : 1;
      const sx = cx + direction.dx * mapW * .35 * diagonal, sy = cy - direction.dy * mapH * .35 * diagonal;
      const ex = cx - direction.dx * px(38), ey = cy + direction.dy * px(38);
      ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = px(7); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      if (result.band.label.toLowerCase().includes('approaching')) {
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(angle - .55) * px(29), ey - Math.sin(angle - .55) * px(29));
        ctx.lineTo(ex - Math.cos(angle + .55) * px(29), ey - Math.sin(angle + .55) * px(29));
        ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(sx, sy, px(10), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#041019'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = px(6);
    ctx.beginPath(); ctx.arc(cx, cy, px(23), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#71e4ff';
    ctx.beginPath(); ctx.arc(cx, cy, px(9), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(224, 246, 255, .2)'; ctx.lineWidth = px(2);
    roundedRect(ctx, mapX, mapY, mapW, mapH, px(27)); ctx.stroke();
    roundedRect(ctx, mapX + px(14), mapY + px(12), px(650), px(44), px(14));
    ctx.fillStyle = 'rgba(3, 12, 18, .8)'; ctx.fill();
    ctx.fillStyle = '#9eb1ba'; ctx.font = font(800, 22);
    const kind = result.peak.frame?.kind;
    ctx.fillText(`${kind === 'guidance' ? 'OFFICIAL HRDPS' : kind === 'nowcast' ? 'RADAR MOTION' : kind === 'observed' ? 'MEASURED RADAR' : 'FORECAST BLEND'} · DESTINATION CENTRE`, mapX + px(27), mapY + px(41));
    roundedRect(ctx, mapX + px(14), mapY + mapH - px(66), mapW - px(28), px(52), px(14));
    ctx.fillStyle = 'rgba(3, 12, 18, .84)'; ctx.fill();
    ctx.fillStyle = '#f4fbff'; ctx.font = font(700, 32);
    drawLines(ctx, result.band.label, mapX + px(28), mapY + mapH - px(30), mapW - px(56), px(34), 1);

    const trackY = mapY + mapH + px(30);
    ctx.fillStyle = '#9eb1ba'; ctx.font = font(800, 22);
    ctx.fillText('YOUR TIME WINDOW', px(60), trackY + px(20));
    const trackX = px(60), trackW = px(960), chartTop = trackY + px(42), chartH = px(142);
    roundedRect(ctx, trackX, chartTop, trackW, chartH, px(21));
    ctx.fillStyle = 'rgba(3, 12, 18, .7)'; ctx.fill();
    ctx.strokeStyle = 'rgba(224, 246, 255, .13)'; ctx.stroke();
    const values = result.samples.map(sample => Math.max(sample.observedRate || 0, sample.modelAmount || 0));
    const max = Math.max(.25, ...values);
    const slot = trackW / result.samples.length;
    const stride = Math.max(1, Math.ceil(result.samples.length / 5));
    result.samples.forEach((sample, index) => {
      const value = values[index];
      const active = index === activeIndex;
      if (active) { ctx.fillStyle = 'rgba(255, 212, 126, .12)'; ctx.fillRect(trackX + slot * index, chartTop + px(2), slot, chartH - px(4)); }
      const barH = value < .05 ? px(4) : px(13) + Math.sqrt(value / max) * px(67);
      ctx.fillStyle = active ? '#ffd47e' : value < .05 ? '#2b4250' : '#4aa8ff';
      roundedRect(ctx, trackX + slot * index + slot * .28, chartTop + chartH - px(45) - barH, slot * .44, barH, px(6));
      ctx.fill();
      if (active || index === 0 || index === result.samples.length - 1 || index % stride === 0) {
        ctx.fillStyle = active ? '#f4fbff' : '#9eb1ba';
        ctx.font = font(active ? 700 : 600, 19);
        ctx.textAlign = 'center';
        ctx.fillText(fmtTime(sample.time), trackX + slot * (index + .5), chartTop + chartH - px(17));
      }
    });
    ctx.textAlign = 'left';

    const factsY = chartTop + chartH + px(29);
    const facts = [['WHEN', result.arrivalFact], ['PEAK', result.peakFact], ['CONFIDENCE', result.confidence.short]];
    const gap = px(12), factW = (px(960) - gap * 2) / 3;
    facts.forEach(([label, value], index) => {
      const x = px(60) + index * (factW + gap);
      roundedRect(ctx, x, factsY, factW, px(130), px(18));
      ctx.fillStyle = 'rgba(255, 255, 255, .035)'; ctx.fill();
      ctx.strokeStyle = 'rgba(224, 246, 255, .12)'; ctx.stroke();
      ctx.fillStyle = '#9eb1ba'; ctx.font = font(800, 20);
      ctx.fillText(label, x + px(16), factsY + px(27));
      ctx.fillStyle = label === 'CONFIDENCE' ? accent : '#f4fbff'; ctx.font = font(700, 32);
      drawLines(ctx, value, x + px(16), factsY + px(65), factW - px(32), px(34), 2);
    });

    ctx.fillStyle = '#9eb1ba'; ctx.font = font(600, 23);
    const checked = formatInZone(result.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    drawLines(ctx, `Checked ${checked} · ECCC radar and official forecast guidance · Timing can shift`, px(60), height - px(42), px(960), px(22), 2);
  }

  const canvasBlob = (canvas, type = 'image/png') => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas export failed')), type));

  async function createVisitImage(result) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const bitmap = await shareBitmap(result.peak.frame, result.place, 960, 400);
    try {
      drawCard(canvas, result, bitmap, Math.max(0, result.samples.indexOf(result.peak)));
      return await canvasBlob(canvas);
    } finally { bitmap?.close?.(); }
  }

  const frameKey = frame => `${frame?.layer || ''}|${frame?.time || ''}|${frame?.reference || ''}`;

  async function createVisitGif(result) {
    const { GIFEncoder, quantize, applyPalette } = await import('./vendor/gifenc.esm.js');
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 750;
    const unique = [];
    result.samples.forEach((sample, index) => {
      if (sample.frame && !unique.some(item => frameKey(item.sample.frame) === frameKey(sample.frame))) unique.push({ sample, index });
    });
    const chosen = unique.length
      ? unique.filter((_, index) => index % Math.max(1, Math.ceil(unique.length / 6)) === 0).slice(0, 6)
      : [{ sample: result.peak, index: Math.max(0, result.samples.indexOf(result.peak)) }];
    if (unique.length && chosen.at(-1).index !== unique.at(-1).index) chosen[chosen.length - 1] = unique.at(-1);
    const gif = GIFEncoder();
    for (let index = 0; index < chosen.length; index += 1) {
      const item = chosen[index];
      const bitmap = await shareBitmap(item.sample.frame, result.place, 600, 330);
      try {
        drawCard(canvas, result, bitmap, item.index);
        const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const palette = quantize(rgba, 64, { format: 'rgb444', useSqrt: false });
        gif.writeFrame(applyPalette(rgba, palette, 'rgb444'), canvas.width, canvas.height, { palette, delay: index === chosen.length - 1 ? 1350 : 650, repeat: 0 });
      } finally { bitmap?.close?.(); }
    }
    gif.finish();
    const blob = new Blob([gif.bytes()], { type: 'image/gif' });
    if (blob.size > 5_500_000) throw new Error('GIF exceeds safe share size');
    return blob;
  }

  function fileStem(result) {
    const place = String(result.place.name || 'Ontario').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'Ontario';
    return `SkyMap-${place}-${dateKeyInZone(new Date(result.start))}-${String(minutesInForecastDay(new Date(result.start))).padStart(4, '0')}`;
  }
  const shareText = result => `${result.place.name} · ${fmtTime(result.start)}–${fmtTime(result.end)}\n${result.title}\n${result.likelihood.label} · ${result.band.label}\nChecked with SkyMap Ontario.`;
  const blobAsBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('File conversion failed'));
    reader.readAsDataURL(blob);
  });

  async function shareFile(blob, filename, result) {
    const copy = shareText(result);
    const native = window.SkyMapNativeBridge;
    if (native) {
      await native.call('shareFile', filename, blob.type, await blobAsBase64(blob), copy);
      return;
    }
    const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type, lastModified: Date.now() }) : null;
    if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: `${result.place.name} weather window`, text: copy, files: [file] });
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    try { await navigator.clipboard.writeText(copy); } catch (_) {}
    sky()?.showToast?.('Saved the share image · summary copied when permitted');
  }

  async function withShareButton(button, busyLabel, task) {
    if (state.sharing || !state.result) return;
    state.sharing = true;
    const original = button?.innerHTML;
    if (button) { button.disabled = true; button.textContent = busyLabel; }
    try { await task(state.result); }
    catch (error) { if (error?.name !== 'AbortError') sky()?.showToast?.('Sharing did not finish. Try the large image again.'); }
    finally {
      state.sharing = false;
      if (button) { button.disabled = false; button.innerHTML = original; }
    }
  }
  const shareImage = button => withShareButton(button, 'Building large image…', async result => shareFile(await createVisitImage(result), `${fileStem(result)}.png`, result));
  const shareMotion = button => withShareButton(button, 'Building short GIF…', async result => {
    let blob;
    try { blob = await createVisitGif(result); }
    catch (_) {
      sky()?.showToast?.('Motion export was unavailable · sharing the large image instead');
      return shareFile(await createVisitImage(result), `${fileStem(result)}.png`, result);
    }
    return shareFile(blob, `${fileStem(result)}.gif`, result);
  });

  function bind() {
    $('#visit-button')?.addEventListener('click', () => open(Boolean(state.result)));
    $('#visit-hero-button')?.addEventListener('click', () => open(false));
    $('#visit-share-quick')?.addEventListener('click', event => shareImage(event.currentTarget));
    $('#visit-place-button')?.addEventListener('click', () => { $('#visit-dialog')?.close(); sky()?.openPlaceDialog?.(); });
    $('#visit-check-action')?.addEventListener('click', run);
    $('#visit-edit-action')?.addEventListener('click', () => { renderForm(); setView(false); });
    $('#visit-map-action')?.addEventListener('click', () => {
      if (!state.result) return;
      $('#visit-dialog')?.close();
      sky()?.showTime?.(state.result.firstWet?.time || state.result.peak.time);
    });
    $('#visit-share-image')?.addEventListener('click', event => shareImage(event.currentTarget));
    $('#visit-share-motion')?.addEventListener('click', event => shareMotion(event.currentTarget));
    $$('[data-visit-adjust]').forEach(button => button.addEventListener('click', () => {
      const [which, delta] = button.dataset.visitAdjust.split(':');
      adjust(which, Number(delta));
    }));
    $$('[data-visit-duration]').forEach(button => button.addEventListener('click', () => setDuration(button.dataset.visitDuration)));
    // A result belongs to one place; moving the pinpoint starts a fresh check.
    window.addEventListener('skymap:place', () => { state.token++; state.result = null; renderHero(null); text('#visit-place-name', sky()?.place?.name || ''); });
  }

  if (globalThis.__SKYMAP_VISIT_TEST__) {
    globalThis.__SKYMAP_VISIT_TEST__.api = {
      state, forecastDayKeys, forecastDateAt, minutesInForecastDay, visitSampleTimes, visitSignalAt,
      visitLikelihood, buildVisitResult, longestCircularWetRun, visitDirectionFromVector
    };
    return;
  }
  bind();
  renderHero(null);
  // app/#visit (used by the landing page) opens the visit check directly.
  window.addEventListener('skymap:ready', () => { if (location.hash === '#visit') setTimeout(() => open(false), 0); }, { once: true });
})();
