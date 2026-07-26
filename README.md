# SkyMap Ontario

**Weather, moving toward you.**

SkyMap Ontario is a radar-first Ontario weather experience. It joins measured radar, official short-range radar extrapolation and high-resolution 48-hour guidance in one honest timeline, checks deterministic precipitation against the official REPS ensemble, turns the next two days into a connected local weather path, explains every selected time in plain language, surfaces active Environment Canada alerts without shouting, and keeps meaningful snapshots ahead of a clear seven-day forecast.

## Current release

The single source of truth is [`version.json`](version.json). The website, web app, Android package metadata, download filenames, build artifact and deployment receipt are generated from that file.

- Website: `https://rbt4.github.io/skymapontario/`
- Web app: `https://rbt4.github.io/skymapontario/app/`
- Latest Android APK: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-latest.apk`
- APK checksum: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-latest.apk.sha256`
- Optional support: `https://ko-fi.com/rbt4dev`

## Product structure

- `index.html`, `assets/site.css`, `assets/site.js` — lean public product page
- `app/index.html`, `app/app.css`, `app/app.js` — canonical current weather experience
- `app/sw.js` — offline app shell; weather itself is never served from cache
- `android/app/src/main/java/ca/skymapontario/app/` — native bridge, restricted GeoMet relay, local store, background refresh and APK updater
- `android/app/signing/skymap-public-release.jks` — deliberately public continuity signing key
- `version.json` — release identity used everywhere
- `.github/workflows/deploy-pages.yml` — one release APK and one Pages deployment

The website, app and Android bridge are all committed as readable source. The release workflow validates that source directly, builds one matching release APK and deploys the same experience to Pages. It never rewrites its own workflow or reconstructs the product from encoded chunks.

## Core behaviour

- Radar and forecasts load independently; one slow source cannot freeze the whole app.
- The rain timeline moves from measured ECCC radar to the official short-range nowcast and then to hourly 2.5 km HRDPS precipitation guidance through 48 hours.
- Source boundaries and confidence are always visible. HRDPS frames are called futurecast or model guidance, never observed radar.
- Futurecast frames query the official 20-member, 10 km REPS ensemble for the probability of at least 1 mm and 5 mm over a three-hour window. SkyMap reports those probabilities directly and labels cross-source alignment separately; alignment is never presented as probability.
- Android forecast memory makes small, bounded adjustments to the point-model blend after archived forecasts can be compared with nearby ECCC observations. The Canadian-first base weighting always remains dominant.
- Direct Now, 6h, 24h and 48h controls change both the timeline and the useful map framing without hiding the current location.
- A connected 48-hour weather path groups blended hourly guidance into tappable three-hour windows, identifies the first wet window, peak and easing time, and opens the matching HRDPS map hour. Model support is labelled separately and is never presented as probability.
- Rain, storms, smoke, AQHI and temperature are exposed in a direct map-view rail instead of being buried in a dropdown.
- Radar playback runs once and stops rather than looping endlessly.
- Every selected time explains whether it is measured, extrapolated or model guidance and reports the value beneath the map centre when available.
- The full-bleed dark map and warm forecast briefing are deliberately different surfaces: one is an instrument, the other is an explanation.
- Laptop users can focus the map with one control and restore the forecast briefing without losing state.
- Nearby official ECCC conditions and hourly guidance are combined with timezone-safe model guidance without presenting model agreement as a probability.
- Place search accepts any Ontario city or town through Open-Meteo geocoding; quick locations and device location remain direct alternatives.
- The Android app tries a restricted native ECCC GeoMet relay first and the public direct route second.
- A failed refresh keeps the last successful weather image visible.
- Transient GeoMet metadata failures are retried and recovered on a short bounded schedule instead of leaving the timeline disabled for the cache window.
- Forecast cards render when the first dependable model responds and refine progressively as more guidance arrives.
- Meaningful snapshots—now, tonight, tomorrow morning, tomorrow afternoon and the most useful weekly window—appear before the full daily table and open their corresponding map hour when available.
- Active alerts appear on the map as a calm banner and in full in their own sheet. Expired bulletins are filtered out.
- Air quality uses the official AQHI observation nearest the selected place, reported as a number and a plain-language health sentence.
- Place labels are drawn above the weather layer, so a heavy radar cell can never hide which town it is over.
- Every colour scale on the map has a legend visible in the interface at all times.
- No type below 11px ships. The release validator fails the build if it reappears.
- The Android app checks for a newer public APK every 12 hours, downloads it, verifies its SHA-256 and opens Android's installer when the app resumes.
- The visible app refreshes live observations and the current radar timeline automatically while it is open, without jumping a user away from a selected future horizon.
- The shell is network-first with a complete offline fallback, preventing an old cached interface from being mixed with a newer version receipt during an update.
- Ko-fi support remains optional and the map remains free.

## Android build

```bash
./gradlew :android-app:assembleRelease
```

Output:

```text
android/app/build/outputs/apk/release/android-app-release.apk
```

The release key is intentionally committed and publicly readable to provide zero-setup update continuity. It does not provide exclusive publisher authentication. See [`docs/RELEASE_SIGNING.md`](docs/RELEASE_SIGNING.md).

Weather information can be delayed, preliminary or unavailable. SkyMap Ontario is independent and does not replace official warnings or emergency instructions.
