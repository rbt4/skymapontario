(() => {
  'use strict';

  const nav = document.querySelector('[data-nav]');
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-nav-menu]');
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  const closeMenu = () => {
    toggle?.setAttribute('aria-expanded', 'false');
    menu?.classList.remove('open');
  };

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    menu?.classList.toggle('open', !open);
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => {
    if (menu?.classList.contains('open') && !menu.contains(event.target) && !toggle?.contains(event.target)) closeMenu();
  });

  let previousY = window.scrollY;
  let ticking = false;
  const updateNav = () => {
    const y = window.scrollY;
    nav?.classList.toggle('scrolled', y > 20);
    nav?.classList.toggle('hidden', y > 150 && y > previousY && !menu?.classList.contains('open'));
    previousY = y;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateNav); ticking = true; }
  }, { passive: true });

  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
      });
    }, { threshold: .08, rootMargin: '0px 0px -35px' });
    reveals.forEach(item => observer.observe(item));
  } else reveals.forEach(item => item.classList.add('visible'));

  const risk = value => value <= 3 ? 'Low risk' : value <= 6 ? 'Moderate risk' : value <= 10 ? 'High risk' : 'Very high risk';
  const feedLabel = document.querySelector('[data-feed-status]');
  const feedPill = feedLabel?.closest('.live-pill');

  async function liveReadouts() {
    const air = fetch('https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&latest=true&bbox=-79.65,43.50,-79.10,43.90&limit=10', { signal: AbortSignal.timeout(12000), cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(data => {
        const values = (data.features || []).map(feature => Number(feature.properties?.aqhi)).filter(Number.isFinite);
        if (!values.length) throw new Error('No AQHI observation');
        const value = values[0];
        document.querySelector('[data-live-aqhi]').textContent = value > 10 ? '10+' : String(Math.round(value));
        document.querySelector('[data-live-aqhi-risk]').textContent = risk(value);
      });

    const alerts = fetch('https://api.weather.gc.ca/collections/weather-alerts/items?f=json&province=ON&limit=1', { signal: AbortSignal.timeout(12000), cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(data => { document.querySelector('[data-live-alerts]').textContent = String(data.numberMatched ?? data.features?.length ?? 0); });

    const results = await Promise.allSettled([air, alerts]);
    const available = results.filter(result => result.status === 'fulfilled').length;
    if (available === results.length) feedLabel.textContent = 'OFFICIAL FEEDS RESPONDING';
    else if (available) { feedLabel.textContent = 'SOME FEEDS RESPONDING'; feedPill?.classList.add('error'); }
    else { feedLabel.textContent = 'LIVE FEEDS TEMPORARILY DELAYED'; feedPill?.classList.add('error'); }
  }

  liveReadouts();
})();
