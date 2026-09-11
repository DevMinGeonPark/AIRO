"""Add the routed OSM footways/minor roads missing from the sparse city basemap.
The geometry is the provider's real path, in the same projection as each SVG.
"""
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
routes = json.loads((ROOT / 'src/lib/landing-routes.json').read_text())
cities = {city['id']: city for city in json.loads((ROOT / 'src/lib/landing-destinations.json').read_text())}


def decode(shape):
    values, number, shift = [], 0, 0
    for char in shape:
        byte = ord(char) - 63
        number |= (byte & 31) << shift
        shift += 5
        if byte < 32:
            values.append(~(number >> 1) if number & 1 else number >> 1)
            number, shift = 0, 0
    lat, lng, result = 0, 0, []
    for i in range(0, len(values), 2):
        lat += values[i]; lng += values[i + 1]
        result.append([lng / 1e6, lat / 1e6])
    return result


for city, days in routes['cities'].items():
    if city == 'kyoto':
        west, north = 135.65, 35.065
        width, height = 7850, 5190
    else:
        points = [point for day in cities[city]['stops'] for point in day]
        west, east = min(p[1] for p in points), max(p[1] for p in points)
        south, north = min(p[2] for p in points), max(p[2] for p in points)
        pad_x, pad_y = max(.015, (east - west) * .25), max(.012, (north - south) * .25)
        west -= pad_x
        north += pad_y
        width = (east + pad_x - west) * 50000
        height = (math.log(math.tan(math.pi / 4 + north * math.pi / 360)) - math.log(math.tan(math.pi / 4 + (south - pad_y) * math.pi / 360))) * 180 / math.pi * 50000
    top = math.log(math.tan(math.pi / 4 + north * math.pi / 360))
    geometries = [decode(shape) for day in days for shape in day['legs']]
    paths, projected = [], []
    for geometry in geometries:
        points = [[(lng - west) * 50000, (top - math.log(math.tan(math.pi / 4 + lat * math.pi / 360))) * 180 / math.pi * 50000] for lng, lat in geometry]
        projected.extend(points)
        paths.append('M' + 'L'.join(f'{x:.2f},{y:.2f}' for x, y in points))
    # Keep the source projection, extending only the viewport for real detours.
    # JourneyMap positions this image at the same x/y in world coordinates.
    x = min(0, min(p[0] for p in projected) - 100) if city != 'kyoto' else 0
    y = min(0, min(p[1] for p in projected) - 100) if city != 'kyoto' else 0
    frame_w = max(width, max(p[0] for p in projected) + 100) - x if city != 'kyoto' else width
    frame_h = max(height, max(p[1] for p in projected) + 100) - y if city != 'kyoto' else height
    for theme, color in [('base', '#FFFFFF'), ('dark', '#343434')]:
        path = ROOT / f'public/maps/{city}-{theme}.svg'
        svg = re.sub(r'<g id="routed-streets".*?</g>', '', path.read_text())
        svg = re.sub(r'<svg[^>]*>', f'<svg xmlns="http://www.w3.org/2000/svg" width="{frame_w}" height="{frame_h}" viewBox="{x} {y} {frame_w} {frame_h}">', svg, count=1)
        layer = f'<g id="routed-streets" fill="none" stroke="{color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><desc>Road and footpath geometry: Valhalla / OpenStreetMap, {routes["receivedAt"][:10]}</desc><path d="{"".join(paths)}"/></g>'
        path.write_text(svg.replace('</svg>', layer + '</svg>'))
    path = ROOT / f'public/maps/{city}-detail.geojson'
    geo = json.loads(path.read_text())
    geo['features'] = [feature for feature in geo['features'] if feature['properties'].get('kind') != 'routed-street']
    geo['features'] += [{'type': 'Feature', 'properties': {'kind': 'routed-street', 'source': 'Valhalla / OpenStreetMap'}, 'geometry': {'type': 'LineString', 'coordinates': line}} for line in geometries]
    path.write_text(json.dumps(geo, separators=(',', ':')))
print('53 basemaps now include the real routed minor roads and footpaths.')
