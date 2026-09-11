import { apiRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { createApiKey, listApiKeys } from "@/lib/store";
import { z } from "zod";
import { mcpApiKeyEnabled } from "@/lib/mcp-config";

async function handleGET() {
  return NextResponse.json({ keys: await listApiKeys() });
}

async function handlePOST(req: Request) {
  if (!mcpApiKeyEnabled) return NextResponse.json({ error: "API 키 연결은 준비 중입니다. 로그인으로 연결해 주세요." }, { status: 503 });
  const parsed = z.object({ name: z.string().trim().min(1).max(60), readOnly: z.boolean().optional(), expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).optional() }).strict().safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "키 이름·권한·유효 기간을 확인하세요." }, { status: 400 });
  const { name, ...options } = parsed.data;
  const result = await createApiKey(name, options);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  // 원문 토큰은 여기서 딱 한 번만 나간다.
  return NextResponse.json(result, { status: 201 });
}

export const GET = apiRoute(handleGET);
export const POST = apiRoute(handlePOST);
