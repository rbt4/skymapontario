# Forecast Lab 33 evidence router

Forecast Lab 33 replaces per-model calibration with a governed, single-pass evidence router. The four numerical model feeds remain raw until their independent consensus is calculated. Shared guidance is then allowed to influence that consensus once.

## Why this exists

Earlier builds fetched Open-Meteo Best Match, ECCC official guidance, REPS, radar nowcast, and WeatherNext while loading each model. The same shared evidence could therefore change GEM, IFS, GFS, and AIFS separately before those models were blended. That made a common signal look like several independent votes.

Lab 33 closes that correlation leak:

- `accuracy-engine.js` records raw model snapshots and exposes ECCC/Best Match evidence as a read-only sidecar.
- `forecast-intelligence-25.js` restores guarded nulls and exposes WeatherNext as a read-only sidecar.
- `evidence-router.js` runs once, after the raw model blend.
- Every source has one source-family identity, one forecast-horizon role, and one bounded influence budget.
- Missing precipitation and weather-code values remain unknown. They are never translated into dry weather or zero precipitation.

## Horizon authority

| Lead time | Primary authority | Maximum corrective budget |
| --- | --- | ---: |
| 0–2.3 h | ECCC point radar nowcast; shared short-range guidance is only a small cross-check | 0.80 |
| 2.3–12 h | Raw model consensus plus one shared occurrence-guidance pass | 0.40 |
| 12–48 h | Raw model consensus; shared guidance and WeatherNext are bounded cross-checks | 0.37 |
| 48–72 h | Raw model consensus dominates | 0.30 |
| 72–168 h | Raw model consensus dominates strongly | 0.20 |
| Beyond 168 h | No corrective evidence routing | 0.00 |

The budgets are correction weights, not new model votes. Best Match plus its neighbourhood is one family. ECCC official plus REPS is one family. WeatherNext is one independent AI-ensemble family.

## Learning governance

Radar verification may continue to collect local model-skill scores. Lab 33 does not automatically promote those observations into model weights, timing offsets, spatial offsets, or probability calibration. Those controls remain locked until they pass the public Forecast Court with prospective, reproducible evidence.

## Executable verification

Run:

```bash
node scripts/check-forecast-contract.mjs
node scripts/check-evidence-router.mjs
```

The checks enforce strict null handling, single-pass routing, unique source identities, horizon budgets, zero model-array mutation, and the promotion locks.
