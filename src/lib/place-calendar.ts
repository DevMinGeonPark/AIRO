import type { Stop, Trip } from "./types";
import { tripDayDate } from "./trip-calendar";
import { validStopTime } from "./itinerary-progress";
import { mapsUrl } from "./place-maps";

export const localPlaceName = (place: Pick<Stop, "name" | "map_query">) => place.map_query?.trim() || place.name;
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (value: string) => value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, value => `\\${value}`);
// Fold by UTF-8 octets, never splitting a Korean character.
function fold(line: string) {
  let result = "", bytes = 0;
  for (const char of line) { const size = new TextEncoder().encode(char).length; if (bytes + size > 75) { result += "\r\n "; bytes = 1; } result += char; bytes += size; }
  return result;
}
function localEpoch(epoch: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" }).formatToParts(epoch);
  const part = (type: string) => Number(parts.find(p => p.type === type)!.value);
  return Date.UTC(part("year"),part("month")-1,part("day"),part("hour"),part("minute"),part("second"));
}
export function calendarInstant(date: string, time: string, zone: string) {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offsets = [...new Set([-172800000,0,172800000].map(delta => localEpoch(wall+delta,zone)-(wall+delta)))];
  const candidates = offsets.map(offset => wall-offset).sort((a,b) => a-b);
  // RFC 5545: first occurrence on an overlap; pre-gap offset for nonexistent times.
  const exact = candidates.find(epoch => localEpoch(epoch,zone) === wall);
  return new Date(exact ?? candidates.find(epoch => localEpoch(epoch,zone) > wall) ?? candidates[0]);
}
export function placeCalendarFile(trip: Pick<Trip,"id"|"title"|"start_date">, stop: Stop, timeZone: string, now = new Date()) {
  if (!trip.start_date) return null;
  const date = tripDayDate(trip.start_date,stop.day,trip.start_date), allDay = !validStopTime(stop.time);
  const begin = allDay ? new Date(`${date}T00:00:00Z`) : calendarInstant(date,stop.time!,timeZone);
  const end = new Date(begin.getTime()+(allDay ? 86400000 : 3600000));
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//AIRO//Travel Calendar//KO","CALSCALE:GREGORIAN","BEGIN:VEVENT",
    `UID:${encodeURIComponent(trip.id)}-${encodeURIComponent(stop.source_id || stop.id)}@airo.local`, `DTSTAMP:${stamp(now)}`,
    allDay ? `DTSTART;VALUE=DATE:${date.replace(/-/g,"")}` : `DTSTART:${stamp(begin)}`,
    allDay ? `DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replace(/-/g,"")}` : `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(stop.name)}`, `LOCATION:${escapeText(`${localPlaceName(stop)} (${stop.lat}, ${stop.lng})`)}`,
    `DESCRIPTION:${escapeText(`${trip.title} · Day ${stop.day}\n${timeZone}\n${mapsUrl(stop)}`)}`,"END:VEVENT","END:VCALENDAR"];
  return { content:lines.map(fold).join("\r\n")+"\r\n", filename:`${stop.name.replace(/[/\\\x00-\x1f]/g,"_").slice(0,80) || "AIRO"}.ics`, allDay };
}
