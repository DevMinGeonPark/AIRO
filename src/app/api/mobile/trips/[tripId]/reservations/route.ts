import { managementRoute, managementBody, type MobileTripContext } from "@/lib/mobile-management";
import { toolSchemas } from "@/lib/tool-contracts";
import { getReservations, setReservation } from "@/lib/trip-management-store";

export const GET = managementRoute(async (_request, { params }: MobileTripContext) =>
  Response.json(await getReservations({ tripId: (await params).tripId })));
export const PUT = managementRoute(async (request, { params }: MobileTripContext) => {
  const input = await managementBody(request, toolSchemas.setReservation.omit({ tripId: true }));
  return Response.json(await setReservation({ ...input, tripId: (await params).tripId }));
});
