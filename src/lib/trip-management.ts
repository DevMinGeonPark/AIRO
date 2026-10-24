import { z } from "zod";

/** Expected management failures retain their status across HTTP and MCP adapters. */
export class ManagementError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const MAX_PDF_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BASE64 = 4 * Math.ceil(MAX_PDF_BYTES / 3);
export const revisionSchema = z.number().int().min(0).max(2147483646);
export const linkedStopIdsSchema = z.array(z.string().min(1).max(200)).max(100)
  .refine(ids => new Set(ids).size === ids.length, "장소 ID가 중복되었습니다.");
export const bookingUrlSchema = z.url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "예약 페이지의 HTTPS 주소를 입력하세요.");
export const reservationSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
  stopId: z.string().min(1).max(128).nullable(),
  stopIds: linkedStopIdsSchema.optional().describe("연박 등 같은 예약을 함께 표시할 추가 장소 ID"),
  bookingUrl: bookingUrlSchema.nullable().optional().describe("실제 예약 상세 또는 플랫폼에서 공유한 HTTPS 링크. 예약번호로 URL을 추측하지 않는다."),
  documentSha256s: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(20).optional().describe("이 예약에 연결할 첨부 PDF의 SHA-256 목록"),
  bookingStatus: z.enum(["not_booked", "pending", "confirmed", "cancelled"]),
  paymentStatus: z.enum(["unpaid", "partial", "paid", "refunded"]),
  reference: z.string().max(300).nullable(),
  note: z.string().max(4000).nullable(),
}).strict();
export const reservationsSchema = z.object({
  revision: revisionSchema,
  entries: z.array(reservationSchema).max(500),
}).strict().refine(value => new Set(value.entries.map(entry => entry.id)).size === value.entries.length, "예약 ID가 중복되었습니다.");
export const notificationSettingsSchema = z.object({
  revision: revisionSchema,
  enabled: z.boolean(),
  timeZone: z.string().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "IANA 시간대를 입력하세요. 예: Asia/Seoul"),
  reminders: z.array(z.object({
    id: z.uuid(), title: z.string().trim().min(1).max(200),
    at: z.iso.datetime({ offset: true }).describe("UTC 또는 오프셋을 포함한 알림 시각"),
    enabled: z.boolean(),
  }).strict()).max(100),
}).strict().refine(value => new Set(value.reminders.map(entry => entry.id)).size === value.reminders.length, "알림 ID가 중복되었습니다.");
export const emptyReservations = () => ({ revision: 0, entries: [] } as z.infer<typeof reservationsSchema>);
export const emptyNotificationSettings = () => ({ revision: 0, enabled: false, timeZone: "Asia/Seoul", reminders: [] } as z.infer<typeof notificationSettingsSchema>);
