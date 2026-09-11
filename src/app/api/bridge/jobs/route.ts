import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/api";
import { bridgeRpc } from "@/lib/ai-bridge";
import { readMcpJson } from "@/lib/mcp-http";
import { getTrip } from "@/lib/store";
import { chatToolSchemas, itinerarySnapshot } from "@/lib/tools";
import { AI_TRAVEL_INSTRUCTIONS } from "@/lib/ai-chat-instructions";
const schema = z.object({ id: z.uuid(), tripId: z.uuid(), deviceId: z.uuid(), message: z.string().trim().min(1).max(600) }).strict();
export const POST = apiRoute(async request => {
  const input = schema.safeParse(await readMcpJson(request, 8192));
  if (!input.success) throw new HttpError(400, "메시지는 600자까지 입력해 주세요.");
  const { id, tripId, deviceId, message } = input.data;
  const detail = await getTrip(tripId);
  if (!detail) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const payload = { message, instructions: AI_TRAVEL_INSTRUCTIONS, snapshot: await itinerarySnapshot(tripId),
    history: detail.messages.slice(-12).map(row => ({ role: row.role, content: row.content.slice(0,4000) })),
    tools: chatToolSchemas().map(({ function: fn }) => ({ name: fn.name, description: fn.description, inputSchema: fn.parameters })) };
  return Response.json(await bridgeRpc("enqueue", id, { tripId, deviceId, payload }));
}, true);
