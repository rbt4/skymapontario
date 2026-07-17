# SkyMap Ontario 4.4

**Plain-English Ontario rain nowcasts, smoke forecasts, local weather, air quality, reported active fires and weather alerts in one focused map.**

SkyMap Ontario is an independent, responsive public-data app for a quick province-wide check or a closer look at a specific community. It runs as a website, installable browser app and Android APK without requiring an account.

## Open SkyMap

- Product website: `https://rbt4.github.io/skymapontario/`
- Full-screen live map: `https://rbt4.github.io/skymapontario/app/`
- Dedicated interactive demo: `https://rbt4.github.io/skymapontario/demo/`
- Android APK: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-v4.4.apk`
- Optional support: `https://ko-fi.com/rbt4dev`

## Live views

- Recent Environment Canada radar observations joined to a one-hour radar nowcast
- Exact rain and modelled wildfire-smoke values at the map centre
- Nearby official current conditions and hourly temperature, precipitation chance and wind
- Plain-English explanation cards for every selected radar or smoke time
- Observed AQHI station markers and nearest-station risk
- NRCan reported Ontario active fires with fire ID, size and stage of control
- Environment Canada weather-alert polygons and summaries
- Sixteen Ontario city and regional presets

## What changed in 4.4

- Added ECCC's short-range radar extrapolation as clearly labelled `NEXT` frames after observed `PAST` radar
- Added ECCC City Page Weather for nearby current conditions, 24-hour forecasts, precipitation chance and wind
- Added WMS point-value queries so each selected time reports the rain rate or modelled wildfire PM₂.₅ under the map centre
- Added a responsive local-picture card with plain-English context on desktop, mobile and Android
- Replaced rapid looping animation with slower crossfaded playback that runs once and stops on the final frame
- Kept observed AQHI beside modelled smoke so a forecast concentration is never presented as a health-risk observation
- Replaced anonymous thermal-hotspot noise with NRCan's current agency-reported active-fire service
- Extended live integration checks to radar nowcasts, point-value queries and local city forecasts

## Build the Android APK

The repository includes the Gradle wrapper and all required Android project files.

```bash
./gradlew :android-app:assembleDebug
```

The APK is produced at `android/app/build/outputs/apk/debug/android-app-debug.apk`. GitHub Actions publishes the named `SkyMap-Ontario-v4.4.apk` artifact and copies it to the website download path after validation succeeds.

## Validate the public feeds

```bash
node scripts/check-live-feeds.mjs
```

The check verifies browser CORS access, observed and next-hour radar timestamps, WMS point values, local city weather, usable WMS images, AQHI observations, Ontario alert GeoJSON and the NRCan active-fire FeatureCollection.

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

Data can be delayed, preliminary or unavailable. Reported fire points are not fire boundaries. Always follow official emergency instructions.
