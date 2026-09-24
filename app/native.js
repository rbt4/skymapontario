/* SkyMap Android bridge.
   Inside the APK the page is served from appassets.androidplatform.net and the
   native app exposes an origin-scoped message channel (window.SkyMapNative).
   On the web this file does nothing. */
(() => {
  'use strict';
  const IS_NATIVE = location.hostname === 'appassets.androidplatform.net';
  const channel = IS_NATIVE ? window.SkyMapNative : null;
  if (!channel || typeof channel.postMessage !== 'function') return;

  const pending = new Map();
  let sequence = 0;
  const receive = event => {
    try {
      const response = JSON.parse(event.data || '{}');
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      clearTimeout(request.timer);
      if (response.ok) request.resolve(response.result);
      else request.reject(new Error(response.error || 'Native request failed'));
    } catch (_) {}
  };
  if (typeof channel.addEventListener === 'function') channel.addEventListener('message', receive);
  else channel.onmessage = receive;

  const NativeBridge = {
    call(method, ...args) {
      const id = `${Date.now().toString(36)}-${(++sequence).toString(36)}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native request timed out')); }, 12000);
        pending.set(id, { resolve, reject, timer });
        try { channel.postMessage(JSON.stringify({ id, method, args })); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    }
  };
  window.SkyMapNativeBridge = NativeBridge;

  // Background refresh on Android follows whatever point the user is watching.
  const remember = place => {
    if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) return;
    NativeBridge.call('rememberLocation', JSON.stringify({ name: place.name, lat: Number(place.lat), lon: Number(place.lon), zoom: Number(place.zoom) || 10 })).catch(() => {});
  };
  window.addEventListener('skymap:ready', event => remember(event.detail?.place));
  window.addEventListener('skymap:place', event => remember(event.detail?.place));
})();
