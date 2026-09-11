import { z } from "zod";
import { NextResponse } from "next/server";
import { apiRoute, HttpError } from "@/lib/api";
import { getTrip } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

const placeSchema = z.object({
  id: z.string().min(1).max(200), name: z.string().trim().min(1).max(300),
  lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180),
  address: z.string().max(2000).default(""), category: z.string().max(200).default("place"),
  website: z.url().refine(url => /^https?:\/\//i.test(url)).nullish(),
  day: z.number().int().min(0).max(3650),
});

export const POST = apiRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  if (!trip) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "장소 정보를 입력해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new HttpError(413, "장소 정보가 너무 큽니다."); }
    chunks.push(value);
  }
  const parsed = placeSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (!parsed.success) throw new HttpError(400, "장소 정보를 확인해 주세요.");
  const place = parsed.data;
  const host = trip.stops.find(stop => stop.day === place.day);
  const client = (await createClient())!;
  const { data, error } = await client.rpc("save_trip_place", { p_trip: tripId, p_place: {
    id: place.id, name: place.name, lat: place.lat, lng: place.lng, day: place.day,
    stopId: host?.id ?? "", kind: place.category, cuisine: place.category, addr: place.address,
    website: place.website ?? null, source: "search",
  } });
  if (error?.code === "22023") throw new HttpError(400, "저장할 수 있는 장소 정보인지 확인해 주세요.");
  if (error) throw new Error(error.message);
  return NextResponse.json(data);
}, true);
