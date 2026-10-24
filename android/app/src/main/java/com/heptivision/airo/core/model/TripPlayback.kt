package com.heptivision.airo.core.model

import kotlin.math.*

data class PlaybackLeg(val from: Stop, val to: Stop, val path: List<List<Double>>, val flight: Boolean)
data class PlaybackPlan(val legs: List<PlaybackLeg>, val missing: Int) { val ready get() = legs.isNotEmpty() && missing == 0 }
data class PlaybackPoint(val lng: Double, val lat: Double, val heading: Double, val flight: Boolean)
fun playbackPlan(stops: List<Stop>, roads: List<List<List<Double>>>): PlaybackPlan {
    var missing = 0
    val legs = stops.sortedWith(stopOrder).zipWithNext().mapNotNull { (a, b) ->
        if (a.pendingChoice() || b.pendingChoice()) { missing++; return@mapNotNull null }
        if (a.lat == b.lat && a.lng == b.lng) return@mapNotNull null
        val flight = b.mode == "flight"
        val path = if (flight) flightArcs(listOf(a, b)).firstOrNull() else roads.firstOrNull { RoadRoute(it).matches(RoutePair(a, b)) }
        if (path == null) { missing++; null } else PlaybackLeg(a, b, path, flight)
    }
    return PlaybackPlan(legs, missing)
}
fun measurePath(path: List<List<Double>>): List<Double> {
    val distances = mutableListOf(0.0)
    path.zipWithNext().forEach { (a, b) ->
        val rad = Math.PI / 180
        val h = sin((b[1] - a[1]) * rad / 2).pow(2) + cos(a[1] * rad) * cos(b[1] * rad) * sin((b[0] - a[0]) * rad / 2).pow(2)
        distances.add(distances.last() + 12742000 * asin(sqrt(h.coerceIn(0.0, 1.0))))
    }
    return distances
}
fun pointOnPath(leg: PlaybackLeg, cumulative: List<Double>, fraction: Double): PlaybackPoint {
    val path = leg.path
    val distance = fraction.coerceIn(0.0, 1.0) * cumulative.last()
    var lo = 1; var hi = path.lastIndex
    while (lo < hi) { val mid = (lo + hi) / 2; if (cumulative[mid] < distance) lo = mid + 1 else hi = mid }
    val a = path[lo - 1]; val b = path[lo]
    val span = cumulative[lo] - cumulative[lo - 1]
    val t = if (span == 0.0) 0.0 else ((distance - cumulative[lo - 1]) / span).coerceIn(0.0, 1.0)
    return PlaybackPoint(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
        atan2((b[0] - a[0]) * cos((a[1] + b[1]) * Math.PI / 360), b[1] - a[1]) * 180 / Math.PI, leg.flight)
}
