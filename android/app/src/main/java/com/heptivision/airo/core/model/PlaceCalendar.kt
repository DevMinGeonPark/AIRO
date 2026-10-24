package com.heptivision.airo.core.model

import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

data class PlaceCalendarEntry(val title: String, val location: String, val description: String,
    val begin: Long, val end: Long, val allDay: Boolean, val timeZone: String)

/** All-day Calendar intents use UTC dates; timed events use the trip's chosen time zone. */
fun placeCalendarEntry(trip: Trip, stop: Stop, timeZone: String): PlaceCalendarEntry? {
    val date = trip.date()?.plusDays(stop.day.toLong() - 1) ?: return null
    val zone = runCatching { ZoneId.of(timeZone) }.getOrNull() ?: return null
    val allDay = !validStopTime(stop.time)
    val begin = if (allDay) date.atStartOfDay(ZoneOffset.UTC).toInstant()
        else date.atTime(LocalTime.parse(stop.time)).atZone(zone).toInstant()
    val end = if (allDay) date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant() else begin.plusSeconds(3600)
    return PlaceCalendarEntry(stop.name, "${stop.localPlaceName()} (${stop.lat}, ${stop.lng})",
        "${trip.title} · ${dayLabel(stop.day)}\nhttps://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}",
        begin.toEpochMilli(), end.toEpochMilli(), allDay, if (allDay) "UTC" else zone.id)
}
