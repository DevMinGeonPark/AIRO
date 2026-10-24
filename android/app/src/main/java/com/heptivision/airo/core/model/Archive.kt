package com.heptivision.airo.core.model

import com.heptivision.airo.core.network.wireJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.util.Base64

const val MAX_ARCHIVE_BYTES = 8 * 1024 * 1024
@Serializable data class ArchiveTrip(val title: String, @SerialName("start_date") val startDate: String? = null, @SerialName("created_at") val createdAt: String? = null)
@Serializable data class ArchiveStop(
    @SerialName("source_id") val sourceId: String, val name: String, val lng: Double, val lat: Double, val day: Int,
    val position: Int = 0, val time: String? = null, val note: String? = null, @SerialName("map_query") val mapQuery: String? = null, val mode: String = "ground", val choice: StopChoice? = null,
)
@Serializable data class ArchiveMessage(val role: String, val content: String, @SerialName("created_at") val createdAt: String)
@Serializable data class ArchiveDocument(val name: String, val mime: String, val base64: String, val sha256: String, val stopIds: List<String> = emptyList()) {
    fun bytes(): ByteArray {
        require(mime == "application/pdf" && name.length in 1..300)
        val bytes = Base64.getDecoder().decode(base64)
        val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        require(hash == sha256 && bytes.take(5).toByteArray().toString(Charsets.US_ASCII) == "%PDF-") { "예약 PDF 원본 검증에 실패했습니다." }
        return bytes
    }
}
@Serializable data class ArchiveFile(
    val format: String = "airo-trip", val version: Int = 1, @SerialName("source_key") val sourceKey: String,
    @SerialName("exported_at") val exportedAt: String, val trip: ArchiveTrip, val stops: List<ArchiveStop>,
    val messages: List<ArchiveMessage> = emptyList(), val data: JsonObject,
) {
    fun images(): List<ArchivedTripImage> = data["images"]?.let { wireJson.decodeFromJsonElement(it) } ?: emptyList()
    fun documents(): List<ArchiveDocument> = data["documents"]?.let { wireJson.decodeFromJsonElement(it) } ?: emptyList()
    fun places(): List<SavedPlace> = data["food"]?.let { wireJson.decodeFromJsonElement(it) } ?: emptyList()
    fun budget(): ExpenseBudget = data["expenseBudget"]?.let { wireJson.decodeFromJsonElement(it) } ?: ExpenseBudget()
    fun savedIds(): List<String> = data["savedPlaceIds"]?.let { wireJson.decodeFromJsonElement(it) } ?: emptyList()
    fun reservations(): ReservationBook = data["reservations"]?.let { wireJson.decodeFromJsonElement(it) } ?: ReservationBook()
}
@Serializable data class ImportResult(val tripId: String, val imported: Boolean)
fun readArchive(text: String): ArchiveFile {
    require(text.toByteArray().size <= MAX_ARCHIVE_BYTES) { "8MB 이하의 여행 파일을 선택해 주세요." }
    val archive = wireJson.decodeFromString<ArchiveFile>(text)
    require(Regex("[a-z][a-z0-9-]*-trip", RegexOption.IGNORE_CASE).matches(archive.format) && archive.version == 1) { "지원하는 AIRO 여행 파일이 아닙니다." }
    require(archive.sourceKey.length in 1..240 && archive.trip.title.length in 1..120)
    archive.trip.startDate?.let(LocalDate::parse)
    Instant.parse(archive.exportedAt)
    require(archive.stops.size <= 10000 && archive.stops.map { it.sourceId }.distinct().size == archive.stops.size)
    archive.stops.forEach {
        it.choice?.validate()
        require(it.sourceId.length in 1..200 && it.name.length in 1..300 && it.day in 0..3650 && it.position >= 0)
        require(it.lat.isFinite() && it.lat in -90.0..90.0 && it.lng.isFinite() && it.lng in -180.0..180.0)
        require(it.mode in listOf("ground", "flight") && (it.note?.length ?: 0) <= 20000 && (it.mapQuery?.length ?: 0) <= 20000 && (it.time?.length ?: 0) <= 20000)
    }
    require(archive.messages.size <= 10000)
    archive.messages.forEach { require(it.role in listOf("user", "assistant") && it.content.length <= 20000); Instant.parse(it.createdAt) }
    require(archive.images().size <= 10)
    archive.images().forEach { it.bytes() }
    require(archive.documents().size <= 20)
    archive.documents().forEach { it.bytes() }
    require(archive.places().size <= 10000 && archive.savedIds().size <= 10000)
    archive.places().forEach { require(it.id.isNotBlank() && it.lat.isFinite() && it.lat in -90.0..90.0 && it.lng.isFinite() && it.lng in -180.0..180.0 && it.day in 0..3650) }
    archive.budget().validate()
    archive.data["itineraryProgress"]?.let { wireJson.decodeFromJsonElement<TripProgress>(it).validate() }
    archive.data["predepartureChecklist"]?.let { wireJson.decodeFromJsonElement<Preparation>(it).validate() }
    return archive.copy(format = "airo-trip")
}
fun encodeArchive(archive: ArchiveFile): String {
    val root = wireJson.encodeToJsonElement(archive).jsonObject.toMutableMap()
    val trip = root.getValue("trip").jsonObject.toMutableMap()
    if (trip["created_at"] == JsonNull) trip.remove("created_at")
    root["trip"] = JsonObject(trip)
    return JsonObject(root).toString()
}
