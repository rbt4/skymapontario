# Forecast Lab 33.1 performance contract

Trustworthy does not mean blocking. Forecast Lab 33.1 separates the minimum evidence needed to show a forecast from the slower evidence used to refine it.

## Critical path

1. Load raw numerical models in parallel.
2. Render as soon as two independent models are usable.
3. Add the remaining models progressively.
4. Load radar metadata, Best Match, ECCC official guidance, REPS, point nowcast, and WeatherNext outside the critical path.
5. Re-run the governed single-pass router when each evidence family becomes ready.

The first view is therefore a real raw-model consensus, never placeholder weather. Later evidence can refine it only within the Lab 33 horizon budgets.

## Resilience rules

- A slow model is stopped after ten seconds instead of freezing the whole experience.
- If a live model refresh fails, a clearly labelled cached response may be used for no more than six hours.
- A failed model cannot reject successful model results.
- Radar metadata cannot block the point forecast.
- The large GeoMet capabilities document is fetched once per ten-minute browser session, not once per layer.
- Parsed WeatherNext members are reused for thirty minutes across reloads.
- Evidence readiness is debounced before UI rendering to avoid flicker and excessive main-thread work.
- Status observers update only when their output changes, preventing mutation loops.

## Executable verification

```bash
node scripts/check-progressive-fast-path.mjs
```

This gate fails if optional evidence returns to the model-loading critical path, progressive rendering disappears, radar metadata becomes blocking, timeouts or stale bounds are removed, duplicate metadata downloads return, or the status observer can loop.
