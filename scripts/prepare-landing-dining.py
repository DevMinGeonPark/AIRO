"""Record real restaurant choices and road routes for the landing conversation.

OSM POIs are read once; Valhalla requests are serialized at <= 1 request/second.
Successful source responses are cached. Never substitute straight-line routes.
"""
import concurrent.futures
import datetime
import json
import math
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'assets/maps/dining'
CACHE.mkdir(exist_ok=True)
source = (ROOT / 'src/lib/landing-map.ts').read_text().split('const trips: JourneyInput[] = [', 1)[1].split('export function buildJourneys', 1)[0]
stops = [[name, float(lng), float(lat)] for name, lng, lat in re.findall(r'name: "([^"]+)", coordinate: \[([\d.]+), ([\d.]+)\]', source)]
cities = [{'id': 'kyoto', 'name': '교토', 'stops': [stops[:3]]}, *json.loads((ROOT / 'src/lib/landing-destinations.json').read_text())]
cities.sort(key=lambda city: (city['id'] not in ['lima', 'kyoto'], city['id']))
HEADERS = {'User-Agent': 'AIRO-Landing-Demo/1.0 (https://airo.dev-heptivision.com)'}

def distance(a, b):
    return math.hypot((a[0] - b[0]) * math.cos(math.radians((a[1] + b[1]) / 2)), a[1] - b[1]) * 111000

def restaurants(city):
    origin, target = city['stops'][0][0], city['stops'][0][-1]
    cache = CACHE / f'{city["id"]}-pois.json'
    if cache.exists():
        data = json.loads(cache.read_text())
    else:
        west, east = min(origin[1], target[1]) - .007, max(origin[1], target[1]) + .007
        south, north = min(origin[2], target[2]) - .007, max(origin[2], target[2]) + .007
        query = f'[out:json][timeout:35];nwr[amenity=restaurant]({south},{west},{north},{east});out center tags;'
        for attempt in range(4):
            endpoint = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter'][attempt % 3]
            try:
                request = urllib.request.Request(endpoint, data=urllib.parse.urlencode({'data': query}).encode(), headers=HEADERS)
                with urllib.request.urlopen(request, timeout=45) as response:
                    data = json.load(response)
                assert data.get('elements') and not data.get('remark')
                cache.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
                break
            except Exception as error:
                print(f'{city["id"]}: POI retry {attempt+1}: {error}', flush=True)
                if attempt == 3:
                    raise
    items = []
    names = set()
    for element in data['elements']:
        tags = element.get('tags', {})
        name = tags.get('name:ko') or tags.get('name:en') or tags.get('name')
        point = element.get('center', element)
        if not name or name.lower() in names or 'lon' not in point:
            continue
        if re.search(r'mcdonald|burger king|kfc|subway|pizza hut|starbucks', name, re.I):
            continue
        names.add(name.lower())
        coordinate = [point['lon'], point['lat']]
        detour = distance(origin[1:], coordinate) + distance(coordinate, target[1:]) - distance(origin[1:], target[1:])
        if distance(origin[1:], coordinate) < 20 or distance(target[1:], coordinate) < 20:
            continue
        preferred = city['id'] == 'lima' and 'cordano' in name.lower()
        items.append({'id': f'{element["type"]}-{element["id"]}', 'name': '코르다노' if preferred else name,
            'originalName': name, 'coordinate': coordinate, 'cuisine': tags.get('cuisine', ''),
            'source': f'https://www.openstreetmap.org/{element["type"]}/{element["id"]}',
            'score': -1000 if preferred else detour})
    items.sort(key=lambda item: item['score'])
    assert len(items) >= 3, f'{city["id"]}: fewer than three named restaurants'
    # Prefer distinct locations, not duplicate venues mapped as a node and a way.
    chosen = []
    for item in items:
        if any(distance(item['coordinate'], previous['coordinate']) < 35 for previous in chosen):
            continue
        item.pop('score')
        chosen.append(item)
        if len(chosen) == 3:
            break
    assert len(chosen) == 3, city['id']
    return {'origin': {'name': origin[0], 'coordinate': origin[1:]}, 'destination': {'name': target[0], 'coordinate': target[1:]}, 'restaurants': chosen}

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
            request = urllib.request.Request('https://valhalla1.openstreetmap.de/route',
                data=json.dumps({'locations': [{'lon': p[0], 'lat': p[1], 'type': 'break'} for p in coordinates], 'costing': 'pedestrian', 'units': 'kilometers'}).encode(),
                headers={**HEADERS, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    data = json.load(response)
                assert len(data.get('trip', {}).get('legs', [])) == len(coordinates) - 1
                cache.write_text(json.dumps(data, separators=(',', ':')))
                break
            except Exception as error:
                print(f'{key}: route retry {attempt+1}: {error}', flush=True)
                if attempt == 3:
                    raise
    trip = data['trip']
    return {'legs': [leg['shape'] for leg in trip['legs']], 'distanceKm': trip['summary']['length'], 'durationSeconds': trip['summary']['time']}

if __name__ == '__main__':
    result = {'receivedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source': 'OpenStreetMap / Valhalla', 'cities': {}}
    # POI collection can overlap the single rate-limited road request queue.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {city['id']: pool.submit(restaurants, city) for city in cities}
        for index, city in enumerate(cities):
            scenario = jobs[city['id']].result()
            a, b = scenario['origin']['coordinate'], scenario['destination']['coordinate']
            scenario['route'] = route(f'{city["id"]}-direct', [a, b])
            for restaurant in scenario['restaurants']:
                restaurant['route'] = route(f'{city["id"]}-{restaurant["id"]}', [a, restaurant['coordinate'], b])
            result['cities'][city['id']] = scenario
            (ROOT / 'public/maps/dining-scenarios.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
            print(f'{index+1}/{len(cities)} {city["id"]}: three restaurants and four road routes ready', flush=True)
    assert len(result['cities']) == 53
