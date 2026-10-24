package com.heptivision.airo.core.platform

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import com.heptivision.airo.core.model.PlaceCalendarEntry

/** Prefer the actual Maps app and its location, with a browser fallback when absent. */
fun openPlaceMap(context: Context, url: String): Boolean {
    val uri = Uri.parse(url)
    if (uri.scheme != "https") return false
    fun launch(packageName: String?): Boolean = try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (packageName != null) setPackage(packageName)
        })
        true
    } catch (_: ActivityNotFoundException) { false } catch (_: SecurityException) { false }
    return (uri.host == "www.google.com" && uri.path?.startsWith("/maps/") == true && launch("com.google.android.apps.maps")) || launch(null)
}

fun calendarIntent(entry: PlaceCalendarEntry) = Intent(Intent.ACTION_INSERT, CalendarContract.Events.CONTENT_URI).apply {
    putExtra(CalendarContract.Events.TITLE, entry.title)
    putExtra(CalendarContract.Events.EVENT_LOCATION, entry.location)
    putExtra(CalendarContract.Events.DESCRIPTION, entry.description)
    putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, entry.begin)
    putExtra(CalendarContract.EXTRA_EVENT_END_TIME, entry.end)
    putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, entry.allDay)
    putExtra(CalendarContract.Events.EVENT_TIMEZONE, entry.timeZone)
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
fun openPlaceCalendar(context: Context, entry: PlaceCalendarEntry): Boolean = try {
    context.startActivity(calendarIntent(entry)); true
} catch (_: ActivityNotFoundException) { false } catch (_: SecurityException) { false }
