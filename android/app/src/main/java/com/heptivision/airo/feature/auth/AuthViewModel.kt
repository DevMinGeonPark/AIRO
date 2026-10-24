package com.heptivision.airo.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.auth.AuthRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class AuthUiState(val busy: Boolean = false, val error: String? = null, val emailSent: Boolean = false, val retryAt: Long = 0, val edition: String? = null)

class AuthViewModel(val repository: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state = _state.asStateFlow()
    private val browser = Channel<String>(Channel.BUFFERED)
    val browserEvents = browser.receiveAsFlow()
    val session = repository.session
    private val operations = Mutex()
    fun report(message: String) { _state.update { it.copy(error = message, busy = false) } }
    fun clearError() { _state.update { it.copy(error = null) } }
    private fun work(enqueue: Boolean = false, block: suspend () -> Unit) {
        if (!enqueue && _state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            operations.withLock {
                _state.update { it.copy(busy = true, error = null) }
                try { block() }
                catch (error: Exception) { if (error is CancellationException) throw error; _state.update { it.copy(error = error.userMessage()) } }
                finally { _state.update { it.copy(busy = false) } }
            }
        }
    }
    fun google() = work { browser.send(repository.googleUrl()) }
    fun configure() { if (!repository.demo && _state.value.edition == null) work { val edition = repository.edition(); _state.update { it.copy(edition = edition) } } }
    fun password(value: String) = work { repository.communityLogin(value) }
    fun email(email: String) {
        if (System.currentTimeMillis() < _state.value.retryAt) return
        work {
            repository.sendEmail(email)
            _state.update { it.copy(emailSent = true, retryAt = System.currentTimeMillis() + 60_000) }
        }
    }
    // A deep link can arrive before the authorize/email request finishes.
    fun callback(value: String) = work(enqueue = true) { repository.acceptCallback(value) }
    fun demo() = work { repository.enterDemo() }
    fun signOut() = work { repository.signOut(); _state.value = AuthUiState() }
}
