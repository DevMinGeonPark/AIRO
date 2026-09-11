import type { Stop } from "./types";

export type Placement = { afterStopId?: string; beforeStopId?: string; position?: number };
export type StopPatch = Partial<Pick<Stop, "name" | "lng" | "lat" | "day" | "time" | "note" | "map_query" | "mode">> & Placement;
export type StopMutation =
  | { operation: "add"; input: StopPatch; newId: string }
  | { operation: "move"; input: StopPatch; stopId: string }
  | { operation: "remove"; stopId: string }
  | { operation: "reorder"; day: number; stopIds: string[] };

/** Pure counterpart of mutate_itinerary. Never modifies the caller's snapshot. */
export function mutateStops(snapshot: Stop[], tripId: string, mutation: StopMutation) {
  const stops = snapshot.filter(s => s.trip_id === tripId).map(s => ({ ...s }));
  const orderedDay = (day: number, exclude?: string) => stops
    .filter(s => s.day === day && s.id !== exclude)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const normalize = (ordered: Stop[]) => ordered.forEach((s, position) => { s.position = position; });
  let changed: Stop | undefined;
  let order: string[] | undefined;

  if (mutation.operation === "reorder") {
    const inDay = orderedDay(mutation.day);
    if (new Set(mutation.stopIds).size !== mutation.stopIds.length || mutation.stopIds.some(id => !inDay.some(s => s.id === id))) {
      throw new Error("이 일차에 속한 장소 ID를 중복 없이 지정하세요.");
    }
    const list = [...mutation.stopIds.map(id => inDay.find(s => s.id === id)!), ...inDay.filter(s => !mutation.stopIds.includes(s.id))];
    normalize(list);
    order = list.map(s => s.id);
  } else if (mutation.operation === "remove") {
    const index = stops.findIndex(s => s.id === mutation.stopId);
    if (index < 0) return { stops, removed: false };
    const [removed] = stops.splice(index, 1);
    normalize(orderedDay(removed.day));
  } else {
    const { afterStopId, beforeStopId, position, ...fields } = mutation.input;
    if ([afterStopId, beforeStopId, position].filter(v => v !== undefined).length > 1) throw new Error("삽입 기준은 하나만 지정하세요.");
    const previous = mutation.operation === "move" ? stops.find(s => s.id === mutation.stopId) : undefined;
    if (mutation.operation === "move" && !previous) return { stops, stop: null };
    const anchorId = afterStopId ?? beforeStopId;
    const anchor = anchorId === undefined ? undefined : stops.find(s => s.id === anchorId);
    if (anchorId !== undefined && (!anchor || anchor.id === previous?.id)) throw new Error("삽입 기준 장소를 확인하세요.");
    const day = fields.day ?? anchor?.day ?? previous?.day;
    if (day === undefined || (anchor && anchor.day !== day)) throw new Error("삽입 기준 장소와 같은 일차를 지정하세요.");
    const oldDay = previous?.day;
    const target = orderedDay(day, previous?.id);
    let index = target.length;
    if (anchor) index = target.findIndex(s => s.id === anchor.id) + (afterStopId ? 1 : 0);
    else if (position !== undefined) index = Math.min(position, target.length);
    else if (previous && previous.day === day) index = orderedDay(day).findIndex(s => s.id === previous.id);
    if (previous) { Object.assign(previous, fields, { day }); changed = previous; }
    else if (mutation.operation === "add") {
      changed = { id: mutation.newId, trip_id: tripId, name: fields.name!, lng: fields.lng!, lat: fields.lat!, day,
        time: fields.time ?? null, note: fields.note ?? null, map_query: fields.map_query ?? null, mode: fields.mode ?? "ground", position: index };
      stops.push(changed);
    }
    if (!changed) throw new Error("장소를 찾을 수 없습니다.");
    target.splice(index, 0, changed);
    normalize(target);
    if (oldDay !== undefined && oldDay !== day) normalize(orderedDay(oldDay));
  }
  return { stops: stops.sort((a, b) => a.day - b.day || a.position - b.position), stop: changed, order, removed: mutation.operation === "remove" ? true : undefined };
}
