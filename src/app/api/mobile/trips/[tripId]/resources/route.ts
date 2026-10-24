import { apiRoute, HttpError } from "@/lib/api";
import { getTrip } from "@/lib/store";
import { getArchive, getSavedPlaces } from "@/lib/archive-store";
import { emptyReservations } from "@/lib/trip-management";
import { webUrl } from "@/lib/archive";

export const GET = apiRoute(async (_request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const detail = await getTrip(tripId);
  if (!detail) throw new HttpError(404, "여행을 찾을 수 없습니다.");
  const [archive, savedPlaceIds] = await Promise.all([getArchive(tripId), getSavedPlaces(tripId)]);
  return Response.json({
    places: (archive?.data.food ?? []).map(place => ({ ...place, image: webUrl(archive?.data.photos[place.id]?.image) ?? webUrl(place.image) ?? null })), savedPlaceIds,
    trip: detail.trip, stops: detail.stops,
    documents: (archive?.data.documents ?? []).map(({ name, mime, sha256, stopIds, base64 }, index) => ({ index, name, mime, sha256, stopIds: stopIds ?? [], sizeBytes: Buffer.byteLength(base64, "base64") })),
    reservations: archive?.data.reservations ?? emptyReservations(),
  });
}, true);
