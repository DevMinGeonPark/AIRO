import { mcpOAuthEnabled, mcpResourceMetadata } from "@/lib/mcp-config";
export const dynamic = "force-dynamic";
export function GET() {
  if (!mcpOAuthEnabled) return Response.json({ error: "OAuth 연결이 아직 활성화되지 않았습니다." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(mcpResourceMetadata(), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
