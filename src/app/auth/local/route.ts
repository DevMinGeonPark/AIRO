import { NextResponse } from "next/server";
import { localAuth } from "@/lib/supabase/config";
import { checkPassword, localConfigured, requestOrigin, sessionCookie } from "@/lib/supabase/local";
import { safeNext } from "@/lib/auth-redirect";

/** Community edition owner login. Origin is checked in proxy.ts. */
export async function POST(request: Request) {
  if (!localAuth) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const password = form?.get("password"), next = safeNext(typeof form?.get("next") === "string" ? String(form.get("next")) : null);
  // Redirect and cookie flags follow the address the browser used, not AIRO_SITE_URL: self-hosters reach one server by several names.
  const origin = requestOrigin(request);
  // Misconfiguration must read as "server not ready", never as "wrong password".
  const result = !localConfigured ? "unavailable" : typeof password === "string" && password.length <= 256 ? checkPassword(password) : "bad";
  if (result !== "ok") {
    if (result === "unavailable") console.error("Community edition is missing AIRO_POSTGREST_URL, a 32+ char AIRO_JWT_SECRET or AIRO_OWNER_PASSWORD.");
    const url = new URL("/login", origin);
    url.searchParams.set("next", next);
    url.searchParams.set("error", result === "limited" ? "rate_limit" : result === "unavailable" ? "unavailable" : "password");
    return NextResponse.redirect(url, 303);
  }
  const response = NextResponse.redirect(new URL(next, origin), 303);
  response.cookies.set(sessionCookie(new URL(origin).protocol === "https:"));
  return response;
}
