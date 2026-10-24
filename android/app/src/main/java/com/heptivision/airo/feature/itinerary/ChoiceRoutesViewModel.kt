package com.heptivision.airo.feature.itinerary

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class ChoiceRoutesState(val roads: List<List<List<Double>>> = emptyList(), val loading: Boolean = false, val failed: Boolean = false)
class ChoiceRoutesViewModel(private val tripId: String, private val repository: TripRepository) : ViewModel() {
    private val mutable = MutableStateFlow(ChoiceRoutesState())
    val state = mutable.asStateFlow()
    private var job: Job? = null
    fun show(stops: List<Stop>, selectedId: String?) {
        job?.cancel(); mutable.value = ChoiceRoutesState()
        val index = stops.indexOfFirst { it.id == selectedId }
        val slot = stops.getOrNull(index) ?: return
        val choice = slot.choice ?: return
        if (!slot.pendingChoice()) return
        val before = stops.getOrNull(index - 1)?.takeUnless { it.pendingChoice() }
        val after = stops.getOrNull(index + 1)?.takeUnless { it.pendingChoice() }
        job = viewModelScope.launch {
            mutable.update { it.copy(loading = true) }
            var failed = false
            for (candidate in choice.candidates.filterNot { it.id == choice.selectedId }) {
                val requests = buildList {
                    if (before != null && candidate.mode != "flight") add(ChoiceRouteInput(before.id, slot.id, toCandidateId = candidate.id))
                    if (after != null && after.mode != "flight") add(ChoiceRouteInput(slot.id, after.id, fromCandidateId = candidate.id))
                }
                for (request in requests) try {
                    val road = repository.choiceRoute(tripId, request)
                    currentCoroutineContext().ensureActive(); check(road.valid())
                    mutable.update { it.copy(roads = it.roads + listOf(road.coordinates)) }
                } catch (e: Exception) { if (e is CancellationException) throw e; failed = true }
            }
            mutable.update { it.copy(loading = false, failed = failed) }
        }
    }
}
