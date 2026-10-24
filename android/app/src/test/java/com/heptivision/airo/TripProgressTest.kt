package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.data.trips.*
import com.heptivision.airo.feature.itinerary.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class TripProgressTest {
    @Test fun automaticChecksUseTravelDateZoneAccuracyFreshnessAndManualPause() {
        val original = DemoTripRepository.seed().first()
        val stop = original.stops.first().copy(time = "10:00")
        val detail = original.copy(trip = original.trip.copy(startDate = "2026-09-18"), stops = listOf(stop))
        val time = Instant.parse("2026-09-18T01:01:00Z")
        val progress = TripProgress(rules = listOf(ProgressRule(stop.id, "either", 150)))
        assertEquals("time", automaticProgress(progress, detail, time).single().second)
        assertTrue(automaticProgress(progress, detail, time.minusSeconds(86400)).isEmpty())
        assertTrue(automaticProgress(progress.copy(timeZone = "America/Los_Angeles"), detail, time).isEmpty())
        val position = ProgressPosition(stop.lat, stop.lng, 20.0, time.toEpochMilli())
        assertEquals("location", automaticProgress(progress, detail, time, position).single().second)
        val locationOnly = progress.copy(rules = listOf(ProgressRule(stop.id, "location", 150)))
        assertTrue(automaticProgress(locationOnly, detail, time, position.copy(accuracy = 120.0)).isEmpty())
        assertTrue(automaticProgress(locationOnly, detail, time, position.copy(timestamp = time.toEpochMilli() - 61000)).isEmpty())
        assertTrue(automaticProgress(locationOnly, detail, time, position.copy(lng = stop.lng + .0015, accuracy = 80.0)).isEmpty())
        val paused = progress.copy(entries = listOf(ProgressEntry(stop.id, false, "manual", null, time.toString())))
        assertTrue(automaticProgress(paused, detail, time, position).isEmpty())
        assertTrue(automaticProgress(progress, detail.copy(trip = detail.trip.copy(startDate = null)), time, position).isEmpty())
    }

    @Test fun progressAndPreparationPersistRoundTripAndRejectStaleChanges() = runBlocking {
        val secrets = MemorySecrets(); val repo = DemoTripRepository(secrets)
        val id = "demo-rome"
        val saved = repo.updateProgress(id, ProgressMutation(action = "manual", stopId = "pantheon", done = true))
        assertTrue(saved.entries.single().done)
        assertEquals(409, (runCatching { repo.updateProgress(id, ProgressMutation(action = "manual", stopId = "pantheon", done = false)) }.exceptionOrNull() as ApiException).status)
        val prep = repo.preparation(id)
        repo.savePreparation(id, prep.copy(items = prep.items.mapIndexed { index, row -> row.copy(done = index == 0) }))
        val exported = readArchive(repo.exportArchive(id))
        val imported = repo.importArchive(exported)
        val newStop = repo.detail(imported.tripId).stops.first()
        assertTrue(repo.progress(imported.tripId).entry(newStop)!!.done)
        assertTrue(repo.preparation(imported.tripId).items.first().done)
        assertTrue(DemoTripRepository(secrets).progress(id).entries.single().done)
        assertTrue(runCatching { repo.savePreparation(id, prep) }.exceptionOrNull() is ApiException)
    }

    @Test fun viewModelPersistsTimeAndLocationCompletionsAndHonorsManualOverride() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repo = DemoTripRepository(MemorySecrets())
            val id = "demo-rome"
            repo.update(id, TripInput("진행 검증", java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString()))
            val original = repo.detail(id).stops.first()
            repo.saveStop(id, original.id, StopInput(original.name, original.lng, original.lat, 1, "00:00"))
            val model = ProgressViewModel(id, repo)
            model.schedule(repo.detail(id)); model.refresh(); advanceUntilIdle()
            model.change(ProgressMutation(action = "timezone", timeZone = "UTC")); advanceUntilIdle()
            model.change(ProgressMutation(action = "rule", rule = ProgressRule(original.id, "time"))); advanceUntilIdle()
            model.automatic(); advanceUntilIdle()
            assertTrue(repo.progress(id).entries.isEmpty()) // paused screen
            model.active(true); model.automatic(); advanceUntilIdle()
            assertEquals("time", repo.progress(id).entries.single().source)
            model.change(ProgressMutation(action = "manual", stopId = original.id, done = false)); advanceUntilIdle()
            model.automatic(); advanceUntilIdle()
            assertFalse(repo.progress(id).entries.single().done)
            model.change(ProgressMutation(action = "rule", rule = ProgressRule(original.id, "location"))); advanceUntilIdle()
            model.change(ProgressMutation(action = "resume", stopId = original.id)); advanceUntilIdle()
            model.tracking(true)
            model.location(ProgressPosition(original.lat, original.lng, 10.0, System.currentTimeMillis())); advanceUntilIdle()
            assertEquals("location", repo.progress(id).entries.single().source)
            assertTrue(repo.progress(id).entries.single().done)
            model.active(false)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun progressReadCannotOverwriteMutationAndAutomaticWorkStopsWithScreen() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val delegate = DemoTripRepository(MemorySecrets())
            val gate = CompletableDeferred<Unit>()
            var reads = 0
            val repo = object : TripRepository by delegate {
                override suspend fun progress(tripId: String): TripProgress {
                    val snapshot = delegate.progress(tripId)
                    if (++reads == 2) withContext(NonCancellable) { gate.await() }
                    return snapshot
                }
            }
            val model = ProgressViewModel("demo-rome", repo)
            model.refresh(); advanceUntilIdle()
            model.refresh(); runCurrent()
            model.change(ProgressMutation(action = "manual", stopId = "pantheon", done = true)); advanceUntilIdle()
            gate.complete(Unit); advanceUntilIdle()
            assertTrue(model.state.value.data!!.entries.single().done)
            model.tracking(true)
            assertFalse(model.state.value.tracking)
            model.active(false)
            model.automatic(); advanceUntilIdle()
            assertEquals(1, model.state.value.data!!.revision)
        } finally { Dispatchers.resetMain() }
    }
}
