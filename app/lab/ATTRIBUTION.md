# Data attribution

SkyMap Future Lab displays Canadian public weather layers from Environment and Climate Change Canada GeoMet and point forecast guidance retrieved through Open-Meteo from GEM, ECMWF IFS, NOAA GFS, and ECMWF AIFS.

Forecast IQ also retrieves Open-Meteo's location-specific Best Match forecast as a calibration signal. The Best Match service automatically selects applicable high-resolution guidance for the requested point; precipitation probability is derived from ensemble weather models. This calibration is used to reduce weak false-positive precipitation signals and preserve credible precipitation events without presenting proprietary Google, Microsoft, or Weather Network data as a source.

- ECCC GeoMet and MSC Open Data: Government of Canada open weather data, including measured radar and official radar extrapolation.
- ECCC HRDPS: high-resolution Canadian deterministic guidance used by the Future Lab map and represented through Canadian forecast guidance.
- Open-Meteo: model-specific forecast APIs, Best Match forecast API, ensemble-derived precipitation probability, and geocoding service.
- ECMWF forecast data is used under its applicable open-data attribution requirements.
- Basemap: OpenStreetMap contributors and CARTO.

SkyMap Ontario is independent and is not affiliated with the Government of Canada, Government of Ontario, ECMWF, NOAA, Open-Meteo, Apple, Google, Microsoft, The Weather Network, or their weather products.
