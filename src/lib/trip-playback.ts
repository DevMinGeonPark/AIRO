import { routablePair } from "./stop-choices";
import type { Stop } from "./types";

export type TripPoint = [number, number];
export type PlaybackRoad = { id: string; coordinates: TripPoint[] };
export type PlaybackLeg = { from: Stop; to: Stop; path: TripPoint[]; flight: boolean };

export function flightPath(a: TripPoint, b: TripPoint): TripPoint[] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const c: TripPoint = [(a[0] + b[0]) / 2 - dy * .14, (a[1] + b[1]) / 2 + dx * .14];
  return Array.from({ length: 121 }, (_, index) => {
    const t = index / 120, u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  });
}

/** Ground movement uses the same road geometry as the visible map. */
export function playbackLegs(stops: Stop[], roads: PlaybackRoad[]) {
  const byId = new Map(roads.map(road => [road.id, road]));
  const legs: PlaybackLeg[] = [];
  let missing = 0;
  for (let index = 1; index < stops.length; index++) {
    const from = stops[index - 1], to = stops[index];
    if (!routablePair(from, to)) { missing++; continue; }
    if (from.lng === to.lng && from.lat === to.lat) continue;
    const flight = to.mode === "flight";
    const path = flight ? flightPath([from.lng, from.lat], [to.lng, to.lat]) : byId.get(`${from.id}->${to.id}`)?.coordinates;
    if (!path || path.length < 2) { missing++; continue; }
    legs.push({ from, to, path, flight });
  }
  return { legs, missing };
}

export function measurePath(path: TripPoint[]) {
  const cumulative = [0];
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index];
    const radians = Math.PI / 180;
    const x = Math.sin((b[1] - a[1]) * radians / 2) ** 2
      + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin((b[0] - a[0]) * radians / 2) ** 2;
    cumulative.push(cumulative[index - 1] + 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x))));
  }
  return cumulative;
}

/** Distance weighting keeps unevenly sampled road vertices from changing speed. */
export function pointOnPath(path: TripPoint[], cumulative: number[], progress: number) {
  if (path.length < 2) return { position: path[0] ?? [0, 0] as TripPoint, heading: 0 };
  const distance = Math.max(0, Math.min(1, progress)) * cumulative.at(-1)!;
  let lo = 1, hi = path.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (cumulative[mid] < distance) lo = mid + 1; else hi = mid;
  }
  const a = path[lo - 1], b = path[lo];
  const span = cumulative[lo] - cumulative[lo - 1];
  const t = span ? Math.max(0, Math.min(1, (distance - cumulative[lo - 1]) / span)) : 0;
  return {
    position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as TripPoint,
    heading: Math.atan2((b[0] - a[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), b[1] - a[1]) * 180 / Math.PI,
  };
}
