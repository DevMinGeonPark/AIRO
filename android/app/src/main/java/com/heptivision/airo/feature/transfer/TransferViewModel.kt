package com.heptivision.airo.feature.transfer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*

data class TransferState(val archive: ArchiveFile? = null, val busy: Boolean = false, val error: String? = null,
    val imported: ImportResult? = null, val exported: Boolean = false)
class TransferViewModel(val tripId: String?, private val trips: TripRepository) : ViewModel() {
    private val _state = MutableStateFlow(TransferState())
    val state = _state.asStateFlow()
    private val downloads = Channel<String>(Channel.BUFFERED)
    val exportFiles = downloads.receiveAsFlow()
    var preparedExport: String? = null
        private set
    fun report(error: Throwable) { _state.update { it.copy(error = error.userMessage(), busy = false) } }
    fun read(open: () -> java.io.InputStream?) {
        if (_state.value.busy) return
        _state.update { it.copy(archive = null, busy = true, error = null, imported = null) }
        viewModelScope.launch {
            try {
                val archive = withContext(Dispatchers.IO) {
                    val text = requireNotNull(open()).use { input ->
                        val output = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (true) {
                            val count = input.read(buffer); if (count < 0) break
                            require(output.size() + count <= MAX_ARCHIVE_BYTES) { "8MB 이하의 여행 파일을 선택해 주세요." }
                            output.write(buffer, 0, count)
                        }
                        output.toString("UTF-8")
                    }
                    readArchive(text)
                }
                _state.update { it.copy(archive = archive) }
            } catch (error: Exception) { if (error is CancellationException) throw error; report(error) }
            finally { _state.update { it.copy(busy = false) } }
        }
    }
    fun import() {
        val archive = _state.value.archive ?: return
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try { val result = trips.importArchive(archive); _state.update { it.copy(imported = result) } }
            catch (error: Exception) { if (error is CancellationException) throw error; report(error) }
            finally { _state.update { it.copy(busy = false) } }
        }
    }
    fun export() {
        if (_state.value.busy || tripId == null) return
        _state.update { it.copy(busy = true, error = null, exported = false) }
        viewModelScope.launch {
            try { val text = trips.exportArchive(tripId); preparedExport = text; downloads.send(text) }
            catch (error: Exception) { if (error is CancellationException) throw error; report(error) }
            finally { _state.update { it.copy(busy = false) } }
        }
    }
    fun written() { preparedExport = null; _state.update { it.copy(exported = true, error = null) } }
}
