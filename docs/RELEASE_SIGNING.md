# SkyMap Android release signing

SkyMap production APKs are signed with one private release key. The workflow is intentionally fail-closed: pull requests use a disposable two-day CI key, while `main` and manually dispatched production builds stop before Gradle unless the real signing secrets exist.

## One-time setup

Run this from a trusted computer with Java, OpenSSL and an authenticated GitHub CLI:

```bash
./scripts/configure-release-signing.sh rbt4/skymapontario
```

The script creates a 4096-bit RSA JKS keystore locally, uploads the five required repository secrets without printing them, and displays the public certificate SHA-256 fingerprint:

- `SKYMAP_KEYSTORE_B64`
- `SKYMAP_KEYSTORE_PASSWORD`
- `SKYMAP_KEY_ALIAS`
- `SKYMAP_KEY_PASSWORD`
- `SKYMAP_SIGNING_CERT_SHA256`

The keystore is written under `.private/skymap-signing/`, which is ignored by Git. Back it up to at least two encrypted locations and store both passwords in a password manager. Do not commit it, attach it to an issue, put it in a release artifact, or send it through chat or email.

## Pre-merge production test

After the secrets exist, open **Actions → Build and deploy SkyMap Ontario → Run workflow**, select the security-release branch, and run it. A manual branch run builds and uploads the production-signed artifact but does not deploy Pages. Confirm all of these are green:

1. `Build Android release APK`
2. `Verify release APK, signer and packaged experience`
3. `Upload production release artifact`

The signer check normalizes and compares the APK certificate fingerprint against `SKYMAP_SIGNING_CERT_SHA256`. A different key fails the build before anything can be published.

## Release behaviour

- Pull request: release-mode, non-debuggable APK signed only with a disposable CI key; no APK or Pages artifact is published.
- Manual branch run: production-signed APK artifact; no Pages deployment.
- Push to `main`: production-signed APK artifact plus GitHub Pages deployment.
- Missing or incorrect secret: hard failure; there is no debug-key fallback.

## Irreversible warning

Android accepts updates only when the package name and signing identity match the installed app. Once the first production-signed APK is distributed, every later SkyMap APK must use this same keystore. If the keystore is lost, existing installations cannot be updated by a newly signed APK.

The previously published debug-signed APK cannot be upgraded in place to the new production key. Anyone who installed that old build must uninstall it once before installing the first production-signed release. After that one-time migration, normal in-place updates work.
