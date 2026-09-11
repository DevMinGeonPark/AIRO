import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { siteUrl, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/config";
import { authCallbackUrl, authNextCookie, isCanonicalAuthHost, loginUrl } from "@/lib/auth-flow";
import { safeNext } from "@/lib/auth-redirect";
import { googleAuthStatus } from "@/lib/google-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const origin = process.env.NODE_ENV === "production" ? siteUrl : url.origin;
  if (process.env.NODE_ENV === "production" && !isCanonicalAuthHost(request.headers, siteUrl)) {
    const canonical = new URL("/auth/google", siteUrl);
    canonical.searchParams.set("next", next);
    return NextResponse.redirect(canonical);
  }
  const fail = (error: string) => NextResponse.redirect(loginUrl(origin, next, error), 303);
  if (!supabaseConfigured) return fail("unavailable");
  const status = await googleAuthStatus();
  if (status !== "enabled") return fail(status === "disabled" ? "google_disabled" : "unavailable");
  try {
    const supabase = await createClient();
    if (!supabase) return fail("unavailable");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(origin), skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
    });
    if (error || !data.url || new URL(data.url).origin !== new URL(SUPABASE_URL).origin) return fail("unavailable");
    const store = await cookies();
    store.set(authNextCookie(next, origin));
    return NextResponse.redirect(data.url, 303);
  } catch { return fail("unavailable"); }
}
