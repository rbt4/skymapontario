# SkyMap Ontario build recovery

SkyMap uses one release workflow, one semantic version file and one stable public Android signing identity.

## First action after a red workflow

Open **Actions → Build and deploy SkyMap Ontario → the newest run → build**. Repair the first red step only. Later skipped steps are consequences.

## Failure map

| First red step | Meaning | Repair |
|---|---|---|
| Align and validate the readable release source | Version drift, public-key hash mismatch, mutable action tag, stale copy, duplicate IDs, syntax error or a required security/experience guarantee disappeared | Fix the directly committed source or `version.json`. Do not patch the APK. |
| Verify every live source used by the product | A radar, forecast, air-quality, lightning or alert contract did not return usable data | Re-run once. If it fails again, inspect the named source response before changing an endpoint or layer. |
| Verify public continuity signing key | The committed keystore bytes or certificate fingerprint changed | Stop and inspect the diff. Restoring the exact existing key preserves in-place updates; replacing it breaks them. |
| Build Android release APK | Java/Gradle/R8 compilation failed | Download `SkyMap-Gradle-Diagnostic` and read the first compiler or R8 error. |
| Verify release APK, signer and packaged experience | Version, public certificate fingerprint, non-debuggable state, alignment, updater, native relay or packaged app source mismatch | Fix the source or build step. Never unzip, edit and repack the APK manually. |
| Unreadable type returned to the app/site | A font size below 11px was reintroduced | Raise it. The floor is deliberate and enforced for both `app/app.css` and `assets/site.css`. |
| A named 14.2 guarantee is missing | The alert banner, legend, air-quality view, label pane, CSP or service worker was removed | Restore the element or function named in the error rather than deleting the assertion. |
| Upload public release artifact | The APK may already be valid | Re-run the failed job. Do not rebuild with another signing key. |
| Configure or deploy GitHub Pages | The APK artifact may already be valid | Re-run the failed deployment. Do not rewrite app code for a temporary Pages problem. |

## Public signing continuity

The repository intentionally contains `android/app/signing/skymap-public-release.jks`. This is a convenience identity, not a secret or exclusive publisher credential.

- Do not regenerate or replace it during routine cleanup.
- The workflow verifies both the keystore file SHA-256 and the APK certificate fingerprint.
- Anyone can copy the public key and sign a counterfeit APK. That is the accepted trade-off for zero-secret automated publishing.
- Android still requires the same certificate and a higher `versionCode` for an in-place update.

## Updater recovery

- If automatic checking fails, confirm `release.json`, `SkyMap-Ontario-latest.apk` and its `.sha256` file are available on GitHub Pages.
- If the download succeeds but installation does not open, enable **Install unknown apps** for SkyMap and reopen the app.
- The updater verifies the published SHA-256 before prompting Android's installer. It cannot silently install because Android requires user confirmation for a normal sideloaded app.

## Versioning

Use semantic versions in `version.json`:

- Visual or feature release: `14.2.0`
- Security or bug fix: `14.2.1`
- Major architecture change: `15.0.0`

`versionCode` must always increase. A release is not aligned unless the APK badging, site release file, artifact name and `version.json` all match.

## Safe rollback

Revert the merge commit that introduced the broken release, raise `versionCode`, push `main`, and let the same workflow rebuild and redeploy the previous source with the same committed signing key. Android will not install a lower `versionCode` over a newer app.
