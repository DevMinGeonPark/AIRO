package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.wireJson
import com.heptivision.airo.data.trips.DemoTripRepository
import com.heptivision.airo.data.auth.serverOrigin
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest
import java.util.Base64

class ArchiveTest {
    private fun archive(): ArchiveFile {
        val pdf = "%PDF-1.4\n% synthetic fixture\n%%EOF".toByteArray()
        val sha = MessageDigest.getInstance("SHA-256").digest(pdf).joinToString("") { "%02x".format(it) }
        return ArchiveFile(sourceKey = "fixture:roundtrip", exportedAt = "2026-09-17T00:00:00Z", trip = ArchiveTrip("Synthetic archive", "2026-10-01"),
            stops = listOf(ArchiveStop("original-stop", "Fixture place", 12.48, 41.9, 0)),
            messages = listOf(ArchiveMessage("user", "Original conversation", "2026-09-01T12:30:00Z")),
            data = buildJsonObject {
                put("originalTrip", buildJsonObject { put("untouched", "original source") })
                put("sourceFiles", buildJsonObject { put("receipt", sha) })
                put("documents", buildJsonArray { add(buildJsonObject { put("name", "Fixture.pdf"); put("mime", "application/pdf"); put("base64", Base64.getEncoder().encodeToString(pdf)); put("sha256", sha) }) })
            })
    }
    @Test fun importIsIdempotentAndExportPreservesOriginalPdfAndMetadata() = runBlocking {
        val original = readArchive(encodeArchive(archive()))
        val store = MemorySecrets(); val repository = DemoTripRepository(store)
        val result = repository.importArchive(original)
        assertTrue(result.imported)
        val again = repository.importArchive(original)
        assertFalse(again.imported); assertEquals(result.tripId, again.tripId)
        val stop = repository.detail(result.tripId).stops.single()
        repository.saveStop(result.tripId, stop.id, StopInput("Edited place", 12.48, 41.9, 0, note = "Native edit"))
        val budget = repository.budget(result.tripId)
        repository.saveBudget(result.tripId, budget.copy(reserve = 12000.0))
        val exported = readArchive(DemoTripRepository(store).exportArchive(result.tripId))
        assertEquals(original.data["documents"], exported.data["documents"])
        assertEquals(original.data["originalTrip"], exported.data["originalTrip"])
        assertEquals(original.data["sourceFiles"], exported.data["sourceFiles"])
        assertEquals(original.messages, exported.messages)
        assertEquals("original-stop", exported.stops.single().sourceId)
        assertEquals("Native edit", exported.stops.single().note)
        assertEquals(0, exported.stops.single().day)
        assertEquals(12000.0, exported.budget().reserve, 0.0)
    }
    @Test fun invalidCoordinatesCorruptDocumentsAndUnsupportedFilesAreRejected() {
        val original = archive()
        assertTrue(runCatching { readArchive(encodeArchive(original.copy(stops = listOf(original.stops.first().copy(lat = 200.0))))) }.isFailure)
        val encoded = encodeArchive(original)
        val hash = original.documents().first().sha256
        assertTrue(runCatching { readArchive(encoded.replace(hash, "0".repeat(64))) }.isFailure)
        assertTrue(runCatching { readArchive(encodeArchive(original.copy(format = "random-file"))) }.isFailure)
        assertTrue(runCatching { readArchive("x".repeat(MAX_ARCHIVE_BYTES + 1)) }.isFailure)
        assertFalse(wireJson.parseToJsonElement(encoded).jsonObject["trip"]!!.jsonObject.containsKey("created_at"))
    }
    @Test fun serverOriginsRejectCredentialsPathsAndInsecureRemoteHosts() {
        assertEquals("https://example.com", serverOrigin("https://EXAMPLE.com/"))
        for (url in listOf("http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?token=x", "https://example.com/#token")) {
            assertTrue(url, runCatching { serverOrigin(url, true) }.isFailure)
        }
        assertEquals("http://127.0.0.1:3156", serverOrigin("http://127.0.0.1:3156", true))
    }
}
