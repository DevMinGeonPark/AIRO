#!/usr/bin/env python3
"""Derive valid Native GeoJSON from the existing OSM asset; never fabricate roads."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = root / 'public/maps/rome-detail.geojson'
target = root / 'android/app/src/main/assets/rome.geojson'
data = json.loads(source.read_text())
kept, omitted = [], 0
for feature in data['features']:
    geometry = feature['geometry']
    coordinates = geometry['coordinates']
    if geometry['type'] == 'Polygon':
        # WebGL tolerated collapsed rings produced by the original simplification.
        # Native rejects the entire source if a single ring is degenerate.
        rings = [ring for ring in coordinates if len(ring) >= 4 and ring[0] == ring[-1]
                 and len({tuple(point) for point in ring[:-1]}) >= 3]
        if not rings or rings[0] != coordinates[0]:
            omitted += 1
            continue
        geometry['coordinates'] = rings
    elif geometry['type'] == 'LineString':
        if len(coordinates) < 2:
            omitted += 1
            continue
    else:
        raise ValueError(f"Unexpected geometry: {geometry['type']}")
    kept.append(feature)
data['features'] = kept
target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'{len(kept)} valid features; omitted {omitted} collapsed polygons. All valid road coordinates preserved.')
