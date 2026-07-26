(() => {
  'use strict';

  const preview = document.querySelector('[data-preview]');
  const tabs = [...document.querySelectorAll('[data-preview-tab]')];
  const playButton = document.querySelector('.preview-time button');
  const copy = {
    now: { kicker: 'OBSERVED RADAR', title: 'Rain stays west for now.', body: 'Watch the latest measured frames move toward your location.', time: 'NOW', left: 'PAST HOUR', centre: 'NOW', right: 'NOWCAST', confidence: 'MEASURED' },
    six: { kicker: 'RADAR → HRDPS + REPS', title: 'Showers approach this evening.', body: 'The source boundary stays visible while ensemble support checks the first forecast hours.', time: 'IN 6H', left: 'NOW', centre: 'NOWCAST', right: '+6H', confidence: 'CONVERGING' },
    day: { kicker: 'HRDPS + REPS SIGNAL', title: 'Tomorrow’s wettest pocket has support.', body: 'The 2.5 km map supplies the shape; the official ensemble supplies the probability signal.', time: 'TOMORROW', left: 'NOW', centre: 'HRDPS + REPS', right: '+24H', confidence: 'ALIGNED' },
    'two-day': { kicker: '48-HOUR CONVERGENCE', title: 'See the two-day path without fake precision.', body: 'Longer lead times remain useful, while mixed sources are labelled guarded instead of certain.', time: 'IN 48H', left: 'NOW', centre: 'MODEL + ENSEMBLE', right: '+48H', confidence: 'GUARDED' }
  };
  let previewTimer = null;

  function setPreview(mode) {
    if (!preview || !copy[mode]) return;
    preview.dataset.preview = mode;
    tabs.forEach(tab => {
      const active = tab.dataset.previewTab === mode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelector('[data-preview-kicker]').textContent = copy[mode].kicker;
    document.querySelector('[data-preview-title]').textContent = copy[mode].title;
    document.querySelector('[data-preview-copy]').textContent = copy[mode].body;
    document.querySelector('[data-preview-time]').textContent = copy[mode].time;
    document.querySelector('[data-preview-left]').textContent = copy[mode].left;
    document.querySelector('[data-preview-centre]').textContent = copy[mode].centre;
    document.querySelector('[data-preview-right]').textContent = copy[mode].right;
    document.querySelector('[data-preview-confidence]').textContent = copy[mode].confidence;
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setPreview(tab.dataset.previewTab)));
  playButton?.addEventListener('click', () => {
    if (previewTimer) {
      clearInterval(previewTimer);
      previewTimer = null;
      playButton.classList.remove('playing');
      playButton.setAttribute('aria-label', 'Preview play');
      return;
    }
    const modes = tabs.map(tab => tab.dataset.previewTab);
    let index = Math.max(0, modes.indexOf(preview?.dataset.preview));
    if (index >= modes.length - 1) {
      index = 0;
      setPreview(modes[index]);
    }
    playButton.classList.add('playing');
    playButton.setAttribute('aria-label', 'Pause preview');
    previewTimer = setInterval(() => {
      index += 1;
      if (index >= modes.length) {
        clearInterval(previewTimer);
        previewTimer = null;
        playButton.classList.remove('playing');
        playButton.setAttribute('aria-label', 'Preview play');
        return;
      }
      setPreview(modes[index]);
    }, 1250);
  });
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
