import { apiRoute, HttpError } from "@/lib/api";
import { toolSchemas } from "@/lib/tool-contracts";
import { addChoiceStop, setStopChoices, selectStopChoice } from "@/lib/stop-choices-store";
import { ManagementError } from "@/lib/trip-management";
import { readMcpJson } from "@/lib/mcp-http";

type Context = { params: Promise<{ tripId: string }> };
async function handle(request: Request, { params }: Context) {
  const { tripId } = await params;
  let input: unknown;
  try { input = await readMcpJson(request, 60000); }
  catch (e) { if (e instanceof RangeError) throw new HttpError(413, "후보 내용이 너무 큽니다."); throw e; }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "후보 요청을 확인하세요.");
  const { action, ...body } = input as Record<string, unknown>;
  const operation = request.method === "POST" ? "addChoiceStop" : action === "configure" ? "setStopChoices" : action === "select" ? "selectStopChoice" : null;
  if (!operation) throw new HttpError(400, "후보 설정 또는 선택을 지정하세요.");
  const parsed = toolSchemas[operation].safeParse({ ...body, tripId });
  if (!parsed.success) throw new HttpError(400, "후보 2~8곳, 이름·좌표·시간과 최신 revision을 확인하세요.");
  try {
    const run = { addChoiceStop, setStopChoices, selectStopChoice }[operation] as (v: typeof parsed.data) => Promise<unknown>;
    return Response.json(await run(parsed.data), { status: request.method === "POST" ? 201 : 200 });
  } catch (e) { if (e instanceof ManagementError) throw new HttpError(e.status, e.message); throw e; }
}
export const POST = apiRoute(handle, true);
export const PATCH = apiRoute(handle, true);
