package com.heptivision.airo

import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.network.*
import com.heptivision.airo.data.ai.*
import com.heptivision.airo.data.auth.*
import com.heptivision.airo.data.trips.DemoTripRepository
import com.heptivision.airo.feature.chat.ChatViewModel
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.time.Instant
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class, DelicateCoroutinesApi::class)
class ChatViewModelTest {
    private val main = newSingleThreadContext("chat-ui-test")
    private val server = MockWebServer()
    private lateinit var ai: AiRepository
    private lateinit var model: ChatViewModel
    private val device get() = AiDevice("11111111-1111-4111-8111-111111111111", "Fixture", "ready", Instant.now().toString())
    @Before fun setup() {
        Dispatchers.setMain(main); server.start()
        val base = server.url("/").toString().trimEnd('/')
        val vault = MemorySecrets()
        vault.write("session:$base", wireJson.encodeToString(Session("fixture-token", "fixture-refresh", Long.MAX_VALUE, Account("fixture"))))
        val auth = AuthRepository(base, HttpTransport(), vault)
        ai = AiRepository(AccountClient(base, HttpTransport(), auth), vault, auth, false)
        model = ChatViewModel("demo-rome", ai, DemoTripRepository(MemorySecrets()))
    }
    @After fun close() { model.viewModelScope.cancel(); server.shutdown(); Dispatchers.resetMain(); main.close() }
    private fun response(body: String = "{}", status: Int = 200) = server.enqueue(MockResponse().setResponseCode(status).setBody(body))
    private suspend fun waitFor(condition: () -> Boolean) = withTimeout(5000) { while (!condition()) delay(10) }
    @Test fun uncertainEnqueueRetriesSameIdAndClearsOnlyAfterCompletion() = runBlocking {
        response(status = 503)
        withContext(main) { model.send(device, "fixture request") {} }
        waitFor { model.state.value.paused }
        val first = wireJson.decodeFromString<PendingChat>(server.takeRequest(5, TimeUnit.SECONDS)!!.body.readUtf8())
        assertEquals(first.id, ai.pending("demo-rome")!!.id)
        response(); response(wireJson.encodeToString(AiJob(first.id, "completed", "fixture result")))
        withContext(main) { model.resume() }
        waitFor { model.state.value.pending == null && !model.state.value.busy }
        val retry = wireJson.decodeFromString<PendingChat>(server.takeRequest(5, TimeUnit.SECONDS)!!.body.readUtf8())
        assertEquals(first, retry)
        assertEquals("/api/bridge/jobs/${first.id}", server.takeRequest(5, TimeUnit.SECONDS)!!.path)
        assertNull(ai.pending("demo-rome")); assertNull(model.state.value.error)
    }
    @Test fun definitiveRejectionRestoresDraftAndApiAccountNeverEnqueues() = runBlocking {
        withContext(main) { model.send(device.copy(state = "api_account"), "must not send") {} }
        assertEquals(0, server.requestCount)
        response(status = 409)
        withContext(main) { model.send(device, "recover this draft") {} }
        waitFor { !model.state.value.busy }
        assertNull(ai.pending("demo-rome")); assertNull(model.state.value.pending)
        assertEquals("recover this draft", model.state.value.unsentMessage)
        assertNotNull(model.state.value.error)
        assertEquals(1, server.requestCount)
    }
    @Test fun cancelStopsPollingAndClearsPersistedRequestAfterServerAcknowledges() = runBlocking {
        response()
        response(wireJson.encodeToString(AiJob(device.id, "running")))
        withContext(main) { model.send(device, "cancel this fixture") {} }
        val queued = server.takeRequest(5, TimeUnit.SECONDS)!!
        val pending = wireJson.decodeFromString<PendingChat>(queued.body.readUtf8())
        assertEquals("/api/bridge/jobs/${pending.id}", server.takeRequest(5, TimeUnit.SECONDS)!!.path)
        response()
        withContext(main) { model.cancel() }
        waitFor { model.state.value.pending == null }
        val cancel = server.takeRequest(5, TimeUnit.SECONDS)!!
        assertEquals("POST", cancel.method)
        assertEquals("/api/bridge/jobs/${pending.id}", cancel.path)
        assertEquals("{\"action\":\"cancel\"}", cancel.body.readUtf8())
        assertNull(ai.pending("demo-rome")); assertFalse(model.state.value.busy)
    }
}
