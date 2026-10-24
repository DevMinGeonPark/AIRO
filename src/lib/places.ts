import "server-only";

import { Agent } from "undici";

import { matchCategory, type Category } from "./categories";
import { googleConfigured, searchGoogle } from "./places-google";
import type { Place } from "./types";
export type { Place };

export type SearchResult = { places: Place[]; source: string; reason?: string };

/** 지도 뷰포트 [west, south, east, north] */
export type BBox = [number, number, number, number];

const TTL_MS = 5 * 60_000;
const CACHE_MAX = 200;
// ponytail: 프로세스 메모리 캐시. 인스턴스가 여러 개가 되면 Redis 로 옮긴다.
const cache = new Map<string, { at: number; value: SearchResult }>();

// HTTP 헤더는 Latin-1 만 담을 수 있다. 한글을 넣으면 fetch 가 통째로 던진다.
const UA = "airo/0.1 (+https://airo.dev-heptivision.com)";

async function getJSON(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json", ...headers },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

type PhotonFeature = {
  properties: Record<string, string | number | undefined>;
  geometry: { coordinates: [number, number] };
};

const joinAddress = (...parts: (string | number | undefined)[]) =>
  parts.filter(Boolean).join(", ");

function fromPhoton(f: PhotonFeature): Place {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  return {
    id: `photon:${p.osm_type ?? "?"}${p.osm_id ?? ""}`,
    name: String(p.name ?? p.street ?? p.city ?? "이름 없음"),
    address: joinAddress(
      joinAddress(p.street, p.housenumber),
      p.district,
      p.city,
      p.state,
      p.country,
    ),
    lat,
    lng,
    category: String(p.osm_value ?? p.osm_key ?? "place"),
  };
}

type NominatimHit = {
  osm_type?: string;
  osm_id?: number;
  display_name: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
};

const fromNominatim = (h: NominatimHit): Place => ({
  id: `osm:${h.osm_type ?? "?"}${h.osm_id ?? ""}`,
  name: h.display_name.split(",")[0].trim(),
  address: h.display_name,
  lat: Number(h.lat),
  lng: Number(h.lon),
  category: String(h.type ?? h.class ?? "place"),
});

const OVERPASS = "https://overpass-api.de/api/interpreter";

/**
 * overpass-api.de publishes AAAA records that this host has no route to, so
 * node's fetch stalls on IPv6 until it times out. Pin this one call to IPv4.
 * ponytail: scoped dispatcher, not a global one — everything else (Photon,
 * OpenAI) is happy on the default.
 */
const ipv4 = new Agent({ connect: { family: 4 } });

/** Metres between two coordinates, good enough for sanity checks. */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.hypot((a.lat - b.lat) * 111_000, (a.lng - b.lng) * 91_000);
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/**
 * Ask OSM for everything of a kind within `radius` of a point, nearest first.
 * This is the path a name geocoder cannot serve — "breweries near here" is a
 * tag query, not a name match.
 */
async function searchCategory(
  category: Category,
  near: { lat: number; lng: number },
  limit: number,
  radius = category.radius ?? 30_000,
): Promise<Place[]> {
  // Note: no ["name"] existence filter here. It stops Overpass using the tag
  // index and turns a 13s query into a timeout; nameless results are dropped below.
  const body =
    `[out:json][timeout:60];(` +
    category.filters
      .map((f) => `nwr${f}(around:${radius},${near.lat},${near.lng});`)
      .join("") +
    `);out center tags 400;`;

  // Overpass answers 429/504 when its slots are busy; one retry covers the usual case.
  let data: { elements?: OverpassElement[] } | null = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      body,
      headers: { "user-agent": UA, "content-type": "text/plain" },
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
      // @ts-expect-error undici-only option, valid on the Node runtime
      dispatcher: ipv4,
    });
    if (res.ok) {
      data = (await res.json()) as { elements?: OverpassElement[] };
      break;
    }
    if (attempt === 1) throw new Error(`overpass ${res.status}`);
    // 429 means every slot is busy; a longer pause is the only thing that helps.
    await new Promise((r) => setTimeout(r, res.status === 429 ? 4000 : 1500));
  }
  if (!data) throw new Error("overpass: 빈 응답");

  const seen = new Set<string>();
  return (data.elements ?? [])
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      const t = e.tags ?? {};
      if (lat == null || lng == null || !t.name) return null;
      // Broad-tag categories (all restaurants) are narrowed here, where a regex
      // costs nothing, instead of in the Overpass query where it costs the index.
      if (category.refine && !category.refine.test(`${t.name} ${t.cuisine ?? ""}`))
        return null;
      return {
        id: `osm:${e.type[0]}${e.id}`,
        name: t.name,
        address: joinAddress(t["addr:city"], t["addr:suburb"], t["addr:street"], t["addr:housenumber"]),
        lat,
        lng,
        category: category.label,
        _d: metres(near, { lat, lng }),
      };
    })
    .filter((p): p is Place & { _d: number } => {
      if (!p || seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    })
    .sort((a, b) => a._d - b._d)
    .slice(0, limit)
    .map(({ _d, ...place }) => { void _d; return place; });
}

