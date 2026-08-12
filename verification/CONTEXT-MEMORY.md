# SkyMap Forecast Context Memory

Forecast Lab 24 adds a compact, physically motivated context archive alongside model-skill verification.

## Why

Weather is chaotic: small differences in atmospheric initial conditions can grow. But that does not mean every remote observation should be dumped into a predictor. SkyMap instead records large-scale modes and boundary conditions that are physically relevant to Ontario weather, then tests whether they improve out-of-sample forecast calibration.

## Context sources

The collector refreshes:

- NOAA/CPC daily Pacific-North American (PNA) index — large-scale North American circulation context
- NOAA/CPC daily North Atlantic Oscillation (NAO) index
- NOAA/CPC daily Arctic Oscillation (AO) index
- NOAA/CPC / PSL monthly Niño 3.4 SST anomaly — ENSO state
- NOAA/CPC historical Madden-Julian Oscillation (MJO) index — tropical convection / propagation context
- NOAA/GLERL GLSEA average surface water temperatures for Lakes Superior, Michigan, Huron, Ontario and Erie

The complete source histories are kept in a compact `verification-history/context.json` file on the generated `forecast-history-data` branch. The generated branch remains force-replaced, so adding context does not bloat `main`.

## How this is intended to be used

These variables are **conditioning features**, not deterministic forecast replacements. They are meant to answer questions such as:

- Does GEM or IFS historically perform better for Ontario precipitation during a strongly positive PNA regime?
- Does a warm Lake Ontario / cold-air setup change the miss rate for snow or lake-effect precipitation?
- Do specific MJO / ENSO states systematically change model bias or forecast spread at 48–72 hours?

Before any context-conditioned adjustment can affect users it must improve held-out forecasts versus Forecast IQ without increasing false alarms or degrading recent prospective verification.

## Guardrails

- Missing context remains missing; it is never coerced to zero.
- A context-source failure is recorded rather than silently replaced.
- Context features do not override exact-point radar/nowcast or active official guidance.
- Historical correlation alone is not treated as causation.
- Production weighting remains off until out-of-sample evidence passes the forecast-quality gate.
