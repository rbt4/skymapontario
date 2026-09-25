# Data attribution

SkyMap Ontario combines public Canadian weather data from Environment and Climate Change Canada (ECCC) with model guidance retrieved through Open-Meteo. The interface is independent; Forecast IQ is SkyMap's own interpretation and calibration layer.

Forecast IQ uses different evidence by forecast horizon instead of treating every model as an equal vote:

- **ECCC measured radar:** observed precipitation at the selected point.
- **ECCC radar extrapolation:** official short-range precipitation motion used as the primary calibration signal for approximately the next two hours.
- **ECCC city-page hourly forecast:** the nearest available official public forecast, including hourly likelihood of precipitation, used as an independent probability check.
- **ECCC REPS:** Canadian regional ensemble probability guidance used selectively through the first three forecast days to test whether a precipitation event is supported by an ensemble rather than a single deterministic run.
- **ECCC HRDPS:** high-resolution Canadian deterministic guidance displayed on the future map.
- **Open-Meteo Best Match:** location-specific high-resolution guidance and ensemble-derived precipitation probability used for exact-point calibration. Forecast IQ also samples four nearby points to detect possible spatial displacement without turning nearby rain into rain at the selected pinpoint.
- **Open-Meteo model-specific APIs:** GEM, ECMWF IFS, NOAA GFS, and ECMWF AIFS remain separate forecast families so disagreement is preserved rather than hidden.
- **Google DeepMind WeatherNext 2 through Open-Meteo:** a global AI ensemble used in Forecast IQ 25 as a bounded independent precipitation-distribution cross-check. It does not replace ECCC radar, ECCC official guidance, or the Canadian ensembles, and it is prevented from dominating the near-term forecast.
- **Historical forecast verification:** archived fixed-lead forecasts are compared with ECCC hourly climate observations. Missing archive values remain missing; they are never interpreted as dry weather.
- **Large-scale context research:** NOAA/CPC PNA, NAO, AO, ENSO/Niño 3.4 and MJO histories, together with NOAA/GLERL Great Lakes water-temperature and ice-cover histories, are collected for shadow research into whether model skill changes under different atmospheric regimes. These context variables do not directly override the live forecast.
- **ECMWF:** forecast data is used under its applicable open-data attribution requirements.
- **Basemap:** Esri World Dark Gray Canvas (Esri, HERE, Garmin, OpenStreetMap contributors), with OpenStreetMap standard tiles as an automatic fallback. No API key is used.

Forecast IQ may store bounded forecast-verification statistics locally in the browser so recent model performance can adjust influence by forecast lead time. The repository also maintains bounded, machine-generated Ontario forecast research on a separate data branch. Regime-conditioned model weights remain shadow-only until they pass an out-of-sample champion-versus-challenger gate; historical correlation alone cannot activate them.

SkyMap Ontario is independent and is not affiliated with the Government of Canada, Government of Ontario, ECMWF, NOAA, Google DeepMind, Open-Meteo, Apple, Google, Microsoft, The Weather Network, or their weather products.

Additional official context in the app:

- **ECCC weather alerts** (`api.weather.gc.ca/collections/weather-alerts`): active warnings, watches and statements near the selected point, shown as published.
- **ECCC AQHI observations** (`aqhi-observations-realtime`): the nearest observed Air Quality Health Index station.
- **ECCC lightning density, RAQDPS wildfire smoke and HRDPS temperature:** optional map layers. They are single official images and are never presented as a radar loop.
- **GIF export:** `gifenc` 1.0.3 under the MIT License. See `docs/THIRD_PARTY_NOTICES.md`.
