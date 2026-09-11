import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { localAuth, siteUrl } from "@/lib/supabase/config";
import { requestOrigin, SESSION_COOKIE } from "@/lib/supabase/local";

export async function POST(request: Request) {
  if (localAuth) {
    const response = NextResponse.redirect(new URL("/", requestOrigin(request)), { status: 303 });
    response.cookies.delete({ name: SESSION_COOKIE, path: "/" });
    return response;
  }
  const origin = process.env.NODE_ENV === "production" ? siteUrl : request.url;
  const response = NextResponse.redirect(new URL("/", origin), { status: 303 });
  const supabase = await createClient();
  await supabase?.auth.signOut();
  return response;
}
