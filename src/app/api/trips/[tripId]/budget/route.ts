import { NextResponse } from "next/server";
import { apiRoute, HttpError } from "@/lib/api";
import { getTrip } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { expenseBudgetSchema } from "@/lib/expense-budget";
import { getExpenseBudget } from "@/lib/expense-budget-store";

type Context = { params: Promise<{ tripId: string }> };
export const GET = apiRoute(async (_request: Request, { params }: Context) => {
  const { tripId } = await params;
  if (!await getTrip(tripId)) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  return NextResponse.json(await getExpenseBudget(tripId));
}, true);

export const PUT = apiRoute(async (request: Request, { params }: Context) => {
  const { tripId } = await params;
  if (!await getTrip(tripId)) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "예산을 입력해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 262144) { await reader.cancel(); throw new HttpError(413, "예산 자료가 너무 큽니다."); }
    chunks.push(value);
  }
  const parsed = expenseBudgetSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (!parsed.success) throw new HttpError(400, "항목 이름·금액·환율을 확인해 주세요. 최대 500개까지 저장할 수 있습니다.");
  // Older apps do not know reservationId. Preserve existing links when the field is omitted.
  const existing = await getExpenseBudget(tripId);
  const linked = expenseBudgetSchema.safeParse({ ...parsed.data, entries: parsed.data.entries.map(entry => ({
    ...entry, reservationId: entry.reservationId === undefined ? existing.entries.find(row => row.id === entry.id)?.reservationId : entry.reservationId,
  })) });
  if (!linked.success) throw new HttpError(400, "예약은 한 지출 항목에만 연결할 수 있습니다.");
  const { revision, ...budget } = linked.data;
  const client = (await createClient())!;
  const { data, error } = await client.rpc("update_trip_budget", { p_trip: tripId, p_budget: budget, p_revision: revision });
  if (error?.code === "40001") throw new HttpError(409, "다른 창에서 예산이 변경됐습니다. 최신 예산을 불러온 뒤 다시 저장해 주세요.");
  if (error?.code === "22023") throw new HttpError(400, "예산 항목의 형식을 확인해 주세요.");
  if (error) throw new Error(error.message);
  return NextResponse.json(expenseBudgetSchema.parse(data));
}, true);
