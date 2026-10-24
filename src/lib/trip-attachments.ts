import type { ArchiveData } from "./archive";
import type { Stop } from "./types";

export type TripAttachments = {
  documents: Omit<ArchiveData["documents"][number], "base64">[];
  reservations: NonNullable<ArchiveData["reservations"]>["entries"];
};
export const emptyTripAttachments = (): TripAttachments => ({ documents: [], reservations: [] });

const platforms: [string, string][] = [["trip.com", "Trip.com"], ["booking.com", "Booking.com"], ["agoda.com", "Agoda"], ["airbnb.com", "Airbnb"], ["airbnb.co.kr", "Airbnb"], ["expedia.com", "Expedia"], ["expedia.co.kr", "Expedia"]];
function platform(host: string) { return platforms.find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1]; }

export function bookingLink(value: string | null | undefined) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const provider = platform(url.hostname);
    // Trip.com publishes wkp=1 in its Apple association file. HTTPS also
    // preserves the exact booking page as the fallback when no app handles it.
    if (provider === "Trip.com") url.searchParams.set("wkp", "1");
    const list = provider === "Trip.com" && /^\/(order\/hotel|m\/orders\/all)\/?$/.test(url.pathname);
    return { href: url.toString(), label: `${provider ?? url.hostname} ${list ? "예약 목록" : "예약 열기"}` };
  } catch { return null; }
}

export function stopAttachments(stop: Stop, attachments: TripAttachments) {
  const ids = [stop.id, stop.source_id].filter(Boolean);
  const matches = (links: string[] = []) => links.some(id => ids.includes(id));
  const reservations = attachments.reservations.filter(r => matches([...(r.stopIds ?? []), ...(r.stopId ? [r.stopId] : [])]));
  const hashes = new Set(reservations.flatMap(r => r.documentSha256s ?? []));
  const documents = attachments.documents.filter(d => matches(d.stopIds) || hashes.has(d.sha256));
  const links = reservations.map(r => bookingLink(r.bookingUrl)).filter(link => link !== null);
  // Older MCP data kept real booking links in stop notes. Only recognized
  // booking platforms become buttons; unrelated links stay in the note.
  for (const raw of stop.note?.match(/https:\/\/[^\s<>"']+/g) ?? []) {
    const value = raw.replace(/[)\]},.;!?]+$/, "");
    try { if (platform(new URL(value).hostname)) { const link = bookingLink(value); if (link) links.push(link); } } catch { /* Invalid note URL. */ }
  }
  const plainNote = (stop.note ?? "").replace(/https?:\/\/[^\s<>"']+/g, "");
  if (!links.length && /\btrip\.com\b/i.test(plainNote)) links.push(bookingLink("https://kr.trip.com/m/orders/all")!);
  return { reservations, documents, links: [...new Map(links.map(link => [link.href, link])).values()] };
}

export function documentViewUrl(tripId: string, sha256: string) {
  return `/api/trips/${encodeURIComponent(tripId)}/documents/${sha256}?view=1`;
}
