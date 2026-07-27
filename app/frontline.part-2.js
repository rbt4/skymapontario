
    return {
      level, title, copy, locality: city?.name || point.name || 'Current location',
      radar: rateLabel(radar?.centre),
      surface: city?.condition || (surface ? `${surface.station} · ${surface.rain.toFixed(1)} mm/1h` : 'No nearby report'),
      front: radar?.nearest ? `${radar.nearest.direction} · 15 km${radar.organized ? ' · organized edge' : ''}` : approaching ? `Projected arrival ${Math.max(5, nowcast.minutes)} min` : thickening ? 'Cloud thickening' : 'No rain edge detected',
      updated: new Date()
    };
  }

  function installUi() {
    const chip = $('.brand-place small');
    if (chip) { chip.id = 'location-mode-chip'; chip.textContent = 'FOLLOW ME · FINDING GPS'; }
    const rail = $('.map-mode-rail');
    if (rail && !$('#cloud-front-toggle')) {
      const button = document.createElement('button');
      button.id = 'cloud-front-toggle';
      button.type = 'button';
      button.className = 'cloud-front-toggle';
      button.setAttribute('aria-pressed', String(state.cloudEnabled));
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 16.5h10a3.7 3.7 0 0 0 .5-7.3A5.7 5.7 0 0 0 6.4 11a2.8 2.8 0 0 0 .4 5.5Z"/><path d="M5 20h13"/></svg><b>Clouds</b>';
      rail.append(button);
    }
    const story = $('.radar-story');
    if (story && !$('#truth-deck')) {
      const deck = document.createElement('section');
      deck.id = 'truth-deck';
      deck.className = 'truth-deck';
      deck.dataset.level = 'loading';
      deck.innerHTML = '<header><span><small>RIGHT NOW · LIVE PINPOINT</small><b id="truth-updated">Finding your location</b></span><button id="truth-refresh" type="button" aria-label="Refresh current pinpoint weather">↻</button></header><h2 id="truth-title">Finding your exact weather.</h2><p id="truth-copy">SkyMap is separating what is reaching the ground now from the selected future frame.</p><div class="truth-signals"><span><small>RADAR AT PIN</small><b id="truth-radar">Resolving</b></span><span><small>SURFACE</small><b id="truth-surface">Resolving</b></span><span><small>RAIN / CLOUD EDGE</small><b id="truth-front">Resolving</b></span><span><small>GPS</small><b id="truth-gps">Finding fix</b></span></div>';
      story.prepend(deck);
    }
    const locationHeader = $('#location-sheet header');
    if (locationHeader && !$('#frontline-use-location')) {
      const button = document.createElement('button');
      button.id = 'frontline-use-location';
      button.className = 'frontline-use-location';
      button.type = 'button';
      button.innerHTML = '<span><i></i><b>Use my live location</b><small>Follow me and refresh after meaningful movement</small></span><em>LIVE</em>';
      locationHeader.after(button);
    }
  }

  function patchLeaflet() {
    if (!window.L?.map || window.L.map.__frontline) return;
    const original = window.L.map;
    const wrapped = function (...args) {
      const map = original.apply(this, args);
      state.map = map;
      map.whenReady(() => {
        if (!map.getPane('satellitePane')) map.createPane('satellitePane');
        map.getPane('satellitePane').style.zIndex = '325';
        map.getPane('satellitePane').style.display = state.cloudEnabled && radarMode() ? '' : 'none';
        map.on('moveend', () => scheduleCloud());
        if (state.position) applyPosition(true);
        refreshCloud(true);
      });
      return map;
    };
    Object.assign(wrapped, original);
    wrapped.__frontline = true;
    window.L.map = wrapped;
  }

  function patchGeolocation() {
    if (!geo || !originalGetCurrentPosition) return;
    const replacement = (success, error, options) => {
      if (state.position && Date.now() - Number(state.position.timestamp || 0) < 90000) {
        queueMicrotask(() => success(state.position));
        return undefined;
      }
      return originalGetCurrentPosition(success, error, options);
    };
    try { Object.defineProperty(geo, 'getCurrentPosition', { configurable: true, value: replacement }); }
    catch (_) { try { geo.getCurrentPosition = replacement; } catch (_) { } }
  }

  function startLocation() {
    if (!state.follow || state.watchId !== null || !originalWatchPosition) return;
    state.watchId = originalWatchPosition(onPosition, onLocationError, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  }

  function stopLocation() {
    if (state.watchId !== null && originalClearWatch) try { originalClearWatch(state.watchId); } catch (_) { }
    state.watchId = null;
  }

  function setFollow(enabled) {
    state.follow = Boolean(enabled);
    if (state.follow) { startLocation(); if (state.position) applyPosition(true); }
    else { stopLocation(); removeAccuracy(); renderLocation('PINNED PLACE · SESSION ONLY'); }
  }

  function onPosition(position) {
    if (!Number.isFinite(position?.coords?.latitude) || !Number.isFinite(position?.coords?.longitude)) return;
    state.position = position;
    renderLocation();
    updateAccuracy();
    applyPosition(false);
  }

  function onLocationError(error) {
    const denied = Number(error?.code) === 1;
    if (denied) {
      state.follow = false;
      stopLocation();
      removeAccuracy();
      renderLocation('LOCATION OFF · USING SAVED PLACE');
      refreshTruth(true);
      return;
    }
    renderLocation('GPS RETRYING');
  }

  function shouldApply(force) {
    if (force || !state.lastApplied) return true;
    const latest = { lat: state.position.coords.latitude, lon: state.position.coords.longitude };
    const moved = distanceKm(state.lastApplied, latest) * 1000;
    const accuracy = Number(state.position.coords.accuracy) || 0;
    const movementThreshold = clamp(Math.max(250, accuracy * 1.5), 250, 900);
    return moved >= movementThreshold || Date.now() - state.lastApplied.savedAt > 3 * 60000;
  }

  function applyPosition(force) {
    if (!state.follow || !state.position || !state.map || state.applying || !shouldApply(force)) return;
    const button = $('#locate-button');
    if (!button) return;
    state.applying = true;
    state.lastApplied = { lat: state.position.coords.latitude, lon: state.position.coords.longitude, savedAt: Date.now() };
    button.click();
    setTimeout(() => {
      state.applying = false;
      state.map?.flyTo([state.lastApplied.lat, state.lastApplied.lon], Math.max(10, state.map.getZoom()), { duration: .55 });
      updateAccuracy();
      refreshTruth(true);
      refreshCloud(true);
    }, 1400);
  }

  function renderLocation(forced = '') {
    const accuracy = state.position?.coords?.accuracy;
    const chip = $('#location-mode-chip');
    if (chip) chip.textContent = forced || (!state.follow ? 'PINNED PLACE · SESSION ONLY' : Number.isFinite(accuracy) ? `FOLLOW ME · GPS ±${accuracy < 1000 ? `${Math.round(accuracy)} M` : `${(accuracy / 1000).toFixed(1)} KM`}` : 'FOLLOW ME · FINDING GPS');
    if (state.follow && state.locality && $('#location-name')) $('#location-name').textContent = `${state.locality} · Current`;
    if ($('#truth-gps')) $('#truth-gps').textContent = Number.isFinite(accuracy) ? `±${accuracy < 1000 ? `${Math.round(accuracy)} m` : `${(accuracy / 1000).toFixed(1)} km`}` : 'Finding fix';
  }

  function updateAccuracy() {
    if (!state.map || !state.position || !state.follow) return;
    const point = [state.position.coords.latitude, state.position.coords.longitude];
    const radius = clamp(state.position.coords.accuracy || 100, 20, 2000);
    if (!state.accuracyCircle) state.accuracyCircle = window.L.circle(point, { radius, pane: 'labelPane', interactive: false, weight: 1, color: '#7be8ff', opacity: .72, fillColor: '#48cfff', fillOpacity: .08 }).addTo(state.map);
    else state.accuracyCircle.setLatLng(point).setRadius(radius);
  }

  function removeAccuracy() {
    if (state.map && state.accuracyCircle) try { state.map.removeLayer(state.accuracyCircle); } catch (_) { }
    state.accuracyCircle = null;
  }

  function radarMode() {
    const active = $('[data-map-mode].active');
    return !active || ['rain', 'storm'].includes(active.dataset.mapMode);
  }

  function cloudUrl(endpoint, meta) {
    const bounds = state.map.getBounds();
    const size = state.map.getSize();
    const query = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: SATELLITE, STYLES: '', CRS: 'EPSG:4326', BBOX: `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`, WIDTH: clamp(Math.round(size.x * 1.2), 360, 1100), HEIGHT: clamp(Math.round(size.y * 1.2), 300, 900), FORMAT: 'image/png', TRANSPARENT: 'TRUE', _: Date.now() });
    const time = meta.defaultTime || meta.times.at(-1);
