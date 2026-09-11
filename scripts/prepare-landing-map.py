"""Compile the recorded OSM snapshot into a compact, self-hosted SVG base map."""
import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCALE = 50000
NORTH = math.log(math.tan(math.pi / 4 + math.radians(35.065) / 2))
def project(p):
    return [(p['lon'] - 135.65) * SCALE, (NORTH - math.log(math.tan(math.pi / 4 + math.radians(p['lat']) / 2))) * 180 / math.pi * SCALE]
def simplify(points, tolerance=2):
    if len(points) <= 2: return points
    a,b = points[0],points[-1]
    dx,dy = b[0]-a[0],b[1]-a[1]
    length = dx*dx+dy*dy
    def distance(p):
        t = max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) if length else 0
        return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
    distances = [distance(p) for p in points[1:-1]]
    largest = max(distances, default=0)
    if largest <= tolerance*tolerance: return [a,b]
    i=distances.index(largest)+1
    return simplify(points[:i+1],tolerance)[:-1]+simplify(points[i:],tolerance)
source=json.loads((ROOT/'assets/maps/kyoto-osm.json').read_text())
layers={k:[] for k in ['park','water','river','primary','secondary','tertiary','pedestrian']}
features=[]
for way in source['elements']:
    tags=way.get('tags',{})
    kind = tags.get('highway') or ('river' if tags.get('waterway') == 'river' else 'water' if tags.get('natural') == 'water' else 'park')
    coords=simplify([project(p) for p in way.get('geometry',[])])
    if len(coords)<2 or kind not in layers: continue
    closed=kind in ['water','park']
    path='M'+'L'.join(f'{x:.1f},{y:.1f}' for x,y in coords)+('Z' if closed else '')
    layers[kind].append(path)
    geographic=[[round(135.65+x/SCALE,7),round(math.degrees(2*math.atan(math.exp(NORTH-y/SCALE*math.pi/180))-math.pi/2),7)] for x,y in coords]
    if closed and geographic[0]!=geographic[-1]: geographic.append(geographic[0])
    features.append({'type':'Feature','properties':{'kind':kind},'geometry':{'type':'Polygon' if closed else 'LineString','coordinates':[geographic] if closed else geographic}})
styles={'park':'fill="#DCE9DE" stroke="none"','water':'fill="#CBDDE6" stroke="none"','river':'fill="none" stroke="#CBDDE6" stroke-width="22"','primary':'fill="none" stroke="#FFFFFF" stroke-width="7"','secondary':'fill="none" stroke="#FFFFFF" stroke-width="5"','tertiary':'fill="none" stroke="#FEFEFC" stroke-width="3"','pedestrian':'fill="none" stroke="#FFFFFF" stroke-width="2"'}
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="7850" height="5190" viewBox="0 0 7850 5190">','<title>Kyoto — OpenStreetMap contributors</title>','<desc>OpenStreetMap data, ODbL 1.0. Snapshot '+source['osm3s']['timestamp_osm_base']+'. Rendered for AIRO.</desc>', '<rect width="7850" height="5190" fill="#EFF5F3"/>']
for kind, paths in layers.items(): svg.append(f'<path class="map-{kind}" d="{"".join(paths)}" {styles[kind]} stroke-linejoin="round" stroke-linecap="round"/>')
svg.append('</svg>')
(ROOT/'public/maps').mkdir(exist_ok=True)
p=ROOT/'public/maps/kyoto-base.svg';p.write_text(''.join(svg))
print('OSM ways:',len(source['elements']),'SVG bytes:',p.stat().st_size)

# The same geography in Mapcn's neutral Dark Matter palette. No generation API.
dark = ''.join(svg)
for before, after in {'#EFF5F3':'#0E0E0E','#DCE9DE':'#171D19','#CBDDE6':'#2C353C','#FFFFFF':'#343434','#FEFEFC':'#282828'}.items():
    dark = dark.replace(before, after)
p = ROOT/'public/maps/kyoto-dark.svg'
p.write_text(dark)
print('Dark SVG bytes:', p.stat().st_size)

# The globe's final descent uses exactly the same simplified geometry.
p=ROOT/'public/maps/kyoto-detail.geojson'
p.write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')))
print('Arrival GeoJSON bytes:',p.stat().st_size)
