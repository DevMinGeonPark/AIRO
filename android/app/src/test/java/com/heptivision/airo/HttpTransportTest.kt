package com.heptivision.airo

import com.heptivision.airo.core.network.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test

class HttpTransportTest {
    @Test fun documentsStayBinaryAndOversizedResponsesFail() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val http = HttpTransport()
            val bytes = byteArrayOf(37, 80, 68, 70, 45, 0, -1, -128)
            server.enqueue(MockResponse().setBody(Buffer().write(bytes)).setHeader("Content-Type", "application/pdf"))
            assertArrayEquals(bytes, http.download(server.url("/document").toString()))
            server.enqueue(MockResponse().setBody("x".repeat(100)))
            val error = runCatching { http.download(server.url("/large").toString(), maxBytes = 64) }.exceptionOrNull()
            assertEquals(413, (error as ApiException).status)
        } finally { server.shutdown() }
    }
    @Test fun redirectsNeverForwardTheBearerToken() = runBlocking {
        val source = MockWebServer(); source.start()
        val foreign = MockWebServer(); foreign.start()
        try {
            source.enqueue(MockResponse().setResponseCode(302).setHeader("Location", foreign.url("/steal")))
            val result = runCatching { HttpTransport().request(source.url("/trip").toString(), headers = mapOf("Authorization" to "Bearer fixture-secret")) }
            assertTrue(result.isFailure)
            assertEquals(0, foreign.requestCount)
        } finally { source.shutdown(); foreign.shutdown() }
    }
}
