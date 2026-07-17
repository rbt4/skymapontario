# SkyMap Ontario 4.3

**Live Ontario rain, smoke, air quality, wildfire hotspots and weather alerts in one focused map.**

SkyMap Ontario is an independent, responsive public-data app for a quick province-wide check or a closer look at a specific community. It runs as a website, installable browser app and Android APK without requiring an account.

## Open SkyMap

- Product website: `https://rbt4.github.io/skymapontario/`
- Full-screen live map: `https://rbt4.github.io/skymapontario/app/`
- Dedicated interactive demo: `https://rbt4.github.io/skymapontario/demo/`
- Android APK: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-v4.3.apk`
- Optional support: `https://ko-fi.com/rbt4dev`

## Live views

- Timestamped Environment Canada rain radar
- Modelled wildfire-smoke forecast
- Observed AQHI station markers and nearest-station risk
- NRCan Ontario satellite hotspots from the last 24 hours
- Environment Canada weather-alert polygons and summaries
- Sixteen Ontario city and regional presets

## What changed in 4.3

- Replaced the broken CWFIS WMS host with the official NRCan WFS feature service
- Replaced the brittle AQHI image overlay with real observed station markers
- Corrected GeoMet timestamps to the second-precision format required by the WMS
- Added verified render states so failed map tiles can never be reported as ready
- Added mapped weather-alert areas and clearer source/data-limit language
- Rebuilt the browser app and landing page around one premium, responsive experience
- Bundled Leaflet locally so the browser app and Android shell do not depend on a map-engine CDN at startup
- Added live-feed integration checks for radar, smoke, AQHI, alerts and wildfire hotspots
- Added the Gradle 8.7 wrapper and an APK artifact on every CI build

## Build the Android APK

The repository includes the Gradle wrapper and all required Android project files.

```bash
./gradlew :android-app:assembleDebug
```

The APK is produced at `android/app/build/outputs/apk/debug/android-app-debug.apk`. GitHub Actions publishes the named `SkyMap-Ontario-v4.3.apk` artifact and copies it to the website download path after validation succeeds.

## Validate the public feeds

```bash
node scripts/check-live-feeds.mjs
```

The check verifies browser CORS access, advertised WMS timestamps, usable WMS images, AQHI observations, Ontario alert GeoJSON and the NRCan hotspot FeatureCollection.

## Repository structure

- `index.html` and `assets/` — product website
- `demo/` — dedicated interactive browser demo
- `app/` — responsive PWA and bundled map engine
- `android/` — reusable native Android WebView shell
- `gradle/`, `gradlew`, `gradlew.bat` — repeatable Gradle wrapper
- `scripts/check-live-feeds.mjs` — live integration checks
- `.github/workflows/deploy-pages.yml` — validation, Android build and Pages deployment

## Data and independence

SkyMap Ontario uses publicly available data from Environment and Climate Change Canada and Natural Resources Canada. It is independent and is not affiliated with or endorsed by the Government of Ontario or the Government of Canada.

Data can be delayed, preliminary or unavailable. Satellite hotspots are thermal detections, not confirmed fire boundaries. Always follow official emergency instructions.
