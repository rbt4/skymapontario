# SkyMap Ontario 13

**Weather, moving toward you — with radar that does not silently disappear.**

SkyMap Ontario is a radar-first weather experience for Ontario. It connects recent observed radar, short-range radar extrapolation, Canadian high-resolution guidance, meaningful weather moments and a visible seven-day forecast in one continuous experience.

## Open SkyMap

- Product website: `https://rbt4.github.io/skymapontario/`
- Full-screen web app: `https://rbt4.github.io/skymapontario/app/`
- Android APK: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-v13.0-Radar-Recovery.apk`
- APK checksum: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-v13.0-Radar-Recovery.apk.sha256`
- Optional support: `https://ko-fi.com/rbt4dev`

## What makes version 13 different

- **Two Android radar routes.** The app tries a tightly restricted native GeoMet relay and then the official direct ECCC connection as a fallback.
- **One radar image per viewport.** SkyMap requests a complete, correctly timed WMS image rather than relying on dozens of fragile browser tiles.
- **Exact run metadata.** Forecast layers select both valid time and `DIM_REFERENCE_TIME` where the source provides them.
- **Last-good-image protection.** A refresh failure does not erase a radar image that already loaded successfully.
- **Explicit feed health.** Transport, update time, retry state and failure reason remain visible.
- **A refined layout.** Radar, the next meaningful weather changes and the seven-day forecast each have their own permanent space.
- **No fake long-range radar.** Detailed radar is used near the present; longer horizons become smoother guidance and probability.

## Forecast hierarchy

| Horizon | Primary role |
|---|---|
| Now | ECCC observed radar and observations |
| 0–2 hours | ECCC radar extrapolation / immediate nowcast |
| 2–48 hours | HRDPS and Canadian high-resolution guidance |
| 3–10 days | GDPS, ECMWF and ensemble blending |
| 10+ days | Ensemble scenarios and broad patterns only |

SkyMap is independent and is not affiliated with or endorsed by the Government of Ontario or the Government of Canada.

## Verification and deployment

The canonical workflow is `.github/workflows/deploy-v13.yml`. A release is blocked unless it can:

1. Reconstruct the verified native source and SkyMap 13 overlay.
2. Pass JavaScript and interface checks.
3. Retrieve and decode a real ECCC observed-radar PNG.
4. Retrieve and decode a real ECCC nowcast PNG.
5. Compile the Android application.
6. Verify APK alignment, signature, version, native relay and packaged interface.
7. Publish the website, web app, APK and checksum together.

The Android APK can also be built locally after reconstructing the verified source bundles:

```bash
./gradlew :android-app:assembleDebug
```

Output:

```text
android/app/build/outputs/apk/debug/android-app-debug.apk
```

## Project structure

- `index.html` and `assets/` — public product website
- `app/` — reconstructed SkyMap 13 web interface during CI
- `android/` — native Android shell, GeoMet relay and local intelligence engine
- `.build/skymap10/` — verified native/source bundle imported during CI
- `.build/skymap13/` — verified radar-recovery and refined-interface overlay
- `scripts/prepare-v13.py` — deterministic website/version preparation
- `scripts/verify-v13-*.sh` — source, live-radar and APK verification
- `.github/workflows/deploy-v13.yml` — canonical build and Pages deployment
- `BUILD_RECOVERY.md` — failure diagnosis and rollback instructions

## Data and safety

Weather data may be delayed, preliminary or unavailable. SkyMap does not replace official alerts, emergency instructions or professional meteorological guidance. During severe weather, follow official government and emergency-management sources.
