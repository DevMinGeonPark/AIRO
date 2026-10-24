import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/api";
import { searchPlaces } from "@/lib/places";

const schema = z.object({ query: z.string().trim().min(2).max(200) }).strict();

/** Explicit submit only. Mobile never enables a billable Places provider. */
export const POST = apiRoute(async request => {
  if (Number(request.headers.get("content-length")) > 2048) throw new HttpError(413, "검색어가 너무 깁니다.");
  const text = await request.text();
  if (text.length > 2048) throw new HttpError(413, "검색어가 너무 깁니다.");
  const parsed = schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new HttpError(400, "장소 이름을 2~200자로 입력해 주세요.");
  return Response.json(await searchPlaces(parsed.data.query, undefined, 8, undefined, { allowGoogle: false }));
}, true);
