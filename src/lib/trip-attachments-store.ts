import "server-only";
import { createClient } from "./supabase/server";
import { emptyTripAttachments, type TripAttachments } from "./trip-attachments";

export async function getTripAttachments(tripId: string): Promise<TripAttachments> {
  const client = await createClient();
  if (!client) return emptyTripAttachments();
  // Strip PDF bytes inside PostgreSQL: background refreshes only need metadata.
  const { data, error } = await client.rpc("get_trip_attachments", { p_trip: tripId });
  if (error) throw new Error(error.message);
  return data ?? emptyTripAttachments();
}
