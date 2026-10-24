import { managementRoute, type MobileTripContext } from "@/lib/mobile-management";
import { toolSchemas } from "@/lib/tool-contracts";
import { listChanges } from "@/lib/trip-management-store";

export const GET = managementRoute(async (request, { params }: MobileTripContext) => {
  const query = new URL(request.url).searchParams;
  const input = toolSchemas.listChanges.parse({ tripId: (await params).tripId,
    ...(query.has("beforeId") ? { beforeId: query.get("beforeId") } : {}),
    ...(query.has("limit") ? { limit: Number(query.get("limit")) } : {}),
  });
  return Response.json(await listChanges(input));
});
