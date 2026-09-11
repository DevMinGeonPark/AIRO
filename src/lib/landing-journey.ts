import { decodePolyline } from "./polyline";
import type { Coordinate } from "./landing-map";
import type { DiningScenario, DiningRestaurant, VisitCategory } from "./landing-dining";

export type JourneyStop = { category: VisitCategory; index: number };
export type JourneyPlan = { legs: Coordinate[][]; coordinates: Coordinate[]; stops: DiningRestaurant[]; distanceKm: number; durationSeconds: number };
type Network = { points: Coordinate[]; edges: Map<number, number>[]; snaps: Map<string, number>; paths: Map<string, Coordinate[]> };
const networks = new WeakMap<DiningScenario, Network>();
const key = (point: Coordinate) => point.join(",");
const radians = Math.PI / 180;
export const walkingDistance = (a: Coordinate, b: Coordinate) => {
  const x = Math.sin((b[1] - a[1]) * radians / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin((b[0] - a[0]) * radians / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const length = (points: Coordinate[]) => points.reduce((sum, point, i) => sum + (i ? walkingDistance(points[i - 1], point) : 0), 0);

function roadNetwork(scenario: DiningScenario) {
  const cached = networks.get(scenario);
  if (cached) return cached;
  const network: Network = { points: [], edges: [], snaps: new Map(), paths: new Map() };
  const indices = new Map<string, number>();
  const node = (point: Coordinate) => {
    const id = key(point), existing = indices.get(id);
    if (existing !== undefined) return existing;
    const index = network.points.length;
    indices.set(id, index); network.points.push(point); network.edges.push(new Map());
    return index;
  };
  // Every edge comes from the existing pedestrian road snapshots. No direct-line fallback.
  for (const option of [scenario, ...(scenario.alternatives ?? [])]) {
    for (const route of [option.route, ...Object.values(option.categories).flat().map(place => place.route)]) {
      for (const encoded of route.legs) {
        const points = decodePolyline(encoded);
        for (let i = 1; i < points.length; i++) {
          const a = node(points[i - 1]), b = node(points[i]);
          if (a === b) continue;
          const distance = walkingDistance(points[i - 1], points[i]);
          network.edges[a].set(b, distance); network.edges[b].set(a, distance);
        }
      }
    }
  }
  networks.set(scenario, network);
  return network;
}
function snap(network: Network, point: Coordinate) {
  const id = key(point), existing = network.snaps.get(id);
  if (existing !== undefined) return existing;
  let best = -1, distance = Infinity;
  network.points.forEach((node, index) => { const next = walkingDistance(node, point); if (next < distance) { best = index; distance = next; } });
  if (best < 0 || distance > 250) throw new Error("이 장소까지 이어지는 도보 경로를 찾지 못했어요.");
  network.snaps.set(id, best);
  return best;
}
function shortest(network: Network, from: Coordinate, to: Coordinate) {
  const start = snap(network, from), end = snap(network, to), cacheKey = `${start}:${end}`;
  const cached = network.paths.get(cacheKey);
  if (cached) return cached;
  const best = new Map([[start, 0]]), previous = new Map<number, number>();
  const heap: [number, number][] = [];
  const push = (entry: [number, number]) => {
    let i = heap.length; heap.push(entry);
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent][0] <= entry[0]) break; heap[i] = heap[parent]; i = parent; }
    heap[i] = entry;
  };
  const pop = () => {
    const root = heap[0], last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++; if (heap[child][0] >= last[0]) break; heap[i] = heap[child]; i = child; }
      heap[i] = last;
    }
    return root;
  };
  push([0, start]);
  while (heap.length) {
    const [distance, current] = pop();
    if (distance !== best.get(current)) continue;
    if (current === end) {
      const path = [network.points[end]];
      let next = end;
      while (next !== start) { next = previous.get(next)!; path.push(network.points[next]); }
      path.reverse(); network.paths.set(cacheKey, path);
      return path;
    }
    for (const [neighbor, weight] of network.edges[current]) {
      const total = distance + weight;
      if (total < (best.get(neighbor) ?? Infinity)) { best.set(neighbor, total); previous.set(neighbor, current); push([total, neighbor]); }
    }
  }
  throw new Error("기존 일정과 연결되는 도보 경로를 찾지 못했어요.");
}

/** Preserve visit order: departure → saved stops in order → selected destination. */
export function planJourney(scenario: DiningScenario, targetIndex: number, visits: JourneyStop[]): JourneyPlan {
  const option = [scenario, ...(scenario.alternatives ?? [])][targetIndex];
  if (!option) throw new Error("목적지를 다시 선택해 주세요.");
  const seen = new Set<string>();
  const stops = visits.flatMap(visit => {
    const place = option.categories[visit.category][visit.index];
    if (!place) throw new Error("장소를 다시 선택해 주세요.");
    if (seen.has(place.id)) return [];
    seen.add(place.id); return [place];
  });
  const network = roadNetwork(scenario);
  const waypoints = [option.origin, ...stops, option.destination];
  const legs = waypoints.slice(1).map((point, i) => shortest(network, waypoints[i].coordinate, point.coordinate));
  const coordinates = legs.flatMap((leg, i) => i ? leg.slice(1) : leg);
  const meters = legs.reduce((sum, leg) => sum + length(leg), 0);
  return { legs, coordinates, stops, distanceKm: meters / 1000, durationSeconds: meters / 1.25 };
}
