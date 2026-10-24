import { directionsUrl, isSouthKorea, mapsUrl, naverMapUrl, primaryMapLabel, type MapPlace } from "@/lib/place-maps";

export function PlaceMapActions({ place }: { place: MapPlace }) {
  const domestic = isSouthKorea(place);
  const style = "inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-xs font-medium";
  return <div className="mt-3 flex flex-wrap gap-2">
    {domestic && <a className={style} href={naverMapUrl(place)} target="_blank" rel="noreferrer">네이버지도</a>}
    <a className={style} href={mapsUrl(place)} target="_blank" rel="noreferrer">{primaryMapLabel(place)}</a>
    <a className={style} href={directionsUrl(place)} target="_blank" rel="noreferrer">{domestic ? "카카오 길찾기" : "길찾기"}</a>
  </div>;
}
