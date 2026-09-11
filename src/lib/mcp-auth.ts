import "server-only";
import { createClient } from "@supabase/supabase-js";
import { resolveApiKey } from "./store";
import { canActAsUser, createUserClient } from "./supabase/user-client";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./supabase/config";
import { mcpIssuer, mcpOAuthEnabled, mcpResource } from "./mcp-config";
import { validMcpPermissions, verifiedMcpIdentity } from "./mcp-claims";

export async function authenticateMcp(token: string) {
  if (!token || token.length > 16384) return null;
  if (token.startsWith("airo_")) {
    const key = await resolveApiKey(token);
    if (!key) return null;
    if (supabaseConfigured && !canActAsUser) throw new Error("API 키 인증을 위한 서버 서명 설정이 필요합니다.");
    const permissions = validMcpPermissions(key.scopes);
    if (!permissions) return null;
    return { userId: key.userId, client: supabaseConfigured ? createUserClient(key.userId, key.keyId) : null, permissions };
  }
  if (!mcpOAuthEnabled) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  // getClaims verifies the signature and expiry. Never trust a merely decoded JWT.
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims) return null;
  const identity = verifiedMcpIdentity(data.claims, mcpIssuer, mcpResource);
  if (!identity) return null;
  // Read the current grant on every request: revocation/downgrades are immediate.
  const grant = await client.rpc("mcp_connection_permissions");
  if (grant.error) throw new Error("MCP 연결 권한을 확인하지 못했습니다.");
  const permissions = validMcpPermissions(grant.data);
  if (!permissions) return null;
  return { userId: identity.userId, client, permissions };
}
