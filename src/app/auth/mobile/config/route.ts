import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured, localAuth } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/** Public client configuration only: the same publishable values shipped in the web bundle. */
export function GET() {
  if (localAuth) return NextResponse.json({ edition: "community", redirectUri: "com.heptivision.airo://auth/callback" }, { headers: { "Cache-Control": "no-store" } });
  if (!supabaseConfigured) return NextResponse.json({ error: "로그인 서버를 준비하고 있습니다." }, { status: 503 });
  return NextResponse.json({
    edition: "cloud",
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    redirectUri: "com.heptivision.airo://auth/callback",
  }, { headers: { "Cache-Control": "no-store" } });
}
