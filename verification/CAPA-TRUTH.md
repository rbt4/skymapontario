# CaPA / RDPA precipitation amount truth

Forecast Lab 30 adds a second kind of observed truth to SkyMap's verification stack: Environment and Climate Change Canada's final Regional Deterministic Precipitation Analysis (RDPA/CaPA).

## Why another truth source?

Different observations answer different questions:

- **1 km radar** is excellent for precipitation presence, motion and exact-point short-range verification.
- **Hourly climate stations** provide direct local observations but may be several kilometres from the requested point and are not spatially complete.
- **RDPA final analysis** provides a gridded six-hour precipitation estimate that combines available observations with a model background. It is therefore useful for judging regional precipitation amount and broad placement without pretending a single gauge represents an entire city.

SkyMap deliberately keeps these truth systems separate rather than merging them into one opaque score.

## What Forecast Lab 30 tests

The backtester retrieves fixed-lead historical precipitation forecasts for Best Match, GEM, ECMWF IFS, GFS and ECMWF AIFS at eight representative Ontario locations. For +24h, +48h and +72h forecasts, hourly precipitation is accumulated into the six-hour windows ending at 00, 06, 12 and 18 UTC and compared with ECCC collection `weather:rdpa:10km:6f`.

The initial historical backfill begins in 2024 so model archives and current-generation systems can be compared fairly. Every forecast family has its own cursor; a failed download remains behind and retries rather than silently creating a gap.

## Metrics

By model, lead, region and season the engine records:

- six-hour precipitation MAE
- recency-weighted MAE
- RMSE
- signed amount bias
- recency-weighted bias
- wet-event CSI / POD / FAR at 0.5 mm per six hours
- heavier-event CSI at 5 mm per six hours

Where the RDPA coverage response includes a usable confidence index, it only moderates the weight of that verification case; low confidence does not turn an observation into zero precipitation.

## Truth hierarchy

RDPA does **not** replace exact radar truth. A 10 km analysis grid is intentionally treated as regional amount truth. SkyMap must not use it to claim that rain occurred at an exact address at an exact minute.

Likewise, radar does not replace RDPA for accumulated precipitation amount. The point of the multi-truth architecture is to use the observation system best suited to each forecast claim.

## Promotion rule

CaPA/RDPA verification is research evidence. Any amount calibration derived from it must be tested prospectively and must preserve or improve event detection and timing before it can influence the live forecast.
