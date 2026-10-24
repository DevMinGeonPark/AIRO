package com.heptivision.airo.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Serializable data class Trip(
    val id: String,
    @SerialName("user_id") val userId: String = "",
    val title: String,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("created_at") val createdAt: String = "",
)
@Serializable data class Stop(
    val id: String,
    @SerialName("trip_id") val tripId: String,
    val name: String,
    val lng: Double,
    val lat: Double,
    val day: Int,
    val position: Int,
    val time: String? = null,
    val note: String? = null,
    @SerialName("map_query") val mapQuery: String? = null,
    val mode: String = "ground",
    @SerialName("source_id") val sourceId: String? = null,
    val choice: StopChoice? = null,
)
@Serializable data class StopInput(
    val name: String, val lng: Double, val lat: Double, val day: Int,
    val time: String? = null, val note: String? = null,
    @SerialName("map_query") val mapQuery: String? = null,
    val mode: String = "ground",
)
@Serializable data class TripSummary(val trip: Trip, val stops: List<Stop> = emptyList())
@Serializable data class TripList(val trips: List<TripSummary>, val plan: String = "free")
@Serializable data class Message(val id: String, val role: String, val content: String)
@Serializable data class TripDetail(val trip: Trip, val stops: List<Stop> = emptyList(), val messages: List<Message> = emptyList(),
    val expenseBudget: ExpenseBudget = ExpenseBudget(), val resources: TripResources = TripResources(), val archive: ArchiveFile? = null,
    val attachments: TripAttachments = TripAttachments(), val roads: Map<String, RoadRoute> = emptyMap(),
    val itineraryProgress: TripProgress = TripProgress(), val predepartureChecklist: Preparation? = null)
@Serializable data class TripEnvelope(val trip: Trip)
@Serializable data class TripInput(val title: String, @SerialName("start_date") val startDate: String?)
@Serializable data class Place(val id: String, val name: String, val lat: Double, val lng: Double, val address: String = "", val category: String = "place")
@Serializable data class PlaceList(val places: List<Place>, val source: String = "", val reason: String? = null)
@Serializable data class SearchInput(val query: String)
@Serializable data class StopPlacement(val day: Int, val position: Int)
@Serializable data class RouteInput(val fromId: String, val toId: String)
@Serializable data class RoadRoute(val coordinates: List<List<Double>>, val distance: Double = 0.0, val duration: Double = 0.0)

val stopOrder = compareBy<Stop> { it.day }.thenBy { it.position }.thenBy { it.id }
fun Trip.date(): LocalDate? = runCatching { startDate?.let(LocalDate::parse) }.getOrNull()
fun dayLabel(day: Int) = if (day == 0) "출발 전" else "${day}일차"
fun Trip.dayDate(day: Int): String = date()?.plusDays(day.toLong() - 1)?.format(DateTimeFormatter.ofPattern("M월 d일")) ?: "날짜 미정"
fun TripSummary.period(): String {
    val start = trip.date() ?: return "출발일을 정해보세요"
    val first = stops.minOfOrNull { it.day } ?: 1
    val last = stops.maxOfOrNull { it.day } ?: 1
    val format = DateTimeFormatter.ofPattern("M.d")
    val from = start.plusDays(first.toLong() - 1)
    val to = start.plusDays(last.toLong() - 1)
    return if (first == last) "${from.year}. ${from.format(format)}" else "${from.year}. ${from.format(format)} — ${to.format(format)}"
}
fun TripSummary.status(today: LocalDate = LocalDate.now()): String {
    val start = trip.date() ?: return "계획 중"
    val end = start.plusDays(((stops.maxOfOrNull { it.day } ?: 1) - 1).toLong())
    val first = start.plusDays(((stops.minOfOrNull { it.day } ?: 1) - 1).toLong())
    return when { today < first -> "다가오는 여행"; today > end -> "지난 여행"; else -> "여행 중" }
}

@Serializable data class ChoiceCandidate(val id: String, val name: String, val lng: Double, val lat: Double,
    @SerialName("map_query") val mapQuery: String? = null, val note: String? = null, val mode: String = "ground")
@Serializable data class StopChoice(val label: String, val kind: String, val candidates: List<ChoiceCandidate>, val revision: Int, val selectedId: String? = null)
@Serializable data class ChoiceSelection(val stopId: String, val revision: Int, val candidateId: String?, val action: String = "select")
@Serializable data class StopEnvelope(val stop: Stop)
fun Stop.pendingChoice() = choice != null && choice.selectedId == null
fun Stop.displayName() = choice?.let { "${it.label} · ${if (it.selectedId == null) "${it.candidates.size}곳 중 선택" else name}" } ?: name
fun Stop.withCandidate(candidate: ChoiceCandidate) = copy(name = candidate.name, lng = candidate.lng, lat = candidate.lat,
    mapQuery = candidate.mapQuery, note = candidate.note, mode = candidate.mode)

fun StopChoice.validate() {
    require(label.isNotBlank() && label.length <= 100 && kind in listOf("meal", "visit", "stay", "other") && revision in 0..2147483645)
    require(candidates.size in 2..8 && candidates.map { it.id }.distinct().size == candidates.size && (selectedId == null || candidates.any { it.id == selectedId }))
    candidates.forEach { require(it.id.length in 1..128 && it.name.isNotBlank() && it.name.length <= 300 && it.lat.isFinite() && it.lng.isFinite() && it.lat in -90.0..90.0 && it.lng in -180.0..180.0 && it.mode in listOf("ground", "flight") && (it.note?.length ?: 0) <= 4000 && (it.mapQuery?.length ?: 0) <= 500) }
}

@Serializable data class ChoiceRouteInput(val fromId: String, val toId: String, val fromCandidateId: String? = null, val toCandidateId: String? = null)
