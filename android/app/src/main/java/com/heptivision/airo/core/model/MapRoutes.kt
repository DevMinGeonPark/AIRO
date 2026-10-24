package com.heptivision.airo.core.model

import com.heptivision.airo.core.network.wireJson
import kotlinx.serialization.json.decodeFromJsonElement
import kotlin.math.hypot

data class RoutePair(val from: Stop, val to: Stop) {
    val key = "${from.id}:${from.lng},${from.lat}>${to.id}:${to.lng},${to.lat}:${to.mode}"
}

fun roadPairs(stops: List<Stop>): List<RoutePair> = stops.sortedWith(stopOrder).zipWithNext()
    .filter { (a, b) -> !a.pendingChoice() && !b.pendingChoice() && b.mode != "flight" && (a.lng != b.lng || a.lat != b.lat) }.map { RoutePair(it.first, it.second) }

fun RoadRoute.valid(): Boolean = coordinates.size in 2..100000 && coordinates.all {
    it.size == 2 && it[0].isFinite() && it[1].isFinite() && it[0] in -180.0..180.0 && it[1] in -90.0..90.0
}
fun RoadRoute.matches(pair: RoutePair): Boolean = valid() &&
    hypot(coordinates.first()[0] - pair.from.lng, coordinates.first()[1] - pair.from.lat) < .002 &&
    hypot(coordinates.last()[0] - pair.to.lng, coordinates.last()[1] - pair.to.lat) < .002

fun TripDetail.savedRoad(pair: RoutePair): RoadRoute? {
    val key = "${pair.from.sourceId ?: pair.from.id}->${pair.to.sourceId ?: pair.to.id}"
    val saved = roads[key] ?: archive?.data?.get("routes")?.let { element ->
        runCatching { wireJson.decodeFromJsonElement<Map<String, RoadRoute>>(element)[key] }.getOrNull()
    }
    return saved?.takeIf { it.matches(pair) }
}

/** Same quadratic arc and antimeridian unwrapping as the web MapArc (curvature .28). */
fun flightArcs(stops: List<Stop>): List<List<List<Double>>> = stops.sortedWith(stopOrder).zipWithNext()
    .filter { (a, b) -> !a.pendingChoice() && !b.pendingChoice() && b.mode == "flight" && (a.lng != b.lng || a.lat != b.lat) }.map { (a, b) ->
        val end = when { b.lng - a.lng > 180 -> b.lng - 360; b.lng - a.lng < -180 -> b.lng + 360; else -> b.lng }
        val dx = end - a.lng; val dy = b.lat - a.lat
        val cx = (a.lng + end) / 2 - dy * .28
        val cy = (a.lat + b.lat) / 2 + dx * .28
        (0..64).map { index ->
            val t = index / 64.0; val inv = 1 - t
            listOf(inv * inv * a.lng + 2 * inv * t * cx + t * t * end,
                (inv * inv * a.lat + 2 * inv * t * cy + t * t * b.lat).coerceIn(-85.0, 85.0))
        }
    }

fun stopOrdinals(stops: List<Stop>): Map<String, Int> = stops.sortedWith(stopOrder).groupBy { it.day }
    .values.flatMap { day -> day.mapIndexed { index, stop -> stop.id to index + 1 } }.toMap()