/**
 * 장소 검색. Photon 이 1순위(키 불필요), 비거나 죽으면 Nominatim.
 *
 * Photon 의 bbox 는 하드 필터라 "보고 있는 동네"를 정확히 잡아주지만, 질의어가
 * 그 안에 없으면 0건이 된다(오사카 뷰포트 + "라멘"). 그래서 bbox → 좌표 bias →
 * Nominatim 순으로 한 단계씩 넓힌다.
 * 둘 다 실패해도 던지지 않는다 — 빈 배열 + reason 으로 UI 가 안 깨지게.
 */
export async function searchPlaces(
  query: string,
  near?: { lat: number; lng: number },
  limit = 10,
  bbox?: BBox,
  options: { allowGoogle?: boolean } = {},
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { places: [], source: "none", reason: "빈 질의" };
  const n = Math.min(Math.max(limit, 1), 20);
  const key = `${options.allowGoogle === false ? "osm" : "auto"}|${q}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}|${bbox?.map((v) => v.toFixed(1)).join(",") ?? ""}|${n}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  // Google knows ratings, hours and which places people actually go to, so it
  // wins whenever a key is configured. OSM stays as the free fallback.
  if (options.allowGoogle !== false && googleConfigured) {
    try {
      const places = await searchGoogle(q, near, n);
      if (places.length) {
        const value = { places, source: "google" };
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
        cache.set(key, { at: Date.now(), value });
        return value;
      }
    } catch {
      // quota, billing or a bad key — fall through to the open-data path
    }
  }

  // "맥주공장", "온천", "라멘" 같은 분류어는 이름 검색으로는 못 찾는다.
  // 좌표가 있으면 Overpass 에 태그로 물어본다.
  const category = matchCategory(q);
  if (category && near) {
    try {
      const places = await searchCategory(category, near, n);
      if (places.length) {
        const value = { places, source: `overpass:${category.label}` };
        cache.set(key, { at: Date.now(), value });
        return value;
      }
      // 30km 안에 없으면 더 넓혀서 한 번 더 — 공장·양조장은 도심 밖에 있다.
      const wider = await searchCategory(
        category,
        near,
        n,
        (category.radius ?? 30_000) * 3,
      );
      if (wider.length) {
        const value = { places: wider, source: `overpass:${category.label}+80km` };
        cache.set(key, { at: Date.now(), value });
        return value;
      }
    } catch {
      // Overpass 가 죽었으면 아래 이름 검색으로 내려간다
    }
  }

  const base = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${n}`;
  const attempts: [string, string][] = [];
  if (bbox) attempts.push(["photon+bbox", `${base}&bbox=${bbox.join(",")}`]);
  attempts.push([
    near ? "photon+near" : "photon",
    near ? `${base}&lat=${near.lat}&lon=${near.lng}&zoom=13&location_bias_scale=1` : base,
  ]);

  const reasons: string[] = [];
  let result: SearchResult = { places: [], source: "none" };

  for (const [source, url] of attempts) {
    try {
      const data = (await getJSON(url)) as { features?: PhotonFeature[] };
      const all = (data.features ?? []).map(fromPhoton);
      // 좌표를 줬는데 300km 밖 결과가 오면 그건 "근처"가 아니다 (오사카 질의에
      // 인천 술집이 걸리던 문제).
      const places = near ? all.filter((p) => metres(near, p) < 300_000) : all;
      if (places.length) {
        result = { places, source };
        break;
      }
      reasons.push(`${source}: 결과 없음`);
    } catch (e) {
      reasons.push(`${source}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!result.places.length) {
    // Nominatim 은 초당 1회 제한 — Photon 이 전부 비었을 때만 두드린다. User-Agent 필수.
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${n}&accept-language=ko`;
      const data = (await getJSON(url)) as NominatimHit[];
      const places = data.map(fromNominatim);
      if (places.length) result = { places, source: "nominatim" };
      else {
        reasons.push("nominatim: 결과 없음");
        result = { places: [], source: "none", reason: reasons.join(" / ") };
      }
    } catch (e) {
      reasons.push(`nominatim: ${e instanceof Error ? e.message : String(e)}`);
      result = { places: [], source: "none", reason: reasons.join(" / ") };
    }
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value: result });
  return result;
}
