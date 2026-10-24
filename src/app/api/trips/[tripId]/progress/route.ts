import { apiRoute, HttpError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { getTrip } from "@/lib/store";
import { emptyItineraryProgress, itineraryProgressSchema, progressMutationSchema } from "@/lib/itinerary-progress";
import { readMcpJson } from "@/lib/mcp-http";

type Context = { params: Promise<{ tripId: string }> };
async function clientFor(tripId: string) {
  if (!await getTrip(tripId)) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const client = await createClient();
  if (!client) throw new HttpError(503, "일정 진행 저장에는 계정 연결이 필요합니다.");
  return client;
}
export const GET = apiRoute(async (_request: Request, { params }: Context) => {
  const { tripId } = await params, client = await clientFor(tripId);
  const { data, error } = await client.from("trip_archives").select("data->itineraryProgress").eq("trip_id", tripId).maybeSingle();
  if (error) throw error;
  return Response.json(itineraryProgressSchema.parse(data?.itineraryProgress ?? emptyItineraryProgress()));
}, true);
export const PATCH = apiRoute(async (request: Request, { params }: Context) => {
  const { tripId } = await params, client = await clientFor(tripId);
  let input: unknown;
  try { input = await readMcpJson(request, 8192); } catch (error) { if (error instanceof RangeError) throw new HttpError(413, "요청이 너무 큽니다."); throw error; }
  const parsed = progressMutationSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "일정과 자동 체크 조건을 확인해 주세요.");
  const { revision, ...action } = parsed.data;
  const { data, error } = await client.rpc("mutate_trip_progress", { p_trip: tripId, p_action: action, p_revision: revision });
  if (error) {
    if (error.code === "40001") throw new HttpError(409, "다른 곳에서 진행 상태가 바뀌었어요. 최신 상태를 불러왔으니 다시 확인해 주세요.");
    if (error.code === "42501") throw new HttpError(404, "여행을 찾을 수 없습니다.");
    if (error.code === "22023") throw new HttpError(400, "자동 체크에는 여행 시작일이 필요하고, 시간 체크에는 HH:mm 형식의 일정 시간이 필요합니다.");
    throw error;
  }
  return Response.json(itineraryProgressSchema.parse(data));
}, true);
