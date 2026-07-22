# SkyMap Ontario

**Weather, moving toward you.**

SkyMap Ontario is a radar-first Ontario weather experience. It keeps observed radar and short-range radar extrapolation primary, surfaces meaningful weather snapshots, and always leaves the seven-day forecast visible.

## Current release

The single source of truth is [`version.json`](version.json). The website, web app, Android package metadata, download filenames, build artifact and deployment receipt are generated from that file.

- Website: `https://rbt4.github.io/skymapontario/`
- Web app: `https://rbt4.github.io/skymapontario/app/`
- Latest Android APK: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-latest.apk`
- Optional support: `https://ko-fi.com/rbt4dev`

## Product structure

- `index.html`, `assets/site.css`, `assets/site.js` — lean public product page
- `app/index.html`, `app/app.css`, `app/app.js` — canonical current weather experience
- `android/app/src/main/java/ca/skymapontario/app/` — native bridge, restricted GeoMet relay, local store and background refresh worker
- `version.json` — release identity used everywhere
- `.github/workflows/deploy-pages.yml` — one build, one APK, one Pages deployment

The website, app and Android bridge are all committed as readable source. The release workflow validates that source directly, builds one matching APK and deploys the same experience to Pages. It never rewrites its own workflow or reconstructs the product from encoded chunks.

## Core behaviour

- Radar and forecasts load independently; one slow source cannot freeze the whole app.
- Radar playback runs once and stops rather than looping endlessly.
- Every selected radar time explains whether it is observed or projected and reports the value beneath the map centre when available.
- Nearby official ECCC conditions and hourly guidance are combined with timezone-safe model guidance without presenting model agreement as a probability.
- The Android app tries a restricted native ECCC GeoMet relay first and the public direct route second.
- A failed refresh keeps the last successful weather image visible.
- Forecast cards render when the first dependable model responds and refine progressively as more guidance arrives.
- Ko-fi support remains optional and the map remains free.

## Build

```bash
./gradlew :android-app:assembleDebug
```

Output:

```text
android/app/build/outputs/apk/debug/android-app-debug.apk
```

Weather information can be delayed, preliminary or unavailable. SkyMap Ontario is independent and does not replace official warnings or emergency instructions.
