package com.heptivision.airo

import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.network.*
import com.heptivision.airo.data.auth.*
import com.heptivision.airo.feature.auth.AuthViewModel
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.*
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class, DelicateCoroutinesApi::class)
class AuthViewModelTest {
    @Test fun callbackArrivingBeforeEmailResponseIsNotLost() = runBlocking {
        val main = newSingleThreadContext("auth-ui-test")
        Dispatchers.setMain(main)
        val releaseEmail = CountDownLatch(1)
        val server = MockWebServer()
        server.start()
        val base = server.url("/").toString().trimEnd('/')
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.requestUrl!!.encodedPath) {
                "/auth/mobile/config" -> MockResponse().setBody(wireJson.encodeToString(AuthConfig(base, "fixture", AuthRepository.CALLBACK)))
                "/auth/v1/otp" -> { check(releaseEmail.await(5, TimeUnit.SECONDS)); MockResponse().setBody("{}") }
                "/auth/v1/token" -> MockResponse().setBody("""{"access_token":"fresh","refresh_token":"refresh","expires_in":3600,"user":{"id":"fixture"}}""")
                else -> MockResponse().setResponseCode(404)
            }
        }
        val repository = AuthRepository(base, HttpTransport(), MemorySecrets())
        val model = withContext(main) { AuthViewModel(repository).also { it.email("fixture@example.test") } }
        try {
            assertEquals("/auth/mobile/config", server.takeRequest(5, TimeUnit.SECONDS)!!.path)
            val email = server.takeRequest(5, TimeUnit.SECONDS)!!
            val callback = email.requestUrl!!.queryParameter("redirect_to")!! + "&code=synthetic"
            withContext(main) { assertTrue(model.state.value.busy); model.callback(callback) }
            releaseEmail.countDown()
            withTimeout(5000) { while (repository.session.value == null) delay(10) }
            assertEquals("fresh", repository.session.value!!.accessToken)
            assertEquals("/auth/v1/token?grant_type=pkce", server.takeRequest(5, TimeUnit.SECONDS)!!.path)
            withContext(main) { assertNull(model.state.value.error) }
        } finally {
            releaseEmail.countDown()
            model.viewModelScope.cancel()
            server.shutdown(); Dispatchers.resetMain(); main.close()
        }
    }
}
