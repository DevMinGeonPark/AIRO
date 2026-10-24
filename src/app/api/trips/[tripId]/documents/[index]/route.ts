import { apiRoute, HttpError } from "@/lib/api";
import { getArchive } from "@/lib/archive-store";

export const GET = apiRoute(async (request: Request, { params }: { params: Promise<{ tripId: string; index: string }> }) => {
  const { tripId, index } = await params;
  const isHash = /^[a-f0-9]{64}$/.test(index);
  if (!isHash && !/^\d{1,2}$/.test(index)) throw new HttpError(404, "문서를 찾을 수 없습니다.");
  const archive = await getArchive(tripId);
  const doc = isHash ? archive?.data.documents.find(doc => doc.sha256 === index) : archive?.data.documents[Number(index)];
  if (!doc) throw new HttpError(404, "문서를 찾을 수 없습니다.");
  return new Response(Buffer.from(doc.base64, "base64"), { headers: {
    "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "Content-Disposition": `${new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment"}; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
  } });
}, true);
