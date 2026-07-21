# SkyMap Ontario 12

**Weather, moving toward you.**

SkyMap Ontario is a radar-first weather experience for Ontario. It connects recent observed radar, short-range radar extrapolation, Canadian high-resolution guidance, meaningful weather snapshots and a visible multi-day outlook in one moving timeline.

## Open SkyMap

- Product website: `https://rbt4.github.io/skymapontario/`
- Full-screen web app: `https://rbt4.github.io/skymapontario/app/`
- Android APK: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-v12.0-Radar-Forecast.apk`
- APK checksum: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-v12.0-Radar-Forecast.apk.sha256`
- Optional support: `https://ko-fi.com/rbt4dev`

## What makes it different

- **Radar is the opening experience.** Recent observed frames flow into the immediate nowcast instead of being buried as a secondary layer.
- **The visual language changes with forecast distance.** Radar detail stays sharp near the present; model fields become smoother; longer-range guidance becomes scenarios and probability.
- **Snapshots focus on meaningful changes.** Rain onset, peak, clearing, freezing transitions, strongest wind and useful dry windows are surfaced before repetitive hourly icons.
- **The seven-day forecast remains visible.** Event snapshots add context without replacing the dependable daily outlook.
- **The Android app remembers locally.** Forecasts and later observations can be stored privately on the phone to support local model scoring and forecast-change comparisons.
- **Source hierarchy is explicit.** ECCC observations and Canadian guidance lead the near term, while global and ensemble models add longer-range diversity.

## Source hierarchy

| Horizon | Primary role |
|---|---|
| Now | ECCC radar and observations |
| 0–2 hours | Radar extrapolation / immediate nowcast |
| 2–48 hours | HRDPS and Canadian high-resolution guidance |
| 3–10 days | GDPS, ECMWF and ensemble blending |
| 10+ days | Ensemble scenarios and broad patterns only |

SkyMap is independent and is not affiliated with or endorsed by the Government of Ontario or the Government of Canada.

## Build and deployment

The `main` branch owns the public website and GitHub Pages deployment. Its workflow imports the verified SkyMap 10 native bundle and SkyMap 12 visual/forecast overlay from the `skymap-8-predictive-map` branch, validates both, builds the APK and publishes the website, web app, APK and checksum together.

The Android APK can also be built locally after reconstructing the verified source bundles:

```bash
./gradlew :android-app:assembleDebug
```

The APK is produced at:

```text
android/app/build/outputs/apk/debug/android-app-debug.apk
```

## Project structure

- `index.html` and `assets/` — public product website
- `app/` — reconstructed SkyMap 12 web app during CI
- `android/` — native Android shell and local intelligence engine
- `.build/skymap10/` — verified native/source bundle
- `.build/skymap12/` — verified radar-and-forecast overlay
- `.github/workflows/deploy-pages.yml` — aligned website, web app and APK deployment
- `BUILD_RECOVERY.md` — build failure and rollback instructions

## Data and safety

Weather data may be delayed, preliminary or unavailable. SkyMap does not replace official alerts, emergency instructions or professional meteorological guidance. During severe weather, follow official government and emergency-management sources.
