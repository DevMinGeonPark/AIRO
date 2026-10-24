import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { HttpError } from "./api";
import { createClient } from "./supabase/server";
import { getTrip } from "./store";
import { MAX_TRIP_IMAGE_BYTES, tripImageMetadataSchema, tripImageSchema, tripImageUploadSchema } from "./trip-images";

async function clientFor(tripId: string) {
  if (!await getTrip(tripId)) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const client = await createClient();
  if (!client) throw new HttpError(503, "이미지 자료에는 계정 연결이 필요합니다.");
  return client;
}
export async function listTripImages(tripId: string) {
  const client = await clientFor(tripId);
  const { data, error } = await client.rpc("list_trip_images", { p_trip: tripId });
  if (error) throw error;
  return tripImageMetadataSchema.array().max(10).parse(data ?? []);
}
export async function readTripImage(tripId: string, sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new HttpError(404, "이미지를 찾을 수 없습니다.");
  const client = await clientFor(tripId);
  const { data, error } = await client.from("trip_archives").select("data->images").eq("trip_id", tripId).maybeSingle();
  if (error) throw error;
  const row = tripImageSchema.array().max(10).parse(data?.images ?? []).find(image => image.sha256 === sha256);
  if (!row) throw new HttpError(404, "이미지를 찾을 수 없습니다.");
  return row;
}
export async function attachTripImage(tripId: string, input: unknown) {
  const client = await clientFor(tripId);
  const parsed = tripImageUploadSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "이미지 이름·PNG/JPEG 원본·출처 주소를 확인해 주세요.");
  const value = parsed.data, bytes = Buffer.from(value.base64, "base64");
  if (bytes.length > MAX_TRIP_IMAGE_BYTES || bytes.toString("base64") !== value.base64) throw new HttpError(400, "이미지는 최대 2 MiB입니다.");
  let width: number, height: number;
  try {
    const image = sharp(bytes, { limitInputPixels: 4096 * 4096 });
    const info = await image.metadata();
    if (info.format !== (value.mime === "image/png" ? "png" : "jpeg") || !info.width || !info.height || info.width > 4096 || info.height > 4096 || (info.pages ?? 1) > 1) throw new Error("Invalid image");
    await image.stats(); // Decode to reject corrupt files; keep the original bytes unchanged.
    width = info.width; height = info.height;
  } catch { throw new HttpError(400, "올바른 PNG/JPEG 이미지가 필요합니다. 최대 해상도는 4096×4096입니다."); }
  const image = tripImageSchema.parse({ ...value, width, height, sha256: createHash("sha256").update(bytes).digest("hex") });
  const { data, error } = await client.rpc("attach_trip_image", { p_trip: tripId, p_image: image });
  if (error) {
    if (error.code === "42501") throw new HttpError(404, "여행을 찾을 수 없습니다.");
    if (error.code === "22023") throw new HttpError(400, "이미지는 최대 10개, 전체 보관 자료는 최대 8 MiB까지 저장할 수 있습니다.");
    throw error;
  }
  return tripImageMetadataSchema.parse(data);
}
