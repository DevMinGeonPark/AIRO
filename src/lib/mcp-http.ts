/** Bounded body reader shared by the MCP transport and its offline contract checks. */
export async function readMcpJson(request: Request, maxBytes = 3 * 1024 * 1024): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RangeError("요청 크기가 너무 큽니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("JSON 요청이 필요합니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RangeError("요청 크기가 너무 큽니다."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}
