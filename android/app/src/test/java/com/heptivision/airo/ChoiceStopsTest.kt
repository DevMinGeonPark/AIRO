package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.data.trips.DemoTripRepository
import com.heptivision.airo.core.network.ApiException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class ChoiceStopsTest {
    private val choice = StopChoice("점심", "meal", listOf(
        ChoiceCandidate("A", "후보 A", 130.39, 33.59), ChoiceCandidate("B", "후보 B", 130.42, 33.6)), 1)
    private fun archive() = ArchiveFile(sourceKey = "choice-unit", exportedAt = Instant.now().toString(), trip = ArchiveTrip("선택 식사", "2026-10-01"),
        stops = listOf(ArchiveStop("hotel", "숙소", 130.375, 33.59, 1, 0), ArchiveStop("meal", "점심", 130.39, 33.59, 1, 1, "12:00", choice = choice),
            ArchiveStop("after", "다음", 130.415, 33.59, 1, 2)), data = JsonObject(emptyMap()))
    @Test fun unresolvedSlotBlocksRoadsFlightsPlaybackAndAutomaticCompletion() {
        val a = Stop("hotel", "t", "숙소", 130.375, 33.59, 1, 0)
        val b = a.copy(id = "meal", name = "점심", position = 1, choice = choice, time = "00:00")
        val c = a.copy(id = "next", lng = 130.415, position = 2, mode = "flight")
        assertTrue(roadPairs(listOf(a,b,c)).isEmpty()); assertTrue(flightArcs(listOf(a,b,c)).isEmpty())
        assertFalse(playbackPlan(listOf(a,b,c), emptyList()).ready)
        val detail = TripDetail(Trip("t", title = "여행", startDate = "2026-10-01"), listOf(b))
        assertTrue(automaticProgress(TripProgress(rules = listOf(ProgressRule("meal", "either"))), detail, Instant.parse("2026-10-01T10:00:00Z"), ProgressPosition(b.lat,b.lng,0.0,Instant.parse("2026-10-01T10:00:00Z").toEpochMilli())).isEmpty())
        val resolved=b.withCandidate(choice.candidates[1]).copy(choice=choice.copy(selectedId="B"))
        assertEquals(1,roadPairs(listOf(a,resolved,c)).size); assertEquals(1,flightArcs(listOf(a,resolved,c)).size)
    }
    @Test fun selectingChangesOnlyOneSlotResetsCompletionAndPersistsAllCandidatesAcrossExportAndRestart() = runTest {
        val memory=MemorySecrets(); val repo=DemoTripRepository(memory)
        val trip=repo.importArchive(readArchive(encodeArchive(archive()))).tripId
        val stop=repo.detail(trip).stops[1]
        val selected=repo.selectChoice(trip,ChoiceSelection(stop.id,1,"B"))
        assertEquals("후보 B",selected.name);assertEquals(130.42,selected.lng,0.0)
        assertEquals(stop.id,selected.id);assertEquals(1,selected.position);assertEquals("12:00",selected.time)
        assertEquals(3,repo.detail(trip).stops.size)
        repo.updateProgress(trip,ProgressMutation(action="manual",stopId=stop.progressKey(),done=true))
        val changed=repo.selectChoice(trip,ChoiceSelection(stop.id,selected.choice!!.revision,"A"))
        assertTrue(repo.progress(trip).entries.isEmpty())
        try { repo.selectChoice(trip,ChoiceSelection(stop.id,1,null)); fail("Expected conflict") } catch (e:ApiException) { assertEquals(409,e.status) }
        val restarted=DemoTripRepository(memory).detail(trip).stops[1];assertEquals(changed,restarted)
        val exported=readArchive(repo.exportArchive(trip));assertEquals(2,exported.stops[1].choice!!.candidates.size);assertEquals("A",exported.stops[1].choice!!.selectedId)
        val pending=repo.selectChoice(trip,ChoiceSelection(stop.id,changed.choice!!.revision,null));assertTrue(pending.pendingChoice());assertEquals("점심",pending.name)
        try { repo.updateProgress(trip,ProgressMutation(revision=repo.progress(trip).revision,action="manual",stopId=stop.progressKey(),done=true));fail("Unresolved completion") } catch (e:ApiException) { assertEquals(400,e.status) }
    }
}
