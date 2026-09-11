import "server-only";
import { createClient } from "./supabase/server";
import { archiveDataSchema, type TripArchive } from "./archive";
import { getTrip } from "./store";
import { HttpError } from "./api";

export async function getArchive(tripId: string) {
  const client = await createClient();
  if (!client) return null;
  const { data, error } = await client.from("trip_archives").select("data,imported_at").eq("trip_id", tripId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...data, data: archiveDataSchema.parse(data.data) } : null;
}
export async function getSavedPlaces(tripId: string): Promise<string[]> {
  const client = await createClient();
  if (!client) return [];
  const { data, error } = await client.from("saved_places").select("place_id").eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.place_id);
}
export async function exportTrip(tripId: string): Promise<TripArchive> {
  const detail = await getTrip(tripId);
  if (!detail) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const [archive, savedPlaceIds] = await Promise.all([getArchive(tripId), getSavedPlaces(tripId)]);
  return {
    format: "airo-trip", version: 1,
    source_key: detail.trip.source_key ?? `export:${tripId}`,
    exported_at: new Date().toISOString(),
    trip: { title: detail.trip.title, start_date: detail.trip.start_date, created_at: detail.trip.created_at },
    stops: detail.stops.map(({ id, trip_id: _tripId, source_id, ...stop }) => {
      void _tripId;
      return { ...stop, source_id: source_id ?? id };
    }),
    messages: detail.messages.map(({ role, content, created_at }) => ({ role, content, created_at })),
    data: { ...(archive?.data ?? { food: [], photos: {}, routes: {}, documents: [] }), savedPlaceIds },
  };
}
