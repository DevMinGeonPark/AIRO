package com.heptivision.airo

import com.heptivision.airo.data.update.*
import com.heptivision.airo.feature.profile.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class UpdateViewModelTest {
    private class Updates : AppUpdates {
        val release = UpdateRelease(UpdateArtifact("cloud", "com.heptivision.airo", "0.3.1", 4, "app.apk", 10, "hash", 26), "2026-09-18", emptyList())
        var latest = false
        var cached = false
        var fail = false
        var downloading = false
        override suspend fun restore() = if (cached) release else null
        override suspend fun check(): UpdateRelease? { if (fail) throw UpdateException("offline"); return if (latest) null else release }
        override suspend fun download(release: UpdateRelease, progress: (Long) -> Unit) {
            downloading = true
            try { progress(5); delay(1000); cached = true } finally { downloading = false }
        }
        override suspend fun installationFile(release: UpdateRelease) = File("verified.apk")
    }
    @Test fun checksCancelsRetriesRestoresAndRequestsInstallOnlyOnTap() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val updates = Updates()
            val model = UpdateViewModel(updates)
            advanceUntilIdle()
            assertEquals(UpdatePhase.IDLE, model.state.value.phase)
            model.check(); advanceUntilIdle()
            assertEquals(UpdatePhase.AVAILABLE, model.state.value.phase)
            model.download(); runCurrent()
            assertTrue(updates.downloading)
            assertEquals(5, model.state.value.received.toInt())
            model.cancel(); advanceUntilIdle()
            assertFalse(updates.downloading)
            assertEquals(UpdatePhase.AVAILABLE, model.state.value.phase)
            model.download(); advanceUntilIdle()
            assertEquals(UpdatePhase.READY, model.state.value.phase)
            val restored = UpdateViewModel(updates); advanceUntilIdle()
            assertEquals(UpdatePhase.READY, restored.state.value.phase)
            val install = async { restored.installationFiles.first() }
            runCurrent(); assertFalse(install.isCompleted)
            restored.prepareInstall(); advanceUntilIdle()
            assertEquals("verified.apk", install.await().name)
            updates.latest = true
            model.check(); advanceUntilIdle()
            assertEquals(UpdatePhase.LATEST, model.state.value.phase)
            updates.fail = true
            model.check(); advanceUntilIdle()
            assertEquals("offline", model.state.value.error)
            assertEquals(UpdatePhase.IDLE, model.state.value.phase)
        } finally { Dispatchers.resetMain() }
    }
}
