import { NextResponse } from "next/server";
import { localAuth, siteUrl } from "@/lib/supabase/config";
import { checkPassword, sessionCookie } from "@/lib/supabase/local";
import { safeNext } from "@/lib/auth-redirect";

/** Community edition owner login. Origin is checked in proxy.ts. */
export async function POST(request: Request) {
  if (!localAuth) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const password = form?.get("password"), next = safeNext(typeof form?.get("next") === "string" ? String(form.get("next")) : null);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const result = typeof password === "string" && password.length <= 256 ? checkPassword(password, ip) : "bad";
  const origin = process.env.NODE_ENV === "production" ? siteUrl : new URL(request.url).origin;
  if (result !== "ok") {
    const url = new URL("/login", origin);
    url.searchParams.set("next", next);
    url.searchParams.set("error", result === "limited" ? "rate_limit" : "password");
    return NextResponse.redirect(url, 303);
  }
  const response = NextResponse.redirect(new URL(next, origin), 303);
  response.cookies.set(sessionCookie(new URL(origin).protocol === "https:"));
  return response;
}
