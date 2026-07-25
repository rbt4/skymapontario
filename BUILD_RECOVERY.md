# SkyMap Ontario build recovery

SkyMap uses one release workflow, one semantic version file and one production Android signing identity.

## First action after a red workflow

Open **Actions → Build and deploy SkyMap Ontario → the newest run → build**. Repair the first red step only. Later skipped steps are consequences.

## Failure map

| First red step | Meaning | Repair |
|---|---|---|
| Align and validate the readable release source | Version drift, mutable action tag, stale copy, duplicate IDs, syntax error or a required security/experience guarantee disappeared | Fix the directly committed source or `version.json`. Do not patch the APK. |
| Verify every live source used by the product | A radar, forecast, air-quality, lightning or alert contract did not return usable data | Re-run once. If it fails again, inspect the named source response before changing an endpoint or layer. |
| Prepare disposable pull-request signing key | The runner could not create the non-production CI key | Check Java/keytool setup. Never substitute the Android debug key. |
| Prepare production signing key | One of the five signing secrets is missing, the base64 keystore is corrupt, or the alias/password is wrong | Run `scripts/configure-release-signing.sh` from the trusted machine holding the keystore. Do not generate a replacement key after production distribution. |
| Build Android release APK | Java/Gradle/R8 compilation failed or signing configuration was unavailable | Download `SkyMap-Gradle-Diagnostic` and read the first compiler or R8 error. |
| Verify release APK, signer and packaged experience | Version, certificate fingerprint, non-debuggable state, alignment, native relay or packaged app source mismatch | Fix the source, signing secret or build step. Never unzip, edit and repack the APK manually. |
| Unreadable type returned to the app/site | A font size below 11px was reintroduced | Raise it. The floor is deliberate and enforced for both `app/app.css` and `assets/site.css`. |
| A named 14.2 guarantee is missing | The alert banner, legend, air-quality view, label pane, CSP or service worker was removed | Restore the element or function named in the error rather than deleting the assertion. |
| Upload production release artifact | The signed build may already be valid | Re-run the failed job. Do not rebuild with another signing key. |
| Configure or deploy GitHub Pages | The APK artifact may already be valid | Re-run the failed deployment. Do not rewrite app code for a temporary Pages problem. |

## Signing recovery

The release key is the Android update identity, not a replaceable CI credential. See `docs/RELEASE_SIGNING.md`.

- If a GitHub secret was deleted but the backed-up keystore remains, rerun `scripts/configure-release-signing.sh` only after moving the existing keystore out of the script's target path, or set the five secrets manually from that same key.
- If the certificate fingerprint check fails, stop. Compare the secret with the fingerprint of the backed-up keystore. Do not change the expected fingerprint merely to make CI green.
- If the keystore itself is lost after production distribution, there is no repository-side repair that preserves in-place Android updates.

## Versioning

Use semantic versions in `version.json`:

- Visual or feature release: `14.2.0`
- Security or bug fix: `14.2.1`
- Major architecture change: `15.0.0`

`versionCode` must always increase. A release is not aligned unless the APK badging, site release file, artifact name and `version.json` all match.

## Safe rollback

Revert the merge commit that introduced the broken release, push `main`, and let the same workflow rebuild and redeploy the previous source **with the same production signing key**. Do not restore an old APK without restoring its matching website and version file. Never roll back to a debug-signed APK after production signing begins.
