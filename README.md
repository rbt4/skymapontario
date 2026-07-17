# SkyMap Ontario

**Live rain, smoke, air quality, wildfire hotspots and weather alerts—one living Ontario map.**

SkyMap Ontario started as a simple Toronto radar idea and grew into an independent province-wide public-data app. The product stays focused on one thing: helping people quickly see what is happening around them and what is moving their way.

## Use SkyMap Ontario

- Product website: `https://rbt4.github.io/skymapontario/`
- Dedicated live demo: `https://rbt4.github.io/skymapontario/demo/`
- Direct browser app: `https://rbt4.github.io/skymapontario/app/`
- Android APK: [`download/SkyMap-Ontario-v4.1-WOW.apk`](download/SkyMap-Ontario-v4.1-WOW.apk)
- Support: `https://ko-fi.com/rbt4dev`

The browser version is responsive and intended for laptops, tablets and mobile browsers. No account or Android installation is required.

## Map views

- Animated rain radar and near-term forecast
- Modelled smoke movement
- Ontario AQHI observations and forecasts
- Recent NRCan wildfire hotspot detections
- Active Environment Canada alerts
- Ontario city and regional presets

## Data and independence

SkyMap Ontario uses publicly available environmental data, including Environment and Climate Change Canada and Natural Resources Canada services. It is an independent project and is not affiliated with or endorsed by the Government of Ontario or the Government of Canada.

Satellite hotspots are thermal detections, not confirmed fire boundaries. Data can be delayed, preliminary or unavailable. Always follow official emergency instructions.

## Repository structure

- `index.html` — product website
- `demo/` — easy-to-share live demo entry point
- `app/` — responsive progressive web app
- `android/` — reusable Android wrapper project
- `assets/` — brand assets
- `download/` — generated Android APK on the deployed Pages site
- `privacy.html` — plain-language privacy information
- `.github/workflows/deploy-pages.yml` — APK build and GitHub Pages deployment

## Built by RBT4

The app is free to use. Ko-fi support helps cover maintenance, testing and future public-data layers without turning the product into an ad wall.
