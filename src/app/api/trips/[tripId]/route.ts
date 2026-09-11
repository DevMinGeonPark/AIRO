import { apiRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { addStop, deleteTrip, getTrip, updateTrip } from "@/lib/store";
import { stopInputSchema } from "@/lib/archive";
import { z } from "zod";
import { createHash } from "node:crypto";

/** 채팅 도구가 일정을 바꾼 뒤 클라이언트가 다시 읽어가는 경로. */
async function handleGET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const detail = await getTrip(tripId);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  const etag = `"${createHash("sha256").update(JSON.stringify(detail)).digest("hex")}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return NextResponse.json(detail, { headers: { "cache-control": "no-store", ETag: etag } });
}

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  if (!await getTrip(tripId)) return NextResponse.json({ error: "여행을 찾을 수 없습니다." }, { status: 404 });
  await deleteTrip(tripId);
  return NextResponse.json({ ok: true });
}

/** 검색 결과에서 고른 장소를 일정에 담는다. 채팅 도구와 같은 구현을 쓴다. */
async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  if (!await getTrip(tripId)) return NextResponse.json({ error: "여행을 찾을 수 없습니다." }, { status: 404 });
  const parsed = stopInputSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "이름, 좌표, 일차를 확인해 주세요." }, { status: 400 });
  try {
    const result = { ok: true, stop: await addStop(tripId, parsed.data) };
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

export const GET = apiRoute(handleGET);
export const DELETE = apiRoute(handleDELETE);
export const POST = apiRoute(handlePOST);

export const PATCH = apiRoute(async (req: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  if (!await getTrip(tripId)) return NextResponse.json({ error: "여행을 찾을 수 없습니다." }, { status: 404 });
  const parsed = z.object({ title: z.string().trim().min(1).max(120).optional(), start_date: z.iso.date().nullable().optional() }).strict().safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "제목과 시작일을 확인해 주세요." }, { status: 400 });
  return NextResponse.json({ trip: await updateTrip(tripId, parsed.data) });
});
