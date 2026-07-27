# Manual test checklist

- Load `/lab/` on desktop and mobile widths.
- Confirm the exact-point answer remains readable over the map.
- Confirm the timeline includes observed radar, radar nowcast, and HRDPS guidance when feeds are available.
- Drag and play the timeline; labels must change between Measured, Radar nowcast, and Model guidance.
- Use browser geolocation and confirm the point, map centre, model requests, and RainLine update.
- Search for Oakville and select it.
- Click the map to move the forecast point.
- Open the evidence drawer and verify partial-source failures are labelled rather than hidden.
- Reload the same point and verify forecast stability compares with the saved previous event.
- Test with one or more blocked data hosts; the interface must remain usable and state that sources are delayed.
- Confirm no screen describes seven-day point guidance as radar.
