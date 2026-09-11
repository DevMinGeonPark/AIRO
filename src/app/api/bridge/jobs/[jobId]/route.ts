import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/api";
import { bridgeRpc } from "@/lib/ai-bridge";
import { readMcpJson } from "@/lib/mcp-http";
import { tripToolRunner } from "@/lib/tools";
type Context = { params: Promise<{ jobId: string }> };
async function idFrom(context: Context) {
  const parsed = z.uuid().safeParse((await context.params).jobId);
  if (!parsed.success) throw new HttpError(400, "대화 주소가 올바르지 않습니다.");
  return parsed.data;
}
export const GET = apiRoute(async (_request, context: Context) => Response.json(await bridgeRpc("status", await idFrom(context))), true);
export const POST = apiRoute(async (request, context: Context) => {
  const id = await idFrom(context);
  const body = z.object({ action: z.enum(["tick", "cancel"]) }).strict().safeParse(await readMcpJson(request, 1024));
  if (!body.success) throw new HttpError(400, "요청을 확인해 주세요.");
  if (body.data.action === "cancel") return Response.json(await bridgeRpc("cancel", id));
  const call = await bridgeRpc("take_call", id) as { id: string; tripId: string; tool: string; arguments: Record<string,unknown> } | null;
  if (!call) return Response.json({ changed: false });
  let result: { success: boolean; data?: unknown; error?: string };
  try {
    const args = { ...call.arguments };
    if (["addStop", "moveStop", "removeStop", "reorderDay"].includes(call.tool)) args.requestId = `bridge-${call.id}`;
    result = { success: true, data: await tripToolRunner(call.tripId)(call.tool, args) };
  } catch (error) { result = { success: false, error: error instanceof Error ? error.message : "일정을 변경하지 못했습니다." }; }
  await bridgeRpc("finish_call", id, { callId: call.id, result });
  return Response.json({ changed: result.success });
}, true);
