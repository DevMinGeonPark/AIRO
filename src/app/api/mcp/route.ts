import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { actorStore } from "@/lib/actor";
import { authenticateMcp } from "@/lib/mcp-auth";
import { createAiroMcpServer } from "@/lib/mcp-server";
import { mcpMetadataUrl, mcpOAuthEnabled, mcpOriginAllowed } from "@/lib/mcp-config";
import { readMcpJson } from "@/lib/mcp-http";
import { toolDefinitions, type ToolName } from "@/lib/tool-contracts";
import { runTool } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const rpcError = (status: number, message: string, headers: Record<string, string> = {}, code = -32000) => Response.json(
  { jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } },
);
const challenge = (error?: string) => `Bearer realm="airo"${mcpOAuthEnabled ? `, resource_metadata="${mcpMetadataUrl}", scope="openid"` : ""}${error ? `, error="${error}"` : ""}`;
function finish(response: Response, request: Request) {
  response.headers.set("Cache-Control", "private, no-store");
  const origin = request.headers.get("origin");
  if (origin && mcpOriginAllowed(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Protocol-Version");
  }
  return response;
}

async function handle(request: Request) {
  if (!mcpOriginAllowed(request.headers.get("origin"))) return rpcError(403, "허용되지 않은 Origin입니다.");
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  try {
    const actor = token ? await authenticateMcp(token) : null;
    if (!actor) return finish(rpcError(401, "아이로 계정을 연결하거나 유효한 API 키를 사용하세요.", { "WWW-Authenticate": challenge(token ? "invalid_token" : undefined) }), request);
    if (request.method !== "POST") return finish(rpcError(405, "상태 없는 MCP 서버입니다. POST를 사용하세요.", { Allow: "POST, OPTIONS" }), request);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return finish(rpcError(415, "Content-Type: application/json이 필요합니다."), request);
    const parsedBody = await readMcpJson(request);
    if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
      const body = parsedBody as { method?: string; params?: { name?: string } };
      if (body.method === "tools/call" && typeof body.params?.name === "string" && Object.hasOwn(toolDefinitions, body.params.name) &&
          !actor.permissions.includes(toolDefinitions[body.params.name as ToolName].permission)) {
        return finish(rpcError(403, "조회 전용 연결입니다. 아이로의 MCP 연결 설정에서 일정 편집 권한을 허용하세요.", { "WWW-Authenticate": challenge("insufficient_scope") }), request);
      }
    }
    return await actorStore.run(actor, async () => {
      if (actor.client) {
        const quota = await actor.client.rpc("consume_mcp_request");
        if (quota.error) throw new Error("MCP 요청 한도를 확인하지 못했습니다.");
        if (quota.data !== true) return finish(rpcError(429, "MCP 요청이 많습니다. 잠시 후 다시 시도하세요.", { "Retry-After": "60" }), request);
      }
      const server = createAiroMcpServer(runTool, actor.permissions);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await server.connect(transport);
        return finish(await transport.handleRequest(request, { parsedBody }), request);
      } finally { await server.close(); }
    });
  } catch (error) {
    const status = error instanceof RangeError ? 413 : error instanceof SyntaxError ? 400 : 503;
    return finish(rpcError(status, status === 503 ? "MCP 서비스를 사용할 수 없습니다. 연결 설정을 확인하거나 잠시 후 다시 시도하세요." : error instanceof Error ? error.message : "잘못된 요청입니다.", {}, error instanceof SyntaxError ? -32700 : -32000), request);
  }
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export async function OPTIONS(request: Request) {
  if (!mcpOriginAllowed(request.headers.get("origin"))) return rpcError(403, "허용되지 않은 Origin입니다.");
  return finish(new Response(null, { status: 204, headers: {
    Allow: "POST, OPTIONS", "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID", "Access-Control-Max-Age": "600",
  } }), request);
}
