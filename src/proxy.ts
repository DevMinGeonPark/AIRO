import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  supabaseConfigured,
  demoEnabled,
} from "@/lib/supabase/config";

/**
 * /app/* 보호 + 세션 쿠키 갱신.
 * Supabase 미설정이면 데모 모드라 통과시킨다 (로그인 없이 UI 확인 가능).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const privatePage = path === "/app" || path.startsWith("/app/");
  const api = path.startsWith("/api/");
  if (((api && path !== "/api/mcp") || path === "/auth/signout") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const allowed = [request.nextUrl.origin, process.env.NEXT_PUBLIC_SITE_URL];
    if ((origin && !allowed.includes(origin)) || request.headers.get("sec-fetch-site") === "cross-site")
      return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  if (!supabaseConfigured) {
    if (!demoEnabled && api) return NextResponse.json({ error: "로그인 서비스를 준비하고 있습니다." }, { status: 503 });
    if (!demoEnabled && privatePage) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }
  // MCP authenticates its own Bearer token; public pages need no auth request.
  if (path === "/api/mcp" || path === "/api/bridge/worker" || (!api && !privatePage)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list)
          response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && (privatePage || api)) {
    if (api) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg)$).*)"],
};
