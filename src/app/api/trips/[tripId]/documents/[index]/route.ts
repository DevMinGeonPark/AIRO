import { apiRoute, HttpError } from "@/lib/api";
import { getArchive } from "@/lib/archive-store";

export const GET = apiRoute(async (_request: Request, { params }: { params: Promise<{ tripId: string; index: string }> }) => {
  const { tripId, index } = await params;
  if (!/^\d+$/.test(index)) throw new HttpError(404, "문서를 찾을 수 없습니다.");
  const archive = await getArchive(tripId);
  const doc = archive?.data.documents[Number(index)];
  if (!doc) throw new HttpError(404, "문서를 찾을 수 없습니다.");
  return new Response(Buffer.from(doc.base64, "base64"), { headers: {
    "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="document-${index}.pdf"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
  } });
}, true);
