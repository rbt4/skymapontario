#!/usr/bin/env bash
set -euo pipefail

APK="${1:-android/app/build/outputs/apk/debug/android-app-debug.apk}"
test -s "$APK"

"$ANDROID_HOME/build-tools/35.0.0/zipalign" -c -P 16 -v 4 "$APK"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose --print-certs "$APK"
"$ANDROID_HOME/build-tools/35.0.0/aapt" dump badging "$APK" > /tmp/skymap-v13-badging.txt

grep -q "versionCode='130'" /tmp/skymap-v13-badging.txt
grep -q "versionName='13.0-radar-recovery'" /tmp/skymap-v13-badging.txt

rm -rf /tmp/skymap-v13-apk
mkdir -p /tmp/skymap-v13-apk
unzip -q "$APK" -d /tmp/skymap-v13-apk

grep -q 'WHAT MATTERS NEXT' /tmp/skymap-v13-apk/assets/index.html
grep -q '7-DAY FORECAST' /tmp/skymap-v13-apk/assets/index.html
grep -q 'L.imageOverlay' /tmp/skymap-v13-apk/assets/v13-radar.js
grep -q 'RADAR_COVERAGE_RRAI.INV' /tmp/skymap-v13-apk/assets/v13-radar.js
grep -q 'buildDailyForecasts' /tmp/skymap-v13-apk/assets/v13-ui.js

found_proxy=0
for dex in /tmp/skymap-v13-apk/classes*.dex; do
  if strings "$dex" | grep 'GeoMetProxy' >/dev/null; then
    found_proxy=1
    break
  fi
done
test "$found_proxy" = "1"

printf 'Verified %s\n' "$APK"
