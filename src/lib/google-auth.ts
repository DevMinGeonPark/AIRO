import "server-only";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured, localAuth } from "./supabase/config";

/** Read the provider setting so enabling Google takes effect without a rebuild. */
export async function googleAuthStatus(): Promise<"enabled" | "disabled" | "unavailable"> {
  if (!supabaseConfigured || localAuth) return "disabled";
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY }, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "unavailable";
    const settings = await response.json();
    return settings.external?.google === true ? "enabled" : "disabled";
  } catch { return "unavailable"; }
}
