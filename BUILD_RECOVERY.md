# SkyMap Ontario 13 build recovery

SkyMap 13 has one canonical release workflow: **Validate, build and deploy SkyMap Ontario 13** from `.github/workflows/deploy-v13.yml`.

## Release architecture

The release is assembled from three verified layers:

1. **SkyMap 10 native base** — Android shell, WebView asset loader, WorkManager, SQLite forecast memory and native bridge.
2. **SkyMap 13 overlay** — native GeoMet relay, viewport radar images, forecast-run handling, refined layout, meaningful moments and seven-day forecast.
3. **Product-site foundation** — the public landing site, aligned to the same version and APK during CI.

## Verified SkyMap 13 overlay

- directory: `.build/skymap13/`
- files: `chunk-00` through `chunk-05`
- count: `6`
- combined Base64 size: `37164`
- Base64 SHA-256: `7b58b3275123c37b1b33a401a97b373a8ba58dc10bb069e8cc9b97d05e825156`
- decoded archive SHA-256: `59eba3742bd2d52bf4cdec2ec9434f6edcf9106d6337b11da20d974677d37625`

Never change a size or expected hash merely to turn a failed build green. A mismatch means the verified source changed or an encoded chunk was damaged.

## First response to a failed run

1. Open **Actions**.
2. Open the newest **Validate, build and deploy SkyMap Ontario 13** run.
3. Open the `build` job.
4. Find the first red step; later skipped steps are usually consequences.
5. Fix only that stage and rerun.
6. Ignore a cancelled run when a newer commit superseded it.

## Failure guide

### `Reconstruct verified native base`

One of the imported `.build/skymap10/part-*` files is missing or altered. Restore the exact verified bundle from `skymap-8-predictive-map`. Do not remove WorkManager, SQLite or the native bridge to bypass the check.

### `Apply verified SkyMap 13 overlay`

Check the six chunk names, total size and hashes above. Compare individual chunk fingerprints and replace only the damaged chunk. Do not relax the integrity check.

### `Prepare and validate SkyMap 13`

This stage runs source validation and real feed verification.

- JavaScript failure: repair the named v13 source, regenerate the archive and all six chunks.
- Missing UI marker: confirm the radar status, `WHAT MATTERS NEXT` and seven-day list still exist once each.
- Native relay marker: confirm `GeoMetProxy.java` and the `geomet-proxy` interception remain connected.
- Live radar failure: inspect whether GetCapabilities, observed radar PNG or nowcast PNG failed. Retry once for a temporary ECCC/network interruption; do not claim the radar works when the real PNG test is red.
- Wrong image response: inspect the saved response type and WMS parameters rather than lowering the PNG signature, dimension or minimum-size checks.

### Android setup failure

Use **Re-run failed jobs** once. SDK and runner downloads can fail temporarily. Do not change app source for an infrastructure outage.

### `Build SkyMap Ontario 13 APK`

Read the first compiler or dependency error. Common causes are an invalid Java import, AndroidX mismatch, malformed resource or method-signature change. Confirm `android.useAndroidX=true` remains set.

### `Verify APK and packaged radar recovery`

The verification script extracts the APK before inspection to avoid false failures from `unzip | grep -q` pipe termination.

- `zipalign`: rebuild; never manually repack the APK.
- `apksigner`: inspect signing-key restoration.
- version mismatch: confirm `versionCode 130` and `versionName 13.0-radar-recovery`.
- missing native relay: confirm `GeoMetProxy` is compiled into a `classes*.dex` file.
- missing interface asset: confirm the v13 overlay was applied before Gradle ran.

### Pages preparation or upload

When APK verification passed but artifact or Pages upload failed, rerun the failed job once. Do not rewrite weather code for a temporary GitHub artifact failure.

### GitHub `409`, SHA mismatch or branch conflict

Fetch the file again and use its newest blob SHA. Never update the same path in parallel. Encoded chunks must be uploaded sequentially.

### Android installation conflict

SkyMap normally reuses the cached signing identity `skymap-ontario-debug-keystore-v1`. If the key was lost, uninstall the previous development build once, then install the new APK. Uninstalling removes the previous on-device forecast archive.

## Release-complete rule

A release is complete only after all of these pass:

- native-base integrity
- SkyMap 13 overlay integrity
- JavaScript and interface checks
- real ECCC observed-radar PNG test
- real ECCC nowcast PNG test
- Android compilation
- ZIP alignment and APK signature verification
- package version verification
- native GeoMet relay inspection
- packaged interface inspection
- APK artifact upload
- Pages deployment receipt updated to `13.0-radar-recovery`
