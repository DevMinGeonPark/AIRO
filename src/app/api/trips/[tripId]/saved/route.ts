import { z } from "zod";
import { NextResponse } from "next/server";
import { apiRoute, HttpError } from "@/lib/api";
import { getSavedPlaces } from "@/lib/archive-store";
import { getTrip } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
const schema = z.object({ ids: z.array(z.string().min(1).max(200)).max(10000), saved: z.boolean() });
export const POST = apiRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  if (!await getTrip(tripId)) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "즐겨찾기 형식이 올바르지 않습니다.");
  const { ids, saved } = parsed.data;
  const client = (await createClient())!;
  if (ids.length) {
    const query = saved
      ? client.from("saved_places").upsert([...new Set(ids)].map((place_id) => ({ trip_id: tripId, place_id })), { onConflict: "trip_id,place_id", ignoreDuplicates: true })
      : client.from("saved_places").delete().eq("trip_id", tripId).in("place_id", ids);
    const { error } = await query;
    if (error) throw new Error(error.message);
  }
  return NextResponse.json({ ids: await getSavedPlaces(tripId) });
}, true);
