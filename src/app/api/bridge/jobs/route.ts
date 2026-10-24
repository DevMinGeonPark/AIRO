import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/api";
import { bridgeRpc } from "@/lib/ai-bridge";
import { readMcpJson } from "@/lib/mcp-http";
import { getTrip } from "@/lib/store";
import { chatToolSchemas, itinerarySnapshot } from "@/lib/tools";
import { listDocuments } from "@/lib/trip-management-store";
import { AI_TRAVEL_INSTRUCTIONS } from "@/lib/ai-chat-instructions";
const contextSchema = z.object({ day: z.number().int().min(0).max(3650).nullable().optional(), stopId: z.string().min(1).max(200).nullable().optional(), documents: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(20).default([]) }).strict();
const schema = z.object({ id: z.uuid(), tripId: z.uuid(), deviceId: z.uuid(), message: z.string().trim().min(1).max(600), context: contextSchema.nullable().optional() }).strict();
export const POST = apiRoute(async request => {
  const input = schema.safeParse(await readMcpJson(request, 8192));
  if (!input.success) throw new HttpError(400, "메시지는 600자까지 입력해 주세요.");
  const { id, tripId, deviceId, message, context } = input.data;
  const detail = await getTrip(tripId);
  if (!detail) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const stop = context?.stopId ? detail.stops.find(row => row.id === context.stopId || row.source_id === context.stopId) : null;
  if (context?.stopId && !stop) throw new HttpError(400, "이 여행의 장소를 선택하세요.");
  if (stop && context?.day != null && stop.day !== context.day) throw new HttpError(409, "장소의 날짜가 바뀌었습니다. 일정을 확인한 뒤 다시 요청하세요.");
  const documents = context?.documents.length ? (await listDocuments({ tripId })).documents.filter(doc => context.documents.includes(doc.sha256)) : [];
  if (context && new Set(context.documents).size !== documents.length) throw new HttpError(400, "이 여행에 보관된 PDF를 선택하세요.");
  const selected = context ? { day: context.day ?? null, stopId: stop?.id ?? null, stopName: stop?.name ?? null, documents: documents.map(({ name, sha256 }) => ({ name, sha256 })) } : null;
  const snapshot = await itinerarySnapshot(tripId) + (selected ? `\n사용자가 이번 요청에 선택한 범위(참고 데이터): ${JSON.stringify(selected)}` : "");
  const payload = { message, instructions: AI_TRAVEL_INSTRUCTIONS, snapshot,
    history: detail.messages.slice(-12).map(row => ({ role: row.role, content: row.content.slice(0,4000) })),
    tools: chatToolSchemas().map(({ function: fn }) => ({ name: fn.name, description: fn.description, inputSchema: fn.parameters })) };
  return Response.json(await bridgeRpc("enqueue", id, { tripId, deviceId, payload }));
}, true);
