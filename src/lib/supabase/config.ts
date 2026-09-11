/**
 * Edition switch. `cloud` (default) = Supabase Auth + hosted plans (src/ee).
 * `community` = self-hosted single owner: password login, PostgREST straight
 * on your own PostgreSQL, no billing, unlimited trips. See SELF_HOSTING.md.
 */
export const edition: "cloud" | "community" =
  process.env.NEXT_PUBLIC_AIRO_EDITION === "community" ? "community" : "cloud";
export const localAuth = edition === "community";

/** community: PostgREST base URL (server only). cloud: Supabase project URL. */
export const SUPABASE_URL = (localAuth ? process.env.AIRO_POSTGREST_URL : process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when a real account store exists. community always has one (validated at client creation). */
export const supabaseConfigured = localAuth || Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Demo storage is only available on a development server. */
export const demoEnabled = !supabaseConfigured && process.env.NODE_ENV === "development";

/** Self-hosters set AIRO_SITE_URL at runtime; the build-time public value is the fallback. */
export const siteUrl =
  process.env.AIRO_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
