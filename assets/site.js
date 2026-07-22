(() => {
  'use strict';

  const preview = document.querySelector('[data-preview]');
  const tabs = [...document.querySelectorAll('[data-preview-tab]')];
  const copy = {
    radar: { kicker: 'OBSERVED RADAR', title: 'Rain stays west for now.', body: 'Watch the latest frames move toward your location.', time: 'NOW' },
    moments: { kicker: 'WEATHER SNAPSHOTS', title: 'The next important change.', body: 'Meaningful moments replace repetitive hourly cards.', time: 'TONIGHT' },
    week: { kicker: '7-DAY FORECAST', title: 'The full week stays visible.', body: 'Highs, lows, conditions and expected rainfall.', time: '7 DAYS' }
  };

  function setPreview(mode) {
    if (!preview || !copy[mode]) return;
    preview.dataset.preview = mode;
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.previewTab === mode));
    document.querySelector('[data-preview-kicker]').textContent = copy[mode].kicker;
    document.querySelector('[data-preview-title]').textContent = copy[mode].title;
    document.querySelector('[data-preview-copy]').textContent = copy[mode].body;
    document.querySelector('[data-preview-time]').textContent = copy[mode].time;
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setPreview(tab.dataset.previewTab)));
  document.querySelector('[data-year]').textContent = String(new Date().getFullYear());

  fetch('version.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(version => {
    if (!version) return;
    const apk = `download/${version.apkBaseName || 'SkyMap-Ontario'}-v${version.version}.apk`;
    document.querySelectorAll('[data-apk]').forEach(link => { link.href = apk; link.setAttribute('download', ''); });
    document.querySelectorAll('[data-version]').forEach(node => { node.textContent = `${version.product || 'SkyMap Ontario'} ${version.version}`; });
    const release = document.querySelector('[data-release]');
    if (release) release.textContent = `Current release · ${version.version} ${version.releaseName || ''}`.trim();
  }).catch(() => { });
})();
