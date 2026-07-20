# SkyMap Android build recovery

SkyMap 11 has one canonical workflow: **Build SkyMap Ontario 11 Weather Theatre**.

The old SkyMap pipeline is manual-only and must not be used for normal releases.

## Architecture

The release is assembled in two independently verified layers:

1. **SkyMap 10 native base** — Android WebView asset loader, WorkManager, SQLite forecast memory, native bridge and local scoring engine.
2. **SkyMap 11 Weather Theatre overlay** — radar movie, automatic weather-aware camera, weather paths, arrival windows, event scenes and cinematic interface.

This separation allows the complete visual experience to be replaced or rolled back without weakening the native intelligence engine.

## First response to any failed build

1. Open **Actions** in GitHub.
2. Open the latest **Build SkyMap Ontario 11 Weather Theatre** run.
3. Open `build-android`.
4. Find the **first red step**. Later failures are normally consequences of that first error.
5. Fix only that stage. Do not repeatedly push unrelated edits.
6. A cancelled run usually means a newer commit replaced it; inspect the newest run instead.

## Source integrity

### SkyMap 10 native base

- directory: `.build/skymap10/`
- files: `part-000` through `part-016`
- file count: `17`
- combined Base64 size: `29024` bytes
- Base64 SHA-256: `2897fe53fd25647b55adf7dceffb9f7118939aab37331bde9442e332cc46fa0f`
- decoded archive SHA-256: `fdaef2b84e05982338de4be4b45853ae1ab0a8f014c51e97b412f716745ee0cd`

### SkyMap 11 Weather Theatre overlay

- directory: `.build/skymap11/`
- files: `part-000` through `part-012`
- file count: `13`
- combined Base64 size: `28408` bytes
- Base64 SHA-256: `90e44e7ca364a9cbffeba2cd9622767c9745a56503246121a1a0c660dba0ced2`
- decoded archive SHA-256: `004a43651d9354b183a721a7ca7bc72132ab48b941a754a3c5bef0a3e574f0ff`

Never change an expected size or hash merely to make a red check green. A mismatch means the source is no longer the verified bundle.

## Failure guide

### `Reconstruct verified SkyMap 10 native base` fails

A native-base chunk is missing, duplicated, altered or out of order.

- Check the file count and names first.
- Compare the named chunk with the known-good local source.
- Replace only the incorrect chunk.
- Do not remove WorkManager, SQLite, the bridge or the local model scoring to bypass the failure.

### `Apply verified SkyMap 11 Weather Theatre overlay` fails

The cinematic overlay is incomplete or altered.

The step prints each chunk size plus the combined size and SHA-256. Use those diagnostics.

- If the file count is not 13, restore the missing or incorrectly named part.
- If the total size is wrong, compare each part size with the original split bundle.
- If size is correct but SHA-256 differs, one or more characters changed. Compare each Git blob SHA or local SHA-256 until the bad part is identified.
- Replace only that part and rerun.
- Never weaken the integrity checks.

### `Validate radar-first Weather Theatre` fails

The archives are intact, but syntax or a required experience marker failed.

- `node --check`: repair the named JavaScript source locally, rebuild the overlay archive and regenerate all overlay chunks.
- Missing `grep` marker: confirm whether the feature was accidentally removed or deliberately renamed.
- Do not patch the compiled APK.
- Do not remove a validation rule unless the architecture changed and an equally specific replacement check is added.

### Android SDK setup fails

This is normally a temporary runner or download problem.

- Use **Re-run failed jobs** once.
- If the same SDK package fails again, inspect the exact download error.
- Do not change application code for an SDK outage.

### `Build APK through Gradle` fails

The workflow uploads **SkyMap-v11-Gradle-Diagnostic**.

- Download that diagnostic artifact.
- Read the first compiler or dependency error, not the final Gradle summary.
- Typical causes are a missing import, invalid dependency version, method-signature mismatch or malformed Java.
- Confirm `google()` and `mavenCentral()` remain configured.
- Fix the actual error; do not remove core native features as a shortcut.

### `Verify Android package and Weather Theatre` fails

- `zipalign`: rebuild; do not manually repackage the APK.
- `apksigner`: inspect the signing-key restoration and signing output.
- version mismatch: confirm `versionCode 110` and `versionName 11.0-weather-theatre` are applied by the workflow.
- asset marker failure: the APK contains stale assets or the overlay was not applied before compilation.

### Artifact upload fails after verification succeeded

The APK may already be valid.

- Confirm `Prepare release` succeeded.
- Re-run the failed job once.
- Do not rewrite source because `upload-artifact` had a temporary failure.

### GitHub file update returns `409`, `sha does not match`, or a branch conflict

- Fetch the file again.
- Use its newest blob SHA for the next update.
- Never update the same path in parallel.
- Upload encoded chunks sequentially.
- After a partial upload, list or fetch the expected parts before retrying.

### Android says the app cannot be installed

SkyMap uses the cached development signing key `skymap-ontario-debug-keystore-v1`.

Do not remove that cache during ordinary troubleshooting. If the key is lost and Android sees a different signature, uninstall the older SkyMap installation once and install the new APK fresh. Uninstalling also removes the existing on-device forecast history.

## Safe rollback

1. Keep the latest successful APK and checksum.
2. Identify the last successful workflow commit.
3. To roll back only the experience, restore the last known-good `.build/skymap11/` overlay and workflow checks while leaving the v10 native base untouched.
4. To roll back the native engine, restore the verified `.build/skymap10/` bundle as well.
5. Run the canonical workflow.
6. Never replace a known-good release artifact with an unverified APK.

## Release rule

A release is complete only after all of these succeed:

- native-base size and hashes
- Weather Theatre overlay size and hashes
- JavaScript syntax and feature checks
- Android compilation
- ZIP alignment
- APK signature verification
- package version verification
- packaged asset inspection
- artifact upload

A green status without the named APK artifact is not a completed release.
