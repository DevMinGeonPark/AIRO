import { notFound } from "next/navigation";
import { getTrip } from "@/lib/store";
import { TripSettings } from "@/components/trip-settings";
export const dynamic = "force-dynamic";
export default async function SettingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params; const detail = await getTrip(tripId); if (!detail) notFound();
  return <TripSettings trip={detail.trip} />;
}
