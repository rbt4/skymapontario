# SkyMap Android build recovery

SkyMap 12 has one canonical workflow: **Build SkyMap Ontario 12 Radar and Forecast**.

The legacy workflow is manual-only and must not be used for normal releases.

## Architecture

The APK is assembled from two independently verified layers:

1. **SkyMap 10 native base** — Android WebView asset loader, WorkManager, SQLite forecast memory, native bridge and local model scoring.
2. **SkyMap 12 radar and forecast overlay** — fixed radar/forecast layout, radar health feedback, observed-to-nowcast playback, important-change cards and seven-day forecast rail.

This keeps the working native intelligence engine separate from the replaceable visual experience.

## First response to a failed build

1. Open **Actions**.
2. Open the newest **Build SkyMap Ontario 12 Radar and Forecast** run.
3. Open `build-android`.
4. Find the first red step. Later skipped steps are normally consequences.
5. Fix only that stage. Do not make several unrelated commits.
6. Ignore a cancelled run when a newer commit has replaced it.

## Verified source bundles

### SkyMap 10 native base

- directory: `.build/skymap10/`
- files: `part-000` through `part-016`
- count: `17`
- combined Base64 size: `29024`
- Base64 SHA-256: `2897fe53fd25647b55adf7dceffb9f7118939aab37331bde9442e332cc46fa0f`
- decoded archive SHA-256: `fdaef2b84e05982338de4be4b45853ae1ab0a8f014c51e97b412f716745ee0cd`

### SkyMap 12 radar and forecast overlay

- directory: `.build/skymap12/`
- files: `chunk-00` through `chunk-03`
- count: `4`
- combined Base64 size: `26368`
- Base64 SHA-256: `75922199700c5d252a01fce4cc9bebe326bf80e6fda069f53c9a3ff1cd20d790`
- decoded archive SHA-256: `66e8caf57516aa3fc9113603c202e85c0efabd243b9a08fab3592a8dea660b99`

Never change an expected size or hash merely to make a check pass. A mismatch means the verified source changed.

## Public website alignment

The `main` branch owns the public GitHub Pages site. Its **Validate, build and deploy SkyMap Ontario 12** workflow imports these verified native and visual bundles, applies the separately verified product-site overlay, builds the APK, and publishes the landing page, web app, APK and checksum together.

When the website is changed:

- keep the product-site source in `.build/site12/` on `main`
- validate the landing page and the reconstructed v12 web app in the same workflow
- never restore a v4.x APK link or version label
- never deploy the website independently from the matching web app and APK
- treat a successful Pages deployment, not merely a successful commit, as completion

## Failure guide

### `Reconstruct verified SkyMap 10 native base`

A base chunk is missing, duplicated, renamed or altered. Restore only the incorrect chunk. Do not remove the native database, WorkManager or bridge to bypass the error.

### `Apply verified SkyMap 12 radar and forecast overlay`

Check that `chunk-00` through `chunk-03` all exist. Compare the total size and SHA-256 with the values above. Replace only the incorrect chunk and rerun.

### `Validate radar and multi-day forecast experience`

The archive is intact, but a source or feature check failed.

- `node --check`: repair the named JavaScript file, recreate the overlay archive and regenerate all four chunks.
- Missing radar marker: confirm `RADAR_COVERAGE_RRAI`, `tileerror` and the official GetCapabilities request remain in `v12-radar.js`.
- Missing forecast marker: confirm `buildDailyForecasts`, `7-DAY FORECAST` and the daily rail remain present.
- Layout marker failure: confirm the fixed radar/forecast grid remains in `v12.css`.
- Never patch the compiled APK or weaken a check just to obtain a green run.

### Android SDK setup

Use **Re-run failed jobs** once. This is usually a temporary GitHub runner or download problem. Do not change application code for an SDK outage.

### `Build APK through Gradle`

Download **SkyMap-v12-Gradle-Diagnostic**. Read the first compiler or dependency error, not only the final Gradle summary. Fix the exact import, dependency, API or method-signature problem.

### `Verify Android package, radar and seven-day forecast`

- `zipalign`: rebuild; do not manually repackage the APK.
- `apksigner`: inspect the signing-key restoration step.
- version mismatch: confirm `versionCode 120` and `versionName 12.0-radar-forecast`.
- asset failure: the compiled APK contains stale assets or the v12 overlay was not applied before compilation.

### Artifact upload

When package verification succeeded but upload failed, rerun the failed job once. Do not rewrite the app for a temporary artifact-service failure.

### GitHub `409`, SHA mismatch or branch conflict

Fetch the file again and use its newest blob SHA. Never update the same path in parallel. Upload encoded chunks sequentially.

### Android installation conflict

SkyMap normally reuses the cached signing identity `skymap-ontario-debug-keystore-v1`. If that key was lost, uninstall the previously installed SkyMap once and install the new APK fresh. Uninstalling removes the previous app's local forecast archive.

## Release rule

A release is complete only after all of these pass:

- native-base hashes
- v12 overlay hashes
- JavaScript syntax and feature checks
- Android compilation
- ZIP alignment
- APK signature verification
- package version verification
- packaged radar and seven-day asset inspection
- artifact upload
- aligned GitHub Pages deployment
