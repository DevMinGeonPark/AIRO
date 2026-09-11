import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { localAuth, siteUrl } from "@/lib/supabase/config";
import { SESSION_COOKIE } from "@/lib/supabase/local";

export async function POST(request: Request) {
  const origin = process.env.NODE_ENV === "production" ? siteUrl : request.url;
  const response = NextResponse.redirect(new URL("/", origin), { status: 303 });
  if (localAuth) { response.cookies.delete(SESSION_COOKIE); return response; }
  const supabase = await createClient();
  await supabase?.auth.signOut();
  return response;
}
