import { pendingChoice } from "./stop-choices";
import { z } from "zod";
import type { Stop } from "./types";
import { tripDayDate } from "./trip-calendar";

export const progressModes = { manual: "직접 체크", location: "위치로 자동 체크", time: "시간으로 자동 체크", either: "위치 또는 시간" } as const;
const stopKey = z.string().min(1).max(200);
const zone = z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "올바른 시간대를 선택해 주세요.");
export const progressRuleSchema = z.object({ stopId: stopKey, mode: z.enum(["manual", "location", "time", "either"]), radiusMeters: z.number().int().min(100).max(1000) }).strict();
export const progressEntrySchema = z.object({ stopId: stopKey, done: z.boolean(), source: z.enum(["manual", "location", "time"]), completedAt: z.iso.datetime({ offset: true }).nullable(), updatedAt: z.iso.datetime({ offset: true }) }).strict().refine(entry => entry.done ? entry.completedAt !== null : entry.completedAt === null && entry.source === "manual");
export const itineraryProgressSchema = z.object({
  revision: z.number().int().min(0).max(2147483645), timeZone: zone,
  rules: z.array(progressRuleSchema).max(10000), entries: z.array(progressEntrySchema).max(10000),
}).strict().refine(value => new Set(value.rules.map(rule => rule.stopId)).size === value.rules.length && new Set(value.entries.map(entry => entry.stopId)).size === value.entries.length, "일정 ID가 중복되었습니다.");
export const positionSchema = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180), accuracy: z.number().finite().nonnegative(), timestamp: z.number().finite().nonnegative() }).strict();
const revision = { revision: z.number().int().min(0).max(2147483645) };
export const progressMutationSchema = z.discriminatedUnion("action", [
  z.object({ ...revision, action: z.literal("manual"), stopId: stopKey, done: z.boolean() }).strict(),
  z.object({ ...revision, action: z.literal("resume"), stopId: stopKey }).strict(),
  z.object({ ...revision, action: z.literal("rule"), rule: progressRuleSchema }).strict(),
  z.object({ ...revision, action: z.literal("timezone"), timeZone: zone }).strict(),
  z.object({ ...revision, action: z.literal("automatic"), position: positionSchema.optional() }).strict(),
]);
export type ItineraryProgress = z.infer<typeof itineraryProgressSchema>;
export type ProgressRule = z.infer<typeof progressRuleSchema>;
export type ProgressEntry = z.infer<typeof progressEntrySchema>;
export type ProgressPosition = z.infer<typeof positionSchema>;
export type ProgressMutation = z.infer<typeof progressMutationSchema>;
export type ProgressAction = ProgressMutation extends infer T ? T extends ProgressMutation ? Omit<T, "revision"> : never : never;
export const emptyItineraryProgress = (): ItineraryProgress => ({ revision: 0, timeZone: "Asia/Seoul", rules: [], entries: [] });
export const progressStopKey = (stop: Pick<Stop, "id" | "source_id">) => stop.source_id || stop.id;
export const progressEntry = (progress: ItineraryProgress | null, stop: Pick<Stop, "id" | "source_id">) => progress?.entries.find(entry => entry.stopId === progressStopKey(stop) || entry.stopId === stop.id);
export const progressRule = (progress: ItineraryProgress | null, stop: Pick<Stop, "id" | "source_id">): ProgressRule => progress?.rules.find(rule => rule.stopId === progressStopKey(stop) || rule.stopId === stop.id) ?? { stopId: progressStopKey(stop), mode: "manual", radiusMeters: 150 };

export function zonedClock(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (key: string) => parts.find(part => part.type === key)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}
export const validStopTime = (value: string | null): value is string => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value ?? "");
export function locationDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h))));
}

/** Only configured stops on the actual travel date; browsing a different day has no effect. */
export function automaticCandidates(progress: ItineraryProgress, stops: Stop[], startDate: string | null, now: number, position?: ProgressPosition) {
  if (!startDate) return [];
  const clock = zonedClock(now, progress.timeZone);
  return stops.flatMap<{ stopId: string; source: "location" | "time" }>(stop => {
    if (pendingChoice(stop) || progressEntry(progress, stop) || tripDayDate(startDate, stop.day, clock.date) !== clock.date) return [];
    const rule = progressRule(progress, stop);
    const fresh = position && now - position.timestamp >= -10000 && now - position.timestamp <= 60000;
    if ((rule.mode === "location" || rule.mode === "either") && fresh && position.accuracy <= 100 && locationDistance(position, stop) + position.accuracy <= rule.radiusMeters)
      return [{ stopId: progressStopKey(stop), source: "location" as const }];
    if ((rule.mode === "time" || rule.mode === "either") && validStopTime(stop.time) && clock.time >= stop.time)
      return [{ stopId: progressStopKey(stop), source: "time" as const }];
    return [];
  });
}
