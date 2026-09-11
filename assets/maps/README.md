# Landing map provenance

## Actual road geometry — 2026-09-09

All **53 cities / 159 days** now use routed OpenStreetMap roads and footways, replacing the older illustrative connections described below. The route line, moving traveler and stop timing use the same 28,350 source vertices. Consecutive legs meet at exactly the same coordinate. Landmark pins retain their original POI positions; roads end at the accessible approach, which may be outside a building, park or summit. The largest approach offset in this snapshot is 752 m at Seongsan Ilchulbong on Jeju.

- Source: [FOSSGIS OSM services](https://www.openstreetmap.de/nutzen/dienste-osm-de/), using [Valhalla](https://valhalla.github.io/valhalla/) at `https://valhalla1.openstreetmap.de/route`. OSM data remains © OpenStreetMap contributors, ODbL 1.0.
- `assets/maps/routes/<city>-day<n>.json` preserves each response; `src/lib/landing-routes.json` contains the compact encoded polyline6 legs, profile, distance and duration. The landing serves these local snapshots and needs no visitor-time route request.
- `python3 scripts/prepare-landing-routes.py` prepares the routes and reuses completed responses. Requests are spaced by at least 1.2 seconds. Days with a leg longer than 5 km use driving; shorter days use walking. Ho Chi Minh City's third day uses the routable road approach because the zoo's walking component was disconnected in the source graph.
- Run `python3 scripts/prepare-route-streets.py` after rebuilding base maps to include the route's minor roads and footways in both SVG themes and descent GeoJSON. All layers share the map's Mercator projection.
- Basemap origins remain tied to the original landmark coordinates, independent of road snapping. SVG viewports extend to include detours. Vienna's wider road context is preserved separately in `assets/maps/vienna-routing-context-osm.json`, including its Overpass endpoint/query, and merged by the map preparation script without replacing the initial snapshot.
- `npm run test:roads` verifies all cached source shapes, joined legs, coordinate bounds and route count. Browser tests also compare the traveler's destination against the road endpoint to display precision.
- `node scripts/test-road-playback.mjs` samples the moving traveler against the rendered road line on mobile Kyoto, Paris and Vienna. All 159 routes are also compared point-by-point against the basemap's corresponding road geometry in `test:destinations`.
- Account travel maps resolve missing ground routes through the authenticated `/api/trips/:tripId/routes` endpoint. Only adjacent stops belonging to that account's trip can be routed. A process-wide queue, in-flight deduplication and 24-hour cache limit upstream requests. Loading/failure and retry are visible; failed road requests never produce a straight substitute. Existing imported road geometry is reused when its endpoints still match the stops.
- `scripts/test-road-api.mjs` checks authorization, account isolation, adjacent ground legs, real route geometry, cache reuse and mobile failure/retry using the dedicated `airo-route-validation-db` fixture and local PostgREST. It does not use the production database.

## Global atlas — 2026-09-08

The current landing has **53 cities, 159 days and 477 example places**, distributed across six inhabited continents. The source dataset is `src/lib/landing-destinations.json` plus the original Kyoto route. `src/lib/landing-regions.ts` defines the continent cameras.

The globe preserves its original black/charcoal surfaces with pistachio action accents. The SVG maps share the original neutral dark colors and camera projection. All city SVGs and descent GeoJSON are served locally. Snapshots retain each Overpass server’s source timestamp; the manual preparation script retries alternate public Overpass instances and preserves completed snapshots if another city fails. Live map data is not fetched in the visitor’s browser.

Run `npm run test:atlas` for globe geography, search, continent filters, label collisions and color contrast; `npm run test:destinations` checks every destination and all three days. The older revision notes below describe the initial implementation.

## Destination examples — 2026-09-08

The landing includes Kyoto plus Seoul, Busan, Jeju, Tokyo, Osaka, Taipei, Bangkok, Singapore, Paris, London, New York and Sydney: 13 cities, 39 days and 117 example places. These are sample itineraries; connecting lines indicate visit order, not walking or driving directions.

- `src/lib/landing-destinations.json` holds the additional destinations and approximate landmark coordinates. `src/lib/landing-destinations.ts` builds the shared preview data; `DestinationProvider` connects the globe, itinerary, conversations, feature maps, postcards and MCP preview.
- `assets/maps/<city>-osm.json` records each OpenStreetMap Overpass response, including its source timestamp. Data is licensed under [ODbL 1.0](https://www.openstreetmap.org/copyright).
- `public/maps/<city>-base.svg`, `<city>-dark.svg` and `<city>-detail.geojson` are simplified from that snapshot. The SVG and globe use the same city-specific Mercator origin and camera calculation from `src/lib/landing-map.ts`.
- Run `python3 scripts/prepare-destination-maps.py` to prepare additional cities. Existing snapshots are reused. This is a manual preparation step, never a browser/build-time Overpass dependency.
- Browser assets are self-hosted. Only the selected city's descent GeoJSON is requested during flight. No API key or paid generation service is used.
- `npm run test:destinations` checks all cities and all days, hemispheres, real browser coordinates, manual map controls, linked previews, animated arrivals, return/skip/pause, mobile sizes and WebGL fallback. `npm run test:landing` covers the original Kyoto scroll flow and other landing regressions. Set `LANDING_BASE_URL` to test another running server.

## Dark globe revision — 2026-09-08

The opening globe now uses the existing Mapcn component's MapLibre globe projection. Its neutral dark surfaces follow [shadcn theming](https://ui.shadcn.com/docs/theming); the street map's colors are based on Mapcn's [CARTO Dark Matter style](https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json). The globe camera lands at the same geographic center, scale and screen anchor as the SVG itinerary, using the shared `getLandingCamera` function.

- `public/maps/world-land.geojson`: vendored Natural Earth 1:110m countries, coordinates rounded to four decimals and unused properties removed. Retrieved 2026-09-08 from [Natural Earth's source repository](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson). Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/).
- `public/maps/kyoto-dark.svg`: dark version of the original OSM geometry.
- `public/maps/kyoto-detail.geojson`: the same simplified OSM geometry for the globe's descent. Requested only when the visitor selects Kyoto.
- Rebuild both SVG themes and the arrival GeoJSON with `python3 scripts/prepare-landing-map.py`.
- MapLibre's worker and shared module are copied from the installed package to `public/vendor/maplibre/<version>/` by `scripts/prepare-map-worker.mjs`, including the BSD license. Both `pnpm dev` and `pnpm build` prepare these files. No worker CDN, remote tile service, geolocation permission or API key is required for the landing.
- Geographic data/renderer changes use no AI image generations. Existing generated artwork remains at 7 images; Higgsfield remains at 0.

## Original paper map

The landing map is a local SVG rendering of OpenStreetMap ways: major streets, pedestrian streets, rivers, water and parks. The base is warm paper (#F4EFE6), with restrained roads, water (#D3E2E4) and parks (#E2E7D6); no decorative block grid is added. The client requests one local SVG; it uses no tile service, map API key or location permission.

- Source: https://www.openstreetmap.org/ — © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright
- Snapshot: `kyoto-osm.json`, 2026-09-08 04:02 UTC, retrieved through `https://overpass-api.de/api/interpreter`.
- Extent: south 34.98, west 135.65, north 35.065, east 135.807.
- Rebuild: `python3 scripts/prepare-landing-map.py` from the project root. This is deterministic and does not make network requests.
- Output: `public/maps/kyoto-base.svg` (210623 bytes).
- POI sources: `kyoto-places.json` and `arashiyama-places.json`. Stops use the recorded node, way center or relation center: Nanzenji way 352013907, Philosopher's Path relation 18344117, Ginkakuji way 105817561, Nishiki Market way 772134672, Pontocho node 4233370290, Kenninji way 760889100, Togetsukyo way 519319727, Tenryuji way 409723494, Bamboo Grove relation 17656638.
- Projection: local Web Mercator, 50,000 units per longitude degree, origin 135.65° E / 35.065° N. `src/lib/landing-map.ts` contains projection/inverse and source coordinates.

The lines connecting these stops are illustrative travel itineraries, not walking navigation or live routing. Tapping the map adds a temporary demonstration pin; it does not save a trip or send coordinates to an external service. An OpenStreetMap copyright link remains visible in each map instance. The broad eastern hill wash and neighborhood label layout are illustrative art direction, not additional measured topographic data.

No new AI image generations were used for this revision. Existing GPT Images 2 illustrations: 7; Higgsfield: 0.
