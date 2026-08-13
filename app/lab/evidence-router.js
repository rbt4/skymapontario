(() => {
  'use strict';

  const VERSION = '33.0.0';
  const PRECIP_CODES = new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
  const SNOW_CODES = new Set([71,73,75,77,85,86]);
  const GOVERNANCE_LOCKS = Object.freeze({
    learnedModelWeights: false,
    timingOffsets: false,
    spatialOffsets: false,
    probabilityCalibration: false,
    reason: 'Observation may update local skill scores, but promotion requires the public Forecast Court.'
  });

  const finite = value => value === null || value === undefined || value === '' || value === '__skymap_missing__'
    ? null
    : (Number.isFinite(Number(value)) ? Number(value) : null);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, weightB) => {
    const av = finite(a), bv = finite(b);
    if (av == null && bv == null) return null;
    if (av == null) return null;
    if (bv == null) return av;
    return av * (1 - weightB) + bv * weightB;
  };

  function horizonProfile(leadHours) {
    if (leadHours <= 2.3) return { id:'radar-handoff', nowcast:.72, shared:.08, weatherNext:0 };
    if (leadHours <= 12) return { id:'short-range', nowcast:0, shared:.34, weatherNext:.06 };
    if (leadHours <= 48) return { id:'event-range', nowcast:0, shared:.27, weatherNext:.10 };
    if (leadHours <= 72) return { id:'extended-range', nowcast:0, shared:.18, weatherNext:.12 };
    if (leadHours <= 168) return { id:'long-range', nowcast:0, shared:.10, weatherNext:.10 };
    return { id:'beyond-governed-range', nowcast:0, shared:0, weatherNext:0 };
  }

  function dedupeContributors(rows) {
    const unique = new Map();
    let duplicates = 0;
    for (const row of rows || []) {
      if (!row?.id || finite(row.value) == null || finite(row.weight) == null || row.weight <= 0) continue;
      if (unique.has(row.id)) { duplicates++; continue; }
      unique.set(row.id, { id:row.id, value:finite(row.value), weight:finite(row.weight) });
    }
    return { rows:[...unique.values()], duplicates };
  }

  function weightedProbability(evidence, leadHours) {
    const candidates = [];
    const add = (id, value, weight) => candidates.push({ id, value, weight });
    const exactPop = finite(evidence?.exactPop), neighbourPop = finite(evidence?.neighbours?.meanPop);
    const bestMatchPop = exactPop == null ? neighbourPop : neighbourPop == null ? exactPop : exactPop * .88 + neighbourPop * .12;
    add('open-meteo-best-match-family', bestMatchPop, leadHours <= 48 ? .62 : .76);
    const officialPop = finite(evidence?.officialPop), repsPop = finite(evidence?.repsPop);
    const ecccPop = officialPop == null ? repsPop : repsPop == null ? officialPop : officialPop * .54 + repsPop * .46;
    if (leadHours <= 54) add('eccc-guidance-family', ecccPop, leadHours <= 48 ? .38 : .24);
    const unique = dedupeContributors(candidates);
    const total = unique.rows.reduce((sum, row) => sum + row.weight, 0);
    return {
      value: total ? unique.rows.reduce((sum, row) => sum + clamp(row.value, 0, 100) * row.weight, 0) / total : null,
      contributors: unique.rows.map(row => row.id),
      duplicates: unique.duplicates
    };
  }

  function representativeCode(rows) {
    const weights = new Map();
    for (const row of rows || []) {
      const code = finite(row?.code);
      const weight = finite(row?.weight);
      if (code == null || weight == null) continue;
      weights.set(code, (weights.get(code) || 0) + weight);
    }
    let best = null, bestWeight = -1;
    for (const [code, weight] of weights) if (weight > bestWeight) { best = code; bestWeight = weight; }
    return best;
  }

  function route(base, options = {}) {
    if (!base || typeof base !== 'object') return base;
    const target = new Date(options.target ?? base.time).getTime();
    if (!Number.isFinite(target)) return base;
    const place = options.place || {};
    const leadHours = Math.max(0, (target - Date.now()) / 3600000);
    const profile = horizonProfile(leadHours);
    const evidence = options.evidence === undefined
      ? window.SkyMapAccuracy?.evidenceAt?.(place.lat, place.lon, target)
      : options.evidence;
    const weatherNext = options.weatherNext === undefined
      ? window.SkyMapForecastIQ25?.at?.(place.lat, place.lon, target)
      : options.weatherNext;
    const shared = weightedProbability(evidence, leadHours);
    const appliedSources = [];
    const withheldSources = [];
    const appliedFamilies = [];
    let duplicatesPrevented = shared.duplicates;
    let occurrence = finite(base.wet);
    let precipitation = finite(base.precip);
    let code = finite(base.code) ?? representativeCode(base.rows);
    const snowSignal = (finite(base.snow) ?? 0) >= 30 || (base.rows || []).some(row => {
      const snowfall = finite(row?.snow);
      const rowCode = finite(row?.code);
      return (snowfall != null && snowfall > .02) || (rowCode != null && SNOW_CODES.has(rowCode));
    });

    const nowcastRate = finite(evidence?.nowcastRate);
    if (profile.nowcast > 0 && nowcastRate != null && !snowSignal) {
      const nowcastProbability = nowcastRate < .03 ? 4 : nowcastRate < .12 ? 30 : nowcastRate < .5 ? 76 : 96;
      occurrence = occurrence == null ? nowcastProbability : mix(occurrence, nowcastProbability, profile.nowcast);
      precipitation = precipitation == null ? Math.max(0, nowcastRate) : mix(precipitation, Math.max(0, nowcastRate), profile.nowcast);
      appliedSources.push('eccc-radar-nowcast');
      appliedFamilies.push('observed-nowcast');
    } else if (nowcastRate != null) {
      withheldSources.push('eccc-radar-nowcast:horizon');
    }

    if (profile.shared > 0 && shared.value != null) {
      occurrence = occurrence == null ? shared.value : mix(occurrence, shared.value, profile.shared);
      if (precipitation != null) {
        const probabilityTarget = precipitation * clamp(.70 + .60 * shared.value / 100, .70, 1.30);
        const exactAmount = finite(evidence?.exactPrecip);
        const amountTarget = exactAmount == null ? probabilityTarget : exactAmount * .65 + probabilityTarget * .35;
        precipitation = mix(precipitation, Math.max(0, amountTarget), profile.shared);
      }
      appliedSources.push(...shared.contributors);
      appliedFamilies.push('shared-occurrence-guidance');
    }

    const wnProbability = finite(weatherNext?.probability);
    const wnMembers = finite(weatherNext?.members);
    if (profile.weatherNext > 0 && wnProbability != null && (wnMembers == null || wnMembers >= 20)) {
      const confidence = Math.abs(clamp(wnProbability, 0, 100) - 50) / 50;
      const spread = finite(weatherNext?.spread);
      const spreadPenalty = spread == null ? 1 : clamp(1 - spread / 8, .45, 1);
      const weight = profile.weatherNext * (.60 + .40 * confidence) * spreadPenalty;
      occurrence = occurrence == null ? wnProbability : mix(occurrence, wnProbability, weight);
      if (precipitation != null) {
        const wnMean = finite(weatherNext?.mean);
        const probabilityTarget = precipitation * clamp(.72 + .56 * wnProbability / 100, .72, 1.28);
        const amountTarget = wnMean == null ? probabilityTarget : wnMean * .45 + probabilityTarget * .55;
        precipitation = mix(precipitation, Math.max(0, amountTarget), weight);
      }
      appliedSources.push('google-weathernext2-ensemble');
      appliedFamilies.push('independent-ai-ensemble');
    } else if (wnProbability != null) {
      withheldSources.push(profile.weatherNext ? 'google-weathernext2-ensemble:members' : 'google-weathernext2-ensemble:horizon');
    }

    const uniqueSources = [...new Set(appliedSources)];
    duplicatesPrevented += appliedSources.length - uniqueSources.length;
    occurrence = occurrence == null ? null : Number(clamp(occurrence, 0, 100).toFixed(0));
    precipitation = precipitation == null ? null : Number(Math.max(0, precipitation).toFixed(3));
    const anchorCode = finite(evidence?.exactCode);
    if (!snowSignal && occurrence != null && occurrence < 18 && precipitation != null && precipitation < .09 && code != null && PRECIP_CODES.has(code)) code = 3;
    if (occurrence != null && occurrence >= 58 && anchorCode != null && PRECIP_CODES.has(anchorCode)) code = anchorCode;

    const output = { ...base, wet:occurrence, precip:precipitation, code };
    output.routing = Object.freeze({
      version: VERSION,
      mode: 'governed-single-pass',
      horizon: profile.id,
      leadHours: Number(leadHours.toFixed(2)),
      budget: Object.freeze({ nowcast:profile.nowcast, shared:profile.shared, weatherNext:profile.weatherNext, total:Number((profile.nowcast + profile.shared + profile.weatherNext).toFixed(2)) }),
      appliedSources: Object.freeze(uniqueSources),
      appliedFamilies: Object.freeze([...new Set(appliedFamilies)]),
      withheldSources: Object.freeze(withheldSources),
      duplicateSourcesPrevented: duplicatesPrevented,
      rawModelRowsMutated: 0,
      sharedProbability: shared.value == null ? null : Number(shared.value.toFixed(1)),
      weatherNextSpread: finite(weatherNext?.spread),
      governanceLocks: GOVERNANCE_LOCKS
    });
    return output;
  }

  window.SkyMapEvidenceRouter = Object.freeze({
    version: VERSION,
    mode: 'governed-single-pass',
    route,
    contract: Object.freeze({ finite, mix, horizonProfile, dedupeContributors, weightedProbability, governanceLocks:GOVERNANCE_LOCKS })
  });
})();
