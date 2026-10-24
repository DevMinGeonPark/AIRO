package com.heptivision.airo.data.auth

import com.heptivision.airo.core.network.*
import com.heptivision.airo.core.security.SecretStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.encodeToString
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

@Serializable data class Account(val id: String, val email: String = "")
@Serializable data class Session(val accessToken: String, val refreshToken: String, val expiresAt: Long, val user: Account, val kind: String = "cloud")
@Serializable data class AuthConfig(val supabaseUrl: String = "", val supabaseAnonKey: String = "", val redirectUri: String, val edition: String = "cloud")
@Serializable private data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Long,
    val user: Account,
)
@Serializable private data class PendingLogin(val verifier: String, val state: String, val createdAt: Long)

fun pkceChallenge(verifier: String): String = Base64.getUrlEncoder().withoutPadding()
    .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
private fun randomToken() = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(SecureRandom()::nextBytes))

class AuthRepository(
    private val baseUrl: String,
    private val http: HttpTransport,
    private val vault: SecretStore,
    val demo: Boolean = false,
    private val now: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private val sessionKey = "session:$baseUrl"
    private val pendingKey = "pending:$baseUrl"
    private val lock = Mutex()
    private var config: AuthConfig? = null
    private val _session = MutableStateFlow(vault.read(sessionKey)?.let { runCatching { wireJson.decodeFromString<Session>(it) }.getOrNull() })
    val session = _session.asStateFlow()
    val server get() = baseUrl
    suspend fun edition(): String = configuration().edition

    private suspend fun configuration(): AuthConfig = config ?: wireJson.decodeFromString<AuthConfig>(
        http.request("$baseUrl/auth/mobile/config")
    ).also {
        require(it.redirectUri == CALLBACK) { "로그인 연결 설정을 확인해 주세요." }
        require(it.edition in listOf("cloud", "community"))
        if (it.edition == "cloud") {
            val authHost = it.supabaseUrl.toHttpUrl()
            require(authHost.isHttps || (baseUrl.startsWith("http://") && authHost.host in listOf("127.0.0.1", "10.0.2.2", "localhost")))
        }
        config = it
    }
    private fun persist(session: Session?) {
        vault.write(sessionKey, session?.let(wireJson::encodeToString))
        _session.value = session
    }
    private fun begin(): PendingLogin = PendingLogin(randomToken(), randomToken(), now()).also {
        vault.write(pendingKey, wireJson.encodeToString(it))
    }
    private fun redirect(pending: PendingLogin) = "$CALLBACK?native_state=${pending.state}"

    suspend fun googleUrl(): String = lock.withLock {
        val settings = configuration()
        require(settings.edition == "cloud")
        val pending = begin()
        settings.supabaseUrl.toHttpUrl().newBuilder().addPathSegments("auth/v1/authorize")
            .addQueryParameter("provider", "google").addQueryParameter("redirect_to", redirect(pending))
            .addQueryParameter("code_challenge", pkceChallenge(pending.verifier)).addQueryParameter("code_challenge_method", "s256")
            .addQueryParameter("prompt", "select_account").build().toString()
    }
    suspend fun sendEmail(email: String) = lock.withLock {
        val settings = configuration()
        require(settings.edition == "cloud")
        val pending = begin()
        val url = settings.supabaseUrl.toHttpUrl().newBuilder().addPathSegments("auth/v1/otp")
            .addQueryParameter("redirect_to", redirect(pending)).build()
        http.request(url.toString(), "POST", wireJson.encodeToString(mapOf(
            "email" to email.trim(), "code_challenge" to pkceChallenge(pending.verifier), "code_challenge_method" to "s256"
        )), mapOf("apikey" to settings.supabaseAnonKey))
    }
    suspend fun communityLogin(password: String) = lock.withLock {
        require(configuration().edition == "community")
        val response = http.request("$baseUrl/auth/mobile/session", "POST", wireJson.encodeToString(mapOf("action" to "login", "password" to password)))
        persist(wireJson.decodeFromString<Session>(response))
    }
    suspend fun acceptCallback(value: String) = lock.withLock {
        val uri = URI(value)
        require(uri.scheme == "com.heptivision.airo" && uri.host == "auth" && uri.path == "/callback" && uri.fragment == null) { "올바른 로그인 링크가 아닙니다." }
        val pending = vault.read(pendingKey)?.let { wireJson.decodeFromString<PendingLogin>(it) }
        require(pending != null && now() - pending.createdAt in 0..3600) { "앱에서 로그인을 다시 시작해 주세요." }
        val params = uri.rawQuery.orEmpty().split('&').mapNotNull {
            val pair = it.split('=', limit = 2)
            if (pair.size == 2) URLDecoder.decode(pair[0], "UTF-8") to URLDecoder.decode(pair[1], "UTF-8") else null
        }.toMap()
        require(params["native_state"] == pending.state) { "이 기기에서 시작한 로그인 링크를 열어 주세요." }
        require(params["error"] == null) { "로그인이 취소됐어요. 다시 시도할 수 있습니다." }
        val code = params["code"]
        require(!code.isNullOrBlank()) { "로그인 링크가 만료됐어요. 다시 시도해 주세요." }
        val next = token("pkce", mapOf("auth_code" to code, "code_verifier" to pending.verifier))
        persist(next)
        vault.write(pendingKey, null)
    }
    private suspend fun token(grant: String, body: Map<String, String>): Session {
        val settings = configuration()
        val response = wireJson.decodeFromString<TokenResponse>(http.request(
            "${settings.supabaseUrl}/auth/v1/token?grant_type=$grant", "POST", wireJson.encodeToString(body),
            mapOf("apikey" to settings.supabaseAnonKey)
        ))
        return Session(response.accessToken, response.refreshToken, now() + response.expiresIn, response.user)
    }
    suspend fun accessToken(rejectedToken: String? = null): String = lock.withLock {
        val current = _session.value ?: throw ApiException(401, "로그인이 필요합니다.")
        // Concurrent 401s reuse the token refreshed by the first caller.
        if (current.expiresAt > now() + 60 && (rejectedToken == null || rejectedToken != current.accessToken)) return current.accessToken
        try {
            val refreshed = if (current.kind == "community") wireJson.decodeFromString<Session>(http.request(
                "$baseUrl/auth/mobile/session", "POST", "{\"action\":\"refresh\"}", mapOf("Authorization" to "Bearer ${current.accessToken}")))
                else token("refresh_token", mapOf("refresh_token" to current.refreshToken))
            persist(refreshed)
            refreshed.accessToken
        } catch (error: ApiException) {
            if (error.status in listOf(400, 401, 403)) persist(null)
            throw error
        }
    }
    suspend fun signOut() = lock.withLock {
        val previous = _session.value
        persist(null)
        vault.write(pendingKey, null)
        if (!demo && previous != null && previous.kind != "community") {
            try {
                val settings = configuration()
                http.request("${settings.supabaseUrl}/auth/v1/logout?scope=local", "POST", "{}",
                    mapOf("apikey" to settings.supabaseAnonKey, "Authorization" to "Bearer ${previous.accessToken}"))
            } catch (error: Exception) { if (error is kotlinx.coroutines.CancellationException) throw error }
        }
    }
    suspend fun enterDemo() = lock.withLock {
        check(demo)
        persist(Session("", "", Long.MAX_VALUE, Account("demo", "traveler@example.test")))
    }
    companion object { const val CALLBACK = "com.heptivision.airo://auth/callback" }
}
