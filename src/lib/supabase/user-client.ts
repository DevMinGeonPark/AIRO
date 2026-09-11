import "server-only";
import { createHmac } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";
export const canActAsUser = Boolean(JWT_SECRET);

const b64 = (v: object | string) =>
  Buffer.from(typeof v === "string" ? v : JSON.stringify(v))
    .toString("base64url");

/**
 * 그 사용자 본인의 JWT 를 발급한다. service_role 이 아니라 authenticated 토큰이라
 * 이후 모든 질의에 RLS 가 그대로 적용된다 — 남의 데이터는 애초에 안 보인다.
 * ponytail: 15분 만료. MCP 요청은 짧으니 갱신 로직은 두지 않았다.
 */
function signUserJwt(userId: string, keyId?: string) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 15 * 60,
    ...(keyId ? { airo_key_id: keyId } : {}),
  });
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** 해당 사용자 권한으로만 동작하는 Supabase 클라이언트. */
export function createUserClient(userId: string, keyId?: string) {
  if (!JWT_SECRET) return null;
  return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signUserJwt(userId, keyId)}` } },
  });
}
