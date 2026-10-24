package com.heptivision.airo.feature.resources

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class ResourcesState(val data: TripResources? = null, val loading: Boolean = true, val busy: Boolean = false,
    val conflict: Boolean = false, val error: String? = null, val message: String? = null, val places: List<Place>? = null)
class ResourcesViewModel(private val tripId: String, private val repository: TripRepository) : ViewModel() {
    private val _state = MutableStateFlow(ResourcesState())
    val state = _state.asStateFlow()
    private var refreshJob: Job? = null
    private val downloads = Channel<Pair<TripDocument, ByteArray>>(Channel.BUFFERED)
    val documents = downloads.receiveAsFlow()
    init { refresh() }
    fun refresh() {
        if (_state.value.busy) return
        refreshJob?.cancel()
        _state.update { it.copy(loading = true, error = null) }
        refreshJob = viewModelScope.launch {
            try { val data = repository.resources(tripId); _state.update { it.copy(data = data, conflict = false) } }
            catch (error: Exception) { if (error is CancellationException) throw error; report(error.userMessage()) }
            finally { if (currentCoroutineContext().isActive) _state.update { it.copy(loading = false) } }
        }
    }
    fun report(message: String) { _state.update { it.copy(error = message) } }
    fun clear() { _state.update { it.copy(places = null, error = null, message = null) } }
    private fun work(operation: suspend () -> Unit) {
        if (_state.value.busy || _state.value.loading) return
        _state.update { it.copy(busy = true, error = null, message = null) }
        viewModelScope.launch {
            try { operation() }
            catch (error: Exception) { if (error is CancellationException) throw error; _state.update { it.copy(error = error.userMessage(), conflict = error is com.heptivision.airo.core.network.ApiException && error.status == 409) } }
            finally { _state.update { it.copy(busy = false) } }
        }
    }
    fun bookmark(place: SavedPlace) = work {
        repository.bookmark(tripId, place.id, place.id !in _state.value.data!!.savedPlaceIds)
        val data = repository.resources(tripId); _state.update { it.copy(data = data) }
    }
    fun search(query: String) = work { val results = repository.search(query); _state.update { it.copy(places = results) } }
    fun save(place: Place, done: () -> Unit) = work {
        repository.savePlace(tripId, SavePlaceInput(place.id, place.name, place.lat, place.lng, 1, place.address, place.category))
        val data = repository.resources(tripId); _state.update { it.copy(data = data, message = "장소를 저장했어요.") }; done()
    }
    fun add(place: SavedPlace, day: Int, done: () -> Unit) = work {
        repository.saveStop(tripId, null, StopInput(place.nameKo ?: place.name, place.lng, place.lat, day, mapQuery = place.name))
        _state.update { it.copy(message = "${dayLabel(day)}에 추가했어요.") }; done()
    }
    fun attach(file: java.io.File, name: String, stopIds: List<String>, done: () -> Unit) = work {
        val input = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            require(file.length() in 1..MAX_PDF_BYTES.toLong()) { "2MB 이하의 PDF를 선택하세요." }
            DocumentInput(name, java.util.Base64.getEncoder().encodeToString(file.readBytes()), stopIds)
        }
        repository.attachDocument(tripId, input)
        val data = repository.resources(tripId)
        _state.update { it.copy(data = data, message = "PDF를 저장했어요. 같은 원본은 중복 보관하지 않습니다.") }; done()
    }
    fun link(document: TripDocument, ids: List<String>, done: () -> Unit) = work {
        repository.linkDocument(tripId, DocumentLinks(document.sha256, ids))
        val data = repository.resources(tripId); _state.update { it.copy(data = data, message = "문서 연결을 저장했어요.") }; done()
    }
    fun reservation(value: Reservation, revision: Int, done: () -> Unit) = work {
        value.validate()
        repository.saveReservation(tripId, ReservationInput(revision, value))
        val data = repository.resources(tripId); _state.update { it.copy(data = data, conflict = false, message = "예약을 저장했어요.") }; done()
    }
    fun open(document: TripDocument) = work { downloads.send(document to repository.document(tripId, document)) }
}
