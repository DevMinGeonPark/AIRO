package com.heptivision.airo.feature.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.data.ai.*
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.util.UUID

data class ChatState(val messages: List<Message> = emptyList(), val devices: List<AiDevice> = emptyList(), val pending: PendingChat? = null,
    val busy: Boolean = false, val paused: Boolean = false, val output: String = "", val error: String? = null, val connectionError: String? = null,
    val contextLabel: String? = null, val completed: Boolean = false, val unsentMessage: String? = null, val checkedAt: Long = 0)
class ChatViewModel(val tripId: String, val ai: AiRepository, private val trips: TripRepository, val context: TravelContext = TravelContext()) : ViewModel() {
    private val _state = MutableStateFlow(ChatState(pending = ai.pending(tripId)))
    val state = _state.asStateFlow()
    private var polling: Job? = null
    private var devicesJob: Job? = null
    private suspend fun messages() {
        val detail = trips.detail(tripId)
        val labels = listOfNotNull(context.day?.let(::dayLabel), detail.stops.find { it.id == context.stopId || it.sourceId == context.stopId && context.stopId != null }?.name,
            if (context.documents.isNotEmpty()) "PDF ${context.documents.size}개" else null)
        _state.update { it.copy(messages = detail.messages, contextLabel = labels.takeIf { it.isNotEmpty() }?.joinToString(" · ")) }
    }
    fun start() {
        if (devicesJob?.isActive != true) devicesJob = viewModelScope.launch {
            try { messages() } catch (error: Exception) { if (error is CancellationException) throw error; _state.update { it.copy(error = error.userMessage()) } }
            while (isActive) {
                try { val devices = ai.devices(); _state.update { it.copy(devices = devices, connectionError = null, checkedAt = System.currentTimeMillis()) } }
                catch (error: Exception) { if (error is CancellationException) throw error; _state.update { it.copy(devices = emptyList(), connectionError = error.userMessage()) } }
                delay(5000)
            }
        }
        if (_state.value.pending != null && polling?.isActive != true) resume()
    }
    fun pause() { devicesJob?.cancel(); polling?.cancel(); _state.update { it.copy(busy = false, paused = it.pending != null) } }
    fun send(device: AiDevice, message: String, sent: () -> Unit) {
        if (_state.value.pending != null || !device.ready() || ai.demo || message.trim().length !in 1..600) return
        val pending = PendingChat(UUID.randomUUID().toString(), tripId, device.id, message.trim(), context)
        try { ai.remember(pending) } catch (error: Exception) { _state.update { it.copy(error = error.userMessage()) }; return }
        _state.update { it.copy(pending = pending, error = null, unsentMessage = null, completed = false) }
        sent(); resume()
    }
    fun resume() {
        val pending = _state.value.pending ?: return
        if (polling?.isActive == true) return
        _state.update { it.copy(busy = true, paused = false, error = null) }
        polling = viewModelScope.launch {
            try {
                // Idempotent enqueue also resolves a lost response after the server accepted it.
                try { ai.enqueue(pending) }
                catch (error: ApiException) {
                    if (error.status in listOf(400, 401, 403, 404, 409, 422)) {
                        ai.forget(tripId)
                        _state.update { it.copy(pending = null, unsentMessage = pending.message) }
                    }
                    throw error
                }
                messages()
                var failures = 0
                while (isActive) {
                    try {
                        val job = ai.status(pending.id)
                        _state.update { it.copy(output = job.output) }
                        if (job.state !in listOf("queued", "running")) {
                            ai.forget(tripId)
                            _state.update { it.copy(pending = null, output = "", error = job.error, paused = false, completed = job.error == null) }
                            messages(); break
                        }
                        if (job.pending) ai.tick(pending.id)
                        failures = 0
                    } catch (error: Exception) { if (error is CancellationException) throw error; if (++failures >= 5) throw error }
                    delay(900)
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                _state.update { it.copy(error = error.userMessage(), paused = it.pending != null) }
            } finally { if (currentCoroutineContext().isActive) _state.update { it.copy(busy = false) } }
        }
    }
    fun cancel() {
        val pending = _state.value.pending ?: return
        polling?.cancel()
        viewModelScope.launch {
            try { ai.cancel(pending.id); ai.forget(tripId); _state.update { it.copy(pending = null, busy = false, paused = false, output = "", error = "대화를 중지했습니다. 이미 반영된 일정은 유지됩니다.") }; messages() }
            catch (error: Exception) { if (error is CancellationException) throw error; _state.update { it.copy(busy = false, paused = true, error = error.userMessage()) } }
        }
    }
    fun revoke(device: AiDevice) {
        viewModelScope.launch {
            try { ai.revoke(device.id); val devices = ai.devices(); _state.update { it.copy(devices = devices) } }
            catch (error: Exception) { if (error is CancellationException) throw error; _state.update { it.copy(connectionError = error.userMessage()) } }
        }
    }
}
