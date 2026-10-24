package com.heptivision.airo.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.JsonObject
import java.net.URI
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.UUID

const val MAX_PDF_BYTES = 2 * 1024 * 1024
@Serializable data class TripAttachments(val documents: List<TripDocument> = emptyList(), val reservations: List<Reservation> = emptyList())
@Serializable data class Reservation(
    val id: String = UUID.randomUUID().toString(), val name: String,
    val stopId: String? = null, val stopIds: List<String> = emptyList(), val bookingUrl: String? = null,
    val documentSha256s: List<String> = emptyList(), val bookingStatus: String = "not_booked", val paymentStatus: String = "unpaid",
    val reference: String? = null, val note: String? = null,
)
@Serializable data class ReservationBook(val revision: Int = 0, val entries: List<Reservation> = emptyList())
@Serializable data class ReservationInput(val revision: Int, val reservation: Reservation)
@Serializable data class ReservationResult(val reservations: ReservationBook)
@Serializable data class DocumentInput(val name: String, val base64: String, val stopIds: List<String>)
@Serializable data class DocumentLinks(val sha256: String, val stopIds: List<String>)
@Serializable data class DocumentResult(val document: TripDocument)
@Serializable data class TripChange(val id: String, @SerialName("created_at") val createdAt: String, val fields: List<String>)
@Serializable data class ChangePage(val changes: List<TripChange> = emptyList())
@Serializable data class ChangeDetail(val id: String, @SerialName("created_at") val createdAt: String, val changes: JsonObject)
@Serializable data class RevertInput(val expectedLatestChangeId: String)
@Serializable data class TravelContext(val day: Int? = null, val stopId: String? = null, val documents: List<String> = emptyList())

val bookingLabels = linkedMapOf("not_booked" to "미예약", "pending" to "예약 대기", "confirmed" to "예약 확정", "cancelled" to "예약 취소")
val paymentLabels = linkedMapOf("unpaid" to "미결제", "partial" to "일부 결제", "paid" to "결제 완료", "refunded" to "환불 완료")
val changeLabels = mapOf("trip" to "여행 정보", "stops" to "일정", "documents" to "문서", "reservations" to "예약", "expenseBudget" to "예산", "notificationSettings" to "알림 설정")
fun safeHttps(value: String?): String? = value?.trim()?.takeIf { it.length <= 2048 }?.let {
    runCatching { URI(it) }.getOrNull()?.takeIf { uri -> uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.rawUserInfo == null }?.toString()
}
fun Reservation.validate() {
    UUID.fromString(id)
    require(name.trim().length in 1..200 && bookingStatus in bookingLabels && paymentStatus in paymentLabels)
    require(stopIds.size <= 100 && stopIds.distinct().size == stopIds.size && documentSha256s.size <= 20)
    require(documentSha256s.all { Regex("[a-f0-9]{64}").matches(it) })
    require((reference?.length ?: 0) <= 300 && (note?.length ?: 0) <= 4000)
    require(bookingUrl == null || safeHttps(bookingUrl) != null) { "예약 페이지의 HTTPS 주소를 입력하세요." }
}
fun Stop.matches(ids: Collection<String>) = id in ids || sourceId != null && sourceId in ids
fun Reservation.linkedTo(stop: Stop) = stop.matches(stopIds + listOfNotNull(stopId))
fun TripAttachments.forStop(stop: Stop): TripAttachments {
    val linked = reservations.filter { it.linkedTo(stop) }
    val hashes = linked.flatMap { it.documentSha256s }.toSet()
    return TripAttachments(documents.filter { stop.matches(it.stopIds) || it.sha256 in hashes }, linked)
}
fun TripResources.attachments() = TripAttachments(documents, reservations.entries)
fun TripResources.documentStops(document: TripDocument): List<Stop> {
    val linkedIds = document.stopIds + reservations.entries.filter { document.sha256 in it.documentSha256s }.flatMap { it.stopIds + listOfNotNull(it.stopId) }
    return stops.filter { it.matches(linkedIds) }.sortedWith(stopOrder)
}
fun Trip.calendarDate(day: Int, today: LocalDate = LocalDate.now()): LocalDate = (date() ?: today).plusDays(day.toLong() - 1)
fun nearestDay(trip: Trip, days: List<Int>, today: LocalDate = LocalDate.now()): Int = days.minWithOrNull(
    compareBy<Int> { kotlin.math.abs(ChronoUnit.DAYS.between(today, trip.calendarDate(it, today))) }.thenBy { it }) ?: 1
fun Trip.calendarLabel(day: Int, today: LocalDate): String {
    val date = calendarDate(day, today)
    return date.format(DateTimeFormatter.ofPattern("M/d E", java.util.Locale.KOREA)) + if (date == today) " · 오늘" else ""
}
data class BookingLink(val url: String, val label: String)
private val platforms = linkedMapOf("trip.com" to "Trip.com", "booking.com" to "Booking.com", "agoda.com" to "Agoda", "airbnb.com" to "Airbnb", "airbnb.co.kr" to "Airbnb", "expedia.com" to "Expedia", "expedia.co.kr" to "Expedia")
fun bookingLink(raw: String?): BookingLink? {
    val original = safeHttps(raw) ?: return null
    val url = if (bookingAppPackage(original) == "ctrip.english") original.toHttpUrl().newBuilder().setQueryParameter("wkp", "1").build().toString() else original
    val host = URI(url).host.lowercase()
    val provider = platforms.entries.find { host == it.key || host.endsWith(".${it.key}") }?.value ?: host
    val isList = provider == "Trip.com" && URI(url).path.trimEnd('/') in listOf("/order/hotel", "/m/orders/all")
    return BookingLink(url, "$provider ${if (isList) "예약 목록" else "예약 열기"}")
}
fun bookingLinks(stop: Stop, reservations: List<Reservation>): List<BookingLink> {
    val links = reservations.mapNotNull { bookingLink(it.bookingUrl) }.toMutableList()
    Regex("https://[^\\s<>\"']+").findAll(stop.note.orEmpty()).forEach { match ->
        val raw = match.value.trimEnd(')', ']', '}', ',', '.', ';', '!', '?')
        val host = runCatching { URI(raw).host?.lowercase() }.getOrNull()
        if (host != null && platforms.keys.any { host == it || host.endsWith(".$it") }) bookingLink(raw)?.let(links::add)
    }
    val plain = stop.note.orEmpty().replace(Regex("https?://\\S+"), "")
    if (links.isEmpty() && Regex("\\btrip\\.com\\b", RegexOption.IGNORE_CASE).containsMatchIn(plain)) bookingLink("https://kr.trip.com/m/orders/all")?.let(links::add)
    return links.distinctBy { it.url }
}
