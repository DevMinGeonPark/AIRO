package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.data.trips.*
import com.heptivision.airo.feature.itinerary.ItineraryViewModel
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MapRoutesTest {
    private val base = DemoTripRepository.seed().first()
    private fun route(from: Stop, to: Stop) = RoadRoute(listOf(listOf(from.lng, from.lat), listOf(from.lng, to.lat), listOf(to.lng, to.lat)))
    @Test fun savedGeometryMatchesCoordinatesAndFlightsCrossTheShortWay() {
        val stops = base.stops
        val pair = RoutePair(stops[0], stops[1])
        assertTrue(route(pair.from, pair.to).matches(pair))
        assertFalse(route(pair.from, pair.to).matches(pair.copy(to = pair.to.copy(lng = 45.0))))
        assertFalse(RoadRoute(listOf(listOf(Double.NaN, 0.0), listOf(0.0, 0.0))).valid())
        val flights = listOf(stops[0].copy(lng = 170.0, lat = 30.0), stops[1].copy(lng = -170.0, lat = 35.0, mode = "flight"))
        assertTrue(roadPairs(flights).isEmpty())
        val arc = flightArcs(flights).single()
        assertEquals(65, arc.size)
        assertEquals(190.0, arc.last()[0], .0001)
        assertTrue(arc.zipWithNext().all { (a, b) -> kotlin.math.abs(a[0] - b[0]) < 2 })
        assertEquals(1, stopOrdinals(stops)["trevi"])
        assertEquals(1, stopOrdinals(stops)["colosseum"])
        assertTrue(roadPairs(listOf(stops[0], stops[1].copy(lat = stops[0].lat, lng = stops[0].lng))).isEmpty())
    }

    @Test fun automaticLoadsUseSavedRoadsCacheSwitchesAndRetryOnlyMissingLegs() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            var detail = base.copy(roads = mapOf("pantheon->coffee" to route(base.stops[0], base.stops[1])))
            val calls = mutableListOf<String>()
            var fail = true
            val memory = DemoTripRepository(MemorySecrets())
            val repository = object : TripRepository by memory {
                override suspend fun detail(id: String) = detail
                override suspend fun route(tripId: String, from: Stop, to: Stop): RoadRoute {
                    calls += "${from.id}->${to.id}"
                    if (fail && to.id == "navona") throw ApiException(502, "fixture failure")
                    return route(from, to)
                }
            }
            val model = ItineraryViewModel(base.trip.id, repository)
            model.routes(1); advanceUntilIdle()
            assertEquals(listOf("coffee->navona"), calls)
            assertEquals(1, model.state.value.roads.size)
            assertNotNull(model.state.value.routeError)
            fail = false; model.routes(1, retry = true); advanceUntilIdle()
            assertEquals(2, model.state.value.roads.size)
            assertNull(model.state.value.routeError)
            model.routes(2); advanceUntilIdle()
            assertEquals("trevi->spanish", calls.last())
            val count = calls.size
            model.routes(1); advanceUntilIdle()
            assertEquals(count, calls.size)
            detail = detail.copy(stops = detail.stops.map { if (it.id == "coffee") it.copy(lng = it.lng + .01) else it })
            model.refresh(); advanceUntilIdle()
            assertEquals(count + 2, calls.size)
            assertEquals(2, model.state.value.roads.size)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun completedMiddleStopIsRemovedFromRouteAndPlaybackAndUndoRestoresCachedLegs() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val calls = mutableListOf<String>()
            val real = DemoTripRepository(MemorySecrets())
            val repo = object : TripRepository by real {
                override suspend fun route(tripId: String, from: Stop, to: Stop): RoadRoute {
                    calls += "${from.id}->${to.id}"; return route(from, to)
                }
            }
            val model = ItineraryViewModel(base.trip.id, repo)
            model.routes(1); advanceUntilIdle()
            val original = model.state.value.roads
            val unfinished = remainingStops(base.stops.filter { it.day == 1 }, setOf("coffee"))
            model.routes(1, completedIds = setOf("coffee")); advanceUntilIdle()
            assertEquals("pantheon->navona", calls.last())
            assertEquals(1, model.state.value.roads.size)
            val playback = playbackPlan(unfinished, model.state.value.roads)
            assertTrue(playback.ready)
            assertEquals("pantheon", playback.legs.single().from.id)
            assertEquals("navona", playback.legs.single().to.id)
            val count = calls.size
            model.routes(1, completedIds = emptySet()); advanceUntilIdle()
            assertEquals(original, model.state.value.roads); assertEquals(count, calls.size)
            model.routes(1, completedIds = base.stops.map { it.id }.toSet()); advanceUntilIdle()
            assertTrue(model.state.value.roads.isEmpty())
            assertTrue(model.state.value.roadsByPair.isEmpty())
        } finally { Dispatchers.resetMain() }
    }

    @Test fun failureDoesNotDiscardOtherLegsAndLateOldDayCannotOverwriteNewDay() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val memory = DemoTripRepository(MemorySecrets())
            val gate = CompletableDeferred<Unit>()
            val repository = object : TripRepository by memory {
                override suspend fun route(tripId: String, from: Stop, to: Stop): RoadRoute {
                    if (to.id == "coffee") withContext(NonCancellable) { gate.await() }
                    return route(from, to)
                }
            }
            val model = ItineraryViewModel(base.trip.id, repository)
            advanceUntilIdle(); model.routes(1); runCurrent()
            model.routes(2); runCurrent()
            assertEquals(2, model.state.value.routeDay)
            val day2 = model.state.value.roads
            gate.complete(Unit); advanceUntilIdle()
            assertEquals(day2, model.state.value.roads)
            assertEquals(2, model.state.value.routeDay)
        } finally { Dispatchers.resetMain() }
    }
}
