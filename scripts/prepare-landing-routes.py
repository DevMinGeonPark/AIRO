"""Cache real OSM routes for the 159 landing examples, never at visitor runtime.

Uses FOSSGIS Valhalla with at least 1.2 seconds between requests (1 req/s limit).
Existing successful responses are reused; failures never create straight lines.
"""
import datetime
import json
import math
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'assets/maps/routes'
CACHE.mkdir(exist_ok=True)
ENDPOINT = 'https://valhalla1.openstreetmap.de/route'
# The zoo's pedestrian component is disconnected in the current OSM graph;
# the verified road approach remains routable, with its real entrance geometry.
PROFILE_OVERRIDES = {('ho-chi-minh', 2): 'auto'}
source = (ROOT / 'src/lib/landing-map.ts').read_text().split('const trips: JourneyInput[] = [', 1)[1].split('export function buildJourneys', 1)[0]
stops = [[name, float(lng), float(lat)] for name, lng, lat in re.findall(r'name: "([^"]+)", coordinate: \[([\d.]+), ([\d.]+)\]', source)]
assert len(stops) == 9
cities = [{'id': 'kyoto', 'stops': [stops[i:i+3] for i in range(0, 9, 3)]}, *json.loads((ROOT / 'src/lib/landing-destinations.json').read_text())]


def distance(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, [a[1], a[2], b[1], b[2]])
    return 6371 * 2 * math.asin(min(1, math.sqrt(math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lng2-lng1)/2)**2)))


result = {'source': 'Valhalla / OpenStreetMap contributors', 'endpoint': ENDPOINT, 'receivedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'precision': 6, 'cities': {}}
failures = []
for city in cities:
    days = []
    for day, locations in enumerate(city['stops']):
        costing = 'auto' if max(distance(a, b) for a, b in zip(locations, locations[1:])) > 5 else 'pedestrian'
        costing = PROFILE_OVERRIDES.get((city['id'], day), costing)
        request = {'locations': [{'lon': point[1], 'lat': point[2], 'type': 'break'} for point in locations], 'costing': costing, 'units': 'kilometers', 'directions_options': {'units': 'kilometers'}, 'id': f'airo-{city["id"]}-{day+1}'}
        cache = CACHE / f'{city["id"]}-day{day+1}.json'
        response = json.loads(cache.read_text()) if cache.exists() else None
        if response is None:
            for attempt in range(3):
                time.sleep(1.2 if attempt == 0 else 5 * attempt)
                try:
                    req = urllib.request.Request(ENDPOINT, data=json.dumps(request).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'AIRO-Route-Snapshot/1.0 (https://airo.dev-heptivision.com)'})
                    with urllib.request.urlopen(req, timeout=45) as stream:
                        response = json.load(stream)
                    assert len(response['trip']['legs']) == 2
                    cache.write_text(json.dumps(response, separators=(',', ':')))
                    break
                except Exception as error:
                    print(city['id'], day + 1, 'retry', attempt + 1, str(error), flush=True)
        if response is None or len(response.get('trip', {}).get('legs', [])) != 2:
            failures.append(f'{city["id"]}/{day+1}')
            continue
        trip = response['trip']
        assert all(isinstance(leg['shape'], str) and len(leg['shape']) > 8 for leg in trip['legs'])
        days.append({'legs': [leg['shape'] for leg in trip['legs']], 'profile': costing, 'distanceKm': trip['summary']['length'], 'durationSeconds': trip['summary']['time']})
    if len(days) == 3:
        result['cities'][city['id']] = days
        print(f'{len(result["cities"]):02d}/{len(cities)} {city["id"]}: 3 road-following routes cached', flush=True)
if failures:
    raise SystemExit('Missing route snapshots: ' + ', '.join(failures))
assert len(result['cities']) == 53
(ROOT / 'src/lib/landing-routes.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print('All 159 routed days exported to src/lib/landing-routes.json', flush=True)
