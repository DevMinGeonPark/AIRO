"""Check every new selectable-landmark route against the cached road evidence."""
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('outings',ROOT/'scripts/prepare-landing-outings.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
base=json.loads((ROOT/'public/maps/outing-scenarios.json').read_text())['cities']
choices=json.loads((ROOT/'public/maps/target-scenarios.json').read_text())['cities']
journeys=json.loads((ROOT/'src/lib/landing-routes.json').read_text())['cities']
assert set(base)==set(choices) and len(choices)==53
count=0;largest=0;largest_place=0
for city,alternate in choices.items():
    original=base[city]
    evidence=[original['route'],*[p['route'] for group in original['categories'].values() for p in group]]
    if journeys[city][0]['profile']=='pedestrian': evidence.append(journeys[city][0])
    else:
        pedestrian=json.loads((ROOT/f'assets/maps/dining/{city}-selectable-landmarks-pedestrian-route.json').read_text())
        evidence.append({'legs':[leg['shape'] for leg in pedestrian['trip']['legs']]})
    edges=set()
    for route in evidence:
        for shape in route['legs']:
            points=[tuple(p) for p in m.decode(shape)]
            edges.update((a,b) for a,b in zip(points,points[1:]));edges.update((b,a) for a,b in zip(points,points[1:]))
    assert alternate['destination'] != original['destination']
    assert alternate['origin'] == original['origin']
    routes=[(alternate['route'],[alternate['origin']['coordinate'],alternate['destination']['coordinate']])]
    for category,places in alternate['categories'].items():
        assert len(places)==3 and [p['id'] for p in places]==[p['id'] for p in original['categories'][category]]
        routes.extend((p['route'],[alternate['origin']['coordinate'],p['coordinate'],alternate['destination']['coordinate']]) for p in places)
    for route,stops in routes:
        assert len(route['legs'])==len(stops)-1 and route['durationSeconds']>0 and route['distanceKm']>0
        for index,shape in enumerate(route['legs']):
            points=[tuple(p) for p in m.decode(shape)]
            assert len(points)>=2 and all((a,b) in edges for a,b in zip(points,points[1:])),(city,'invented road edge')
            for point,stop in [(points[0],stops[index]),(points[-1],stops[index+1])]:
                snap=m.distance(point,stop);largest=max(largest,snap)
                limit=180 if len(stops)==3 and stop==stops[1] else 250
                assert snap<=limit,(city,snap,limit)
                if limit==180:largest_place=max(largest_place,snap)
        count+=1
report={'cities':len(choices),'targets':len(choices)*2,'newRoutes':count,'allEdgesVerified':True,'maxSnapMeters':round(largest,2),'maxPlaceSnapMeters':round(largest_place,2)}
(ROOT/'assets/maps/target-routes-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(report)
