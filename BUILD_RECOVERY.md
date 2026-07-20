# SkyMap Android build recovery

SkyMap 10 has one canonical workflow: **Build SkyMap Ontario 10 Local Intelligence**.

The old SkyMap 8 workflow is manual-only and must not be used for normal releases.

## First response to any failed build

1. Open **Actions** in GitHub.
2. Open the latest **Build SkyMap Ontario 10 Local Intelligence** run.
3. Open `build-android`.
4. Find the **first red step**. Later failures are usually consequences of that first error.
5. Do not repeatedly push unrelated edits. Fix only the failed stage, then rerun or make one corrective commit.

## Failure guide

### `Reconstruct verified SkyMap 10 source` fails

The source chunks were changed, omitted, duplicated, or uploaded out of order.

Expected state:

- directory: `.build/skymap10/`
- files: `part-000` through `part-016`
- file count: `17`
- combined Base64 size: `29024` bytes
- combined Base64 SHA-256: `2897fe53fd25647b55adf7dceffb9f7118939aab37331bde9442e332cc46fa0f`
- decoded archive SHA-256: `fdaef2b84e05982338de4be4b45853ae1ab0a8f014c51e97b412f716745ee0cd`

Fix only the named or missing chunk. Do not edit the expected hashes merely to make the check pass. A hash mismatch means the source is no longer the verified source.

### `Validate local-intelligence experience` fails

The reconstructed source is intact, but a required feature or syntax check failed.

- For `node --check`, fix `app/v10.js` locally and regenerate the complete source archive and all chunks.
- For a missing `grep` marker, confirm whether the feature was accidentally removed or renamed.
- Never patch the compiled APK directly.
- Do not weaken a validation check unless the architecture deliberately changed and the replacement check is equally specific.

### Android SDK setup fails

This is usually a temporary GitHub-hosted runner or download problem.

- Use **Re-run failed jobs** once.
- If it fails again at the same package, inspect the exact SDK package name and runner network error.
- Do not change app code for an SDK download outage.

### Gradle dependency download fails

- Re-run the failed job once.
- Confirm `google()` and `mavenCentral()` remain in `settings.gradle`.
- Confirm the AndroidX dependency versions in `android/app/build.gradle` are valid.
- If GitHub or Maven is unavailable, wait and rerun; do not replace dependencies with random mirrors.

### Java compilation fails

Read the first compiler error, not the final Gradle summary.

Common causes:

- missing import
- Android API used below the configured minimum SDK
- method signature mismatch
- malformed Java introduced while editing through the GitHub API

Fix and compile again. Do not remove the local database, WorkManager, or WebView bridge merely to bypass compilation.

### APK verification fails

- `zipalign` failure: rebuild; do not manually repackage the APK.
- `apksigner` failure: check the keystore step and signing output.
- `aapt` version mismatch: confirm `versionCode 100` and `versionName 10.0-local-intelligence` in `android/app/build.gradle`.
- packaged asset check failure: the APK contains stale assets or the source extraction did not run.

### Signing or update conflict on the phone

SkyMap uses the cached development signing key `skymap-ontario-debug-keystore-v1`.

Do not delete that cache during ordinary troubleshooting. If the signing key is lost and a new key is generated, Android will not update an older installation signed by the previous key. The recovery is to uninstall the older SkyMap app once and install the newly signed APK fresh.

### Artifact upload fails after the APK built

The app may already be valid. Check whether `Prepare release` succeeded.

- Re-run the failed job.
- Do not rebuild source merely because `upload-artifact` had a temporary failure.
- Confirm the `release/` directory contains the APK and checksum.

### GitHub file update returns `409`, `sha does not match`, or branch conflict

- Fetch the file again.
- Use its newest blob SHA for the next update.
- Never write to the same branch path in parallel.
- Upload source chunks sequentially.
- If a push was partially applied, list the expected files before retrying.

### A workflow is cancelled

The v10 workflow uses `cancel-in-progress`. A newer commit intentionally cancels an older build.

Wait for the newest run. Do not troubleshoot the cancelled run unless the newest run also fails.

## Safe rollback

1. Keep the latest successful APK and checksum.
2. Identify the last successful workflow commit.
3. Revert only the failing commits or restore the verified source chunks and workflow from that commit.
4. Run the canonical v10 workflow again.
5. Never overwrite a known-good release artifact with an unverified APK.

## Release rule

A SkyMap release is complete only when all of these pass:

- source archive and hashes
- JavaScript syntax and feature checks
- Android compilation
- ZIP alignment
- APK signature verification
- package version verification
- packaged asset inspection
- artifact upload

A green commit status without the APK artifact is not a completed release.
