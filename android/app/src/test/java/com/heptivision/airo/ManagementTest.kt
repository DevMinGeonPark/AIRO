package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.data.trips.DemoTripRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.util.Base64
import java.util.UUID

class ManagementTest {
    @Test fun calendarSelectsTodayNearestAndEarlierTieIncludingPredeparture() {
        val trip = Trip("trip", title = "Travel", startDate = "2026-09-18")
        assertEquals(1, nearestDay(trip, listOf(0, 1, 3), LocalDate.parse("2026-09-18")))
        assertEquals(0, nearestDay(trip, listOf(0, 1, 3), LocalDate.parse("2026-09-10")))
        assertEquals(1, nearestDay(trip, listOf(1, 3), LocalDate.parse("2026-09-19")))
        assertEquals(3, nearestDay(trip, listOf(0, 1, 3), LocalDate.parse("2026-10-01")))
        assertEquals(LocalDate.parse("2026-09-17"), trip.calendarDate(0))
        assertEquals(1, nearestDay(trip.copy(startDate = null), listOf(0, 1, 2), LocalDate.parse("2026-09-18")))
    }
    @Test fun explicitLinksUseSourceIdsAndBookingDocumentsWithoutGuessingNames() {
        val stop = Stop("new-id", "trip", "Airport", 12.0, 41.0, 0, 0, sourceId = "old-id")
        val unrelated = TripDocument(name = "Airport ticket confirmed.pdf", sha256 = "a".repeat(64))
        val direct = TripDocument(name = "Receipt.pdf", sha256 = "b".repeat(64), stopIds = listOf("old-id"))
        val bookingDoc = TripDocument(name = "Pass.pdf", sha256 = "c".repeat(64))
        val reservation = Reservation(name = "Flight", stopIds = listOf("new-id"), documentSha256s = listOf(bookingDoc.sha256))
        val linked = TripAttachments(listOf(unrelated, direct, bookingDoc), listOf(reservation)).forStop(stop)
        assertEquals(listOf(direct, bookingDoc), linked.documents)
        assertEquals("not_booked", linked.reservations.single().bookingStatus)
        assertNull(bookingLink("javascript:alert(1)"))
        assertNull(bookingLink("https://user:password@example.test"))
        assertEquals("Trip.com 예약 목록", bookingLink("https://kr.trip.com/m/orders/all")!!.label)
        assertEquals(0, bookingLinks(stop.copy(note = "https://nottrip.com/evil"), emptyList()).size)
    }
    @Test fun uploadRetryRelinkReservationConflictAndExportRetainBytesAndAssociations() = runBlocking {
        val store = MemorySecrets()
        var repository = DemoTripRepository(store)
        val bytes = "%PDF-1.4\n% synthetic\n%%EOF".toByteArray()
        val input = DocumentInput("Ticket.pdf", Base64.getEncoder().encodeToString(bytes), listOf("pantheon"))
        val doc = repository.attachDocument("demo-rome", input)
        repository.attachDocument("demo-rome", input)
        assertEquals(1, repository.resources("demo-rome").documents.size)
        assertArrayEquals(bytes, repository.document("demo-rome", doc.copy(index = 90)))
        assertTrue(runCatching { repository.attachDocument("demo-rome", input.copy(stopIds = listOf("other-trip"))) }.isFailure)
        repository.linkDocument("demo-rome", DocumentLinks(doc.sha256, listOf("coffee")))
        assertTrue(repository.detail("demo-rome").attachments.forStop(repository.detail("demo-rome").stops.first { it.id == "pantheon" }).documents.isEmpty())
        val booking = Reservation(name = "Ticket", stopIds = listOf("coffee"), documentSha256s = listOf(doc.sha256), bookingStatus = "confirmed")
        repository.saveReservation("demo-rome", ReservationInput(0, booking))
        val conflict = runCatching { repository.saveReservation("demo-rome", ReservationInput(0, booking.copy(name = "Stale"))) }.exceptionOrNull()
        assertEquals(409, (conflict as ApiException).status)
        repository = DemoTripRepository(store)
        val exported = readArchive(repository.exportArchive("demo-rome"))
        assertArrayEquals(bytes, exported.documents().single().bytes())
        assertEquals(listOf("coffee"), exported.documents().single().stopIds)
        assertEquals(booking, exported.reservations().entries.single())
        val another = DemoTripRepository(MemorySecrets())
        val imported = another.importArchive(exported)
        val importedStop = another.detail(imported.tripId).stops.first { it.sourceId == "coffee" }
        val resources = another.resources(imported.tripId)
        assertEquals(doc.sha256, resources.attachments().forStop(importedStop).documents.single().sha256)
        another.linkDocument(imported.tripId, DocumentLinks(doc.sha256, listOf(importedStop.id)))
        assertEquals(listOf("coffee"), readArchive(another.exportArchive(imported.tripId)).documents().single().stopIds)
    }
    @Test fun reservationBudgetLinkRejectsDuplicateAndRetainsExistingEntryId() = runBlocking {
        val repository = DemoTripRepository(MemorySecrets())
        val reservation = UUID.randomUUID().toString()
        val expense = Expense(UUID.randomUUID().toString(), "Flight", "flight", 1, 12.0, "EUR", 1500.0, true, reservation)
        val saved = repository.saveBudget("demo-rome", ExpenseBudget(entries = listOf(expense)))
        assertEquals(expense, saved.entries.single())
        assertTrue(runCatching { repository.saveBudget("demo-rome", saved.copy(entries = listOf(expense, expense.copy(id = UUID.randomUUID().toString())))) }.isFailure)
        assertEquals(expense.id, repository.budget("demo-rome").entries.single().id)
    }
}
