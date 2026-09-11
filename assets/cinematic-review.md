# Cinematic landing review — 2026-09-08

The latest revision uses a centered headline and a single dimensional map/pin object as the opening composition. Scrolling unfolds the object into a full-viewport geographic explorer. A direct explore button offers the same canvas without requiring the scroll sequence.

Reference principle: Apple's AirPods Pro product page (https://www.apple.com/airpods-pro/), inspected for typography scale, single-object composition and progressive disclosure. No Apple artwork or branding is used.

## Acceptance criteria

- Original Korean marketing copy, link destinations, route and section order remain present.
- The opening composition has one map plane and one pin. Explorer controls are inert and absent from the accessibility tree until exploration opens.
- Desktop/tablet scroll unrotates and expands the map with transform/opacity, then advances the actual route and geographic camera. Closing reverses the scene and restores keyboard focus.
- The explorer reaches all viewport edges and groups controls into a header, inspector and dock.
- Mobile has an explicit opening action, no pinned scroll, and a collapsible conversation to retain map space.
- Existing pin selection, cross-city day flights, zoom, pan, route playback and geographic pin placement remain usable by pointer, touch and keyboard.
- Features retain their order and use large sticky visual chapters. Their controls scroll using Lenis. MCP nodes can be selected and report the chosen connection.
- Reduced motion and global pause preserve manual exploration. Server HTML displays the headline and primary CTA.
- No additional generated images, video, packages, external trip-data writes or new routes.
- Production build, responsive browser checks, zero browser errors, and mobile Lighthouse thresholds are verified against the final build.

Implementation and measurement details: `redesign-report.md`. Browser artifacts: `validation/cinematic/`, `validation/browser-checks.json`, `validation/map-checks.json`, `validation/fullscreen-checks.json`.
