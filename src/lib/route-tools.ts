import type { Place, Stop } from "./types";

type Point = [number, number];
type Profile = "pedestrian" | "auto";
export type RouteData = { coordinates: Point[]; distance: number; duration: number; profile: Profile };
export type RouteProvider = (from: Point, to: Point, profile: Profile) => Promise<RouteData>;
export type PlaceProvider = (query: string, near?: { lng: number; lat: number }, limit?: number) => Promise<{ places: Place[]; source: string; reason?: string }>;
const wrap = (lng: number) => ((lng + 540) % 360) - 180;
const metres = (a: Point, b: Point) => Math.hypot(wrap(b[0] - a[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), b[1] - a[1]) * 111_195;
const point = (s: { lng: number; lat: number }): Point => [s.lng, s.lat];
const dayStops = (stops: Stop[], day: number) => stops.filter(s => s.day === day).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

async function legsFor(stops: Stop[], route: RouteProvider, profile?: Profile) {
  if (stops.length > 21) throw new Error("한 번에 최대 20개 이동 구간을 조회할 수 있습니다. 시작·끝 장소로 범위를 좁혀 주세요.");
  const legs = [];
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1], to = stops[i];
    const base = { fromStopId: from.id, toStopId: to.id, from: from.name, to: to.name };
    if (to.mode === "flight") {
      legs.push({ ...base, mode: "flight" as const, route: null });
    } else {
      const data = await route(point(from), point(to), profile ?? (metres(point(from), point(to)) <= 5000 ? "pedestrian" : "auto"));
      if (!Number.isFinite(data.distance) || data.distance < 0 || !Number.isFinite(data.duration) || data.duration < 0 || data.coordinates.length < 2 || data.coordinates.some(c => !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90)) {
        throw new Error("도로 공급자가 올바른 경로를 반환하지 않았습니다.");
      }
      legs.push({ ...base, mode: "ground" as const, route: data });
    }
  }
  return legs;
}

export async function getDayRoute(stops: Stop[], input: { day: number; profile?: Profile; includeGeometry?: boolean }, route: RouteProvider) {
  const ordered = dayStops(stops, input.day);
  const legs = await legsFor(ordered, route, input.profile);
  return {
    day: input.day, stopIds: ordered.map(s => s.id),
    roadDistanceMeters: Math.round(legs.reduce((sum, l) => sum + (l.route?.distance ?? 0), 0)),
    roadDurationSeconds: Math.round(legs.reduce((sum, l) => sum + (l.route?.duration ?? 0), 0)),
    durationNote: "도로 공급자의 예상 이동 시간이며 교통 실황·체류 시간·항공편 시간은 포함하지 않습니다.",
    legs: legs.map(({ route: data, ...leg }) => ({ ...leg, ...(data ? {
      profile: data.profile, distanceMeters: Math.round(data.distance), durationSeconds: Math.round(data.duration),
      ...(input.includeGeometry ? { geometry: { type: "LineString", coordinates: data.coordinates } } : {}),
    } : { note: "항공 구간입니다. 거리·시간 합계에서 제외합니다." }) })),
  };
}

/** Distance to the actual road polyline, not to a straight origin/destination line. */
export function nearestRoadPoint(location: Point, coordinates: Point[]) {
  let best = { distance: Infinity, along: 0 };
  let travelled = 0;
  const scale = Math.cos(location[1] * Math.PI / 180);
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1], b = coordinates[i];
    const ax = wrap(a[0] - location[0]) * scale * 111_195, ay = (a[1] - location[1]) * 111_195;
    const bx = (wrap(a[0] - location[0]) + wrap(b[0] - a[0])) * scale * 111_195, by = (b[1] - location[1]) * 111_195;
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (length * length))) : 0;
    const distance = Math.hypot(ax + dx * t, ay + dy * t);
    if (distance < best.distance) best = { distance, along: travelled + t * length };
    travelled += length;
  }
  return best;
}

