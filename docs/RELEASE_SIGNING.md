# SkyMap Android public continuity signing

SkyMap 14.2.1 intentionally uses a stable Android signing keystore committed to this public repository. This removes secret setup and lets GitHub Actions publish an installable APK that keeps the same Android identity across releases.

## What this provides

- Every release APK is built in release mode, R8-minified and non-debuggable.
- The same certificate is used on pull requests, `main` and future releases.
- Android accepts a newer SkyMap APK as an in-place update when `versionCode` increases.
- The app checks the public release receipt every 12 hours, downloads a newer APK, verifies its published SHA-256, and opens Android's installer when the app resumes.
- GitHub Pages always exposes `SkyMap-Ontario-latest.apk` and its checksum after a successful `main` build.

## Explicit security trade-off

The file `android/app/signing/skymap-public-release.jks` contains the private signing key. Its password and alias are also present in `android/app/build.gradle`. Anyone who can read the repository can sign another APK that Android will recognize as SkyMap Ontario.

This means the key provides **update continuity, not publisher authenticity**. The application, WebView bridge, release-mode build, CSP and CI pinning remain hardened, but the signing identity cannot protect users from a malicious actor who obtains installation access to their device.

Do not describe this APK as cryptographically exclusive to RBT4. The repository-held key is a deliberate convenience decision.

## Update behaviour

A normal sideloaded Android application cannot silently install its own update. SkyMap performs the maximum practical automatic flow:

1. Check `release.json` automatically.
2. Download a newer APK automatically over HTTPS.
3. Verify the matching published SHA-256 before offering it.
4. Ask once for Android's **Install unknown apps** permission when needed.
5. Open the system package installer for the user's required confirmation.

After confirmation, Android replaces the existing app while preserving its data because the package name and signing certificate match.

## Irreversible warning

Every future public SkyMap APK must keep this exact committed keystore. Replacing it would force users to uninstall before installing the new signing identity. Deleting or rotating the key therefore breaks in-place updates even though the key is public.
