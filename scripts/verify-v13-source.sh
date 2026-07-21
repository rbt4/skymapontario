#!/usr/bin/env bash
set -euo pipefail

node --check assets/site.js
node --check app/v13-core.js
node --check app/v13-radar.js
node --check app/v13-ui.js

grep -q 'SkyMap Ontario 13' app/index.html
grep -q 'WHAT MATTERS NEXT' app/index.html
grep -q '7-DAY FORECAST' app/index.html
grep -q 'class="daily-list"' app/index.html
grep -q 'geomet-proxy' app/v13-core.js
grep -q "layer: layerName" app/v13-radar.js
grep -q 'RADAR_COVERAGE_RRAI.INV' app/v13-radar.js
grep -q 'L.imageOverlay' app/v13-radar.js
grep -q 'DIM_REFERENCE_TIME' app/v13-radar.js
grep -q 'Keeping the last successful' app/v13-ui.js
grep -q 'buildDailyForecasts' app/v13-ui.js
! grep -q 'crossOrigin:true' app/v13-radar.js

grep -q 'class GeoMetProxy' android/app/src/main/java/ca/skymapontario/app/GeoMetProxy.java
grep -q 'geoMetProxy.fetch' android/app/src/main/java/ca/skymapontario/app/MainActivity.java
grep -q 'WebViewAssetLoader' android/app/src/main/java/ca/skymapontario/app/MainActivity.java

grep -q 'Two routes to the same official radar' index.html
grep -q 'SkyMap-Ontario-v13.0-Radar-Recovery.apk' index.html
! grep -q 'SkyMap-Ontario-v12.0-Radar-Forecast.apk' index.html

test -f app/vendor/leaflet.js
test -f app/vendor/leaflet.css
test "$(grep -c 'id="radar-status"' app/index.html)" = "1"
test "$(grep -c 'id="daily-rail"' app/index.html)" = "1"
