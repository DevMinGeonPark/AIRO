import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  const origin = process.env.NODE_ENV === "production" ? siteUrl : request.url;
  return NextResponse.redirect(new URL("/", origin), { status: 303 });
}
