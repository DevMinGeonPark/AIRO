import { apiRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { createTrip, listTrips } from "@/lib/store";
import { z } from "zod";

async function handleGET() {
  return NextResponse.json({ trips: await listTrips() });
}

async function handlePOST(req: Request) {
  const parsed = z.object({ title: z.string().trim().min(1).max(120), start_date: z.iso.date().nullable().optional() }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "제목과 시작일을 확인해 주세요." }, { status: 400 });
  const result = await createTrip(parsed.data.title, parsed.data.start_date ?? null);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}

export const GET = apiRoute(handleGET);
export const POST = apiRoute(handlePOST);
