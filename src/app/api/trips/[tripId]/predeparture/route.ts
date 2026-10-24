import { apiRoute, HttpError } from "@/lib/api";
import { getTrip } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { defaultPredeparture, predepartureSchema } from "@/lib/predeparture";

type Context = { params: Promise<{ tripId: string }> };
async function clientFor(tripId: string) {
  if (!await getTrip(tripId)) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const client = await createClient();
  if (!client) throw new HttpError(503, "Todo 저장에는 계정 연결이 필요합니다.");
  return client;
}
export const GET = apiRoute(async (_request: Request, { params }: Context) => {
  const { tripId } = await params;
  const client = await clientFor(tripId);
  const { data, error } = await client.from("trip_archives").select("data->predepartureChecklist").eq("trip_id", tripId).maybeSingle();
  if (error) throw error;
  return Response.json(predepartureSchema.parse(data?.predepartureChecklist ?? defaultPredeparture()));
}, true);

export const PUT = apiRoute(async (request: Request, { params }: Context) => {
  const { tripId } = await params;
  const client = await clientFor(tripId);
  // Bound the stream itself, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Todo 목록이 필요합니다.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 131072) { await reader.cancel(); throw new HttpError(413, "Todo 목록이 너무 큽니다."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const value = predepartureSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (!value.success) throw new HttpError(400, "항목은 100개까지, 이름은 200자까지 입력해 주세요.");
  const { data, error } = await client.rpc("update_trip_predeparture", { p_trip: tripId, p_value: value.data, p_revision: value.data.revision });
  if (error) {
    if (error.code === "40001") throw new HttpError(409, "다른 곳에서 Todo가 변경됐어요. 작성한 내용은 유지됩니다. 최신 목록을 확인한 뒤 다시 수정해 주세요.");
    if (error.code === "42501") throw new HttpError(404, "여행을 찾을 수 없습니다.");
    if (error.code === "22023") throw new HttpError(400, "Todo 항목을 확인해 주세요.");
    throw error;
  }
  return Response.json(predepartureSchema.parse(data));
}, true);
