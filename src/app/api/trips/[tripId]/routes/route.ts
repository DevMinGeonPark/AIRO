import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { getTrip } from "@/lib/store";
import { distanceKm, sortStops } from "@/lib/geo";
import { roadRoute } from "@/lib/road-routing";
import { choicePreviewStop } from "@/lib/stop-choices";
import { remainingRoadPair } from "@/lib/remaining-itinerary";

export const runtime = "nodejs";
export const POST = apiRoute(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const detail = await getTrip(tripId);
  if (!detail) return NextResponse.json({ error: "여행을 찾을 수 없습니다." }, { status: 404 });
  const parsed = z.object({ fromId: z.string().min(1).max(128), toId: z.string().min(1).max(128), fromCandidateId: z.string().min(1).max(128).optional(), toCandidateId: z.string().min(1).max(128).optional() }).strict().safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "출발지와 도착지를 확인해 주세요." }, { status: 400 });
  let invalid = false;
  const preview = detail.stops.map(stop => {
    const candidateId = stop.id === parsed.data.fromId ? parsed.data.fromCandidateId : stop.id === parsed.data.toId ? parsed.data.toCandidateId : undefined;
    if (!candidateId) return stop;
    const candidate = stop.choice?.candidates.find(c => c.id === candidateId);
    if (!candidate) { invalid = true; return stop; }
    return choicePreviewStop(stop, candidate);
  });
  if (invalid) return NextResponse.json({ error: "이 일정의 후보를 확인해 주세요." }, { status: 400 });
  const pair = remainingRoadPair(sortStops(preview), parsed.data.fromId, parsed.data.toId);
  if (!pair) return NextResponse.json({ error: "이 여행에서 순서대로 이어지는 육상 장소를 선택해 주세요." }, { status: 400 });
  const { from, to } = pair;
  try {
    const route = await roadRoute([from.lng, from.lat], [to.lng, to.lat], distanceKm(from, to) <= 5 ? "pedestrian" : "auto");
    return NextResponse.json(route);
  } catch {
    return NextResponse.json({ error: "도로 경로를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
});
