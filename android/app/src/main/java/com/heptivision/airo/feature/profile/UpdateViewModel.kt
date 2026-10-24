package com.heptivision.airo.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.data.update.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import java.io.File

enum class UpdatePhase { IDLE, CHECKING, LATEST, AVAILABLE, DOWNLOADING, READY, VERIFYING }
data class UpdateState(
    val phase: UpdatePhase = UpdatePhase.CHECKING, val release: UpdateRelease? = null,
    val received: Long = 0, val message: String? = null, val error: String? = null,
) {
    val busy get() = phase in listOf(UpdatePhase.CHECKING, UpdatePhase.DOWNLOADING, UpdatePhase.VERIFYING)
}

class UpdateViewModel(private val updates: AppUpdates) : ViewModel() {
    private val mutableState = MutableStateFlow(UpdateState())
    val state = mutableState.asStateFlow()
    private val installs = Channel<File>(Channel.BUFFERED)
    val installationFiles = installs.receiveAsFlow()
    private var job: Job? = null

    init {
        job = viewModelScope.launch {
            val ready = updates.restore()
            mutableState.value = UpdateState(if (ready == null) UpdatePhase.IDLE else UpdatePhase.READY, ready)
        }
    }

    fun check() = run(UpdatePhase.CHECKING) {
        val release = updates.check()
        val cached = if (release != null) updates.restore() else null
        mutableState.value = UpdateState(when {
            release == null -> UpdatePhase.LATEST
            cached == release -> UpdatePhase.READY
            else -> UpdatePhase.AVAILABLE
        }, release)
    }

    fun download() {
        val release = state.value.release ?: return
        run(UpdatePhase.DOWNLOADING) {
            updates.download(release) { received -> mutableState.update { it.copy(received = received) } }
            mutableState.value = UpdateState(UpdatePhase.READY, release)
        }
    }

    fun prepareInstall() {
        val release = state.value.release ?: return
        run(UpdatePhase.VERIFYING) {
            val file = updates.installationFile(release)
            mutableState.value = UpdateState(UpdatePhase.READY, release)
            installs.send(file)
        }
    }

    fun cancel() { if (state.value.phase == UpdatePhase.DOWNLOADING) job?.cancel() }
    fun message(text: String) { mutableState.update { it.copy(message = text, error = null) } }
    fun report(text: String) { mutableState.update { it.copy(error = text, message = null) } }

    private fun run(phase: UpdatePhase, block: suspend () -> Unit) {
        if (job?.isActive == true) return
        mutableState.update { it.copy(phase = phase, error = null, message = null, received = 0) }
        job = viewModelScope.launch {
            try { block() }
            catch (error: CancellationException) {
                mutableState.update { it.copy(phase = if (it.release == null) UpdatePhase.IDLE else UpdatePhase.AVAILABLE, message = "다운로드를 취소했어요.") }
                throw error
            } catch (error: Exception) {
                mutableState.update { it.copy(phase = if (it.release == null) UpdatePhase.IDLE else UpdatePhase.AVAILABLE,
                    error = if (error is UpdateException) error.message else "연결을 확인한 뒤 다시 시도해 주세요.") }
            }
        }
    }
}
