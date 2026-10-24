import { z } from "zod";
import { managementRoute, managementBody, type MobileTripContext } from "@/lib/mobile-management";
import { toolSchemas } from "@/lib/tool-contracts";
import { linkedStopIdsSchema } from "@/lib/trip-management";
import { attachDocument, getDocument } from "@/lib/trip-management-store";

const upload = toolSchemas.attachDocument.omit({ tripId: true });
const links = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), stopIds: linkedStopIdsSchema }).strict();

export const POST = managementRoute(async (request, { params }: MobileTripContext) => {
  const { tripId } = await params;
  const input = await managementBody(request, upload, 3 * 1024 * 1024);
  return Response.json(await attachDocument({ ...input, tripId }), { status: 201 });
});

// Reuse the stored original; changing a link never sends the PDF back from the phone.
export const PUT = managementRoute(async (request, { params }: MobileTripContext) => {
  const { tripId } = await params;
  const { sha256, stopIds } = await managementBody(request, links);
  const { document } = await getDocument({ tripId, sha256 });
  return Response.json(await attachDocument({ tripId, name: document.name, base64: document.base64, stopIds }));
});
