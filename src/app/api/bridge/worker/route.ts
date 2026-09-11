import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured } from "@/lib/supabase/config";
import { readMcpJson } from "@/lib/mcp-http";
const input = z.object({ op: z.enum(["heartbeat", "next", "progress", "call", "complete", "fail"]), id: z.uuid(), data: z.record(z.string(), z.unknown()).default({}) }).strict();
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!supabaseConfigured) return Response.json({ error: "연결 준비 중입니다." }, { status: 503, headers });
  const key = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!key) return Response.json({ error: "DEVICE_UNAUTHORIZED" }, { status: 401, headers });
  try {
    const parsed = input.safeParse(await readMcpJson(request, 131072));
    if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400, headers });
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { op, id, data } = parsed.data;
    const result = await client.rpc("ai_bridge", { p_op: `worker_${op}`, p_id: id, p_key: key, p_data: data });
    if (result.error) return Response.json({ error: result.error.message.includes("DEVICE_UNAUTHORIZED") ? "DEVICE_UNAUTHORIZED" : result.error.message.includes("JOB_STOPPED") ? "JOB_STOPPED" : "연결 요청을 처리하지 못했습니다." }, { status: result.error.message.includes("DEVICE_UNAUTHORIZED") ? 401 : 409, headers });
    return Response.json(result.data, { headers });
  } catch { return Response.json({ error: "Invalid request" }, { status: 400, headers }); }
}
