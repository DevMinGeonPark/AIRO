import { apiRoute } from "@/lib/api";
import { currentPlan, listTripSummaries } from "@/lib/store";

export const GET = apiRoute(async () => {
  const [trips, plan] = await Promise.all([listTripSummaries(), currentPlan()]);
  return Response.json({ trips, plan });
}, true);
