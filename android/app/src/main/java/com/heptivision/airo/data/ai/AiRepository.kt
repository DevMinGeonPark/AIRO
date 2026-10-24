package com.heptivision.airo.data.ai

import com.heptivision.airo.core.network.*
import com.heptivision.airo.core.security.SecretStore
import com.heptivision.airo.data.auth.AuthRepository
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.time.Instant

@Serializable data class AiDevice(val id: String, val name: String, val state: String, val seenAt: String? = null, val revokedAt: String? = null) {
    fun online(now: Long = System.currentTimeMillis()): Boolean = revokedAt == null && seenAt != null && runCatching { now - Instant.parse(seenAt).toEpochMilli() in 0..29_999 }.getOrDefault(false)
    fun ready() = online() && state == "ready"
    fun label() = when {
        revokedAt != null -> "연결 해제됨"
        !online() -> "오프라인"
        state == "ready" -> "연결됨"
        state == "login_required" || state == "api_account" -> "Codex 구독 로그인 필요"
        state == "starting" -> "연결 중"
        else -> "연결 확인 필요"
    }
}
@Serializable data class DeviceList(val devices: List<AiDevice>)
@Serializable data class PendingChat(val id: String, val tripId: String, val deviceId: String, val message: String, val context: com.heptivision.airo.core.model.TravelContext? = null)
@Serializable data class AiJob(val id: String, val state: String, val output: String = "", val error: String? = null, val pending: Boolean = false)
@Serializable private data class RevokeDevice(val action: String = "revoke", val id: String)

/** Only the subscription bridge. There is no API-provider or paid fallback option. */
class AiRepository(private val client: AccountClient, private val vault: SecretStore, private val auth: AuthRepository, val demo: Boolean) {
    val server get() = client.baseUrl
    private fun key(tripId: String) = "chat:${client.baseUrl}:${auth.session.value?.user?.id}:$tripId"
    fun pending(tripId: String): PendingChat? = vault.read(key(tripId))?.let { runCatching { wireJson.decodeFromString<PendingChat>(it) }.getOrNull() }
    fun remember(pending: PendingChat) = vault.write(key(pending.tripId), wireJson.encodeToString(pending))
    fun forget(tripId: String) = vault.write(key(tripId), null)
    suspend fun devices(): List<AiDevice> = if (demo) emptyList() else wireJson.decodeFromString<DeviceList>(client.request("/api/bridge/devices")).devices
    suspend fun enqueue(pending: PendingChat) {
        check(!demo) { "샘플 여행에서는 AI 연결을 사용하지 않습니다." }
        client.request("/api/bridge/jobs", "POST", wireJson.encodeToString(pending))
    }
    suspend fun status(id: String): AiJob { requireId(id); return wireJson.decodeFromString(client.request("/api/bridge/jobs/$id")) }
    suspend fun tick(id: String) { requireId(id); client.request("/api/bridge/jobs/$id", "POST", "{\"action\":\"tick\"}") }
    suspend fun cancel(id: String) { requireId(id); client.request("/api/bridge/jobs/$id", "POST", "{\"action\":\"cancel\"}") }
    suspend fun revoke(id: String) { requireId(id); client.request("/api/bridge/devices", "POST", wireJson.encodeToString(RevokeDevice(id = id))) }
    private fun requireId(id: String) { require(Regex("[a-fA-F0-9-]{36}").matches(id)); check(!demo) }
}
