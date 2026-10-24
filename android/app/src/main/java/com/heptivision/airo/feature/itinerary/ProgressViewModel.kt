package com.heptivision.airo.feature.itinerary

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.time.Instant

data class ProgressState(val data: TripProgress? = null, val busy: Boolean = false, val error: String? = null,
    val tracking: Boolean = false, val locationStatus: String? = null, val pendingCount: Int = 0)

class ProgressViewModel(private val tripId: String, private val repository: TripRepository) : ViewModel() {
    private val mutable = MutableStateFlow(ProgressState())
    val state = mutable.asStateFlow()
    private data class Pending(val id: Long, val action: ProgressMutation, val at: Instant)
    private var confirmed: TripProgress? = null
    private val pending = mutableListOf<Pending>()
    private var nextId = 0L
    private var inFlight: Long? = null
    private var writing: Job? = null
    private var reading: Job? = null
    private var schedule: TripDetail? = null
    private var position: ProgressPosition? = null
    private var active = false
    private var retryAt = 0L
    fun schedule(detail: TripDetail?) { schedule = detail }
    fun active(value: Boolean) { active = value; if (!value) position = null }
    fun refresh() {
        if (pending.isNotEmpty() || reading?.isActive == true) return
        reading = viewModelScope.launch {
            try {
                val data = repository.progress(tripId)
                currentCoroutineContext().ensureActive()
                confirmed = data
                publish(); mutable.update { it.copy(error = null) }; automatic()
            } catch (error: Exception) { if (error is CancellationException) throw error; mutable.update { it.copy(error = error.userMessage()) } }
        }
    }
    private fun publish() {
        val base = confirmed ?: return
        val preview = pending.fold(base) { data, item -> projectProgress(data, schedule, item.action, item.at) }
        mutable.update { it.copy(data = preview, busy = pending.isNotEmpty(), pendingCount = pending.size,
            tracking = it.tracking && preview.rules.any { r -> r.mode in listOf("location", "either") }) }
        if (!state.value.tracking) position = null
    }
    fun toggle(stop: Stop) {
        if (stop.pendingChoice()) return
        val data = state.value.data ?: return
        change(ProgressMutation(action = "manual", stopId = stop.progressKey(), done = data.entry(stop)?.done != true))
    }
    fun change(action: ProgressMutation) {
        if (confirmed == null) return
        reading?.cancel()
        // Keep the latest unsent intent per control. Never cancel an in-flight write or overwrite its revision.
        val sameControl: (Pending) -> Boolean = { item -> item.id != inFlight && item.action.action == action.action && when (action.action) {
            "manual", "resume" -> item.action.stopId == action.stopId
            "rule" -> item.action.rule?.stopId == action.rule?.stopId
            "timezone", "automatic" -> true
            else -> false
        } }
        pending.removeAll(sameControl)
        pending += Pending(++nextId, action, Instant.now())
        mutable.update { it.copy(error = null) }
        publish() // Synchronous: checkbox, count, map and routes all update before the first network suspension.
        if (writing?.isActive != true) {
            // Assign before starting: an immediate repository response may enqueue automatic work recursively.
            val worker = viewModelScope.launch(start = CoroutineStart.LAZY) { drain() }
            writing = worker
            worker.start()
        }
    }
    private suspend fun drain() {
        while (pending.isNotEmpty()) {
            val item = pending.first(); inFlight = item.id
            try {
                var conflicts = 0
                while (true) {
                    try {
                        val before = requireNotNull(confirmed)
                        val saved = repository.updateProgress(tripId, item.action.copy(revision = before.revision))
                        currentCoroutineContext().ensureActive()
                        confirmed = saved
                        retryAt = if (item.action.action == "automatic" && saved.revision == before.revision) System.currentTimeMillis() + 15000 else 0
                        break
                    } catch (error: ApiException) {
                        if (error.status != 409 || ++conflicts > 2) throw error
                        confirmed = repository.progress(tripId)
                        currentCoroutineContext().ensureActive()
                        publish() // Rebase queued clicks over changes from the web or another device.
                    }
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                // A dropped response can still have committed. Reconcile if possible; otherwise roll back only this intent.
                try { confirmed = repository.progress(tripId); currentCoroutineContext().ensureActive() }
                catch (load: Exception) { if (load is CancellationException) throw load }
                retryAt = System.currentTimeMillis() + 60000
                mutable.update { it.copy(error = "저장하지 못한 변경을 다시 확인해 주세요. ${error.userMessage()}") }
            } finally {
                pending.removeAll { it.id == item.id }; inFlight = null; publish()
            }
        }
        // Fresh rules can qualify immediately; don't make the user wait for the periodic tick.
        writing = null
        automatic()
    }
    fun configure(stops: List<Stop>, mode: String): Boolean {
        if (confirmed == null || stops.isEmpty() || mode !in progressModes) return false
        if (mode != "manual" && schedule?.trip?.date() == null) {
            mutable.update { it.copy(error = "자동 체크를 쓰려면 여행 시작일을 먼저 정해 주세요.") }; return false
        }
        if (mode == "time" && stops.any { !validStopTime(it.time) }) {
            mutable.update { it.copy(error = "시간이 없는 장소가 있어요. 시간을 입력하거나 위치 또는 시간을 선택해 주세요.") }; return false
        }
        stops.forEach { stop ->
            val selectedMode = if (mode == "either" && !validStopTime(stop.time)) "location" else mode
            val current = state.value.data!!.rule(stop)
            if (current.mode != selectedMode) change(ProgressMutation(action = "rule", rule = current.copy(mode = selectedMode)))
        }
        automatic()
        return true
    }
    fun automatic() {
        val detail = schedule ?: return
        val data = state.value.data ?: return
        if (!active || pending.any { it.action.action == "automatic" } || System.currentTimeMillis() < retryAt) return
        val location = position.takeIf { state.value.tracking }
        if (automaticProgress(data, detail, position = location).isNotEmpty()) change(ProgressMutation(action = "automatic", position = location))
    }
    fun tracking(value: Boolean) {
        if (value && state.value.data?.rules?.none { it.mode in listOf("location", "either") } != false) return
        position = null
        mutable.update { it.copy(tracking = value, locationStatus = if (value) "위치를 확인하는 중…" else "위치 자동 체크를 멈췄습니다.") }
    }
    fun location(value: ProgressPosition) {
        if (!active || !state.value.tracking) return
        position = value
        locationStatus(if (value.accuracy > 100) "위치 오차가 커요. 더 정확한 위치를 기다립니다." else "위치 체크 중 · 오차 약 ${value.accuracy.toInt()}m")
        automatic()
    }
    fun locationStatus(text: String) { mutable.update { it.copy(locationStatus = text) } }
}
