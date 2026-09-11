"""Audit source authenticity, category coverage and actual road endpoints."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('outings', ROOT / 'scripts/prepare-landing-outings.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
data = json.loads((ROOT / 'public/maps/outing-scenarios.json').read_text())
assert set(data['cities']) == set(m.BASE['cities'])
report = {'cities': len(data['cities']), 'categories': ['restaurant', 'cafe', 'bar', 'dessert'], 'newPlaces': 0, 'newRouteLegs': 0, 'maxSnapDistanceMeters': 0, 'maxPlaceSnapDistanceMeters': 0, 'baselineAccessSnaps': [], 'perCity': {}}
for city_id, scenario in data['cities'].items():
    for key in ['origin', 'destination', 'route', 'restaurants']:
        assert scenario[key] == m.BASE['cities'][city_id][key], f'{city_id} changed legacy {key}'
    assert scenario['categories']['restaurant'] == scenario['restaurants']
    sources = {}
    for cache in sorted(m.CACHE.glob(f'{city_id}-pois-*.json')):
        for element in json.loads(cache.read_text()).get('elements', []):
            sources[f'{element["type"]}-{element["id"]}'] = element
    city_report = {}
    for category in ['cafe', 'bar', 'dessert']:
        places = scenario['categories'][category]
        assert len(places) == 3 and len({p['id'] for p in places}) == 3
        snaps = []
        for place in places:
            source = sources[place['id']]
            tags = source['tags']
            point = source.get('center', source)
            assert place['coordinate'] == [point['lon'], point['lat']]
            assert place['name'] in [tags.get('name'), tags.get('name:ko'), tags.get('name:en')]
            assert place['source'] == f'https://www.openstreetmap.org/{source["type"]}/{source["id"]}'
            assert (category == 'cafe' and tags.get('amenity') == 'cafe') or (category == 'bar' and tags.get('amenity') in ['bar', 'pub']) or (category == 'dessert' and (tags.get('amenity') == 'ice_cream' or tags.get('shop') in ['bakery', 'confectionery']))
            route = place['route']
            assert len(route['legs']) == 2 and route['distanceKm'] > 0 and route['durationSeconds'] > 0
            legs = [m.decode(shape) for shape in route['legs']]
            assert all(len(leg) >= 2 for leg in legs)
            for actual, expected, limit in [(legs[0][0], scenario['origin']['coordinate'], 250), (legs[0][-1], place['coordinate'], 180), (legs[1][0], place['coordinate'], 180), (legs[1][-1], scenario['destination']['coordinate'], 250)]:
                snap = m.distance(actual, expected)
                assert snap <= limit, f'{city_id} {place["name"]}: {snap}'
                if limit == 180:
                    report['maxPlaceSnapDistanceMeters'] = max(report['maxPlaceSnapDistanceMeters'], snap)
                elif snap > 180:
                    base_leg = m.decode(scenario['route']['legs'][0])
                    baseline = base_leg[0] if expected == scenario['origin']['coordinate'] else base_leg[-1]
                    assert m.distance(actual, baseline) < 5, f'{city_id}: access snap differs from original route'
                    record = {'city': city_id, 'endpoint': 'origin' if expected == scenario['origin']['coordinate'] else 'destination', 'snapDistanceMeters': round(snap, 3), 'matchesOriginalRoute': True}
                    if record not in report['baselineAccessSnaps']:
                        report['baselineAccessSnaps'].append(record)
                snaps.append(snap)
            assert m.distance(legs[0][-1], legs[1][0]) < 1
            report['newPlaces'] += 1
            report['newRouteLegs'] += 2
        report['maxSnapDistanceMeters'] = max(report['maxSnapDistanceMeters'], *snaps)
        city_report[category] = {'names': [p['name'] for p in places], 'maxSnapDistanceMeters': round(max(snaps), 2), 'maxRouteDistanceKm': max(p['route']['distanceKm'] for p in places)}
    report['perCity'][city_id] = city_report
path = ROOT / 'assets/maps/outings-audit.json'
path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'perCity'}, indent=2))
