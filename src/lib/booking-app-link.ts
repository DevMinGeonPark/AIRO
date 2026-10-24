import { bookingLink } from "./trip-attachments";
const packages: Record<string,string> = { "trip.com":"ctrip.english", "agoda.com":"com.agoda.mobile.consumer", "booking.com":"com.booking", "airbnb.com":"com.airbnb.android", "airbnb.co.kr":"com.airbnb.android", "expedia.com":"com.expedia.bookings", "expedia.co.kr":"com.expedia.bookings" };
export function bookingAndroidIntent(raw:string) {
  const link=bookingLink(raw);if(!link)return null;
  const url=new URL(link.href);
  const domain=Object.keys(packages).find(domain=>url.hostname===domain||url.hostname.endsWith(`.${domain}`));
  if(!domain || url.hash)return null;
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=${packages[domain]};S.browser_fallback_url=${encodeURIComponent(link.href)};end`;
}
