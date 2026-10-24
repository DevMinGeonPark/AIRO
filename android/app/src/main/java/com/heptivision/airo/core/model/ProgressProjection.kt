package com.heptivision.airo.core.model

import java.time.Instant

/** Local preview only. The API remains authoritative for revision, time and GPS validation. */
fun projectProgress(data: TripProgress, detail: TripDetail?, action: ProgressMutation, now: Instant): TripProgress {
    val raw = action.stopId ?: action.rule?.stopId
    val stop = detail?.stops?.find { it.progressKey() == raw || it.id == raw }
    val key = stop?.progressKey() ?: raw
    fun matches(id: String) = id == key || id == stop?.id
    val stamp = now.toString()
    return when (action.action) {
        "manual" -> if (key == null) data else data.copy(entries = data.entries.filterNot { matches(it.stopId) } +
            ProgressEntry(key, action.done == true, "manual", stamp.takeIf { action.done == true }, stamp))
        "resume" -> data.copy(entries = data.entries.filterNot { matches(it.stopId) })
        "rule" -> action.rule?.let { rule -> data.copy(rules = data.rules.filterNot { matches(it.stopId) } + rule.copy(stopId = key ?: rule.stopId)) } ?: data
        "timezone" -> action.timeZone?.let { data.copy(timeZone = it) } ?: data
        "automatic" -> if (detail == null) data else data.copy(entries = data.entries + automaticProgress(data, detail, now, action.position).map { (target, source) ->
            ProgressEntry(target.progressKey(), true, source, stamp, stamp)
        })
        else -> data
    }
}
fun completedStopIds(stops: List<Stop>, progress: TripProgress?): Set<String> = stops.filter { progress?.entry(it)?.done == true }.mapTo(linkedSetOf()) { it.id }
fun remainingStops(stops: List<Stop>, completed: Set<String>) = stops.filterNot { it.id in completed }.sortedWith(stopOrder)
