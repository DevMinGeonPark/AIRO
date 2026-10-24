import { notFound } from "next/navigation";
import { getTrip } from "@/lib/store";
import { getArchive } from "@/lib/archive-store";
import { TripBudget } from "@/components/trip-budget";
import { ExpenseBudget } from "@/components/expense-budget";
import { getExpenseBudget } from "@/lib/expense-budget-store";
export const dynamic = "force-dynamic";
export default async function CostPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ view?: string; reservationId?: string }> }) {
  const { tripId } = await params;
  const detail = await getTrip(tripId); if (!detail) notFound();
  const [archive, budget, query] = await Promise.all([getArchive(tripId), getExpenseBudget(tripId), searchParams]);
  if (archive?.data.budget && !query.reservationId && (query.view === "original" || (!query.view && !budget.revision))) return <TripBudget trip={detail.trip} budget={archive.data.budget} />;
  const reservation=archive?.data.reservations?.entries.find(entry=>entry.id===query.reservationId);
  return <ExpenseBudget key={reservation?.id??"ledger"} trip={detail.trip} stops={detail.stops} initial={budget} hasOriginal={!!archive?.data.budget} initialReservation={reservation} />;
}
