import { apiRoute } from "@/lib/api";
import { exportTrip } from "@/lib/archive-store";

export const GET = apiRoute(async (_request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  return new Response(JSON.stringify(await exportTrip(tripId)), { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="airo-${tripId}.json"`,
  } });
}, true);
