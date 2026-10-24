import "server-only";
import { createClient } from "./supabase/server";
import { archiveDataSchema, type ArchiveData } from "./archive";

/** Same saved geometry the web map uses, without loading original PDF bytes. */
export async function getTripRoads(tripId: string): Promise<ArchiveData["routes"]> {
  const client = await createClient();
  if (!client) return {};
  const { data, error } = await client.from("trip_archives").select("data->routes").eq("trip_id", tripId).maybeSingle();
  if (error) throw new Error(error.message);
  return archiveDataSchema.shape.routes.parse(data?.routes ?? {});
}
