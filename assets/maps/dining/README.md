# Conversation demo data

The 53-city demo uses named restaurant POIs from OpenStreetMap and recorded pedestrian routes from Valhalla. `scripts/prepare-landing-dining.py` preserves source responses here and exports `public/maps/dining-scenarios.json`. Each city has an origin, a destination, three alternative restaurants, the direct route, and a route via each restaurant. Every restaurant includes its OSM object URL. Road requests are serialized below one request per second.

Lima prioritizes El Cordano; its Korean display name is 코르다노. The municipal tourism source also identifies the venue at Jr. Áncash 202: [Bar Cordano — Visita Lima](https://visitalima.pe/experiencia/bar-cordano/). Other labels and cuisine tags come from the recorded OSM objects. No ratings, prices, or opening status are inferred. Times describe pedestrian travel, excluding meals.

Attribution: [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright), [FOSSGIS Valhalla](https://valhalla1.openstreetmap.de/). The UI labels this as an example conversation. Selecting a candidate previews a choice; sending the follow-up message commits that choice within the demo and swaps in its recorded route. Actual account trips are separate.
