# SkyMap Historical Intelligence

Forecast IQ 21 reacts to current radar, official guidance, ensembles and local device learning. Forecast Lab 22 began prospective verification. Forecast Lab 23 added historical forecast skill plus large-scale atmospheric context. **23.1 makes that history lossless and source-aware.**

## 1. Historical forecast skill

SkyMap backfills archived forecasts from 2024 onward at +24 h, +48 h and +72 h for 12 Ontario locations spanning the GTA, Golden Horseshoe, southwest, east, northeastern Ontario, northern Great Lakes and northwest.

Sources sampled from Open-Meteo Previous Runs:

- Best Match
- GEM seamless
- ECMWF IFS 0.25°
- GFS seamless
- ECMWF AIFS when archive coverage exists

The forecasts are verified against ECCC `climate-hourly` observations. Historical observations are therefore the truth source; a forecast is never graded against another forecast.

Each forecast source is scored overall, by season and by Ontario region. Old samples receive an exponential recency weight with a 365-day half-life because operational forecast systems change over time. Raw unweighted metrics remain available for audit.

### Lossless archive rules

The original large-chunk prototype proved the concept but exposed two unacceptable failure modes: large archive requests could time out, and JavaScript `null` could accidentally be coerced to numeric zero. V23.1 removes both failure modes.

- `null`, `undefined` and blank archive values remain missing. They are **never** interpreted as a dry forecast.
- Every forecast source has an independent cursor.
- A network/API failure does not move that source's cursor; the same period is retried later.
- A successful response containing genuinely no archived data may advance without adding a score.
- Smaller 21-day source chunks reduce timeout risk.
- Coverage metadata records attempts, successful chunks, empty chunks, failures, usable values and scored pairs for every source.

Because different models entered archives at different times, this is more correct than forcing all models through one global historical cursor.

## 2. Better observation-station selection

For each Ontario point, SkyMap examines several nearby ECCC climate stations rather than blindly accepting the nearest metadata match. It downloads hourly records and prefers a station with adequate usable coverage for the requested period. If the nearest candidate has no real hourly observations, it falls back to the next candidate.

This prevents a nominally nearby but unusable station from silently eliminating a city from historical verification.

## 3. Upstream atmospheric fingerprints

Ontario precipitation is not only a local problem. The independent atmospheric-history cursor starts in 2022 and records a 12-hour fingerprint at ten sentinel points covering:

Eastern Pacific → British Columbia → Alberta → Prairies → northwestern Ontario → Great Lakes → Ohio Valley → Gulf of Mexico → northeastern U.S. → Hudson Bay.

For each point it records archived ECMWF IFS guidance for:

- mean sea-level pressure
- CAPE
- total-column integrated water vapour
- 500 hPa geopotential height
- 850 hPa temperature
- 850 hPa relative humidity
- 850 hPa wind speed and direction

This captures synoptic structure, instability and moisture transport without pretending every distant grid cell is equally relevant. The corresponding observed Ontario wet fraction and mean precipitation are stored with each fingerprint, creating an analog library for later regime-conditioned calibration.

The atmospheric cursor is independent from the model-skill cursors. If an atmospheric archive request fails, the pattern history stays on that period and retries instead of leaving a permanent hole.

## 4. Why this is safer than blindly training on everything

Weather is chaotic and small initial-condition differences can grow, but that does not make every distant observation equally useful. A production system should prefer physically relevant upstream state, ensemble spread, local observations and verified model skill over indiscriminate data volume.

Historical model versions also change. A 2024 model error should not have the same authority as a recent error after model upgrades. Historical skill is therefore segmented and recency-weighted instead of becoming a permanent global ranking.

## 5. Data and repository safety

Historical state lives on the generated `forecast-history-data` branch. Each update force-replaces the branch with one commit, preventing years of backfill from bloating `main` or continuously rebuilding the app.

The lossless collector runs every six hours. Each run advances each model by at most one 21-day chunk and the atmospheric archive by one 28-day chunk. That is intentionally gentler than the original 62-day downloads and naturally becomes a maintenance collector once the archive catches up.

## 6. Production gate

The live Lab does **not** consume historical weights yet. Before historical intelligence can influence a user-facing forecast it must pass:

1. adequate sample size per source / lead / region / season;
2. out-of-sample testing on dates excluded from fitting;
3. comparison against the existing Forecast IQ baseline;
4. shrinkage toward safe default weights when evidence is weak;
5. automatic rollback when historical calibration degrades recent verification.

The goal is not to declare SkyMap superior by architecture. The goal is to make every weighting change earn its place with observed evidence.
