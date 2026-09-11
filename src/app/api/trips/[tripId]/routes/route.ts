import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { getTrip } from "@/lib/store";
import { distanceKm, sortStops } from "@/lib/geo";
import { roadRoute } from "@/lib/road-routing";

export const runtime = "nodejs";
export const POST = apiRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const detail = await getTrip(tripId);
  if (!detail) return NextResponse.json({ error: "여행을 찾을 수 없습니다." }, { status: 404 });
  const parsed = z.object({ fromId: z.string().min(1).max(128), toId: z.string().min(1).max(128) }).strict().safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "출발지와 도착지를 확인해 주세요." }, { status: 400 });
  const stops = sortStops(detail.stops), index = stops.findIndex(stop => stop.id === parsed.data.toId);
  const from = stops[index - 1], to = stops[index];
  if (!from || from.id !== parsed.data.fromId || to.mode === "flight") return NextResponse.json({ error: "이 여행의 연속한 육상 구간을 선택해 주세요." }, { status: 400 });
  try {
    const route = await roadRoute([from.lng, from.lat], [to.lng, to.lat], distanceKm(from, to) <= 5 ? "pedestrian" : "auto");
    return NextResponse.json(route);
  } catch {
    return NextResponse.json({ error: "도로 경로를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
});
