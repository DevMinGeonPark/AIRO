import "server-only";
import { createClient } from "./supabase/server";
import { HttpError } from "./api";
export async function bridgeRpc(op: string, id: string | null = null, data: unknown = {}, key: string | null = null) {
  const client = await createClient();
  if (!client) throw new HttpError(503, "내 AI 연결은 로그인 후 사용할 수 있습니다.");
  const result = await client.rpc("ai_bridge", { p_op: op, p_id: id, p_data: data, p_key: key });
  if (result.error) throw new HttpError(409, result.error.message);
  return result.data;
}
