import { listTripSummaries, currentPlan } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { SetupNotice } from "@/components/setup-notice";
import { AppHeader } from "@/components/app-shell";
import { TripList } from "@/components/trip-list";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const [summaries, plan] = await Promise.all([listTripSummaries(), currentPlan()]);
  return (
    <div className="min-h-dvh">
      <AppHeader plan={plan} showSignOut={supabaseConfigured} />
      <SetupNotice configured={supabaseConfigured} />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-14">
        <p className="mb-3 text-xs font-semibold tracking-[0.15em] text-primary">MY JOURNEYS</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">내 여행</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          어디로든, AI와 함께. 다음 여행의 시작을 여기에.
        </p>
        <TripList
          initial={summaries.map((s) => ({
            trip: s.trip,
            stops: s.stops,
          }))}
          plan={plan}
        />
      </main>
    </div>
  );
}
