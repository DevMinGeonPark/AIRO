import type { ArchivedPlace } from "./archive";
import { webUrl } from "./archive";
import type { Stop } from "./types";
import type { ToolInput } from "./tool-contracts";

const normalize = (value: string) => value.normalize("NFKC").toLowerCase();

/** Same archive and favourites as ResourcesPage; never return archive blobs or passthrough fields. */
export function savedPlacesPage(food: ArchivedPlace[], savedIds: string[], stops: Stop[], input: ToolInput<"listSavedPlaces">) {
  const saved = new Set(savedIds);
  const hosts = new Map<string, Stop>();
  for (const stop of stops) {
    hosts.set(stop.id, stop);
    if (stop.source_id) hosts.set(stop.source_id, stop);
  }
  const matches = (values: unknown[], query?: string) => !query || normalize(values.filter(v => typeof v === "string").join(" ")).includes(normalize(query));
  const filtered = food.filter(place => {
    const host = hosts.get(place.stopId);
    return (input.day === undefined || place.day === input.day)
      && (!input.savedOnly || saved.has(place.id))
      && matches([place.name, place.nameKo, place.nameEn, place.cuisine, place.kind, place.addr], input.query)
      && matches([place.addr, host?.name], input.region);
  });
  const offset = input.offset ?? 0, limit = input.limit ?? 10;
  const places = filtered.slice(offset, offset + limit).map(place => {
    const host = hosts.get(place.stopId);
    const truncatedFields: string[] = [];
    const text = (key: string, value: unknown) => {
      if (typeof value !== "string") return null;
      if (value.length > 300) truncatedFields.push(key);
      return value.slice(0, 300);
    };
    const result = {
      id: place.id, name: text("name", place.name), nameKo: text("nameKo", place.nameKo), nameEn: text("nameEn", place.nameEn),
      day: place.day, lat: place.lat, lng: place.lng,
      kind: text("kind", place.kind), cuisine: text("cuisine", place.cuisine),
      addr: text("addr", place.addr), hours: text("hours", place.hours), phone: text("phone", place.phone),
      website: (typeof place.website === "string" && place.website.length <= 2000 ? webUrl(place.website) : undefined) ?? null,
      saved: saved.has(place.id), stopId: host?.id ?? null, sourceStopId: place.stopId,
      nearStopName: text("nearStopName", host?.name),
    };
    return { ...result, ...(truncatedFields.length ? { truncatedFields } : {}) };
  });
  const hasMore = offset + places.length < filtered.length;
  return { tripId: input.tripId, source: "trip-resources", total: filtered.length, offset, limit, places,
    hasMore, nextOffset: hasMore ? offset + places.length : null,
    note: "저장된 자료입니다. 영업시간·폐업 여부는 실시간 확인되지 않았습니다. 지역은 주소·연결 장소명의 부분 일치입니다." };
}
