import "server-only";
import { createClient, getUser } from "./supabase/server";
import { mcpOAuthEnabled } from "./mcp-config";
import type { McpConnection } from "./types";

export async function listMcpConnections(): Promise<McpConnection[]> {
  if (!mcpOAuthEnabled) return [];
  const client = (await createClient())!;
  const { data, error } = await client.from("mcp_connections").select("client_id,client_name,redirect_uri,permissions,authorized_at,revoked_at").order("authorized_at", { ascending: false });
  if (error) throw new Error("연결한 도구를 불러오지 못했습니다.");
  return data ?? [];
}

export async function changeMcpConnection(clientId: string, action: "read" | "write" | "revoke") {
  const user = await getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const client = (await createClient())!;
  const patch = action === "revoke" ? { revoked_at: new Date().toISOString() } : { permissions: action === "write" ? ["trips:read", "trips:write"] : ["trips:read"] };
  let query = client.from("mcp_connections").update(patch).eq("user_id", user.id).eq("client_id", clientId);
  if (action !== "revoke") query = query.is("revoked_at", null);
  const result = await query.select("client_id");
  if (result.error || !result.data?.length) throw new Error("연결 정보를 변경하지 못했습니다.");
  if (action === "revoke") {
    // Local permission is revoked first, even if the identity provider is unavailable.
    const revoked = await client.auth.oauth.revokeGrant({ clientId });
    if (revoked.error) return { ok: true, warning: "아이로 접근은 차단했습니다. 로그인 제공자의 연결 해제를 완료하려면 연결 해제를 한 번 더 눌러 주세요." };
  }
  return { ok: true };
}
