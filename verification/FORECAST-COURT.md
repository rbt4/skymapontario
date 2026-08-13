# Forecast Lab 34 prospective Forecast Court

Forecast Lab 34 turns local verification into a conservative calibration system. It does not claim that past hit rate is a future probability, and it does not let a short winning streak rewrite the forecast.

## Evidence lifecycle

1. Each raw GEM, IFS, GFS, and AIFS forecast is frozen before its valid hour.
2. One representative forecast is retained per model, valid hour, and lead bucket for nine days.
3. When that hour arrives, ECCC `RADAR_1KM_RRAI` point data supplies the independent rain observation.
4. Rain occurrence and log-scaled precipitation-rate error are scored separately, then combined as 80% occurrence and 20% amount quality.
5. A valid hour counts once per model and lead bucket. Reloads and repeated thirty-minute forecasts cannot manufacture extra court samples.
6. Snow and mixed-snow groups are withheld because rain-radar rate is not a valid snow truth source.

## Cohorts

Evidence is retained separately by:

- local 0.1° cell;
- forecast lead bucket: 0–3, 3–12, 12–24, 24–48, 48–96, or 96+ hours;
- meteorological season;
- forecast regime: dry, light rain, or steady rain.

The court tries the most specific mature cohort first, then falls back through local and Ontario-wide lead cohorts. A fallback is still based only on observations collected on the current device.

## Promotion gate

A cohort cannot adjust model influence until it has all of the following:

| Gate | Minimum |
| --- | ---: |
| Independently verified hours | 48 |
| Observation span | 30 days |
| Observed wet hours | 8 |
| Observed dry hours | 16 |
| Models meeting the sample floor | 2 |

Every model score is shrunk toward a 72% prior with 24 virtual samples. This makes early evidence deliberately weak. After promotion, each model's influence factor is capped between 0.86 and 1.14 of its published base influence, and total influence is conserved. The hardcoded base weights remain immutable.

## Controls that remain locked

- event probabilities are not calibrated;
- timing is not shifted;
- forecast locations are not spatially moved;
- shared ECCC, Best Match, REPS, nowcast, and WeatherNext evidence is not learned into raw-model weights;
- radar does not grade snow.

The user-facing evidence drawer identifies whether the Court is still collecting or active and shows both base and adjusted influence when active.

## Privacy and persistence

The ledger remains in browser local storage. SkyMap sends no calibration analytics, location history, forecasts, or observations to a SkyMap server. Storage is bounded: global observation identifiers, per-cohort observations, per-model sample identifiers, and prospective snapshots all have explicit caps.

## Executable verification

```bash
node scripts/check-forecast-court.mjs
```

The contract fails if thresholds weaken, balance or span gates disappear, influence exceeds ±14%, total model influence changes, long-range forecasts expire before verification, rain radar can grade snow, or the visible consensus bypasses eligible Court weights.
