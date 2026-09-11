"""Fetch and record OSM city snapshots, then compile matching SVG/GeoJSON assets.

Run manually when adding destinations. Browsers only request the committed assets.
Existing snapshots are reused; no generation service or map key is needed.
"""
import concurrent.futures
import html
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SCALE = 50000


def simplify(points, tolerance=3):
    if len(points) <= 2:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    distances = []
    for p in points[1:-1]:
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) if length else 0
        distances.append((p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2)
    if max(distances, default=0) <= tolerance * tolerance:
        return [a, b]
    i = distances.index(max(distances)) + 1
    return simplify(points[:i + 1], tolerance)[:-1] + simplify(points[i:], tolerance)


def prepare(city):
    coords = [stop[1:] for day in city['stops'] for stop in day]
    west, east = min(p[0] for p in coords), max(p[0] for p in coords)
    south, north = min(p[1] for p in coords), max(p[1] for p in coords)
    pad_x, pad_y = max(.015, (east - west) * .25), max(.012, (north - south) * .25)
    west, east, south, north = west - pad_x, east + pad_x, south - pad_y, north + pad_y
    top = math.log(math.tan(math.pi / 4 + north * math.pi / 360))

    def project(p):
        return [(p['lon'] - west) * SCALE, (top - math.log(math.tan(math.pi / 4 + p['lat'] * math.pi / 360))) * 180 / math.pi * SCALE]

    width, height = project({'lon': east, 'lat': south})
    bbox = f'{south},{west},{north},{east}'
    query = f'[out:json][timeout:60];(way[highway~"^(primary|secondary|tertiary|pedestrian)$"]({bbox});way[waterway=river]({bbox});way[natural=water]({bbox});way[leisure=park]({bbox}););out geom;'
    snapshot = ROOT / 'assets/maps' / f'{city["id"]}-osm.json'
    if not snapshot.exists():
        for attempt in range(4):
            endpoint = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'][attempt % 3]
            try:
                request = urllib.request.Request(endpoint, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'AIRO-Landing-Map-Builder/1.0'})
                with urllib.request.urlopen(request, timeout=80) as response:
                    source = json.load(response)
                if not source.get('elements') or source.get('remark'):
                    raise ValueError(source.get('remark', 'Empty OSM snapshot'))
                snapshot.write_text(json.dumps(source, separators=(',', ':')))
                break
            except Exception as error:
                print(city['id'], 'retry', attempt + 1, str(error), flush=True)
                if attempt == 3:
                    raise
                time.sleep(3)
    source = json.loads(snapshot.read_text())
    timestamps = [source['osm3s']['timestamp_osm_base']]
    # Preserve the initial snapshot while extending the surrounding map when
    # a routed road takes a substantial detour beyond the landmark extent.
    context = ROOT / 'assets/maps' / f'{city["id"]}-routing-context-osm.json'
    if context.exists():
        extra = json.loads(context.read_text())
        timestamps.append(extra['osm3s']['timestamp_osm_base'])
        ways = {(way['type'], way['id']): way for way in source['elements']}
        ways.update({(way['type'], way['id']): way for way in extra['elements']})
        source['elements'] = list(ways.values())
    layers = {k: [] for k in ['park', 'water', 'river', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'pedestrian']}
    features = []
    for way in source['elements']:
        tags = way.get('tags', {})
        kind = tags.get('highway') or ('river' if tags.get('waterway') == 'river' else 'water' if tags.get('natural') == 'water' else 'park')
        kind = kind.removesuffix('_link')
        points = simplify([project(p) for p in way.get('geometry', [])])
        if len(points) < 2 or kind not in layers:
            continue
        closed = kind in ['park', 'water']
        layers[kind].append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in points) + ('Z' if closed else ''))
        geo = [[round(west + x / SCALE, 7), round(math.degrees(2 * math.atan(math.exp(top - y / SCALE * math.pi / 180)) - math.pi / 2), 7)] for x, y in points]
        if closed and geo[0] != geo[-1]:
            geo.append(geo[0])
        features.append({'type': 'Feature', 'properties': {'kind': kind}, 'geometry': {'type': 'Polygon' if closed else 'LineString', 'coordinates': [geo] if closed else geo}})
    styles = {'park': 'fill="#DCE9DE"', 'water': 'fill="#CBDDE6"', 'river': 'fill="none" stroke="#CBDDE6" stroke-width="22"', 'primary': 'fill="none" stroke="#FFFFFF" stroke-width="7"', 'secondary': 'fill="none" stroke="#FFFFFF" stroke-width="5"', 'tertiary': 'fill="none" stroke="#FEFEFC" stroke-width="3"', 'pedestrian': 'fill="none" stroke="#FFFFFF" stroke-width="2"'}
    styles.update({kind: 'fill="none" stroke="#FFFFFF" stroke-width="7"' for kind in ['motorway', 'trunk']})
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><title>{html.escape(city["en"])} — OpenStreetMap contributors</title><desc>ODbL 1.0. Snapshots {", ".join(timestamps)}.</desc><rect width="100%" height="100%" fill="#EFF5F3"/>'
    for kind, paths in layers.items():
        svg += f'<path d="{"".join(paths)}" {styles[kind]} stroke-linejoin="round" stroke-linecap="round"/>'
    svg += '</svg>'
    output = ROOT / 'public/maps'
    (output / f'{city["id"]}-base.svg').write_text(svg)
    for before, after in {'#EFF5F3': '#0E0E0E', '#DCE9DE': '#171D19', '#CBDDE6': '#2C353C', '#FFFFFF': '#343434', '#FEFEFC': '#282828'}.items():
        svg = svg.replace(before, after)
    (output / f'{city["id"]}-dark.svg').write_text(svg)
    (output / f'{city["id"]}-detail.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')))
    print(f'{city["id"]}: {len(features)} features, {len(svg)} SVG bytes', flush=True)


if __name__ == '__main__':
    cities = json.loads((ROOT / 'src/lib/landing-destinations.json').read_text())
    # A slow city must not cancel the remaining cities' queued work.
    cities.sort(key=lambda city: city['id'] == 'dubai')
    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(prepare, city): city['id'] for city in cities}
        for job in concurrent.futures.as_completed(jobs):
            try:
                job.result()
            except Exception as error:
                failed.append(jobs[job])
                print(f'{jobs[job]}: incomplete — {error}', flush=True)
    if failed:
        raise SystemExit('Maps still needed: ' + ', '.join(failed))
