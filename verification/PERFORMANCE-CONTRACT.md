# Forecast Lab 33.2 performance contract

Trustworthy does not mean blocking. Forecast Lab 33.2 separates the minimum evidence needed to paint a forecast from every request that can safely arrive afterward.

## Critical path

1. Start Canada GEM and ECMWF IFS as the highest-trust independent pair.
2. If that pair is slow, hedge with GFS and then AIFS instead of waiting blindly.
3. Render as soon as two independent models are usable.
4. Wait until that forecast has reached a browser paint before attaching map tiles or starting secondary traffic.
5. Add the remaining models progressively.
6. Load radar metadata, Best Match, ECCC official guidance, REPS, point nowcast, and WeatherNext outside the first-paint path.
7. Re-run the governed single-pass router when each evidence family becomes ready.

The first view is therefore a real raw-model consensus, never placeholder weather. Later evidence can refine it only within the Lab 33 horizon budgets.

## Resilience rules

- A slow model is stopped after ten seconds instead of freezing the whole experience.
- Changing location cancels obsolete model requests instead of letting them consume bandwidth or mutate the new place.
- If a live model refresh fails, a clearly labelled cached response may be used for no more than six hours.
- Even fresh cache hits are labelled with their age; a cached answer is never presented as a live fetch.
- The thirty-minute scheduled refresh bypasses the forty-five-minute launch cache and really contacts the models.
- A failed model cannot reject successful model results.
- Radar metadata cannot block the point forecast.
- The large GeoMet capabilities document is fetched once per ten-minute browser session, not once per layer.
- Parsed WeatherNext members are reused for thirty minutes across reloads.
- Evidence readiness is debounced before UI rendering to avoid flicker and excessive main-thread work.
- Status observers update only when their output changes, preventing mutation loops.

## Local adaptation and privacy

- First-forecast paint time and per-model completion time are stored only in local browser storage.
- No performance or location telemetry is transmitted to SkyMap or any analytics service.
- At most twenty local samples are retained.
- The most recent eight samples for the current connection class tune the hedge delay within strict bounds.
- Data Saver, 2G, and slow-2G connections use a more conservative request schedule so optional traffic does not swamp the link.

## Executable verification

```bash
node scripts/check-progressive-fast-path.mjs
```

This gate fails if optional evidence or map tiles return to the first-paint path, the trusted primary pair or bounded hedges disappear, progressive rendering is removed, scheduled refreshes silently reuse cache, cached data loses its label, obsolete requests are not cancelled, radar metadata becomes blocking, timeouts or stale bounds are removed, duplicate metadata downloads return, or the status observer can loop.
