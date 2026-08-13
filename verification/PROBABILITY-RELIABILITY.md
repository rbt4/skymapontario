# Precipitation probability reliability

Forecast Lab 31 asks a different question from ordinary forecast verification: **when a source says 70%, does the event actually happen about 70% of the time?**

A source may have good hit/miss performance while still being systematically overconfident or underconfident. SkyMap therefore treats probability calibration as its own prospective evidence stream.

## Probability sources

Every six hours, the collector seals +6/+12/+24/+48/+72 hour probabilities across eight Ontario locations from four distinct probability families:

- Open-Meteo Best Match precipitation probability
- Google DeepMind WeatherNext 2 member wet fraction
- current SkyMap deterministic model-consensus wet fraction (GEM/IFS/GFS/AIFS weights)
- the nearest available ECCC official hourly likelihood of precipitation

Only explicit numeric probabilities are scored. A textual forecast condition is not silently converted into an invented probability.

## Verification

After the valid time passes, the forecast is scored against the same null-safe ECCC hourly observation method used by SkyMap's prospective verifier. Missing forecast or observation data is excluded rather than converted into dry weather.

For each source, lead and season the archive stores 10 probability bins and calculates:

- Brier score
- Expected Calibration Error (ECE)
- reliability component
- resolution component
- uncertainty
- forecast-bin mean probability
- observed event frequency
- sample count and wet-event count

## Shadow recalibration

The candidate mapping is deliberately conservative:

1. Each 10% bin receives a 20-equivalent-sample prior centred on the original probability. This shrinks small samples toward identity.
2. Pool Adjacent Violators (PAVA) creates a monotonic reliability mapping; a higher input probability cannot map below a lower input probability.
3. No bin is eligible for adjustment until it has at least 25 actual samples.
4. A source/lead requires at least 500 total cases and 50 wet outcomes before its calibration can even be reviewed.
5. A proposed correction is capped to ±15 percentage points from the original bin centre.
6. The generated candidate is permanently shadow-only (`approved:false`, `autoApplies:false`) until a separate prospective champion-versus-challenger test demonstrates improvement without harming event detection or timing.

## Why this matters

A user should be able to interpret SkyMap's probability language consistently. Reliability calibration is intended to improve probability honesty, not to make forecasts look more confident.
