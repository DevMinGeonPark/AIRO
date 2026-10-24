package com.heptivision.airo.feature.itinerary

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class PreparationState(val draft: Preparation? = null, val saved: Preparation? = null, val busy: Boolean = false, val loading: Boolean = false,
    val error: String? = null, val conflict: Boolean = false, val images: List<TripImage>? = null, val imageError: String? = null,
    val title: String = "", val category: String = "packing") {
    val dirty get() = draft != saved
}
class PreparationViewModel(private val tripId: String, private val repository: TripRepository) : ViewModel() {
    private val mutable = MutableStateFlow(PreparationState())
    val state = mutable.asStateFlow()
    fun load() {
        if (state.value.loading || state.value.busy) return
        mutable.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try { val value = repository.preparation(tripId); mutable.update { it.copy(draft = value, saved = value, conflict = false) } }
            catch (error: Exception) { if (error is CancellationException) throw error; mutable.update { it.copy(error = error.userMessage()) } }
            finally { mutable.update { it.copy(loading = false) } }
        }
        images()
    }
    fun images() {
        mutable.update { it.copy(imageError = null, images = null) }
        viewModelScope.launch {
            try { val images = repository.images(tripId); mutable.update { it.copy(images = images) } }
            catch (error: Exception) { if (error is CancellationException) throw error; mutable.update { it.copy(imageError = error.userMessage()) } }
        }
    }
    suspend fun image(image: TripImage) = repository.image(tripId, image)
    fun title(value: String) { if (value.length <= 200 && !state.value.busy) mutable.update { it.copy(title = value) } }
    fun category(value: String) { if (value in todoCategories && !state.value.busy) mutable.update { it.copy(category = value) } }
    private fun edit(block: (Preparation) -> Preparation) {
        if (state.value.busy || state.value.loading) return
        mutable.update { it.copy(draft = it.draft?.let(block)) }
    }
    fun toggle(id: String) = edit { it.copy(items = it.items.map { row -> if (row.id == id) row.copy(done = !row.done) else row }) }
    fun remove(id: String) = edit { it.copy(items = it.items.filterNot { row -> row.id == id }) }
    fun add(title: String, category: String) = edit {
        require(title.trim().length in 1..200 && category in todoCategories && it.items.size < 100)
        it.copy(items = it.items + PreparationItem(java.util.UUID.randomUUID().toString(), title.trim(), category))
    }
    fun discard() { mutable.update { it.copy(draft = it.saved, error = null, conflict = false, title = "") } }
    fun save(done: () -> Unit) {
        val draft = state.value.draft ?: return
        if (state.value.busy || state.value.loading || state.value.conflict) return
        mutable.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try { val saved = repository.savePreparation(tripId, draft); mutable.update { it.copy(draft = saved, saved = saved) }; done() }
            catch (error: Exception) { if (error is CancellationException) throw error; mutable.update { it.copy(error = error.userMessage(), conflict = error is ApiException && error.status == 409) } }
            finally { mutable.update { it.copy(busy = false) } }
        }
    }
}
