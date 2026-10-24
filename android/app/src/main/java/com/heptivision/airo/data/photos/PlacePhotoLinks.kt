package com.heptivision.airo.data.photos

import com.heptivision.airo.core.security.SecretStore
import com.heptivision.airo.core.network.wireJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.net.URI
import java.security.MessageDigest

@Serializable data class PlacePhotoLink(val uri: String, val addedAt: Long)

/** Only selected content URIs, encrypted and scoped to server/account/trip/stop. Photos stay on the device. */
class PlacePhotoLinks(private val vault: SecretStore, private val origin: String, private val owner: () -> String?) {
    private val lock = Mutex()
    private fun key(tripId: String, stopId: String): String {
        val account = requireNotNull(owner()) { "로그인한 뒤 사진을 연결해 주세요." }
        val scope = wireJson.encodeToString(listOf(origin, account, tripId, stopId))
        return "place-photos:" + MessageDigest.getInstance("SHA-256").digest(scope.toByteArray()).joinToString("") { "%02x".format(it) }
    }
    suspend fun list(tripId: String, stopId: String): List<PlacePhotoLink> = withContext(Dispatchers.IO) {
        lock.withLock { vault.read(key(tripId, stopId))?.let { wireJson.decodeFromString<List<PlacePhotoLink>>(it) }.orEmpty() }
    }
    suspend fun add(tripId: String, stopId: String, uris: List<String>): List<PlacePhotoLink> = update(tripId, stopId) { current ->
        uris.forEach { value -> val uri = URI(value); require(value.length <= 4096 && uri.scheme == "content" && !uri.authority.isNullOrEmpty()) }
        val merged = (current + uris.map { PlacePhotoLink(it, System.currentTimeMillis()) }).distinctBy { it.uri }
        require(merged.size <= 20) { "한 장소에는 사진을 20장까지 연결할 수 있어요." }
        merged
    }
    suspend fun remove(tripId: String, stopId: String, uri: String) = update(tripId, stopId) { it.filterNot { p -> p.uri == uri } }
    private suspend fun update(tripId: String, stopId: String, action: (List<PlacePhotoLink>) -> List<PlacePhotoLink>): List<PlacePhotoLink> = withContext(Dispatchers.IO) {
        lock.withLock {
            val key = key(tripId, stopId)
            val current = vault.read(key)?.let { wireJson.decodeFromString<List<PlacePhotoLink>>(it) }.orEmpty()
            val next = action(current)
            check(key == key(tripId, stopId))
            vault.write(key, next.takeIf { it.isNotEmpty() }?.let { wireJson.encodeToString(it) })
            next
        }
    }
}
