# Spatial displacement verification

Forecast Lab 29 adds prospective spatial verification without weakening SkyMap's exact-point promise.

## Why exact-only scoring is incomplete

A forecast can put the correct precipitation system nearby but miss the selected pinpoint. That is still an exact-point error, yet it is a different failure mode from forecasting a storm that does not exist anywhere nearby. Treating both failures identically loses useful information about model displacement and representativeness.

## Forecast neighbourhood

For Toronto, Ottawa, London and Thunder Bay, SkyMap seals forecasts at five points:

- exact pinpoint
- 12 km north
- 12 km south
- 12 km east
- 12 km west

It collects the pattern at +6h, +12h, +24h and +48h from Best Match, GEM, ECMWF IFS, GFS, ECMWF AIFS and WeatherNext 2.

## Observed truth

Once a valid time has passed, the same five points are queried against ECCC's 1 km observed rain radar and 1 km observed snow radar. Radar times must be available within 15 minutes of the forecast valid time. A malformed/missing radar response is not converted into dry weather. A valid radar feature explicitly reporting no measurable return is recorded as a measured dry return.

## Separate scores

Exact-point scores remain authoritative. The neighbourhood is a diagnostic layer only.

SkyMap stores:

- exact hits, misses, false alarms and CSI
- neighbourhood hits, misses, false alarms and CSI
- exact Brier score where forecast probability is available
- neighbourhood Fractions Skill Score-style fraction comparison
- exact errors where the system existed within 12 km (`displacement`)
- exact errors where the entire local neighbourhood disagreed (`hard` miss/false alarm)
- precipitation-centroid east/west and north/south displacement bias
- average centroid displacement distance

A forecast that says rain at the pinpoint while radar observes it 12 km east is **not** turned into an exact hit. It stays an exact false alarm plus a separate displacement diagnostic.

## Timing and retention

Forecast neighbourhoods are sealed only at four issue cycles per day. The workflow runs hourly so a matured valid time can be compared with radar while that radar time is still available. The generated state lives on the force-replaced `forecast-spatial-data` branch.

## Future use

Once enough events exist, a persistent directional bias may be used as an uncertainty or bounded spatial-calibration feature. It will not be used to move rain onto a user's exact point without prospective evidence that doing so improves exact-point verification.
