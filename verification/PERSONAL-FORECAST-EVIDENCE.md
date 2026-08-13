# Forecast Lab 34 personal shadow evidence

Forecast Lab 34 keeps a private, prospective record of forecasts and later rain-radar observations on the current device. Its purpose is diagnosis: it can show a bounded shadow blend, but it cannot change the live forecast.

## Evidence lifecycle

1. Raw GEM, IFS, GFS, and AIFS forecasts are frozen before their valid hour.
2. One representative forecast is retained per model, valid hour, and lead bucket for nine days.
3. When the hour arrives, ECCC `RADAR_1KM_RRAI` point data supplies an independent rain observation.
4. Rain occurrence and log-scaled precipitation-rate error are scored separately.
5. A valid hour counts once per model and lead bucket; reloads cannot manufacture samples.
6. Snow and mixed-snow groups are withheld because rain-radar rate is not snow truth.

Evidence stays separate by local cell, forecast lead, season, and forecast regime. A shadow cohort is not shown as mature until it has 48 verified hours across at least 30 days, including at least 8 wet and 16 dry observations, with two models meeting the sample floor. Scores are shrunk toward a prior, and the diagnostic shadow is capped to ±14% of each base influence.

These are diagnostic thresholds, not production-promotion thresholds. The stricter sealed Ontario Court in `FORECAST-COURT.md` is the only statistical release gate. Even a passing Court still requires an explicit code release.

The ledger remains in bounded browser local storage. SkyMap does not send personal forecast history, observation history, or location history to a SkyMap server.

## Verification

```bash
node scripts/check-forecast-court.mjs
```

The contract fails if the personal path can alter a live row, auto-promote a weight, grade snow with rain radar, manufacture duplicate samples, or consume a public Court verdict as executable configuration.
