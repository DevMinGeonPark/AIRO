package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.data.photos.PlacePhotoLinks
import com.heptivision.airo.data.trips.DemoTripRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class NativeLinksTest {
    @Test fun providerTargetsPreserveBookingParametersAndRejectSpoofedHosts() {
        val url = "https://kr.trip.com/m/orders/all?orderId=123&lang=ko&wkp=0#hotel"
        val link = bookingLink(url)!!
        assertEquals("ctrip.english", bookingAppPackage(link.url))
        assertEquals("https://kr.trip.com/m/orders/all?orderId=123&lang=ko&wkp=1#hotel", link.url)
        assertEquals(link.url, bookingLink(link.url)!!.url)
        assertEquals("com.agoda.mobile.consumer", bookingAppPackage("https://www.agoda.com/info/mybookings.html?booking=123"))
        assertEquals("com.booking", bookingAppPackage("https://secure.booking.com/confirmation"))
        listOf("https://eviltrip.com/a", "https://trip.com.evil.test/a", "https://trip.com:444/a", "intent://trip.com/a", "http://trip.com/a", "https://user@trip.com/a").forEach { assertNull(it, bookingAppPackage(it)) }
    }
    @Test fun calendarPreservesDayZeroLocalTimeAndAllDayUtcAndCopyUsesLocalName() {
        val trip = Trip("trip", title = "도쿄", startDate = "2026-09-18")
        val stop = Stop("stop", trip.id, "도쿄역", 139.7, 35.6, 0, 0, "10:30", mapQuery = " 東京駅 ")
        assertEquals("東京駅", stop.localPlaceName())
        assertEquals("도쿄역", stop.copy(mapQuery = " ").localPlaceName())
        val entry = placeCalendarEntry(trip, stop, "Asia/Tokyo")!!
        assertEquals(Instant.parse("2026-09-17T01:30:00Z").toEpochMilli(), entry.begin)
        assertEquals(entry.begin + 3600000, entry.end)
        assertTrue(entry.location.contains("東京駅"))
        assertFalse(entry.allDay)
        val allDay = placeCalendarEntry(trip, stop.copy(time = null, day = 2), "America/Los_Angeles")!!
        assertTrue(allDay.allDay)
        assertEquals(Instant.parse("2026-09-19T00:00:00Z").toEpochMilli(), allDay.begin)
        assertEquals(86400000L, allDay.end - allDay.begin)
        assertNull(placeCalendarEntry(trip.copy(startDate = null), stop, "Asia/Tokyo"))
    }
    @Test fun photoLinksPersistWithoutDuplicatesAndIsolateAccountOriginTripAndStop() = runBlocking {
        val vault = MemorySecrets()
        var owner: String? = "first"
        var store = PlacePhotoLinks(vault, "https://airo.test") { owner }
        val uris = listOf("content://media/external/images/media/123")
        store.add("trip", "stop", uris)
        store = PlacePhotoLinks(vault, "https://airo.test") { owner }
        assertEquals(1, store.add("trip", "stop", uris).size)
        assertTrue(store.list("other-trip", "stop").isEmpty())
        assertTrue(store.list("trip", "other-stop").isEmpty())
        assertTrue(PlacePhotoLinks(vault, "https://other.test") { owner }.list("trip", "stop").isEmpty())
        owner = "second"; assertTrue(store.list("trip", "stop").isEmpty())
        owner = null; assertTrue(runCatching { store.list("trip", "stop") }.isFailure)
        owner = "first"
        assertTrue(runCatching { store.add("trip", "stop", listOf("https://evil.test/photo.jpg")) }.isFailure)
        assertEquals(uris.single(), store.list("trip", "stop").single().uri)
        assertTrue(runCatching { store.add("trip", "stop", (1..21).map { "content://media/$it" }) }.isFailure)
        assertTrue(store.remove("trip", "stop", uris.single()).isEmpty())
        assertTrue(store.list("trip", "stop").isEmpty())
    }
}
