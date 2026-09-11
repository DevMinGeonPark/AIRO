import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";
import { AUTH_NEXT_COOKIE, authNext, authNextCookie, loginUrl } from "@/lib/auth-flow";

/** 매직링크·OAuth 가 돌아오는 지점. code 를 세션 쿠키로 교환한다. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.NODE_ENV === "production" ? new URL(siteUrl).origin : url.origin;
  const code = url.searchParams.get("code");
  const store = await cookies();
  const next = authNext(store.get(AUTH_NEXT_COOKIE)?.value, url.searchParams.get("next"));
  store.set({ ...authNextCookie(null, origin), value: "", maxAge: 0 });

  if (code) {
    try {
      const supabase = await createClient();
      if (supabase) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return NextResponse.redirect(new URL(next, origin));
      }
    } catch { /* Return a retry path, including the original MCP consent request. */ }
  }
  return NextResponse.redirect(loginUrl(origin, next, url.searchParams.get("error") === "access_denied" ? "cancelled" : "auth"));
}
