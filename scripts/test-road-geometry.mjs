import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { decodePolyline } from '../src/lib/polyline.ts';

const snapshot = JSON.parse(await readFile('src/lib/landing-routes.json', 'utf8'));
assert.equal(snapshot.precision, 6);
assert.equal(Object.keys(snapshot.cities).length, 53);
let days = 0, vertices = 0;
for (const [city, routes] of Object.entries(snapshot.cities)) {
  assert.equal(routes.length, 3);
  for (const [day, route] of routes.entries()) {
    const source = JSON.parse(await readFile(`assets/maps/routes/${city}-day${day + 1}.json`, 'utf8')).trip;
    assert.deepEqual(route.legs, source.legs.map(leg => leg.shape), `${city}: preserve the provider's road geometry`);
    const legs = route.legs.map(decodePolyline);
    assert.equal(legs.length, 2);
    assert.deepEqual(legs[0].at(-1), legs[1][0], `${city}: no straight connector between road legs`);
    const points = legs.flat(), box = source.summary;
    assert.ok(points.length > 20, `${city}: detailed route geometry`);
    for (const [lng, lat] of points) {
      assert.ok(lng >= box.min_lon - .00001 && lng <= box.max_lon + .00001);
      assert.ok(lat >= box.min_lat - .00001 && lat <= box.max_lat + .00001);
    }
    assert.ok(route.distanceKm > 0 && route.durationSeconds > 0);
    days++; vertices += points.length;
  }
}
assert.equal(days, 159);
await mkdir('assets/validation/roads', { recursive: true });
await writeFile('assets/validation/roads/geometry-checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), cities: 53, days, vertices, sourceShapesPreserved: true, joinedLegs: true, sourceBounds: true }, null, 2));
console.log(`✓ ${days} days / ${vertices} road vertices: source geometry, joined legs and geographic bounds`);
