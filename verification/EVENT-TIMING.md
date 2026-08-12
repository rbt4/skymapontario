# Precipitation event timing verification

Forecast Lab 28 verifies the thing users actually experience: not only whether precipitation occurs, but whether the forecast gets the event window right.

## Prospective snapshots

Twice per day SkyMap seals precipitation-event windows for eight Ontario locations from six independent sources:

- Open-Meteo Best Match
- GEM
- ECMWF IFS
- GFS
- ECMWF AIFS
- Google DeepMind WeatherNext 2 ensemble

The verification horizon begins at +6 hours, after the radar/official-nowcast-dominant period, and extends to +72 hours.

## Event objects

Hourly wet signals are converted into event objects containing start time, end time, duration, total forecast amount and peak probability when available. A one-hour dry interruption may be bridged so a briefly intermittent shower band is not automatically split into multiple unrelated events.

After the entire forecast horizon has passed, ECCC hourly climate observations are converted into observed event objects using the same wet threshold. Predicted and observed events are matched only when they are temporally close enough; the matcher cannot force an unrelated event to count as a hit.

## Metrics

For each source and actual-event lead bucket (6–12h, 12–24h, 24–48h, 48–72h), SkyMap records:

- hits
- missed events
- false event windows
- probability of detection
- false alarm ratio
- Critical Success Index
- start-time mean absolute error
- signed start-time bias (early vs late)
- end-time mean absolute error
- signed end-time bias
- duration mean absolute error

The signed biases are especially important for future calibration. A source that repeatedly predicts Ontario rain two hours too early should not merely receive a lower generic model weight; SkyMap can eventually learn a bounded timing correction for the relevant place, horizon and weather regime.

## Scientific restraint

Event matching is intentionally conservative. Overlapping forecast horizons create correlated verification samples, so no accuracy claim will be made from a small number of snapshots. The timing archive is evidence for future calibration, not a license to move live rain windows until enough prospective cases have accumulated.
