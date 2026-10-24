package com.heptivision.airo.feature.trips

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive

data class TripsState(val loading: Boolean = true, val saving: Boolean = false, val data: TripList? = null, val error: String? = null, val formError: String? = null)
class TripsViewModel(private val repository: TripRepository) : ViewModel() {
    private val _state = MutableStateFlow(TripsState())
    val state = _state.asStateFlow()
    private var refreshJob: Job? = null
    init { refresh() }
    fun refresh() {
        refreshJob?.cancel()
        _state.update { it.copy(loading = true, error = null) }
        refreshJob = viewModelScope.launch {
            try { val result = repository.list(); _state.update { it.copy(data = result) } }
            catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(error = e.userMessage()) } }
            finally { if (kotlinx.coroutines.currentCoroutineContext().isActive) _state.update { it.copy(loading = false) } }
        }
    }
    fun clearFormError() { _state.update { it.copy(formError = null) } }
    fun create(input: TripInput, onSaved: (String) -> Unit) {
        if (_state.value.saving) return
        _state.update { it.copy(saving = true, formError = null) }
        viewModelScope.launch {
            try { val trip = repository.create(input); refresh(); onSaved(trip.id) }
            catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(formError = e.userMessage()) } }
            finally { _state.update { it.copy(saving = false) } }
        }
    }
}
