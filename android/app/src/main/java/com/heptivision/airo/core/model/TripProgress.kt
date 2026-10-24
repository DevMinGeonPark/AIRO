package com.heptivision.airo.core.model

import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import kotlin.math.*

val progressModes = linkedMapOf("manual" to "직접 체크", "location" to "위치로 자동 체크", "time" to "시간으로 자동 체크", "either" to "위치 또는 시간")
@Serializable data class ProgressRule(val stopId: String, val mode: String = "manual", val radiusMeters: Int = 150)
@Serializable data class ProgressEntry(val stopId: String, val done: Boolean, val source: String, val completedAt: String?, val updatedAt: String)
@Serializable data class TripProgress(val revision: Int = 0, val timeZone: String = "Asia/Seoul", val rules: List<ProgressRule> = emptyList(), val entries: List<ProgressEntry> = emptyList()) {
    fun entry(stop: Stop) = entries.find { it.stopId == stop.progressKey() || it.stopId == stop.id }
    fun rule(stop: Stop) = rules.find { it.stopId == stop.progressKey() || it.stopId == stop.id } ?: ProgressRule(stop.progressKey())
}
@Serializable data class ProgressPosition(val lat: Double, val lng: Double, val accuracy: Double, val timestamp: Long)
@Serializable data class ProgressMutation(val revision: Int = 0, val action: String, val stopId: String? = null, val done: Boolean? = null,
    val rule: ProgressRule? = null, val timeZone: String? = null, val position: ProgressPosition? = null)
fun Stop.progressKey() = sourceId ?: id
fun validStopTime(time: String?) = time?.matches(Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")) == true
fun automaticProgress(progress: TripProgress, detail: TripDetail, now: Instant = Instant.now(), position: ProgressPosition? = null): List<Pair<Stop, String>> {
    val start = detail.trip.date() ?: return emptyList()
    val clock = now.atZone(ZoneId.of(progress.timeZone))
    return detail.stops.mapNotNull { stop ->
        if (stop.pendingChoice() || progress.entry(stop) != null || start.plusDays(stop.day.toLong() - 1) != clock.toLocalDate()) return@mapNotNull null
        val rule = progress.rule(stop)
        if (rule.mode in listOf("location", "either") && position != null && now.toEpochMilli() - position.timestamp in -10000..60000 && position.accuracy in 0.0..100.0) {
            val rad = Math.PI / 180
            val h = sin((stop.lat - position.lat) * rad / 2).pow(2) + cos(position.lat * rad) * cos(stop.lat * rad) * sin((stop.lng - position.lng) * rad / 2).pow(2)
            val distance = 12742000 * asin(sqrt(h.coerceIn(0.0, 1.0)))
            if (distance + position.accuracy <= rule.radiusMeters) return@mapNotNull stop to "location"
        }
        if (rule.mode in listOf("time", "either") && validStopTime(stop.time) && clock.toLocalTime() >= LocalTime.parse(stop.time)) stop to "time" else null
    }
}

val todoCategories = linkedMapOf("packing" to "챙길 것", "documents" to "여권·비자·서류", "tasks" to "출국 준비")
@Serializable data class PreparationItem(val id: String, val title: String, val category: String, val done: Boolean = false)
@Serializable data class Preparation(val revision: Int = 0, val items: List<PreparationItem> = emptyList())
fun defaultPreparation() = Preparation(items = listOf(
    "packing" to "여권·지갑·결제 카드 챙기기", "packing" to "충전기·보조배터리·어댑터 챙기기", "packing" to "복용약·세면도구·옷 챙기기",
    "documents" to "여권 유효기간 확인", "documents" to "목적지 비자 필요 여부 확인·필요 시 신청", "documents" to "항공권·숙소 예약 확인서 저장",
    "tasks" to "항공편·체크인·공항 이동 시간 확인", "tasks" to "수하물 규정·로밍 또는 eSIM 확인",
).mapIndexed { index, (category, title) -> PreparationItem("00000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}", title, category) })
const val VISIT_JAPAN_QR_URL = "https://www.vjw.digital.go.jp/main/#/vjwpic026"
@Serializable data class TripImage(val name: String, val mime: String, val sha256: String, val width: Int, val height: Int, val sourceUrl: String, val capturedAt: String)
@Serializable data class TripImages(val images: List<TripImage> = emptyList())

fun TripProgress.validate() {
    require(revision in 0..2147483645 && rules.size <= 10000 && entries.size <= 10000)
    ZoneId.of(timeZone)
    require(rules.map { it.stopId }.distinct().size == rules.size && entries.map { it.stopId }.distinct().size == entries.size)
    rules.forEach { require(it.stopId.length in 1..200 && it.mode in progressModes && it.radiusMeters in 100..1000) }
    entries.forEach {
        require(it.stopId.length in 1..200 && it.source in listOf("manual", "location", "time"))
        Instant.parse(it.updatedAt)
        if (it.done) Instant.parse(requireNotNull(it.completedAt)) else require(it.completedAt == null && it.source == "manual")
    }
}
fun Preparation.validate() {
    require(revision in 0..2147483645 && items.size <= 100 && items.map { it.id }.distinct().size == items.size)
    items.forEach { java.util.UUID.fromString(it.id); require(it.title.trim().length in 1..200 && it.category in todoCategories) }
}

@Serializable data class ArchivedTripImage(val name: String, val mime: String, val sha256: String, val width: Int, val height: Int, val sourceUrl: String, val capturedAt: String, val base64: String) {
    fun metadata() = TripImage(name, mime, sha256, width, height, sourceUrl, capturedAt)
    fun bytes(): ByteArray {
        require(name.length in 1..200 && mime in listOf("image/png", "image/jpeg") && width in 1..4096 && height in 1..4096 && base64.length <= 2796204)
        val uri = java.net.URI(sourceUrl); require(uri.scheme == "https" && uri.userInfo == null && !uri.host.isNullOrBlank())
        Instant.parse(capturedAt)
        val bytes = java.util.Base64.getDecoder().decode(base64)
        require(bytes.size <= 2 * 1024 * 1024 && java.util.Base64.getEncoder().encodeToString(bytes) == base64)
        require(java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) } == sha256)
        return bytes
    }
}
