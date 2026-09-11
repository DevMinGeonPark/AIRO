import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, localAuth } from "./config";
import { localAnonKey, localClientOptions, signHs256 } from "./local";

// community: the same secret PostgREST verifies; cloud: the project's legacy JWT secret.
const JWT_SECRET = (localAuth ? process.env.AIRO_JWT_SECRET : process.env.SUPABASE_JWT_SECRET) ?? "";
export const canActAsUser = Boolean(JWT_SECRET);

/**
 * 그 사용자 본인의 JWT 를 발급한다. service_role 이 아니라 authenticated 토큰이라
 * 이후 모든 질의에 RLS 가 그대로 적용된다 — 남의 데이터는 애초에 안 보인다.
 * ponytail: 15분 만료. MCP 요청은 짧으니 갱신 로직은 두지 않았다.
 */
const signUserJwt = (userId: string, keyId?: string) =>
  signHs256({ sub: userId, role: "authenticated", ...(keyId ? { airo_key_id: keyId } : {}) }, JWT_SECRET, 15 * 60);

/** 해당 사용자 권한으로만 동작하는 Supabase 클라이언트. */
export function createUserClient(userId: string, keyId?: string) {
  if (!JWT_SECRET) return null;
  return createSupabaseClient(SUPABASE_URL, localAuth ? localAnonKey() : SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signUserJwt(userId, keyId)}` }, ...localClientOptions().global },
  });
}

/** 세션 없는 호출(키 조회, 브리지 워커)용 anon 클라이언트. security definer RPC 만 부른다. */
export function createAnonClient() {
  return createSupabaseClient(SUPABASE_URL, localAuth ? localAnonKey() : SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...localClientOptions(),
  });
}
