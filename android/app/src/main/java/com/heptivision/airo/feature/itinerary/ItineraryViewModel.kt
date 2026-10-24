package com.heptivision.airo.feature.itinerary

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

data class ItineraryState(
    val loading: Boolean = true, val detail: TripDetail? = null, val error: String? = null,
    val saving: Boolean = false, val formError: String? = null,
    val searching: Boolean = false, val searchResults: List<Place>? = null, val searchError: String? = null,
    val roadsByPair: Map<String, List<List<Double>>> = emptyMap(),
    val routing: Boolean = false, val roads: List<List<List<Double>>> = emptyList(), val routeDay: Int? = null, val routeError: String? = null,
)

class ItineraryViewModel(val tripId: String, private val repository: TripRepository) : ViewModel() {
    val choiceRoutes = ChoiceRoutesViewModel(tripId, repository)
    override fun onCleared() { choiceRoutes.show(emptyList(), null) }
    private val _state = MutableStateFlow(ItineraryState())
    val state = _state.asStateFlow()
    private var searchJob: Job? = null
    private var routeJob: Job? = null
    private var refreshJob: Job? = null
    private var activeDay: Int? = null
    private var routesRequested = false
    private var activeCompletedIds: Set<String> = emptySet()
    private data class RoutePlan(val day: Int?, val ids: List<String>, val pairs: List<Pair<String, RoadRoute?>>)
    private var routePlan: RoutePlan? = null
    private val routeCache = linkedMapOf<String, RoadRoute>()
    init { refresh() }
    fun refresh(force: Boolean = false) {
        if (refreshJob?.isActive == true && !force) return
        refreshJob?.cancel()
        _state.update { it.copy(loading = true, error = null) }
        refreshJob = viewModelScope.launch {
            try {
                val detail = repository.detail(tripId)
                currentCoroutineContext().ensureActive()
                _state.update { it.copy(detail = detail) }
                if (routesRequested) routes(activeDay)
            }
            catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(error = e.userMessage()) } }
            finally { if (kotlinx.coroutines.currentCoroutineContext().isActive) _state.update { it.copy(loading = false) } }
        }
    }
    fun resetForm() {
        searchJob?.cancel()
        _state.update { it.copy(formError = null, searchResults = null, searchError = null, searching = false) }
    }
    fun search(query: String) {
        searchJob?.cancel()
        _state.update { it.copy(searching = true, searchError = null, searchResults = null) }
        searchJob = viewModelScope.launch {
            try { val results = repository.search(query); _state.update { it.copy(searchResults = results) } }
            catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(searchError = e.userMessage()) } }
            finally { if (kotlinx.coroutines.currentCoroutineContext().isActive) _state.update { it.copy(searching = false) } }
        }
    }
    private fun mutate(onSuccess: () -> Unit, operation: suspend () -> Unit) {
        if (_state.value.saving) return
        _state.update { it.copy(saving = true, formError = null) }
        viewModelScope.launch {
            try {
                operation()
                routeJob?.cancel()
                routePlan = null
                // The mutation has succeeded even if the subsequent read fails.
                onSuccess()
                refresh(force = true)
            } catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(formError = e.userMessage()) } }
            finally { _state.update { it.copy(saving = false) } }
        }
    }
    fun selectChoice(stop: Stop, candidateId: String?, onSaved: () -> Unit) {
        val choice = stop.choice ?: return
        mutate(onSaved) { repository.selectChoice(tripId, ChoiceSelection(stop.id, choice.revision, candidateId)) }
    }
    fun saveStop(stopId: String?, input: StopInput, done: () -> Unit) = mutate(done) { repository.saveStop(tripId, stopId, input) }
    fun deleteStop(stopId: String, done: () -> Unit) = mutate(done) { repository.deleteStop(tripId, stopId) }
    fun moveStop(stop: Stop, position: Int) = mutate({}) { repository.moveStop(tripId, stop.id, stop.day, position) }
    fun updateTrip(input: TripInput, done: () -> Unit) = mutate(done) { repository.update(tripId, input) }
    fun deleteTrip(done: () -> Unit) {
        if (_state.value.saving) return
        _state.update { it.copy(saving = true, formError = null) }
        viewModelScope.launch {
            try { repository.delete(tripId); done() }
            catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(formError = e.userMessage()) } }
            finally { _state.update { it.copy(saving = false) } }
        }
    }
    fun resetRoutes() {
        routeJob?.cancel()
        routePlan = null
        _state.update { it.copy(roads = emptyList(), roadsByPair = emptyMap(), routeError = null, routeDay = null, routing = false) }
    }
    fun routes(day: Int?, retry: Boolean = false, completedIds: Set<String> = activeCompletedIds) {
        activeDay = day
        activeCompletedIds = completedIds
        routesRequested = true
        val detail = _state.value.detail ?: return
        val visible = detail.stops.filter { (day == null || it.day == day) && it.id !in activeCompletedIds }.sortedWith(stopOrder)
        val pairs = roadPairs(visible)
        val plan = RoutePlan(day, visible.map { it.id }, pairs.map { it.key to detail.savedRoad(it) })
        if (plan == routePlan && !retry) return
        routePlan = plan
        routeJob?.cancel()
        val available = linkedMapOf<String, RoadRoute>()
        pairs.forEach { pair -> (detail.savedRoad(pair) ?: routeCache[pair.key])?.let { available[pair.key] = it } }
        val missing = pairs.filter { it.key !in available }
        fun lines() = pairs.mapNotNull { available[it.key]?.coordinates }
        fun byPair() = available.mapValues { it.value.coordinates }
        _state.update { it.copy(routing = missing.isNotEmpty(), roads = lines(), roadsByPair = byPair(), routeError = null, routeDay = day) }
        routeJob = viewModelScope.launch {
            try {
                var failed = false
                for (pair in missing) {
                    try {
                        val route = repository.route(tripId, pair.from, pair.to)
                        currentCoroutineContext().ensureActive()
                        check(route.valid())
                        available[pair.key] = route
                        if (routeCache.size >= 512) routeCache.remove(routeCache.keys.first())
                        routeCache[pair.key] = route
                        _state.update { it.copy(roads = lines(), roadsByPair = byPair()) }
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        currentCoroutineContext().ensureActive()
                        failed = true
                    }
                }
                _state.update { it.copy(routeError = if (failed) "일부 도로 경로를 불러오지 못했어요." else null) }
            }
            finally { if (kotlinx.coroutines.currentCoroutineContext().isActive) _state.update { it.copy(routing = false) } }
        }
    }
}
