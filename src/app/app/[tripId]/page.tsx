import { notFound } from "next/navigation";
import { getTrip } from "@/lib/store";
import { TripWorkspace } from "@/components/trip-workspace";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import type { ArchiveData } from "@/lib/archive";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const detail = await getTrip(tripId);
  if (!detail) notFound();
  const client = await createClient();
  const result = client ? await client.from("trip_archives").select("data->routes,data->photos").eq("trip_id", tripId).maybeSingle() : null;
  if (result?.error) throw new Error(result.error.message);
  return (
    <TripWorkspace
      trip={detail.trip}
      initialStops={detail.stops}
      initialMessages={detail.messages}
      roads={(result?.data?.routes as ArchiveData["routes"]) ?? {}}
      photos={(result?.data?.photos as ArchiveData["photos"]) ?? {}}
      showSignOut={supabaseConfigured}
    />
  );
}
