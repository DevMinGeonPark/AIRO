import { z } from "zod";

export const VISIT_JAPAN_QR_URL = "https://www.vjw.digital.go.jp/main/#/vjwpic026";
export const MAX_TRIP_IMAGE_BYTES = 2 * 1024 * 1024;
const sourceUrl = z.url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "HTTPS 주소를 입력해 주세요.");
export const tripImageMetadataSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.enum(["image/png", "image/jpeg"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096),
  sourceUrl, capturedAt: z.iso.datetime(),
}).strict();
export const tripImageSchema = tripImageMetadataSchema.extend({
  base64: z.string().min(1).max(2796204).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const tripImageUploadSchema = tripImageSchema.omit({ sha256: true, width: true, height: true });
export type TripImageMetadata = z.infer<typeof tripImageMetadataSchema>;
export const tripImageUrl = (tripId: string, sha256: string) => `/api/trips/${encodeURIComponent(tripId)}/images/${sha256}`;
