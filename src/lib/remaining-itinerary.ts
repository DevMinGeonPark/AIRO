import { pendingChoice } from "./stop-choices";
import { progressEntry, progressRule, progressStopKey, validStopTime, type ItineraryProgress, type ProgressRule, type ProgressAction } from "./itinerary-progress";
import type { Stop } from "./types";

/** Preserve flights when a completed arrival is between two remaining places. */
export function remainingItinerary(stops: Stop[], progress: ItineraryProgress | null) {
  let previous = -1;
  return stops.flatMap((stop, index) => {
    if (progressEntry(progress, stop)?.done) return [];
    const flight = previous >= 0 && stops.slice(previous + 1, index + 1).some(place => place.mode === "flight");
    previous = index;
    return [flight && stop.mode !== "flight" ? { ...stop, mode: "flight" as const } : stop];
  });
}

export function remainingRoadPair(stops: Stop[], fromId: string, toId: string) {
  const a = stops.findIndex(stop => stop.id === fromId), b = stops.findIndex(stop => stop.id === toId);
  if (a < 0 || b <= a || stops.slice(a, b + 1).some(pendingChoice) || stops.slice(a + 1, b + 1).some(stop => stop.mode === "flight")) return null;
  return { from: stops[a], to: stops[b] };
}

export function dayProgressRules(stops: Stop[], progress: ItineraryProgress | null, mode: ProgressRule["mode"]): ProgressAction[] {
  return stops.filter(stop => mode !== "time" || validStopTime(stop.time)).map(stop => ({ action: "rule", rule: {
    ...progressRule(progress, stop), stopId: progressStopKey(stop), mode: mode === "either" && !validStopTime(stop.time) ? "location" : mode,
  } }));
}
