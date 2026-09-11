import "server-only";

import type { Place } from "./types";

/**
 * Google Places (New) adapter.
 *
 * OSM knows what exists; Google knows what people actually go to — ratings,
 * review counts, opening hours, photos. When a key is present this becomes the
 * primary source and OSM stays as the free fallback.
 *
 * Needs a billed Google Cloud project with the Places API (New) enabled.
 * ponytail: Text Search only. Nearby Search would add category browsing without
 * a query string; add it when a screen actually needs that.
 */
const KEY = process.env.GOOGLE_MAPS_API_KEY;
export const googleConfigured = Boolean(KEY);

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
// Only the fields we render — the field mask is what Google bills on.
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.currentOpeningHours.openNow",
  "places.websiteUri",
].join(",");

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  websiteUri?: string;
};

export async function searchGoogle(
  query: string,
  near?: { lat: number; lng: number },
  limit = 10,
  radius = 20_000,
): Promise<Place[]> {
  if (!KEY) return [];

  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: "ko",
    regionCode: "JP",
    maxResultCount: Math.min(Math.max(limit, 1), 20),
  };
  if (near) {
    body.locationBias = {
      circle: {
        center: { latitude: near.lat, longitude: near.lng },
        radius: Math.min(radius, 50_000),
      },
    };
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": FIELDS,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`google places ${res.status}`);

  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? [])
    .filter((p) => p.location)
    .map((p) => ({
      id: `google:${p.id}`,
      name: p.displayName?.text ?? "이름 없음",
      address: p.formattedAddress ?? "",
      lat: p.location!.latitude,
      lng: p.location!.longitude,
      category: p.primaryTypeDisplayName?.text ?? p.types?.[0] ?? "place",
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      website: p.websiteUri ?? null,
    }));
}
