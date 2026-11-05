import { notFound } from "next/navigation";
import { getTrip } from "@/lib/store";
import { TripManagement } from "@/components/trip-management";
import { supabaseConfigured } from "@/lib/supabase/config";
import { AccountRequired } from "@/components/account-required";
export const dynamic = "force-dynamic";
export default async function ManagePage({params,searchParams}:{params:Promise<{tripId:string}>;searchParams:Promise<{stopId?:string;tab?:string}>}) {
  const {tripId}=await params, detail=await getTrip(tripId);if(!detail)notFound();
  if(!supabaseConfigured)return <AccountRequired trip={detail.trip} title="자료·예약 관리"/>;
  const query=await searchParams;
  return <TripManagement trip={detail.trip} initialStopId={detail.stops.find(s=>s.id===query.stopId||s.source_id===query.stopId)?.id} initialTab={query.tab==="history"?"history":"documents"}/>;
}
