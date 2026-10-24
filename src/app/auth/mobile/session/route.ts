import { NextResponse } from "next/server";
import { z } from "zod";
import { localAuth } from "@/lib/supabase/config";
import { checkPassword, localConfigured, localSessionClaims, OWNER_ID, ownerEmail, sessionCookie } from "@/lib/supabase/local";
import { readMcpJson } from "@/lib/mcp-http";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), password: z.string().min(1).max(256) }).strict(),
  z.object({ action: z.literal("refresh") }).strict(),
]);
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (!localAuth) return NextResponse.json({ error: "자체 서버에서만 사용할 수 있습니다." }, { status: 404, headers });
  if (!localConfigured) return NextResponse.json({ error: "서버 로그인 설정을 확인해 주세요." }, { status: 503, headers });
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await readMcpJson(request, 2048)); }
  catch { return NextResponse.json({ error: "로그인 정보를 확인해 주세요." }, { status: 400, headers }); }
  if (body.action === "login") {
    const result = checkPassword(body.password);
    if (result !== "ok") return NextResponse.json({ error: result === "limited" ? "요청이 많아요. 15분 뒤 다시 시도해 주세요." : "비밀번호를 확인해 주세요." }, { status: result === "limited" ? 429 : 401, headers });
  } else {
    const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.get("authorization") ?? "");
    if (!match || !localSessionClaims(match[1])) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401, headers });
  }
  const accessToken = sessionCookie(true).value;
  return NextResponse.json({ accessToken, refreshToken: "", expiresAt: localSessionClaims(accessToken)!.exp,
    user: { id: OWNER_ID, email: ownerEmail }, kind: "community" }, { headers });
}
