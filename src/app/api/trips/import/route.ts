import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { apiRoute, HttpError } from "@/lib/api";
import { MAX_ARCHIVE_BYTES } from "@/lib/archive";
import { importArchiveSchema } from "@/lib/archive";
import { createClient } from "@/lib/supabase/server";

export const POST = apiRoute(async (request: Request) => {
  if (Number(request.headers.get("content-length")) > MAX_ARCHIVE_BYTES) throw new HttpError(413, "8MB 이하의 여행 파일을 선택해 주세요.");
  // Also enforce the limit for requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "여행 파일이 없습니다.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_ARCHIVE_BYTES) { await reader.cancel(); throw new HttpError(413, "8MB 이하의 여행 파일을 선택해 주세요."); }
    chunks.push(value);
  }
  const parsed = importArchiveSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (!parsed.success) throw new HttpError(400, "여행 파일 형식이 올바르지 않습니다. 원본에서 다시 내보내 주세요.");
  for (const doc of parsed.data.data.documents) {
    const bytes = Buffer.from(doc.base64, "base64");
    if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256 || bytes.subarray(0, 5).toString() !== "%PDF-")
      throw new HttpError(400, "원본 PDF 검증에 실패했습니다.");
  }
  const client = await createClient();
  const { data, error } = await client!.rpc("import_trip", { p_archive: parsed.data });
  if (error) {
    if (error.code === "P0001" && error.message.includes("무료 플랜")) throw new HttpError(409, error.message);
    throw new Error(error.message);
  }
  return NextResponse.json(data, { status: data.imported ? 201 : 200 });
}, true);
