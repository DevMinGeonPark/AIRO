package com.heptivision.airo.feature.budget

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class BudgetState(val budget: ExpenseBudget? = null, val loading: Boolean = true, val saving: Boolean = false,
    val reservation: Reservation? = null, val reservationDay: Int? = null, val error: String? = null, val formError: String? = null, val conflict: Boolean = false)
class BudgetViewModel(private val tripId: String, private val repository: TripRepository, private val reservationId: String? = null) : ViewModel() {
    private val _state = MutableStateFlow(BudgetState())
    val state = _state.asStateFlow()
    private var refreshJob: Job? = null
    init { refresh() }
    fun refresh() {
        if (_state.value.saving) return
        refreshJob?.cancel()
        _state.update { it.copy(loading = true, error = null) }
        refreshJob = viewModelScope.launch {
            try {
                val result = repository.budget(tripId)
                val resources = if (reservationId == null) null else repository.resources(tripId)
                val reservation = resources?.reservations?.entries?.find { it.id == reservationId }
                _state.update { it.copy(budget = result, reservation = reservation, reservationDay = resources?.stops?.firstOrNull { stop -> reservation?.linkedTo(stop) == true }?.day, conflict = false, formError = null) }
            }
            catch (error: Exception) { if (error is CancellationException) throw error; _state.update { it.copy(error = error.userMessage()) } }
            finally { if (currentCoroutineContext().isActive) _state.update { it.copy(loading = false) } }
        }
    }
    fun clearForm() { _state.update { it.copy(formError = null) } }
    private fun save(next: ExpenseBudget, done: () -> Unit) {
        if (_state.value.saving || _state.value.loading || _state.value.conflict) return
        _state.update { it.copy(saving = true, formError = null) }
        viewModelScope.launch {
            try { val result = repository.saveBudget(tripId, next); _state.update { it.copy(budget = result, conflict = false) }; done() }
            catch (error: Exception) {
                if (error is CancellationException) throw error
                _state.update { it.copy(formError = error.userMessage(), conflict = error is ApiException && error.status == 409) }
            } finally { _state.update { it.copy(saving = false) } }
        }
    }
    fun entry(entry: Expense, done: () -> Unit) {
        val budget = _state.value.budget ?: return
        val entries = if (budget.entries.any { it.id == entry.id }) budget.entries.map { if (it.id == entry.id) entry else it } else budget.entries + entry
        save(budget.copy(entries = entries), done)
    }
    fun link(entry: Expense, done: () -> Unit) {
        val reservation = _state.value.reservation ?: return
        if (_state.value.budget?.entries?.any { it.reservationId == reservation.id && it.id != entry.id } == true) return
        entry(entry.copy(reservationId = reservation.id), done)
    }
    fun remove(id: String, done: () -> Unit) { _state.value.budget?.let { save(it.copy(entries = it.entries.filterNot { item -> item.id == id }), done) } }
    fun reserve(value: Double, done: () -> Unit) { _state.value.budget?.let { save(it.copy(reserve = value), done) } }
}
