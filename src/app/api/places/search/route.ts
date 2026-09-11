import { apiRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { searchPlaces, type BBox } from "@/lib/places";

export const runtime = "nodejs";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** 서버 전용 프록시. 외부 지오코더를 클라이언트에 직접 노출하지 않는다. */
async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    near?: { lat?: number; lng?: number };
    bbox?: number[];
    limit?: number;
  };
  const query = typeof body.query === "string" ? body.query : "";
  const lat = num(body.near?.lat);
  const lng = num(body.near?.lng);
  const near = lat !== null && lng !== null ? { lat, lng } : undefined;
  const bbox =
    Array.isArray(body.bbox) && body.bbox.length === 4 && body.bbox.every((v) => num(v) !== null)
      ? (body.bbox.map(Number) as BBox)
      : undefined;

  const result = await searchPlaces(query, near, num(body.limit) ?? 10, bbox);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}

export const POST = apiRoute(handlePOST);
