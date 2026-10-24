package com.heptivision.airo

import android.content.ActivityNotFoundException
import android.content.ContextWrapper
import android.content.Intent
import android.provider.CalendarContract
import androidx.test.platform.app.InstrumentationRegistry
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.platform.*
import org.junit.Assert.*
import org.junit.Test

class NativeLinksIntentTest {
    @Test fun installedBookingAppGetsExactHttpsDestinationAndMissingAppFallsBack() {
        val calls = mutableListOf<Intent>()
        var missing = false
        val context = object : ContextWrapper(InstrumentationRegistry.getInstrumentation().targetContext) {
            override fun startActivity(intent: Intent) { calls += intent; if (missing && intent.`package` != null) throw ActivityNotFoundException() }
        }
        val raw = "https://www.agoda.com/info/mybookings.html?booking=123#detail"
        assertTrue(openBookingLink(context, raw))
        assertEquals("com.agoda.mobile.consumer", calls.single().`package`)
        assertEquals(raw, calls.single().dataString)
        calls.clear(); missing = true
        assertTrue(openBookingLink(context, raw))
        assertEquals(2, calls.size)
        assertEquals(calls[0].data, calls[1].data)
        assertNull(calls[1].`package`)
        calls.clear()
        assertFalse(openBookingLink(context, "javascript:alert(1)"))
        assertTrue(calls.isEmpty())
        assertTrue(openBookingLink(context, "https://kr.trip.com/m/orders/all?order=123"))
        assertEquals("ctrip.english", calls.first().`package`)
        assertEquals("https://kr.trip.com/m/orders/all?order=123&wkp=1", calls.last().dataString)
    }
    @Test fun calendarOpensPrefilledEditorWithoutDirectWritePermissions() {
        val entry = placeCalendarEntry(Trip("trip", title = "도쿄", startDate = "2026-09-18"), Stop("stop", "trip", "도쿄역", 139.7, 35.6, 1, 0, "10:30", mapQuery = "東京駅"), "Asia/Tokyo")!!
        val intent = calendarIntent(entry)
        assertEquals(Intent.ACTION_INSERT, intent.action)
        assertEquals(CalendarContract.Events.CONTENT_URI, intent.data)
        assertEquals(entry.begin, intent.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, 0))
        assertEquals(entry.end, intent.getLongExtra(CalendarContract.EXTRA_EVENT_END_TIME, 0))
        assertEquals("도쿄역", intent.getStringExtra(CalendarContract.Events.TITLE))
        assertTrue(intent.getStringExtra(CalendarContract.Events.EVENT_LOCATION)!!.contains("東京駅"))
    }
}
