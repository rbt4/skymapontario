# Data attribution

SkyMap Future Lab combines public Canadian weather data from Environment and Climate Change Canada (ECCC) with model guidance retrieved through Open-Meteo. The interface is independent; Forecast IQ is SkyMap's own interpretation and calibration layer.

Forecast IQ 21 uses different evidence by forecast horizon instead of treating every model as an equal vote:

- **ECCC measured radar:** observed precipitation at the selected point.
- **ECCC radar extrapolation:** official short-range precipitation motion used as the primary calibration signal for approximately the next two hours.
- **ECCC city-page hourly forecast:** the nearest available official public forecast, including hourly likelihood of precipitation, used as an independent human-adjusted probability check.
- **ECCC REPS:** Canadian regional ensemble probability guidance used selectively through the first three forecast days to test whether a precipitation event is supported by an ensemble rather than a single deterministic run.
- **ECCC HRDPS:** high-resolution Canadian deterministic guidance displayed on the future map.
- **Open-Meteo Best Match:** location-specific high-resolution guidance and ensemble-derived precipitation probability used for exact-point calibration. Forecast IQ also samples four nearby points to detect possible spatial displacement without turning nearby rain into rain at the selected pinpoint.
- **Open-Meteo model-specific APIs:** GEM, ECMWF IFS, NOAA GFS, and ECMWF AIFS remain separate forecast families so disagreement is preserved rather than hidden.
- **ECMWF:** forecast data is used under its applicable open-data attribution requirements.
- **Basemap:** OpenStreetMap contributors and CARTO.

Forecast IQ may store bounded forecast-verification statistics locally in the browser so recent model performance can adjust influence by forecast lead time. These local scores are not official ECCC verification statistics and are not uploaded by SkyMap.

SkyMap Ontario is independent and is not affiliated with the Government of Canada, Government of Ontario, ECMWF, NOAA, Open-Meteo, Apple, Google, Microsoft, The Weather Network, or their weather products.
