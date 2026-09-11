import "server-only";
import { decodePolyline } from "./polyline";

export type RoadRoute = { coordinates: [number, number][]; distance: number; duration: number; profile: "pedestrian" | "auto" };
const cache = new Map<string, { at: number; value: RoadRoute }>();
const pending = new Map<string, Promise<RoadRoute>>();
let queue: Promise<unknown> = Promise.resolve();
let nextRequest = 0;
const TTL = 24 * 60 * 60_000;

/** One process-wide queue respects the upstream demo service's 1 request/s limit.
 * Only server-validated trip coordinates enter here; raw failures are not logged.
 */
export function roadRoute(from: [number, number], to: [number, number], profile: "pedestrian" | "auto") {
  const key = JSON.stringify([from, to, profile]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.value);
  const active = pending.get(key);
  if (active) return active;
  if (pending.size >= 32) return Promise.reject(new Error("경로 요청이 많습니다. 잠시 후 다시 시도해 주세요."));
  const work = queue.catch(() => {}).then(async () => {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, nextRequest - Date.now())));
    nextRequest = Date.now() + 1200;
    const response = await fetch("https://valhalla1.openstreetmap.de/route", {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "AIRO/0.1 (https://airo.dev-heptivision.com)" },
      body: JSON.stringify({ locations: [from, to].map(([lon, lat]) => ({ lon, lat, type: "break" })), costing: profile, units: "kilometers" }),
      signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
    if (!response.ok) throw new Error("도로 경로를 불러오지 못했습니다.");
    const data = await response.json();
    const leg = data.trip?.legs?.[0], summary = data.trip?.summary;
    if (typeof leg?.shape !== "string" || !Number.isFinite(summary?.length) || !Number.isFinite(summary?.time)) throw new Error("연결 가능한 도로 경로가 없습니다.");
    const coordinates = decodePolyline(leg.shape);
    if (coordinates.length < 2) throw new Error("연결 가능한 도로 경로가 없습니다.");
    const value: RoadRoute = { coordinates, distance: summary.length * 1000, duration: summary.time, profile };
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
    return value;
  });
  queue = work.catch(() => {});
  pending.set(key, work);
  void work.finally(() => pending.delete(key)).catch(() => {});
  return work;
}
