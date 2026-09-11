import { NextResponse } from "next/server";
import { apiRoute, HttpError } from "@/lib/api";
import { stopInputSchema } from "@/lib/archive";
import { getTrip, moveStop, removeStop } from "@/lib/store";
type Context = { params: Promise<{ tripId: string; stopId: string }> };
async function owned(context: Context) {
  const ids = await context.params;
  const detail = await getTrip(ids.tripId);
  if (!detail?.stops.some((s) => s.id === ids.stopId)) throw new HttpError(404, "일정을 찾을 수 없습니다.");
  return ids;
}
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  const { tripId, stopId } = await owned(context);
  const parsed = stopInputSchema.partial().strict().safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "이름, 좌표, 일차를 확인해 주세요.");
  return NextResponse.json({ stop: await moveStop(tripId, stopId, parsed.data) });
});
export const DELETE = apiRoute(async (_request: Request, context: Context) => {
  const { tripId, stopId } = await owned(context);
  await removeStop(tripId, stopId);
  return NextResponse.json({ ok: true });
});
