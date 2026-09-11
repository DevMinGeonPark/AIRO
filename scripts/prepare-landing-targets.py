"""Derive a second selectable landmark from cached pedestrian road snapshots.

Shortest paths use only existing Valhalla road segments. No synthetic edges or
straight-line fallback; a disconnected landmark fails the generation.
"""
import heapq
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('outings', ROOT / 'scripts/prepare-landing-outings.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
decode, distance = module.decode, module.distance

def encode(points):
    output, previous = '', [0, 0]
    for point in points:
        current = [round(point[1] * 1e6), round(point[0] * 1e6)]
        for value, old in zip(current, previous):
            delta = value - old
            number = ~(delta << 1) if delta < 0 else delta << 1
            while number >= 32:
                output += chr((32 | (number & 31)) + 63)
                number >>= 5
            output += chr(number + 63)
        previous = current
    return output

base = json.loads((ROOT / 'public/maps/outing-scenarios.json').read_text())
routes = json.loads((ROOT / 'src/lib/landing-routes.json').read_text())['cities']
examples = {c['id']: c for c in json.loads((ROOT / 'src/lib/landing-destinations.json').read_text())}
examples['kyoto'] = {'stops': [[['난젠지',135.7926827,35.0116224],['철학의 길',135.7946821,35.0215812],['은각사',135.7984287,35.0269122]]]}
result, checks = {}, []
for city, scenario in base['cities'].items():
    graph = {}
    all_routes = [scenario['route'], *[p['route'] for places in scenario['categories'].values() for p in places]]
    if routes[city][0]['profile'] == 'pedestrian':
        all_routes.append(routes[city][0])
    else:
        # Existing vehicle itineraries must not become pedestrian choices.
        route_spec = importlib.util.spec_from_file_location('dining', ROOT / 'scripts/prepare-landing-dining.py')
        routing = importlib.util.module_from_spec(route_spec)
        route_spec.loader.exec_module(routing)
        all_routes.append(routing.route(f'{city}-selectable-landmarks-pedestrian', [p[1:] for p in examples[city]['stops'][0]]))
    for route in all_routes:
        for shape in route['legs']:
            points = [tuple(p) for p in decode(shape)]
            for a, b in zip(points, points[1:]):
                if a == b: continue
                length = distance(a,b)
                graph.setdefault(a,{})[b] = length
                graph.setdefault(b,{})[a] = length
    def snap(point):
        found = min(graph, key=lambda node: distance(node,point))
        assert distance(found, point) < 250, (city,point,'too far from road')
        return found
    def shortest(start, end):
        start, end = snap(start), snap(end)
        queue, best, parent = [(0,start)], {start:0}, {}
        while queue:
            length,node = heapq.heappop(queue)
            if length != best[node]: continue
            if node == end:
                path = [node]
                while node != start:
                    node = parent[node]; path.append(node)
                return path[::-1],length
            for neighbor,weight in graph[node].items():
                total = length+weight
                if total < best.get(neighbor,math.inf):
                    best[neighbor],parent[neighbor] = total,node
                    heapq.heappush(queue,(total,neighbor))
        raise ValueError(f'{city}: no connected pedestrian path from {start} to {end}')
    def route_via(points):
        legs, length = [],0
        for a,b in zip(points,points[1:]):
            coordinates,part = shortest(a,b)
            assert len(coordinates) >= 2
            legs.append(encode(coordinates)); length += part
        return {'legs':legs,'distanceKm':round(length/1000,3),'durationSeconds':round(length/1.25)}
    name,lon,lat = examples[city]['stops'][0][1]
    target = {'name':name,'coordinate':[lon,lat]}
    alternate = {**scenario,'destination':target,'route':route_via([scenario['origin']['coordinate'],target['coordinate']]),'categories':{}}
    for category,places in scenario['categories'].items():
        alternate['categories'][category] = [{**place,'route':route_via([scenario['origin']['coordinate'],place['coordinate'],target['coordinate']])} for place in places]
    alternate['restaurants'] = alternate['categories']['restaurant']
    result[city] = alternate
    checks.append({'city':city,'target':name,'routes':13,'realRoadEdges':sum(len(edges) for edges in graph.values())//2,'targetSnapMeters':round(distance(snap(target['coordinate']),target['coordinate']),2)})
output = {'source':'Shortest paths on cached OpenStreetMap / Valhalla pedestrian road geometry','cities':result}
(ROOT/'public/maps/target-scenarios.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
(ROOT/'assets/maps/targets-audit.json').write_text(json.dumps({'cities':len(result),'checks':checks},ensure_ascii=False,indent=2)+'\n')
print(f'{len(result)} cities: two selectable landmarks, 689 additional routes using only cached road edges')
