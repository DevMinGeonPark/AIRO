import type { Stop } from "./types";

export type Leg = { id: string; from: [number, number]; to: [number, number] };

/**
 * 연속한 지점 사이의 구간. 항공은 호로 표시하고 육상은 별도의 도로 경로를 사용한다.
 */
export function tripLegs(stops: Stop[]): { flight: Leg[]; ground: Leg[] } {
  const flight: Leg[] = [];
  const ground: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (a.lng === b.lng && a.lat === b.lat) continue;
    const leg: Leg = {
      id: `${a.id}->${b.id}`,
      from: [a.lng, a.lat],
      to: [b.lng, b.lat],
    };
    (b.mode === "flight" ? flight : ground).push(leg);
  }
  return { flight, ground };
}

/** 일자별 묶음. 순서는 그대로 유지. */
export function byDay(stops: Stop[]) {
  const days = new Map<number, Stop[]>();
  for (const stop of stops) {
    const list = days.get(stop.day);
    if (list) list.push(stop);
    else days.set(stop.day, [stop]);
  }
  return [...days.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, stops]) => ({ day, stops }));
}

/** [[west, south], [east, north]] */
export function bounds(stops: Pick<Stop, "lng" | "lat">[]): [[number, number], [number, number]] {
  if (!stops.length) return [[126, 33], [136, 38]];
  const lngs = stops.map((s) => s.lng);
  const lats = stops.map((s) => s.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

const query = (s: Stop) => encodeURIComponent(s.map_query ?? `${s.lat},${s.lng}`);

export const mapsUrl = (s: Stop) =>
  `https://www.google.com/maps/search/?api=1&query=${query(s)}`;

export const directionsUrl = (s: Stop) =>
  `https://www.google.com/maps/dir/?api=1&destination=${query(s)}`;

/** 정렬 기준: day → position. DB 조회와 낙관적 갱신 양쪽에서 쓴다. */
export const sortStops = (stops: Stop[]) =>
  [...stops].sort((a, b) => a.day - b.day || a.position - b.position);

export function dateForDay(startDate: string | null, day: number, original?: string | null) {
  if (!startDate) return original ?? "";
  const date = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return original ?? "";
  date.setUTCDate(date.getUTCDate() + day - 1);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()} ${["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()]}`;
}

/** 두 지점 사이 대권 거리(km). 하루 이동량을 어림하는 용도. */
export function distanceKm(a: Stop, b: Stop) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 연속한 지점을 직선으로 이은 합계 거리(km).
 * ponytail: 도로 경로가 아니라 직선 합이라 실제보다 짧게 나온다 — 어림값으로만 쓴다.
 */
export const totalKm = (stops: Stop[]) =>
  stops.reduce((sum, s, i) => (i ? sum + distanceKm(stops[i - 1], s) : 0), 0);
