package com.heptivision.airo

import com.heptivision.airo.core.network.*
import com.heptivision.airo.core.security.SecretStore
import com.heptivision.airo.data.auth.*
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class MemorySecrets : SecretStore {
    private val values = mutableMapOf<String, String>()
    override fun read(key: String) = values[key]
    override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
}

class AuthRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var vault: MemorySecrets
    private lateinit var base: String
    private var clock = 1000L
    @Before fun setup() { server = MockWebServer(); server.start(); base = server.url("/").toString().trimEnd('/'); vault = MemorySecrets() }
    @After fun close() { server.shutdown() }
    private fun repo() = AuthRepository(base, HttpTransport(), vault, now = { clock })
    private fun response(body: String, status: Int = 200) = server.enqueue(MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body))
    private fun config() = response(wireJson.encodeToString(AuthConfig(base, "fixture-anon", AuthRepository.CALLBACK)))
    private fun token(access: String = "fresh") = response("""{"access_token":"$access","refresh_token":"refresh-next","expires_in":3600,"user":{"id":"owner","email":"owner@example.test"}}""")
    private fun stored(expires: Long = 900) { vault.write("session:$base", wireJson.encodeToString(Session("old", "refresh-old", expires, Account("owner")))) }

    @Test fun pkceMatchesRfc7636Vector() {
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }
    @Test fun callbackSurvivesProcessRestartAndIsSingleUse() = runBlocking {
        config()
        val url = repo().googleUrl().toHttpUrl()
        assertEquals("s256", url.queryParameter("code_challenge_method"))
        val redirect = url.queryParameter("redirect_to")!!
        config(); token()
        val restored = repo()
        restored.acceptCallback("$redirect&code=fixture-code")
        assertEquals("fresh", restored.accessToken())
        assertEquals("owner", restored.session.value?.user?.id)
        server.takeRequest(); server.takeRequest()
        val exchange = server.takeRequest()
        assertEquals("/auth/v1/token?grant_type=pkce", exchange.path)
        assertTrue(exchange.body.readUtf8().contains("code_verifier"))
        assertNull(vault.read("pending:$base"))
        assertTrue(runCatching { restored.acceptCallback("$redirect&code=fixture-code") }.exceptionOrNull() is IllegalArgumentException)
    }
    @Test fun invalidStateCannotExchangeCode() = runBlocking {
        config()
        val auth = repo(); auth.googleUrl()
        val result = runCatching { auth.acceptCallback("${AuthRepository.CALLBACK}?native_state=wrong&code=fixture") }
        assertTrue(result.exceptionOrNull() is IllegalArgumentException)
        assertNull(auth.session.value)
        assertEquals(1, server.requestCount)
    }
    @Test fun expiredCallbackCannotExchangeCode() = runBlocking {
        config(); val auth = repo()
        val redirect = auth.googleUrl().toHttpUrl().queryParameter("redirect_to")!!
        clock += 3601
        assertTrue(runCatching { auth.acceptCallback("$redirect&code=fixture") }.isFailure)
        assertEquals(1, server.requestCount)
    }
    @Test fun concurrentRefreshUsesOneRefreshTokenExchange() = runBlocking {
        stored(); config(); token()
        val auth = repo()
        val results = (1..8).map { async { auth.accessToken(rejectedToken = "old") } }.awaitAll()
        assertTrue(results.all { it == "fresh" })
        assertEquals(2, server.requestCount)
        server.takeRequest()
        assertEquals("/auth/v1/token?grant_type=refresh_token", server.takeRequest().path)
    }
    @Test fun rejectedRefreshClearsAccountButNetworkFailureDoesNot() = runBlocking {
        stored(); config(); response("{}", 503)
        val auth = repo()
        assertTrue(runCatching { auth.accessToken() }.isFailure)
        assertNotNull(auth.session.value)
        response("{}", 401)
        assertTrue(runCatching { auth.accessToken() }.isFailure)
        assertNull(auth.session.value)
        assertNull(vault.read("session:$base"))
    }
    @Test fun signOutClearsSessionEvenIfServerUnavailable() = runBlocking {
        stored(); config(); response("{}", 503)
        val auth = repo(); auth.signOut()
        assertNull(auth.session.value)
        assertNull(vault.read("session:$base"))
    }
    @Test fun communityLoginRefreshAndLogoutUseOnlyTheChosenServer() = runBlocking {
        response(wireJson.encodeToString(AuthConfig(redirectUri = AuthRepository.CALLBACK, edition = "community")))
        val session = Session("local-token", "", 1050, Account("local-owner", "owner@example.test"), "community")
        response(wireJson.encodeToString(session))
        val auth = repo(); auth.communityLogin("fixture-password")
        assertEquals("community", auth.session.value?.kind)
        response(wireJson.encodeToString(session.copy(accessToken = "local-refreshed", expiresAt = 5000)))
        assertEquals("local-refreshed", auth.accessToken())
        server.takeRequest()
        val login = server.takeRequest(); assertEquals("/auth/mobile/session", login.path)
        assertTrue(login.body.readUtf8().contains("fixture-password"))
        val refresh = server.takeRequest(); assertEquals("Bearer local-token", refresh.getHeader("Authorization"))
        assertEquals("/auth/mobile/session", refresh.path)
        auth.signOut(); assertNull(auth.session.value)
        assertEquals(3, server.requestCount)
    }
}
