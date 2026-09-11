import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/api";
import { bridgeRpc } from "@/lib/ai-bridge";
import { readMcpJson } from "@/lib/mcp-http";
export const GET = apiRoute(async () => Response.json({ devices: await bridgeRpc("devices") }), true);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pair"), id: z.uuid(), key: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal("revoke"), id: z.uuid() }).strict(),
]);
export const POST = apiRoute(async request => {
  const parsed = input.safeParse(await readMcpJson(request, 4096));
  if (!parsed.success) throw new HttpError(400, "연결 정보를 확인해 주세요.");
  const body = parsed.data;
  return Response.json(await bridgeRpc(body.action, body.id, body.action === "pair" ? { name: body.name } : {}, body.action === "pair" ? body.key : null));
}, true);
