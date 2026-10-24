import "server-only";
import { z } from "zod";
import { apiRoute, HttpError } from "./api";
import { readMcpJson } from "./mcp-http";
import { ManagementError } from "./trip-management";

export type MobileTripContext = { params: Promise<{ tripId: string }> };
export function managementRoute<T>(handler: (request: Request, context: T) => Promise<Response>) {
  return apiRoute<T>(async (request, context) => {
    try { return await handler(request, context); }
    catch (error) {
      if (error instanceof ManagementError) throw new HttpError(error.status, error.message);
      if (error instanceof z.ZodError) throw new HttpError(400, "자료 형식과 입력 내용을 확인해 주세요.");
      if (error instanceof RangeError) throw new HttpError(413, "자료가 너무 큽니다. PDF는 파일당 2 MiB까지 올릴 수 있습니다.");
      throw error;
    }
  }, true);
}
export async function managementBody<S extends z.ZodType>(request: Request, schema: S, maxBytes = 128 * 1024): Promise<z.output<S>> {
  return schema.parse(await readMcpJson(request, maxBytes));
}
