package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.data.trips.*
import com.heptivision.airo.feature.itinerary.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OptimisticProgressTest {
    private fun click(id: String, done: Boolean = true) = ProgressMutation(action = "manual", stopId = id, done = done)
    @Test fun checksAndUndoAreImmediateWhileRequestsAreSerializedWithoutLostClicks() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val real = DemoTripRepository(MemorySecrets()); val gate = CompletableDeferred<Unit>(); val writes = mutableListOf<ProgressMutation>()
            val repo = object : TripRepository by real {
                override suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress {
                    writes += value
                    if (writes.size == 1) gate.await()
                    return real.updateProgress(tripId, value)
                }
            }
            val model = ProgressViewModel("demo-rome", repo); model.schedule(real.detail("demo-rome")); model.refresh(); advanceUntilIdle()
            val stops = real.detail("demo-rome").stops
            model.toggle(stops[0])
            assertTrue(model.state.value.data!!.entry(stops[0])!!.done) // no scheduler advancement, zero network wait
            assertTrue(model.state.value.busy)
            runCurrent(); assertEquals(1, writes.size)
            model.toggle(stops[1]); model.toggle(stops[0]); model.toggle(stops[1]); model.toggle(stops[1])
            assertFalse(model.state.value.data!!.entry(stops[0])!!.done)
            assertTrue(model.state.value.data!!.entry(stops[1])!!.done)
            assertEquals(1, writes.size)
            gate.complete(Unit); advanceUntilIdle()
            assertEquals(listOf(0, 1, 2), writes.map { it.revision })
            assertFalse(real.progress("demo-rome").entry(stops[0])!!.done)
            assertTrue(real.progress("demo-rome").entry(stops[1])!!.done)
            assertFalse(model.state.value.busy)
        } finally { Dispatchers.resetMain() }
    }
    @Test fun immediateRuleSaveCannotStartTwoWorkersForDelayedAutomaticSave() = runTest {
        Dispatchers.setMain(UnconfinedTestDispatcher(testScheduler))
        try {
            val real = DemoTripRepository(MemorySecrets()); val gate = CompletableDeferred<Unit>(); var automaticRequests = 0
            val id = "demo-rome"
            real.update(id, TripInput("immediate", java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString()))
            val first = real.detail(id).stops[0]
            real.saveStop(id, first.id, StopInput(first.name, first.lng, first.lat, 1, "00:00"))
            val repo = object : TripRepository by real {
                override suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress {
                    if (value.action == "automatic") { automaticRequests++; gate.await() }
                    return real.updateProgress(tripId, value)
                }
            }
            val model = ProgressViewModel(id, repo); model.schedule(real.detail(id)); model.refresh()
            model.change(ProgressMutation(action = "timezone", timeZone = "UTC")); model.active(true)
            model.change(ProgressMutation(action = "rule", rule = ProgressRule(first.id, "time")))
            assertEquals(1, automaticRequests)
            model.change(click("coffee"))
            assertEquals(1, automaticRequests)
            gate.complete(Unit); advanceUntilIdle()
            assertEquals(2, real.progress(id).entries.count { it.done })
            assertFalse(model.state.value.busy)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun failedWriteRollsBackOnlyThatStopAndDoesNotDiscardLaterClicks() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val real = DemoTripRepository(MemorySecrets()); val gate = CompletableDeferred<Unit>()
            val repo = object : TripRepository by real {
                override suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress {
                    if (value.stopId == "pantheon") { gate.await(); throw ApiException(503, "offline fixture") }
                    return real.updateProgress(tripId, value)
                }
            }
            val model = ProgressViewModel("demo-rome", repo); model.refresh(); advanceUntilIdle()
            model.change(click("pantheon")); runCurrent(); model.change(click("coffee"))
            assertEquals(2, model.state.value.data!!.entries.count { it.done })
            gate.complete(Unit); advanceUntilIdle()
            assertEquals(listOf("coffee"), model.state.value.data!!.entries.filter { it.done }.map { it.stopId })
            assertNotNull(model.state.value.error)
            assertFalse(model.state.value.busy)
        } finally { Dispatchers.resetMain() }
    }
    @Test fun conflictRebasesOverAnotherDeviceAndLostSuccessResponseIsReconciled() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val real = DemoTripRepository(MemorySecrets()); var responses = 0
            val repo = object : TripRepository by real {
                override suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress {
                    if (++responses == 1) real.updateProgress(tripId, click("navona")) // another client advanced revision
                    val result = real.updateProgress(tripId, value)
                    if (value.stopId == "coffee") throw ApiException(503, "response dropped after commit")
                    return result
                }
            }
            val model = ProgressViewModel("demo-rome", repo); model.refresh(); advanceUntilIdle()
            model.change(click("pantheon")); model.change(click("coffee")); advanceUntilIdle()
            assertEquals(setOf("pantheon", "coffee", "navona"), model.state.value.data!!.entries.filter { it.done }.map { it.stopId }.toSet())
            assertEquals(real.progress("demo-rome"), model.state.value.data)
            assertFalse(model.state.value.busy)
        } finally { Dispatchers.resetMain() }
    }
    @Test fun automaticCompletionPreviewsBeforeSaveAndBulkRulesSupportUntimedGpsStops() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val real = DemoTripRepository(MemorySecrets()); val gate = CompletableDeferred<Unit>()
            val id = "demo-rome"
            real.update(id, TripInput("automatic", java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString()))
            val first = real.detail(id).stops[0]; val second = real.detail(id).stops[1]
            real.saveStop(id, first.id, StopInput(first.name, first.lng, first.lat, 1, "00:00"))
            real.saveStop(id, second.id, StopInput(second.name, second.lng, second.lat, 1))
            val repo = object : TripRepository by real {
                override suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress {
                    if (value.action == "automatic") gate.await()
                    return real.updateProgress(tripId, value)
                }
            }
            val detail = real.detail(id)
            val model = ProgressViewModel(id, repo); model.schedule(detail); model.refresh(); advanceUntilIdle()
            model.change(ProgressMutation(action = "timezone", timeZone = "UTC")); advanceUntilIdle()
            model.active(true)
            assertTrue(model.configure(detail.stops.take(2), "either")); runCurrent()
            assertEquals("location", model.state.value.data!!.rule(second).mode)
            assertTrue(model.state.value.data!!.entry(first)!!.done)
            assertEquals("time", model.state.value.data!!.entry(first)!!.source)
            assertTrue(real.progress(id).entries.isEmpty())
            gate.complete(Unit); advanceUntilIdle()
            assertEquals("time", real.progress(id).entry(first)!!.source)
            model.tracking(true)
            model.location(ProgressPosition(second.lat, second.lng, 10.0, System.currentTimeMillis()))
            assertTrue(model.state.value.data!!.entry(second)!!.done)
            advanceUntilIdle(); assertEquals("location", real.progress(id).entry(second)!!.source)
            model.change(click(second.id, false)); advanceUntilIdle()
            model.location(ProgressPosition(second.lat, second.lng, 10.0, System.currentTimeMillis())); advanceUntilIdle()
            assertFalse(real.progress(id).entry(second)!!.done)
        } finally { Dispatchers.resetMain() }
    }
}
