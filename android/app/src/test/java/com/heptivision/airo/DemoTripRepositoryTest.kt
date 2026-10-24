package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.security.SecretStore
import com.heptivision.airo.data.trips.DemoTripRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class DemoTripRepositoryTest {
    @Test fun budgetConflictsAndBookmarksRetainCommittedData() = runBlocking {
        val memory = MemorySecrets()
        val repository = DemoTripRepository(memory)
        val first = repository.budget("demo-rome")
        val saved = repository.saveBudget("demo-rome", first.copy(reserve = 15000.0))
        assertEquals(1, saved.revision)
        assertTrue(runCatching { repository.saveBudget("demo-rome", first.copy(reserve = 1.0)) }.isFailure)
        repository.bookmark("demo-rome", "pantheon", true)
        repository.deleteStop("demo-rome", "pantheon")
        val restored = DemoTripRepository(memory)
        assertEquals(15000.0, restored.budget("demo-rome").reserve, 0.0)
        assertTrue("pantheon" in restored.resources("demo-rome").savedPlaceIds)
        assertTrue(restored.resources("demo-rome").places.any { it.id == "pantheon" })
    }
    @Test fun saveFailurePreservesLastCommittedState() = runBlocking {
        val memory = MemorySecrets()
        val broken = object : SecretStore by memory {
            override fun write(key: String, value: String?) { throw IllegalStateException("disk full") }
        }
        val repository = DemoTripRepository(broken)
        val before = repository.detail("demo-rome")
        assertTrue(runCatching { repository.update("demo-rome", TripInput("must not persist", null)) }.isFailure)
        assertEquals(before, repository.detail("demo-rome"))
        assertTrue(runCatching { repository.delete("demo-rome") }.isFailure)
        assertEquals(before, repository.detail("demo-rome"))
    }
    @Test fun movingAndDeletingStopsPersistsAcrossRepositoryRecreation() = runBlocking {
        val memory = MemorySecrets()
        val repository = DemoTripRepository(memory)
        repository.moveStop("demo-rome", "navona", 1, 0)
        var restored = DemoTripRepository(memory)
        assertEquals(listOf("navona", "pantheon", "coffee"), restored.detail("demo-rome").stops.filter { it.day == 1 }.map { it.id })
        restored.moveStop("demo-rome", "navona", 2, 1)
        restored.deleteStop("demo-rome", "pantheon")
        restored = DemoTripRepository(memory)
        val detail = restored.detail("demo-rome")
        assertEquals(listOf("trevi", "navona", "spanish"), detail.stops.filter { it.day == 2 }.map { it.id })
        assertFalse(detail.stops.any { it.id == "pantheon" })
        assertEquals(listOf(0, 1, 2), detail.stops.filter { it.day == 2 }.map { it.position })
    }
}
