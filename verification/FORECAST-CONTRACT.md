# Forecast Lab 32 — truth firewall

Forecast Lab 32 changes the contract of SkyMap's live forecast fusion engine: **missing weather evidence is not dry weather**.

## Why this is an engine change

The research collectors already excluded missing forecasts and observations. The browser fusion layer still contained ordinary JavaScript coercions such as `Number(null) === 0`, fallback `|| 0` expressions, and zero-filled arrays. Those shortcuts could:

- turn a missing model value into a dry forecast;
- suppress precipitation without two explicit numeric inputs;
- store a fabricated dry hour in local learning;
- reward or punish a model for evidence it never supplied.

More models cannot correct a corrupted truth contract. The invariant has to exist at the first numeric boundary.

## Contract

1. `null`, `undefined`, blank strings, and the Forecast IQ missing-value sentinel remain missing.
2. Two missing values never blend to zero.
3. Optional rain, shower, snow, and weather-code fields are not created when absent.
4. A model hour with neither numeric precipitation nor an explicit weather code is not stored for local verification.
5. Dry corrections require explicit forecast evidence. Missing anchor precipitation cannot satisfy a dry threshold.
6. Exact numeric zero remains valid measured/forecast dry evidence.
7. Radar, official ECCC probabilities, REPS, Best Match, and WeatherNext keep their existing roles; this lab changes evidence integrity, not source priority.

## Executable gate

`scripts/check-forecast-contract.mjs` loads the real browser engine in a network-disabled VM and tests the exported contract. It also rejects the legacy null-to-zero helper, missing-to-dry mixer, and zero-filled forecast-array pattern if they return.

The dedicated `forecast-contract.yml` workflow runs on every relevant pull request and on `main`.

## Promotion boundary

Forecast Lab 32 does not promote regime weights, spatial corrections, event-timing offsets, or probability calibration. Those remain shadow-only until their prospective courts meet the published sample and non-degradation gates. The truth firewall makes those future promotions safer by ensuring the live engine cannot fabricate evidence at the boundary.
