# SkyMap Ontario 4.2

**Live rain, smoke, air quality, wildfire hotspots and weather alerts—one living Ontario map.**

SkyMap Ontario started as a simple Toronto radar idea and grew into an independent province-wide public-data app. The focus remains simple: let people quickly see what is happening around them and what is moving their way.

## Use SkyMap Ontario

- Product website: `https://rbt4.github.io/skymapontario/`
- Dedicated interactive demo: `https://rbt4.github.io/skymapontario/demo/`
- Direct full-screen browser app: `https://rbt4.github.io/skymapontario/app/`
- Android APK: `https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-v4.2.apk`
- Support: `https://ko-fi.com/rbt4dev`

The browser app is responsive and works on laptops, tablets and mobile browsers. No account is required.

## Map views

- Animated Environment Canada rain radar
- Modelled wildfire-smoke movement
- Ontario AQHI observations
- Recent NRCan wildfire hotspot detections
- Active Environment Canada weather alerts
- Sixteen Ontario city and regional presets

## 4.2 polish pass

- Rebuilt responsive landing page and embedded demo
- Rebuilt browser map controls for desktop and mobile
- Added real radar/smoke timeline handling from WMS capabilities
- Added robust loading, offline and feed-error states
- Removed fragile implicit DOM globals
- Improved keyboard, focus and reduced-motion support
- Added a restrained RBT4/Ko-fi support module without popups
- Updated PWA cache strategy and Android back-button handling

## Data and independence

SkyMap Ontario uses publicly available environmental data, including Environment and Climate Change Canada and Natural Resources Canada services. It is independent and is not affiliated with or endorsed by the Government of Ontario or the Government of Canada.

Satellite hotspots are thermal detections, not confirmed fire boundaries. Data can be delayed, preliminary or unavailable. Always follow official emergency instructions.

## Repository structure

- `index.html` — product website
- `assets/` — website styles, script and brand assets
- `demo/` — dedicated interactive browser demo
- `app/` — responsive progressive web app
- `android/` — reusable native Android WebView wrapper
- `privacy.html` — plain-language privacy information
- `.github/workflows/deploy-pages.yml` — Android build and GitHub Pages deployment

## Built by RBT4

The app is free. Ko-fi support helps cover maintenance, testing and future public-data layers without turning the product into an ad wall.
