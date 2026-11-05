import { apiRoute } from "@/lib/api";
import { listTripSummaries } from "@/lib/store";

// `plan` is kept for Android clients <= 0.3.8, which show a trip limit when it is "free".
export const GET = apiRoute(async () => Response.json({ trips: await listTripSummaries(), plan: "pro" }), true);
