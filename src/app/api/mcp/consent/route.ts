import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/api";
import { createClient, getUser } from "@/lib/supabase/server";
import { mcpOAuthEnabled } from "@/lib/mcp-config";
import { providerRedirect } from "@/lib/oauth-redirect";
import { siteUrl } from "@/lib/supabase/config";

export const POST = apiRoute(async (request: Request) => {
  if (!mcpOAuthEnabled) throw new HttpError(503, "OAuth 연결이 아직 활성화되지 않았습니다.");
  if (request.headers.get("origin") !== new URL(siteUrl).origin) throw new HttpError(403, "아이로 승인 화면에서 연결을 허용해 주세요.");
  const parsed = z.object({ authorizationId: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/), permission: z.enum(["read", "write"]), decision: z.enum(["approve", "deny"]) }).strict().safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "연결 요청을 확인하세요.");
  const { authorizationId, permission, decision } = parsed.data;
  const client = (await createClient())!, user = (await getUser())!;
  const details = await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error || !details.data) throw new HttpError(400, "연결 요청이 만료되었습니다. 다시 연결하세요.");
  if (!("authorization_id" in details.data)) return Response.json({ redirectUrl: providerRedirect(details.data.redirect_url) });
  if (details.data.user.id !== user.id) throw new HttpError(403, "이 계정의 연결 요청이 아닙니다.");
  if (decision === "approve") {
    const saved = await client.from("mcp_connections").upsert({
      user_id: user.id, client_id: details.data.client.id, client_name: details.data.client.name,
      redirect_uri: details.data.redirect_uri, permissions: permission === "write" ? ["trips:read", "trips:write"] : ["trips:read"],
      grant_version: crypto.randomUUID(), authorized_at: new Date().toISOString(), revoked_at: null,
    }, { onConflict: "user_id,client_id" });
    if (saved.error) throw new HttpError(503, "연결 권한을 저장하지 못했습니다.");
  }
  const result = await client.auth.oauth[decision === "approve" ? "approveAuthorization" : "denyAuthorization"](authorizationId, { skipBrowserRedirect: true });
  if (result.error || !result.data) throw new HttpError(400, "승인을 완료하지 못했습니다. 다시 연결해 주세요.");
  return Response.json({ redirectUrl: providerRedirect(result.data.redirect_url) });
}, true);
