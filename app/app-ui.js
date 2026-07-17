  function applyFrame(index, user = true) {
    if (!state.frames.length || !state.weatherLayer) return;
    state.frameIndex = Math.max(0, Math.min(index, state.frames.length - 1));
    const time = state.frames[state.frameIndex];
    state.weatherLayer.setParams({ time: time.toISOString(), _refresh: Date.now() }, false);
    renderTimeline();
    if (user) setStatus(`Loading frame ${state.frameIndex + 1} of ${state.frames.length}…`, 'loading');
  }

  function renderTimeline() {
    const frames = state.frames;
    const max = Math.max(0, frames.length - 1);
    DOM.slider.max = String(max); DOM.slider.value = String(Math.min(state.frameIndex, max));
    const pct = max ? (state.frameIndex / max) * 100 : 0;
    DOM.progress.style.width = `${pct}%`;
    if (!frames.length) {
      DOM.relative.textContent = 'CURRENT'; DOM.absolute.textContent = 'This layer does not use a timeline'; DOM.rangeStart.textContent = '—'; DOM.rangeEnd.textContent = '—'; DOM.nowMarker.style.display = 'none'; return;
    }
    const current = frames[state.frameIndex], now = Date.now(), minutes = Math.round((current.getTime() - now) / 60000);
    DOM.relative.textContent = Math.abs(minutes) < 4 ? 'RIGHT NOW' : minutes < 0 ? `${Math.abs(minutes)} MIN AGO` : `IN ${minutes} MIN`;
    DOM.absolute.textContent = formatDateTime(current);
    DOM.rangeStart.textContent = formatShort(frames[0]); DOM.rangeEnd.textContent = formatShort(frames[max]);
    if (max) {
      const nearest = frames.reduce((best, date, index) => Math.abs(date - now) < Math.abs(frames[best] - now) ? index : best, 0);
      DOM.nowMarker.style.display = ''; DOM.nowMarker.style.left = `${(nearest / max) * 100}%`;
    } else DOM.nowMarker.style.display = 'none';
  }

  function startPlayback() {
    if (state.frames.length < 2) return showToast('No animation frames are available for this layer.');
    state.playing = true; DOM.play.classList.add('playing'); DOM.play.querySelector('span').textContent = 'Ⅱ'; DOM.play.setAttribute('aria-label', 'Pause animation');
    state.frameTimer = setInterval(() => applyFrame((state.frameIndex + 1) % state.frames.length, false), state.mode === 'rain' ? 620 : 850);
  }
  function stopPlayback() {
    state.playing = false; clearInterval(state.frameTimer); state.frameTimer = null;
    DOM.play.classList.remove('playing'); DOM.play.querySelector('span').textContent = '▶'; DOM.play.setAttribute('aria-label', 'Play animation');
  }

  function renderPlaces() {
    DOM.placeGrid.innerHTML = '';
    PLACES.forEach(([name, lat, lng, zoom, region]) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `place-option${name === state.place ? ' active' : ''}`;
      button.innerHTML = `<b>${escapeHtml(name)}</b><span>${escapeHtml(region)}</span>`;
      button.addEventListener('click', () => selectPlace(name, lat, lng, zoom)); DOM.placeGrid.appendChild(button);
    });
  }

  function selectPlace(name, lat, lng, zoom) {
    state.place = name; safeStorageSet('skymap.place', name); DOM.placeLabel.textContent = name;
    qsa('.place-option').forEach(button => button.classList.toggle('active', qs('b', button)?.textContent === name));
    closeSheets(); state.map.flyTo([lat, lng], zoom, { duration: 1.1 }); loadAQHI(lat, lng); showToast(`Viewing ${name}`);
  }

  function aqRisk(value) {
    if (value <= 3) return ['Low risk', 'var(--green)'];
    if (value <= 6) return ['Moderate risk', 'var(--yellow)'];
    if (value <= 10) return ['High risk', 'var(--orange)'];
    return ['Very high risk', 'var(--red)'];
  }

  async function loadAQHI(lat, lng) {
    try {
      const url = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&latest=true&bbox=-95.5,41.4,-73.8,57.6&limit=300';
      const data = await (await fetchWithTimeout(url, {}, 12000)).json();
      const candidates = (data.features || []).map(feature => {
        const p = feature.properties || {}, coords = feature.geometry?.coordinates || [];
        const value = Number(p.aqhi ?? p.AQHI ?? p.value ?? p.observed_value);
        if (!Number.isFinite(value) || coords.length < 2) return null;
        return { value, lat: Number(coords[1]), lng: Number(coords[0]), name: p.location_name_en || p.station_name || p.name_en || p.name || 'Ontario reporting station' };
      }).filter(Boolean).sort((a, b) => ((a.lat-lat)**2 + (a.lng-lng)**2) - ((b.lat-lat)**2 + (b.lng-lng)**2));
      if (!candidates.length) throw new Error('No observations');
      const nearest = candidates[0], [risk, colour] = aqRisk(nearest.value), shown = nearest.value > 10 ? '10+' : String(Math.round(nearest.value));
      [DOM.aqValue, DOM.sheetAqValue].forEach(el => { el.textContent = shown; el.style.color = colour; el.style.borderColor = colour; });
      [DOM.aqRisk, DOM.sheetAqRisk].forEach(el => el.textContent = risk);
      [DOM.aqStation, DOM.sheetAqStation].forEach(el => el.textContent = nearest.name);
    } catch (_) {
      [DOM.aqValue, DOM.sheetAqValue].forEach(el => el.textContent = '—');
      [DOM.aqRisk, DOM.sheetAqRisk].forEach(el => el.textContent = 'AQHI temporarily unavailable');
      [DOM.aqStation, DOM.sheetAqStation].forEach(el => el.textContent = 'Environment Canada feed');
    }
  }

  function renderAlerts() {
    const features = state.alertFeatures;
    const count = features.length;
    [DOM.alertTotal, DOM.sheetAlertTotal].forEach(el => el.textContent = String(count));
    DOM.modeAlertCount.hidden = count === 0; DOM.modeAlertCount.textContent = count > 99 ? '99+' : String(count);
    const markup = count ? features.slice(0, 4).map(feature => {
      const p = feature.properties || {};
      const title = p.alert_short_name_en || p.alert_name_en || p.alert_type || 'Weather alert';
      const area = p.feature_name_en || p.area_name_en || p.province || 'Ontario';
      return `<div class="alert-item"><b>${escapeHtml(title)}</b><span>${escapeHtml(area)}</span></div>`;
    }).join('') : '<p>No active Ontario alerts were returned by the public feed.</p>';
    DOM.alertList.innerHTML = markup; DOM.sheetAlertList.innerHTML = markup;
  }

  async function loadAlerts() {
    try {
      const url = 'https://api.weather.gc.ca/collections/weather-alerts/items?f=json&province=ON&limit=250&sortby=-publication_datetime';
      const data = await (await fetchWithTimeout(url, {}, 14000)).json();
      const unique = new Map();
      (data.features || []).forEach(feature => {
        const p = feature.properties || {};
        const key = `${p.alert_code || p.alert_name_en || 'alert'}|${p.feature_name_en || p.id || Math.random()}`;
        if (!unique.has(key)) unique.set(key, feature);
      });
      state.alertFeatures = [...unique.values()]; renderAlerts();
    } catch (_) { state.alertFeatures = []; renderAlerts(); DOM.alertList.innerHTML = DOM.sheetAlertList.innerHTML = '<p>The alert feed could not be reached. Use the official link for current instructions.</p>'; }
  }

  function openSheet(sheet) {
    closeSheets(false); sheet.hidden = false; DOM.backdrop.hidden = false; document.body.dataset.sheetOpen = 'true';
    requestAnimationFrame(() => qs('button,[href],input', sheet)?.focus());
  }
  function closeSheets(focus = true) {
    [DOM.placeSheet, DOM.infoSheet].forEach(sheet => sheet.hidden = true); DOM.backdrop.hidden = true; delete document.body.dataset.sheetOpen;
    if (focus) DOM.menuButton.focus({ preventScroll: true });
  }
  function openInfoSheetOnMobile() { if (innerWidth <= 780) openSheet(DOM.infoSheet); }

  function useLocation() {
    if (!navigator.geolocation) return showError('Location is not available in this browser.', false);
    DOM.locateButton.textContent = '…';
    navigator.geolocation.getCurrentPosition(position => {
      DOM.locateButton.textContent = '◎'; state.place = 'My location'; DOM.placeLabel.textContent = 'My location';
      state.map.flyTo([position.coords.latitude, position.coords.longitude], 9, { duration: 1.1 }); loadAQHI(position.coords.latitude, position.coords.longitude); showToast('Centred on your location');
    }, error => {
      DOM.locateButton.textContent = '◎'; showError(error.code === 1 ? 'Location permission was not granted.' : 'Your location could not be determined.', false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  async function shareView() {
    const center = state.map.getCenter();
    const url = new URL(IS_FILE ? 'https://rbt4.github.io/skymapontario/app/' : location.href);
    url.searchParams.delete('embed'); url.hash = `map=${state.map.getZoom()}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}&mode=${state.mode}`;
    const text = `${CONFIG[state.mode].story} — ${state.place}`;
    try {
      if (navigator.share) await navigator.share({ title: 'SkyMap Ontario', text, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); showToast('Map link copied'); }
    } catch (error) { if (error.name !== 'AbortError') showToast('Could not share this view'); }
  }

  function restoreHashView() {
    const match = /map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)&mode=(\w+)/.exec(location.hash);
    if (!match) return;
    state.map.setView([Number(match[2]), Number(match[3])], Number(match[1])); if (CONFIG[match[4]]) state.mode = match[4];
  }

  function bindEvents() {
    qsa('.mode-button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    DOM.placeButton.addEventListener('click', () => openSheet(DOM.placeSheet)); DOM.menuButton.addEventListener('click', () => openSheet(DOM.infoSheet));
    DOM.mobileSummaryButton.addEventListener('click', () => openSheet(DOM.infoSheet)); DOM.backdrop.addEventListener('click', () => closeSheets());
    qsa('[data-close-sheet]').forEach(button => button.addEventListener('click', () => closeSheets()));
    DOM.locateButton.addEventListener('click', useLocation); DOM.shareButton.addEventListener('click', shareView);
    DOM.play.addEventListener('click', () => state.playing ? stopPlayback() : startPlayback());
    DOM.slider.addEventListener('input', () => { stopPlayback(); applyFrame(Number(DOM.slider.value)); });
    DOM.refresh.addEventListener('click', () => setMode(state.mode, { force: true }));
    DOM.opacity.value = String(Math.round(state.opacity * 100)); DOM.opacity.addEventListener('input', () => {
      state.opacity = Number(DOM.opacity.value) / 100; safeStorageSet('skymap.opacity', String(DOM.opacity.value));
      if (state.weatherLayer && CONFIG[state.mode]) state.weatherLayer.setOpacity(Math.min(1, state.opacity * (CONFIG[state.mode].opacity / .82)));
    });
    qs('[data-collapse-panel]')?.addEventListener('click', () => { DOM.desktopInfo.classList.add('collapsed'); DOM.panelRestore.hidden = false; DOM.timeline.style.right = '12px'; state.map.invalidateSize(); });
    DOM.panelRestore.addEventListener('click', () => { DOM.desktopInfo.classList.remove('collapsed'); DOM.panelRestore.hidden = true; DOM.timeline.style.right = ''; state.map.invalidateSize(); });
    DOM.errorRetry.addEventListener('click', () => { clearError(); setMode(state.mode, { force: true }); });
    window.addEventListener('online', () => { setConnection(true); setMode(state.mode, { force: true }); loadAlerts(); });
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
    if (!IS_FILE && 'serviceWorker' in navigator) { try { await navigator.serviceWorker.register('./sw.js'); } catch (_) {} }
  }

  async function start() {
    try {
      bindEvents(); renderPlaces(); setConnection(navigator.onLine); DOM.loadingMessage.textContent = 'Loading the map engine…';
      await loadLeaflet(); initMap(); restoreHashView();
      const savedPlace = PLACES.find(place => place[0] === state.place); if (savedPlace) { DOM.placeLabel.textContent = savedPlace[0]; } else DOM.placeLabel.textContent = state.place;
      updateModeUI(state.mode); DOM.loadingMessage.textContent = 'Connecting to Ontario data…';
      await Promise.allSettled([setMode(state.mode, { force: true }), loadAQHI(state.map.getCenter().lat, state.map.getCenter().lng), loadAlerts(), registerServiceWorker()]);
      await sleep(250); DOM.loading.classList.add('done'); setTimeout(() => DOM.loading.remove(), 700);
      setInterval(() => { if (navigator.onLine && !state.playing) loadAlerts(); }, 15 * 60 * 1000);
      setInterval(() => { if (navigator.onLine && CONFIG[state.mode].timed && !state.playing) loadTimeFrames(state.mode); }, 10 * 60 * 1000);
    } catch (error) {
      DOM.loading.classList.add('done'); showError(error.message || 'SkyMap Ontario could not start.', true); setStatus('Map startup failed', 'error');
    }
  }

  start();
