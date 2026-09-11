import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/api";
import { changeMcpConnection } from "@/lib/mcp-connections";
export const PATCH = apiRoute(async (request: Request, { params }: { params: Promise<{ clientId: string }> }) => {
  const id = z.uuid().safeParse((await params).clientId);
  const action = z.object({ action: z.enum(["read", "write", "revoke"]) }).strict().safeParse(await request.json());
  if (!id.success || !action.success) throw new HttpError(400, "연결 정보를 확인하세요.");
  return Response.json(await changeMcpConnection(id.data, action.data.action));
}, true);
