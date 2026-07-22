# SkyMap Ontario build recovery

SkyMap now uses one release workflow and one semantic version file.

## First action after a red workflow

Open **Actions → Build and deploy SkyMap Ontario → the newest run → build**. Repair the first red step only. Later skipped steps are consequences.

## Failure map

| First red step | Meaning | Repair |
|---|---|---|
| Align and validate the readable release source | Version drift, stale copy, duplicate IDs, syntax error or a required experience disappeared | Fix the directly committed source or `version.json`. Do not patch the APK. |
| Verify every live source used by the product | A radar, forecast, air-quality, lightning or alert contract did not return usable data | Re-run once. If it fails again, inspect the named source response before changing an endpoint or layer. |
| Android SDK | Temporary runner or package download problem | Re-run failed jobs once. |
| Build Android APK | Java/Gradle compilation failed | Download `SkyMap-Gradle-Diagnostic` and read the first compiler error. |
| Verify APK | Version, signature, alignment, native relay or packaged app source mismatch | Fix the source/build step. Never unzip, edit and repack the APK manually. |
| Upload or Pages deployment | The build may already be valid | Re-run the failed job. Do not rewrite app code for a temporary upload problem. |

## Versioning

Use semantic versions in `version.json`:

- Visual or feature release: `14.1.0`
- Bug fix: `14.1.1`
- Major architecture change: `15.0.0`

`versionCode` must always increase. A release is not aligned unless the APK badging, site release file, artifact name and `version.json` all match.

## Safe rollback

Revert the merge commit that introduced the broken release, push `main`, and let the same workflow rebuild and redeploy the previous source. Do not restore an old APK without restoring its matching website and version file.
