import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, localAuth, supabaseConfigured } from "./supabase/config";
import type { Actor } from "./actor";
import { localSession, localAnonKey, localClientOptions } from "./supabase/local";

/** Verify with Auth, then forward the original user JWT to Postgres so RLS still applies. */
export async function mobileActor(authorization: string): Promise<Actor | null> {
  const match = /^Bearer ([^\s,]+)$/i.exec(authorization);
  if (!match || match[1].length > 16384 || !supabaseConfigured) return null;
  const token = match[1];
  if (localAuth) {
    const owner = localSession(token);
    if (!owner) return null;
    return { userId: owner.id, client: createClient(SUPABASE_URL, localAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { ...localClientOptions().global, headers: { Authorization: `Bearer ${token}` } },
    }) };
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || data.user.role !== "authenticated") return null;
  return { userId: data.user.id, client };
}
