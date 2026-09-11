import { apiRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { revokeApiKey } from "@/lib/store";

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await revokeApiKey(id);
  return NextResponse.json({ ok: true });
}

export const DELETE = apiRoute(handleDELETE);
