    const reference = meta.defaultReference || meta.references.at(-1);
    if (time) query.set('TIME', formatTime(time));
    if (reference) query.set('DIM_REFERENCE_TIME', formatTime(reference));
    return `${endpoint}?${query}`;
  }

  async function refreshCloud(force = false) {
    if (!state.map || !state.cloudEnabled || !radarMode() || document.hidden) return;
    try {
      const meta = await layerMeta(SATELLITE, force);
      const endpoint = endpoints()[0];
      const overlay = window.L.imageOverlay(cloudUrl(endpoint, meta), state.map.getBounds(), { opacity: 0, pane: 'satellitePane', interactive: false, className: 'skymap-satellite-layer' }).addTo(state.map);
      overlay.once('load', () => {
        overlay.setOpacity(.48);
        const previous = state.cloudOverlay;
        state.cloudOverlay = overlay;
        if (previous && previous !== overlay) setTimeout(() => { try { state.map.removeLayer(previous); } catch (_) { } }, 450);
        if ($('#cloud-front-toggle')) $('#cloud-front-toggle').dataset.live = 'true';
      });
      overlay.once('error', () => { try { state.map.removeLayer(overlay); } catch (_) { } });
    } catch (_) { if ($('#cloud-front-toggle')) $('#cloud-front-toggle').dataset.live = 'false'; }
  }

  function scheduleCloud() {
    clearTimeout(state.cloudTimer);
    state.cloudTimer = setTimeout(() => refreshCloud(false), 500);
  }

  function renderTruth(truth) {
    const deck = $('#truth-deck');
    if (deck) deck.dataset.level = truth.level;
    const set = (selector, value) => { const element = $(selector); if (element) element.textContent = value; };
    set('#truth-title', truth.title);
    set('#truth-copy', truth.copy);
    set('#truth-radar', truth.radar);
    set('#truth-surface', truth.surface);
    set('#truth-front', truth.front);
    set('#truth-updated', `Updated ${fmtTime(truth.updated)} · ECCC + GOES + short interval`);
    renderLocation();
  }

  async function refreshTruth(force = false) {
    clearTimeout(state.truthTimer);
    const token = ++state.truthToken;
    const point = activePoint();
    const results = await Promise.allSettled([cityEvidence(point), surfaceEvidence(point), shortEvidence(point), radarEvidence(point), nowcastEvidence(point)]);
    if (token !== state.truthToken) return;
    const value = index => results[index].status === 'fulfilled' ? results[index].value : null;
    state.truth = buildTruth(point, value(0), value(1), value(2), value(3), value(4));
    state.locality = state.truth.locality;
    renderTruth(state.truth);
    rewriteStory();
    state.truthTimer = setTimeout(() => refreshTruth(false), force ? 4 * 60000 : 5 * 60000);
  }

  function selectedCurrent() {
    const label = String($('#playback-label')?.textContent || '').trim().toLowerCase();
    const kind = String($('#playback-kind')?.textContent || '').trim().toLowerCase();
    return label === 'now' || (label.includes('min ago') && kind.includes('measured'));
  }

  function selectedClock() {
    return String($('#story-time')?.textContent || $('#playback-clock')?.textContent || 'the selected time').replace(/^Today\s*·\s*/i, '');
  }

  function rewriteStory() {
    if (state.rewriting || !$('#story-title') || !$('#story-copy')) return;
    state.rewriting = true;
    try {
      const original = $('#story-title').textContent.trim();
      if (selectedCurrent() && state.truth && ['wet', 'trace', 'watch'].includes(state.truth.level)) {
        $('#story-title').textContent = state.truth.title;
        $('#story-copy').textContent = state.truth.copy;
      } else if (/^No measurable rain is projected here\.?$|^No radar return is projected here\.?$/i.test(original)) {
        $('#story-title').textContent = `At ${selectedClock()}, no measurable radar return is projected at the pinpoint.`;
        $('#story-copy').textContent = 'That is a radar-motion estimate for the selected future frame—not proof that no drizzle is reaching the ground right now.';
      } else if (/^No measurable rain is over this point\.?$|^No radar return is over this point\.?$/i.test(original)) {
        $('#story-title').textContent = `At ${selectedClock()}, no measurable radar return is over the pinpoint.`;
        $('#story-copy').textContent = 'Fine shallow drizzle can be missed or underestimated by radar, so the live surface check above remains separate.';
      } else if (/^Dry at this point now/i.test(original)) {
        $('#story-title').textContent = 'No measurable radar return is over the pinpoint now.';
        $('#story-copy').textContent = 'The radar point is below threshold. The live surface check above determines whether drizzle may still be reaching the ground.';
      }
    } finally { state.rewriting = false; }
  }

  function bind() {
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest('#locate-button, #frontline-use-location')) {
        setFollow(true);
        if (!state.position && originalGetCurrentPosition) originalGetCurrentPosition(onPosition, onLocationError, { enableHighAccuracy: true, maximumAge: 0, timeout: 18000 });
      }
      if (target.closest('#location-grid button, #location-search-results button')) {
        setFollow(false);
        setTimeout(() => refreshTruth(true), 1600);
      }
      if (target.closest('#cloud-front-toggle')) {
        state.cloudEnabled = !state.cloudEnabled;
        saveCloudPreference();
        $('#cloud-front-toggle')?.setAttribute('aria-pressed', String(state.cloudEnabled));
        if (state.map?.getPane('satellitePane')) state.map.getPane('satellitePane').style.display = state.cloudEnabled ? '' : 'none';
        if (state.cloudEnabled) refreshCloud(true);
      }
      if (target.closest('#truth-refresh')) refreshTruth(true);
      if (target.closest('[data-map-mode]')) setTimeout(() => refreshCloud(true), 100);
    }, true);

    const observer = new MutationObserver(() => rewriteStory());
    ['story-title', 'story-copy', 'story-time', 'playback-label', 'playback-kind'].forEach(id => {
      const element = document.getElementById(id);
      if (element) observer.observe(element, { childList: true, characterData: true, subtree: true });
    });
    const name = $('#location-name');
    if (name) new MutationObserver(() => {
      if (state.follow && state.locality && name.textContent !== `${state.locality} · Current`) name.textContent = `${state.locality} · Current`;
    }).observe(name, { childList: true, characterData: true, subtree: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      startLocation();
      refreshTruth(true);
      refreshCloud(true);
    });
    window.addEventListener('online', () => { refreshTruth(true); refreshCloud(true); });
  }

  function start() {
    installUi();
    bind();
    startLocation();
    setTimeout(() => refreshTruth(true), 1200);
    setInterval(() => { if (!document.hidden) refreshCloud(false); }, 10 * 60000);
  }

  patchLeaflet();
  patchGeolocation();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
