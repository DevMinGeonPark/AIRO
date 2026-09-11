import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { siteUrl, supabaseConfigured } from "@/lib/supabase/config";
import { authCallbackUrl, authNextCookie, isCanonicalAuthHost, loginErrors, loginUrl } from "@/lib/auth-flow";
import { safeNext } from "@/lib/auth-redirect";

export async function POST(request: Request) {
  const origin = process.env.NODE_ENV === "production" ? new URL(siteUrl).origin : new URL(request.url).origin;
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  const fail = (code: string, status: number) => NextResponse.json({ error: loginErrors[code], code }, { status });
  if (!supabaseConfigured) return fail("unavailable", 503);
  if (Number(request.headers.get("content-length")) > 4096) return fail("invalid_email", 413);
  let data: { email?: unknown; next?: unknown };
  try {
    const text = await request.text();
    if (text.length > 4096) return fail("invalid_email", 413);
    data = JSON.parse(text);
    if (!data || typeof data !== "object") return fail("invalid_email", 400);
  } catch { return fail("invalid_email", 400); }
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const next = safeNext(typeof data.next === "string" ? data.next : null);
  if (process.env.NODE_ENV === "production" && !isCanonicalAuthHost(request.headers, siteUrl)) {
    return NextResponse.json({ error: "아이로 공식 주소에서 로그인을 시작해 주세요.", loginUrl: loginUrl(siteUrl, next).href }, { status: 409 });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("invalid_email", 400);
  try {
    const supabase = await createClient();
    if (!supabase) return fail("unavailable", 503);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: authCallbackUrl(origin) } });
    if (error) return fail(error.status === 429 ? "rate_limit" : "unavailable", error.status === 429 ? 429 : 503);
    (await cookies()).set(authNextCookie(next, origin));
    return NextResponse.json({ message: "메일함을 확인하세요. 로그인 링크를 보냈어요. 지금 이 브라우저에서 링크를 열어 주세요." });
  } catch { return fail("unavailable", 503); }
}
