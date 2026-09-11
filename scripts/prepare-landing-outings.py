"""Cache authentic OSM cafe/bar/dessert choices and pedestrian route snapshots.

Never changes the existing dining snapshots. Route requests use a single queue
with at least 1.25 seconds between requests. Reruns resume successful caches.
"""
import concurrent.futures
import datetime
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'assets/maps/outings'
CACHE.mkdir(parents=True, exist_ok=True)
BASE = json.loads((ROOT / 'public/maps/dining-scenarios.json').read_text())
HEADERS = {'User-Agent': 'AIRO-Landing-Demo/1.0 (https://airo.dev-heptivision.com)'}
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']

def distance(a, b):
    return math.hypot((a[0] - b[0]) * math.cos(math.radians((a[1] + b[1]) / 2)), a[1] - b[1]) * 111000

def decode(shape):
    points, index, lat, lon = [], 0, 0, 0
    while index < len(shape):
        values = []
        for _ in range(2):
            value = shift = 0
            while True:
                byte = ord(shape[index]) - 63
                index += 1
                value |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            values.append(~(value >> 1) if value & 1 else value >> 1)
        lat += values[0]
        lon += values[1]
        points.append([lon / 1e6, lat / 1e6])
    return points

def collect(city_id, scenario):
    a, b = scenario['origin']['coordinate'], scenario['destination']['coordinate']
    items = {key: {} for key in ['cafe', 'bar', 'dessert']}
    for margin in [.007, .025, .08, .18]:
        cache = CACHE / f'{city_id}-pois-{margin}.json'
        if cache.exists():
            data = json.loads(cache.read_text())
        else:
            bbox = f'{min(a[1],b[1])-margin},{min(a[0],b[0])-margin},{max(a[1],b[1])+margin},{max(a[0],b[0])+margin}'
            query = f'[out:json][timeout:35];(nwr[amenity~"^(cafe|bar|pub|ice_cream)$"]({bbox});nwr[shop~"^(bakery|confectionery)$"]({bbox}););out center tags;'
            for attempt in range(6):
                try:
                    req = urllib.request.Request(ENDPOINTS[attempt % len(ENDPOINTS)], data=urllib.parse.urlencode({'data': query}).encode(), headers=HEADERS)
                    with urllib.request.urlopen(req, timeout=45) as response:
                        data = json.load(response)
                    assert not data.get('remark'), data.get('remark')
                    cache.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
                    break
                except Exception as error:
                    print(f'{city_id} POI {margin} retry {attempt+1}: {error}', flush=True)
                    if attempt == 5:
                        raise
                    time.sleep(2)
        for element in data.get('elements', []):
            tags = element.get('tags', {})
            point = element.get('center', element)
            name = tags.get('name:ko') or tags.get('name:en') or tags.get('name')
            if not name or 'lon' not in point:
                continue
            amenity, shop = tags.get('amenity'), tags.get('shop')
            category = 'bar' if amenity in ['bar', 'pub'] else 'cafe' if amenity == 'cafe' else 'dessert'
            coordinate = [point['lon'], point['lat']]
            if min(distance(a, coordinate), distance(b, coordinate)) < 20:
                continue
            key = f'{element["type"]}-{element["id"]}'
            items[category][key] = {'id': key, 'name': name, 'originalName': tags.get('name') or name, 'coordinate': coordinate,
                'cuisine': tags.get('cuisine', ''), 'tags': {key: tags[key] for key in ['amenity', 'shop', 'cuisine', 'name', 'name:en', 'name:ko'] if key in tags}, 'category': category, 'subtype': amenity if category != 'dessert' or amenity == 'ice_cream' else shop,
                'source': f'https://www.openstreetmap.org/{element["type"]}/{element["id"]}',
                '_score': distance(a, coordinate) + distance(coordinate, b) - distance(a, b)}
        result = {}
        for category, candidates in items.items():
            chosen = []
            for item in sorted(candidates.values(), key=lambda place: place['_score']):
                if any(item['name'].casefold() == old['name'].casefold() or distance(item['coordinate'], old['coordinate']) < 35 for old in chosen):
                    continue
                chosen.append(item)
            result[category] = chosen
        if all(len(candidates) >= 6 for candidates in result.values()):
            print(f'{city_id}: POIs ready '+str({key:len(value) for key,value in result.items()}), flush=True)
            return result
    assert all(len(candidates) >= 3 for candidates in result.values()), f'{city_id}: insufficient named POIs { {key:len(value) for key,value in result.items()} }'
    print(f'{city_id}: wider POIs ready '+str({key:len(value) for key,value in result.items()}), flush=True)
    return result

last_request = 0

def route(key, coordinates):
    global last_request
    cache = CACHE / f'{key}-route.json'
    if cache.exists():
        data = json.loads(cache.read_text())
    else:
        for attempt in range(4):
            time.sleep(max(0, 1.25 - (time.monotonic() - last_request)))
            last_request = time.monotonic()
            req = urllib.request.Request('https://valhalla1.openstreetmap.de/route', data=json.dumps({'locations': [{'lon': p[0], 'lat': p[1], 'type': 'break'} for p in coordinates], 'costing': 'pedestrian', 'units': 'kilometers'}).encode(), headers={**HEADERS, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    data = json.load(response)
                assert len(data.get('trip', {}).get('legs', [])) == 2
                cache.write_text(json.dumps(data, separators=(',', ':')))
                break
            except Exception as error:
                print(f'{key}: route retry {attempt+1}: {error}', flush=True)
                if attempt == 3:
                    raise
    trip = data['trip']
    legs = [decode(leg['shape']) for leg in trip['legs']]
    for actual, requested, limit in [(legs[0][0], coordinates[0], 250), (legs[0][-1], coordinates[1], 180), (legs[1][0], coordinates[1], 180), (legs[1][-1], coordinates[2], 250)]:
        assert distance(actual, requested) <= limit, f'{key}: road misses location by {distance(actual, requested):.1f} m'
    return {'legs': [leg['shape'] for leg in trip['legs']], 'distanceKm': trip['summary']['length'], 'durationSeconds': trip['summary']['time']}

if __name__ == '__main__':
    output = ROOT / 'public/maps/outing-scenarios.json'
    result = {'receivedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source': 'OpenStreetMap / Valhalla', 'cities': {}}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {key: pool.submit(collect, key, scenario) for key, scenario in BASE['cities'].items()}
        for index, (city_id, original) in enumerate(BASE['cities'].items()):
            scenario = dict(original)
            scenario['categories'] = {'restaurant': original['restaurants']}
            candidates = jobs[city_id].result()
            for category, places in candidates.items():
                chosen = []
                for item in places:
                    place = {key: value for key, value in item.items() if not key.startswith('_')}
                    try:
                        place['route'] = route(f'{city_id}-{place["id"]}', [scenario['origin']['coordinate'], place['coordinate'], scenario['destination']['coordinate']])
                    except Exception as error:
                        print(f'{city_id} skip {place["name"]}: {error}', flush=True)
                        continue
                    chosen.append(place)
                    if len(chosen) == 3:
                        break
                assert len(chosen) == 3, f'{city_id} {category}: insufficient reachable places'
                scenario['categories'][category] = chosen
            result['cities'][city_id] = scenario
            output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
            print(f'COMPLETE {index+1}/{len(BASE["cities"])} {city_id}: four categories, twelve places', flush=True)
    assert len(result['cities']) == 53
