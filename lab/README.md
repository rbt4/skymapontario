# SkyMap Future Lab

This is an isolated experimental surface for discovering the final SkyMap product. It does not replace `/app/`.

## Product hypothesis

A weather map should not stop at **now** or force the user to switch between unrelated radar and forecast screens. The Future Lab keeps one selected point at the centre of a continuous experience:

1. recent measured radar;
2. official radar extrapolation;
3. high-resolution Canadian model guidance;
4. a seven-day precipitation-event timeline assembled from independent forecast families.

The primary answer remains visible over the map: the next likely precipitation window at that exact point, event confidence, timing confidence, and whether the forecast has remained stable since the previous visit.

## Live sources

- Environment and Climate Change Canada 1 km radar
- ECCC radar precipitation-rate extrapolation
- ECCC HRDPS 2.5 km precipitation guidance
- Canadian GEM point guidance
- ECMWF IFS point guidance
- NOAA GFS point guidance
- ECMWF AIFS point guidance

The point models are retrieved through Open-Meteo's model-specific APIs. Canadian GEM receives the largest base weight for Ontario. The other model families are independent checks, not equal duplicate votes.

## Experimental intelligence

- precipitation events persist as named time windows rather than isolated rain icons;
- source-weighted wet support determines whether an event is declared;
- timing spread between model families controls the timing-confidence language;
- the previous local forecast is saved in the browser so SkyMap can say whether an event shifted earlier, later, remained stable, or faded;
- observed, extrapolated, and model-guidance frames are visually and verbally separated.

## Deliberate limitations

- This is not a trained SkyMap machine-learning model.
- The seven-day RainLine is point guidance, not synthetic high-resolution radar.
- Current source weighting is a transparent experimental baseline, not a validated accuracy claim.
- Apple WeatherKit is not called from the browser because it requires a protected server-side signing key and Apple attribution. A future backend adapter can add it once credentials and secure token issuance are available.
- Google Weather is not used because its current service terms restrict using the API to create a weather app or weather model whose primary purpose is weather information.
- Severe-weather decisions must still follow official alerts and instructions.

## Validation path

The next stage should archive each issued event window and compare it with later ECCC radar and precipitation analysis. Only measured verification should be allowed to change model weights or support public accuracy claims.
