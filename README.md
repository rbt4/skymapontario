# SkyMap Ontario

**Will rain reach your plans?**

SkyMap Ontario is one Ontario weather app built around one exact point. The map joins measured ECCC radar, the official radar extrapolation and HRDPS 2.5 km guidance in a single timeline. The forecast deck turns four independent forecast families into a seven-day RainLine through a governed evidence router. The visit check answers the practical question: choose a place and exact arrival and departure times, see whether rain reaches it, then share a large, readable PNG or GIF.

Version 40 merges what used to be two products, the 18.x app and the Future Lab (Forecast Lab 19–34), into one. The Lab's forecast engine is now the app. The old app's visit check, sharing, alerts, air quality, map layers and Android bridge are rebuilt on top of it.

## Current release

The single source of truth is [`version.json`](version.json). `scripts/prepare-release.mjs` copies it into the web app, service worker, in-app label, Android package metadata and user agents. The build artifact, download filenames and deployment receipt use the same file.

- Website: `https://rbt4.github.io/skymapontario/`
- Web app: `https://rbt4.github.io/skymapontario/app/` (visit check: `app/#visit`)
- Latest Android APK: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-latest.apk`
- APK checksum: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-latest.apk.sha256`
- Optional support: `https://ko-fi.com/rbt4dev`

Old `/app/lab/` links redirect to `/app/`.

## Product structure

| Path | Role |
|---|---|
| `index.html`, `assets/` | Lean public landing page with a live radar map |
| `app/index.html`, `app/app.css` | The app shell |
| `app/app.js` | Core: map, measured → nowcast → HRDPS timeline, layer modes, point blend, RainLine, evidence drawer, place search. Exposes a small read-only `window.SkyMap` API |
| `app/forecast-intelligence-25.js` | Forecast IQ: Open-Meteo best-match, ensembles and WeatherNext 2, null-guarded |
| `app/accuracy-engine.js` | Truth firewall, CaPA/ECCC verification, personal shadow calibration, sealed Forecast Court status |
| `app/evidence-router.js` | Governed single-pass evidence router; never mutates model rows |
| `app/visit.js` | Visit check, rain-area ring analysis, 1080 × 1350 PNG and GIF share |
| `app/conditions.js` | Environment Canada alerts and nearest AQHI observation |
| `app/native.js` | Android message-channel bridge (sharing, remembered location); inert on the web |
| `app/sw.js` | Network-first offline shell. Weather is never served from cache |
| `android/` | Native bridge, restricted GeoMet relay, local store, background refresh and APK updater |
| `scripts/`, `verification/` | Release validation, engine contracts and the scheduled Ontario verification pipelines |

Script load order matters. `native.js`, `conditions.js` and `visit.js` load before the engine and `app.js`, so they are listening when the core announces `skymap:ready`, `skymap:place` and `skymap:forecast`.

## Core behaviour

- **One pinpoint.** Search any Ontario place, use your location, or tap the map. Everything (timeline, RainLine, visit check, alerts, AQHI) follows that point.
- **One timeline, honest boundaries.** Measured radar, official extrapolation and HRDPS guidance are coloured and labelled separately. Guidance is never called radar.
- **Rain, Storms, Smoke, Air, Temp.** Rain and Storms (radar plus lightning density) play the timeline. Smoke, AQHI and temperature are single official images and say so. Every layer has an on-screen legend.
- **Seven-day RainLine.** GEM leads locally; IFS, GFS and AIFS are independent checks, not duplicate votes. Events show a first-possible time, main window, likely end, event and timing confidence, and whether the forecast shifted since the last visit.
- **Truth firewall.** Missing precipitation values are never turned into a dry forecast.
- **Evidence you can inspect.** The Trust drawer shows every source's state, personal verification progress and the sealed Forecast Court status. Shadow calibration never changes live weights without an explicit release.
- **Visit check.** Pick a day and an arrival and departure time up to 48 hours out. SkyMap samples the window every 30 minutes against radar, nowcast, HRDPS, REPS (≥1 mm and ≥5 mm per 3 h) and the blend. An eight-direction ring separates an organized band from an isolated cell. "Approaching" is used only when an earlier frame supports it. Model agreement is labelled as agreement, never as probability.
- **Sharing.** A 1080 × 1350 PNG designed to survive messaging-app compression, or a short GIF from the official frames. A failed GIF falls back to the PNG. Android shares through its origin-scoped message channel and restricted `FileProvider`. Browsers use Web Share or a download.
- **Alerts and air.** Active Environment Canada bulletins appear as a calm map banner and in full in their own dialog. Expired bulletins are dropped. The nearest AQHI station is reported as a number and a plain health sentence.
- **Fast first paint.** GEM and IFS load first, with adaptive hedging to GFS/AIFS. Map tiles and enrichment start after the first forecast paints.
- **Readable.** No type below 11px ships. The release validator fails the build if it returns.
- **Android.** Native GeoMet relay first, direct GeoMet second. Hardware back closes dialogs and drawers first. Background refresh follows the watched point. The app checks for a newer signed APK every 12 hours and verifies its SHA-256 before opening the installer.

Every change to `app/` runs `scripts/validate-release.mjs`, the visit-window tests and the four forecast-engine contract checks, and inspects the packaged APK. See [`BUILD_RECOVERY.md`](BUILD_RECOVERY.md).

The GIF exporter uses `gifenc` 1.0.3 under the MIT License. See [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md). Data sources and attribution are listed in [`app/ATTRIBUTION.md`](app/ATTRIBUTION.md).

## Android build

```bash
./gradlew :android-app:assembleRelease
```

Output:

```text
android/app/build/outputs/apk/release/android-app-release.apk
```

The release key is intentionally committed and publicly readable to provide zero-setup update continuity. It does not provide exclusive publisher authentication. See [`docs/RELEASE_SIGNING.md`](docs/RELEASE_SIGNING.md).

Weather information can be delayed, preliminary or unavailable. SkyMap Ontario is independent and does not replace official warnings or emergency instructions.