export async function searchAlongRoute(stops: Stop[], input: {
  day: number; query: string; fromStopId?: string; toStopId?: string; radiusMeters?: number; limit?: number; profile?: Profile;
}, route: RouteProvider, search: PlaceProvider) {
  const ordered = dayStops(stops, input.day);
  const start = input.fromStopId ? ordered.findIndex(s => s.id === input.fromStopId) : 0;
  const end = input.toStopId ? ordered.findIndex(s => s.id === input.toStopId) : ordered.length - 1;
  if (start < 0 || end < 0 || start >= end) throw new Error("같은 일차에서 앞선 출발 장소와 뒤의 도착 장소를 선택하세요.");
  const legs = await legsFor(ordered.slice(start, end + 1), route, input.profile);
  if (legs.some(l => !l.route)) throw new Error("항공 구간에서는 가는 길의 장소를 검색할 수 없습니다. 육상 구간을 선택하세요.");
  const segments = legs.flatMap((leg, legIndex) => leg.route!.coordinates.slice(1).map((b, i) => ({ a: leg.route!.coordinates[i], b, legIndex, length: metres(leg.route!.coordinates[i], b) })));
  const total = segments.reduce((sum, s) => sum + s.length, 0);
  // Bounded search cost: three positions on the requested road, never the bounding-box centre.
  const anchors = [0.15, 0.5, 0.85].map(fraction => {
    let remaining = total * fraction;
    for (const segment of segments) {
      if (remaining <= segment.length) {
        const t = segment.length ? remaining / segment.length : 0;
        return { lng: wrap(segment.a[0] + wrap(segment.b[0] - segment.a[0]) * t), lat: segment.a[1] + (segment.b[1] - segment.a[1]) * t };
      }
      remaining -= segment.length;
    }
    return { lng: segments.at(-1)!.b[0], lat: segments.at(-1)!.b[1] };
  });
  const sources = new Set<string>(), warnings: string[] = [];
  const results: Place[] = [];
  for (const anchor of anchors) {
    const result = await search(input.query, anchor, 20);
    sources.add(result.source);
    if (result.reason) warnings.push("일부 검색에서 후보를 찾지 못했거나 공급자 응답을 받지 못했습니다.");
    results.push(...result.places);
  }
  const seen = new Set<string>();
  const candidates = results.filter(p => {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat) || seen.has(p.id) || ordered.some(s => metres(point(s), point(p)) < 25)) return false;
    seen.add(p.id); return true;
  }).map(place => {
    let nearest = { distance: Infinity, along: 0, legIndex: 0 };
    let offset = 0;
    legs.forEach((leg, legIndex) => {
      const hit = nearestRoadPoint(point(place), leg.route!.coordinates);
      if (hit.distance < nearest.distance) nearest = { ...hit, along: offset + hit.along, legIndex };
      offset += leg.route!.coordinates.slice(1).reduce((sum, c, i) => sum + metres(leg.route!.coordinates[i], c), 0);
    });
    const leg = legs[nearest.legIndex];
    return { ...place, day: input.day, distanceFromRouteMeters: Math.round(nearest.distance), routeProgressMeters: Math.round(nearest.along),
      placement: { afterStopId: leg.fromStopId }, nextStopId: leg.toStopId };
  }).filter(p => p.distanceFromRouteMeters <= (input.radiusMeters ?? 700))
    .sort((a, b) => a.distanceFromRouteMeters - b.distanceFromRouteMeters).slice(0, input.limit ?? 8)
    .sort((a, b) => a.routeProgressMeters - b.routeProgressMeters);
  return { day: input.day, fromStopId: ordered[start].id, toStopId: ordered[end].id, candidates, sources: [...sources], warnings: [...new Set(warnings)],
    searchNote: "도로 위 세 지점 주변의 검색 결과입니다. 모든 가게를 망라하지 않으며 경로까지 거리는 근사 직선 거리입니다. 실제 우회 시간·영업 여부는 별도로 확인해야 합니다.",
    nextAction: "사용자가 선택한 후보만 addStop으로 저장하세요. 반환된 placement.afterStopId를 사용하면 기존 경로의 해당 구간에 삽입됩니다. 여러 후보를 연속 추가할 때는 방금 추가한 stopId를 다음 후보의 afterStopId로 사용하세요." };
}
