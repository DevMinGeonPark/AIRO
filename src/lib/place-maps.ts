import { southKoreaRings } from "./south-korea-boundary";

export type MapPlace = { name: string; lat: number; lng: number; map_query?: string | null };

/** Offline country lookup. A small coastline margin includes reclaimed airport land. */
export function isSouthKorea({ lat, lng }: Pick<MapPlace, "lat" | "lng">) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 38.7 || lng < 124.5 || lng > 132) return false;
  // Small eastern islands are absent from the simplified Natural Earth polygons.
  if (Math.hypot((lng - 131.869) * .8, lat - 37.242) < .025) return true;
  return southKoreaRings.some(ring => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[j];
      if ((ay > lat) !== (by > lat) && lng < (bx - ax) * (lat - ay) / (by - ay) + ax) inside = !inside;
      const dx = (bx - ax) * .8, dy = by - ay, px = (lng - ax) * .8, py = lat - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(px - t * dx, py - t * dy) < .012) return true;
    }
    return inside;
  });
}

const query = (place: MapPlace) => encodeURIComponent(place.map_query?.trim() || `${place.lat},${place.lng}`);
const kakaoPlace = (place: MapPlace) => `${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
export const primaryMapLabel = (place: MapPlace) => isSouthKorea(place) ? "카카오맵" : "구글지도";
export const mapsUrl = (place: MapPlace) => isSouthKorea(place)
  ? `https://map.kakao.com/link/map/${kakaoPlace(place)}`
  : `https://www.google.com/maps/search/?api=1&query=${query(place)}`;
export const directionsUrl = (place: MapPlace) => isSouthKorea(place)
  ? `https://map.kakao.com/link/to/${kakaoPlace(place)}`
  // Google Maps owns the live origin; never use AIRO's camera or saved GPS fix.
  : `https://www.google.com/maps/dir/?api=1&destination=${query(place)}&dir_action=navigate`;
export const naverMapUrl = (place: MapPlace) => `https://map.naver.com/p/search/${encodeURIComponent(place.map_query?.trim() || place.name)}`;
