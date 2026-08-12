# SkyMap Forecast Verification

SkyMap's browser-local learning can improve one user's frequently visited point, but it cannot answer the larger question: **which forecast source actually performs best across Ontario, at each lead time?**

This verification system is the shared evidence layer for that question.

## What it samples

Every six hours the scheduled workflow records forecasts for Toronto, Ottawa, Hamilton, London, Windsor, Kingston, Greater Sudbury, and Thunder Bay at +6 h, +12 h, +24 h, +48 h, and +72 h.

The sources are:

- Open-Meteo Best Match, including precipitation probability
- GEM
- ECMWF IFS
- NOAA GFS
- ECMWF AIFS
- ECCC official hourly forecast probability where the city-page hourly horizon covers the target
- ECCC HRDPS exact-point precipitation through its available short-range horizon
- ECCC REPS probability of at least 1 mm in 3 hours for supported medium-range targets

## Ground truth

Predictions are not graded against another forecast. After the valid time has passed and the observation archive has had time to populate, the workflow queries ECCC's `climate-hourly` observations around the verification point and selects the nearest station with usable precipitation or observed-weather evidence.

A wet observation is declared when the station reports at least 0.2 mm of precipitation or an observed-weather description indicating precipitation. REPS uses a three-hour verification window because the REPS layer itself represents a three-hour precipitation threshold.

### Missing data is not dry weather

The verifier uses strict null semantics. A missing precipitation field, missing model pixel, missing station precipitation value, blank field, or absent weather description is **not** converted to numeric zero. If there is not enough evidence to score a source/hour, that source/hour is excluded and can be retried rather than receiving an artificial correct-dry result.

This rule is regression-tested because JavaScript otherwise converts `null` to `0` when passed through `Number()`.

## Metrics

For each source and lead time the system accumulates:

- hits
- misses
- false alarms
- correct dry forecasts
- accuracy
- probability of detection (POD)
- false alarm ratio (FAR)
- critical success index (CSI)
- Brier score for probabilistic guidance
- precipitation amount mean absolute error where comparable station accumulation exists

Rankings are withheld until a source/lead pair has at least 20 verified samples. The minimum can be raised once the archive is mature.

## Storage design

The generated data lives on the `forecast-data` branch rather than `main`. Each run force-replaces that branch with a single commit containing the bounded current state, compact public metrics, and a Markdown report. This avoids triggering the production application build every six hours and prevents years of verification snapshots from bloating Git history.

The production forecast engine does **not** automatically consume these scores yet. That is deliberate: the benchmark needs enough observations before it should be allowed to tune shared forecast weights.
