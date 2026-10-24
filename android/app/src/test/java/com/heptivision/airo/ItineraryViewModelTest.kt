package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.data.trips.*
import com.heptivision.airo.feature.itinerary.ItineraryViewModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ItineraryViewModelTest {
    @Test fun savingCancelsOldReadAndFetchesCommittedDetail() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val memory = DemoTripRepository(MemorySecrets())
            val stale = CompletableDeferred<TripDetail>()
            var reads = 0
            val repository = object : TripRepository by memory {
                override suspend fun detail(id: String): TripDetail {
                    reads++
                    return if (reads == 1) stale.await() else memory.detail(id)
                }
            }
            val model = ItineraryViewModel("demo-rome", repository)
            runCurrent()
            assertEquals(1, reads)
            model.saveStop("pantheon", StopInput("수정된 판테온", 12.47687, 41.89861, 1)) {}
            advanceUntilIdle()
            assertEquals(2, reads)
            assertEquals("수정된 판테온", model.state.value.detail?.stops?.find { it.id == "pantheon" }?.name)
            assertFalse(model.state.value.loading)
            stale.complete(DemoTripRepository.seed().first())
            runCurrent()
            assertEquals("수정된 판테온", model.state.value.detail?.stops?.find { it.id == "pantheon" }?.name)
        } finally { Dispatchers.resetMain() }
    }
}
