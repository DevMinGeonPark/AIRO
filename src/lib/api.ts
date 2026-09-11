import "server-only";
import { NextResponse } from "next/server";
import { getUser } from "./supabase/server";
import { demoEnabled, supabaseConfigured } from "./supabase/config";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Authenticate at the handler as well as the proxy; never silently use demo data. */
export function apiRoute<T>(handler: (request: Request, context: T) => Promise<Response>, accountOnly = false) {
  return async (request: Request, context: T) => {
    try {
      if (!supabaseConfigured && (accountOnly || !demoEnabled))
        throw new HttpError(503, "로그인 저장소를 연결한 후 사용할 수 있습니다.");
      if (supabaseConfigured && !await getUser()) throw new HttpError(401, "로그인이 필요합니다.");
      const response = await handler(request, context);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof SyntaxError ? 400 : 500;
      if (status === 500) console.error("API operation failed", error);
      return NextResponse.json({ error: error instanceof HttpError ? error.message : status === 400 ? "올바른 JSON을 보내 주세요." : "저장소 요청을 처리하지 못했습니다. 다시 시도해 주세요." }, { status });
    }
  };
}
