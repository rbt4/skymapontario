(() => {
  'use strict';

  const preview = document.querySelector('[data-preview]');
  const tabs = [...document.querySelectorAll('[data-preview-tab]')];
  const playButton = document.querySelector('.preview-time button');
  const copy = {
    now: { kicker: 'OBSERVED RADAR', title: 'Dry at Oakville now.', body: 'The rain area is still west of your destination.', time: 'NOW', left: 'PAST HOUR', centre: 'NOW', right: '4 PM', confidence: 'MEASURED', path: 'No rain at arrival', peak: 'Band west of Oakville', then: 'Measured now', likelihood: '18%', decision: 'Mostly dry at arrival. Keep watching the band to the west.' },
    four: { kicker: 'RADAR NOWCAST', title: 'Rain approaches near arrival.', body: 'Official radar motion brings the western edge closer to Oakville.', time: '4:00 PM', left: 'NOW', centre: '4 PM', right: '5 PM', confidence: 'MED–HIGH', path: 'Edge near 4:20 PM', peak: 'Approaching from west', then: 'Motion guidance', likelihood: '58%', decision: 'Rain is possible shortly after arrival. Timing can still shift.' },
    five: { kicker: 'HRDPS + REPS', title: 'The wettest part is near 5 PM.', body: 'The high-resolution map and official ensemble both support rain.', time: '5:00 PM', left: '4 PM', centre: '5 PM', right: '6 PM', confidence: 'ALIGNED', path: 'Peak near 5:10 PM', peak: 'Light to steady rain', then: 'Easing later', likelihood: '72%', decision: 'Plan for rain during the middle of the visit.' },
    six: { kicker: 'HRDPS FUTURECAST', title: 'The rain area starts to ease.', body: 'The local amount falls while the broader band moves east.', time: '6:00 PM', left: '5 PM', centre: '6 PM', right: 'AFTER', confidence: 'MEDIUM', path: 'Easing near departure', peak: 'Band moving east', then: 'Recheck closer', likelihood: '44%', decision: 'The visit may end drier than its middle.' }
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
    document.querySelector('[data-preview-path]').textContent = copy[mode].path;
    document.querySelector('[data-preview-peak]').textContent = copy[mode].peak;
    document.querySelector('[data-preview-then]').textContent = copy[mode].then;
    document.querySelector('[data-preview-likelihood]').textContent = copy[mode].likelihood;
    document.querySelector('[data-preview-decision]').textContent = copy[mode].decision;
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setPreview(tab.dataset.previewTab)));
  if (preview) setPreview(preview.dataset.preview || 'now');
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
