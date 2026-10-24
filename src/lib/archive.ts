import { z } from "zod";
import { stopChoiceSchema } from "./stop-choices";
import { expenseBudgetSchema } from "./expense-budget";
import { predepartureSchema } from "./predeparture";
import { tripImageSchema } from "./trip-images";
import { itineraryProgressSchema } from "./itinerary-progress";
import { reservationsSchema, notificationSettingsSchema, linkedStopIdsSchema } from "./trip-management";

const text = z.string().max(20000);
const nullableText = text.nullish();
const day = z.number().int().min(0).max(3650);
const money = z.number().finite().nonnegative();
const tier = z.enum(["thrifty", "normal", "comfort"]);
const amounts = z.object({ thrifty: money, normal: money, comfort: money });
const line = z.object({ name: text, krw: money, yen: money.optional(), shared: z.number().optional() });
const daily = z.object({ day, date: text, paid: z.array(line), spend: z.array(line), paidKrw: money, spendKrw: money });
const total = z.object({ japanYen: money, japanKrw: money, korea: money, upcoming: money, spent: money, grand: money, reserve: money, budget: money });
const namedDetail = z.object({ name: text, detail: text });
const paidRow = z.object({ date: text, name: text, krw: money, day });
const safeUrl = z.url().refine((v) => /^https?:\/\//i.test(v), "HTTP 주소가 필요합니다.");

export const budgetSchema = z.object({
  YEN: money, DAY_KEYS: z.array(day),
  TIERS: z.array(z.object({ key: tier, label: text, hint: text })).length(3).refine((rows) => new Set(rows.map((row) => row.key)).size === 3),
  japanItems: z.array(amounts.extend({ name: text, days: z.array(day) })),
  koreaItems: z.array(amounts.extend({ name: text, days: z.array(day) })),
  reserve: amounts,
  paid: z.object({ flights: z.array(paidRow), stays: z.array(paidRow), extraYen: money, extraDay: day }),
  paidTotal: z.object({ flights: money, stays: money, extra: money, all: money }),
  totalsByTier: z.object({ thrifty: total, normal: total, comfort: total }),
  daysByTier: z.object({ thrifty: z.array(daily), normal: z.array(daily), comfort: z.array(daily) }),
  dailyDrivers: z.array(z.object({ day, date: text, plan: text, cost: text })),
  assumptions: z.array(namedDetail), risks: z.array(namedDetail),
  sources: z.array(z.object({ name: text, url: safeUrl })),
}).passthrough();
export type BudgetSnapshot = z.infer<typeof budgetSchema>;
export type Tier = z.infer<typeof tier>;

export const stopInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
  day,
  position: z.number().int().min(0).optional(),
  time: nullableText, note: nullableText, map_query: nullableText,
  mode: z.enum(["flight", "ground"]).optional(),
});
const archivedStop = stopInputSchema.extend({
  choice: stopChoiceSchema.nullish(),
  source_id: z.string().min(1).max(200), date: nullableText,
});
const foodSchema = z.object({
  id: z.string().min(1), name: text, lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
  day, stopId: text, kind: text, cuisine: text,
  nameKo: nullableText, nameEn: nullableText, hours: nullableText, addr: nullableText,
  phone: nullableText, website: nullableText, image: nullableText, dist: z.number().optional(),
}).passthrough();
export type ArchivedPlace = z.infer<typeof foodSchema>;
export const archiveDataSchema = z.object({
  food: z.array(foodSchema).max(10000).default([]),
  photos: z.record(z.string(), z.object({ image: nullableText }).passthrough()).default({}),
  routes: z.record(z.string(), z.object({ coordinates: z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(2), distance: money, duration: money })).default({}),
  budget: budgetSchema.optional(),
  expenseBudget: expenseBudgetSchema.optional(),
  reservations: reservationsSchema.optional(),
  notificationSettings: notificationSettingsSchema.optional(),
  predepartureChecklist: predepartureSchema.optional(),
  images: z.array(tripImageSchema).max(10).optional(),
  itineraryProgress: itineraryProgressSchema.optional(),
  documents: z.array(z.object({ name: z.string().min(1).max(300), mime: z.literal("application/pdf"), base64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), stopIds: linkedStopIdsSchema.optional() })).max(20).default([]),
  savedPlaceIds: z.array(z.string().max(200)).max(10000).default([]),
  originalTrip: z.unknown().optional(),
  sourceFiles: z.record(z.string(), z.string()).optional(),
}).passthrough();
export type ArchiveData = z.infer<typeof archiveDataSchema>;

export const archiveSchema = z.object({
  format: z.literal("airo-trip"), version: z.literal(1),
  source_key: z.string().min(1).max(240), exported_at: z.iso.datetime(),
  trip: z.object({ title: z.string().min(1).max(120), start_date: z.iso.date().nullable(), created_at: z.iso.datetime().optional() }),
  stops: z.array(archivedStop).max(10000),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: text, created_at: z.iso.datetime() })).max(10000).default([]),
  data: archiveDataSchema,
}).superRefine((value, ctx) => {
  if (new Set(value.stops.map((s) => s.source_id)).size !== value.stops.length)
    ctx.addIssue({ code: "custom", message: "일정 ID가 중복되었습니다." });
});
export type TripArchive = z.infer<typeof archiveSchema>;
export const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
export function parseArchive(input: unknown): TripArchive { return archiveSchema.parse(input); }
export function webUrl(value: unknown): string | undefined {
  const result = safeUrl.safeParse(value);
  return result.success ? result.data : undefined;
}

// Import compatible versioned export families, then validate the complete
// payload. Persisted files always use the canonical AIRO format.
function normalizeFormat(value: unknown, family: "trip" | "saved") {
  if (value && typeof value === "object" && "format" in value && typeof value.format === "string"
    && new RegExp(`^[a-z][a-z0-9-]*-${family}$`, "i").test(value.format))
    return { ...value, format: `airo-${family}` };
  return value;
}

export const importArchiveSchema = z.preprocess(
  (value) => normalizeFormat(value, "trip"),
  archiveSchema,
);

export const importSavedSchema = z.preprocess(
  (value) => normalizeFormat(value, "saved"),
  z.object({ format: z.literal("airo-saved"), version: z.literal(1), ids: z.array(z.string().max(200)).max(10000) }),
);
