# SkyMap Historical Intelligence

Forecast IQ 21 reacts to current radar, official guidance, ensembles and local device learning. Forecast Lab 22 began prospective verification. This layer adds the missing third leg: **historical forecast skill plus large-scale atmospheric context**.

## 1. Historical forecast skill

SkyMap backfills archived forecasts from 2024 onward at +24 h, +48 h and +72 h for 12 Ontario locations spanning the GTA, Golden Horseshoe, southwest, east, northeastern Ontario, northern Great Lakes and northwest.

Sources sampled from the archived Previous Runs API:

- Best Match
- GEM seamless
- ECMWF IFS 0.25°
- GFS seamless
- ECMWF AIFS where archive coverage exists

The forecasts are verified against ECCC `climate-hourly` observations from the nearest station with hourly coverage. Historical observations are therefore the truth source; the forecast archive is not used as its own verifier.

Each forecast source is scored overall, by season and by Ontario region. Old samples receive an exponential recency weight with a 365-day half-life because operational forecast systems change over time. Raw unweighted metrics remain available for audit.

## 2. Upstream atmospheric fingerprints

Ontario precipitation is not only a local problem. The backfill also records a 12-hour atmospheric fingerprint at ten sentinel points covering:

Eastern Pacific → British Columbia → Alberta → Prairies → northwestern Ontario → Great Lakes → Ohio Valley → Gulf of Mexico → northeastern U.S. → Hudson Bay.

For each point it records ECMWF IFS archived guidance for:

- mean sea-level pressure
- CAPE
- total-column integrated water vapour
- 500 hPa geopotential height
- 850 hPa temperature
- 850 hPa relative humidity
- 850 hPa wind speed and direction

This captures synoptic and moisture-transport structure without trying to ingest every grid cell on Earth.

The corresponding Ontario station wet fraction and mean precipitation are stored with each fingerprint. These form an analog library for later nearest-neighbour / regime-conditioned calibration.

## 3. Why this is safer than blindly training on everything

Weather is chaotic and small initial-condition differences can grow, but that does not make every distant observation equally useful. A production system should prefer physically relevant upstream state, ensemble spread, local observations and model skill over indiscriminate data volume.

Historical model versions also change. A 2024 GEM error should not have the same authority as a recent error after major model upgrades. For that reason historical skill is segmented and recency-weighted instead of being turned directly into a permanent global model ranking.

## 4. Data and repository safety

Historical state lives on the generated `forecast-history-data` branch. Each update force-replaces the branch with one commit, preventing years of backfill from bloating `main` or continuously rebuilding the app.

The backfill runs twice daily and advances two 62-day chunks per run until caught up. Once caught up, runs become effectively no-ops until new safely-verifiable history is available.

## 5. Production gate

The live Lab does **not** consume historical weights yet. Before that happens, the next gate will require:

1. adequate sample size per source / lead / region / season;
2. out-of-sample testing on dates excluded from fitting;
3. comparison against the existing Forecast IQ baseline;
4. shrinkage toward safe default weights when evidence is weak;
5. automatic rollback when historical calibration degrades recent verification.

The goal is not to claim superiority by design. The goal is to make SkyMap earn any weighting change with observed evidence.
