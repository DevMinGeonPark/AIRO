import { notFound } from "next/navigation";
import { getTrip } from "@/lib/store";
import { getArchive, getSavedPlaces } from "@/lib/archive-store";
import { TripResources } from "@/components/trip-resources";
export const dynamic = "force-dynamic";
export default async function ResourcesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const detail = await getTrip(tripId); if (!detail) notFound();
  const [archive, saved] = await Promise.all([getArchive(tripId), getSavedPlaces(tripId)]);
  return <TripResources trip={detail.trip} stops={detail.stops} food={archive?.data.food ?? []} photos={archive?.data.photos ?? {}} documents={archive?.data.documents.map(({ name }) => ({ name })) ?? []} initialSaved={saved} hasBudget={!!(archive?.data.budget || archive?.data.expenseBudget?.revision)} />;
}
