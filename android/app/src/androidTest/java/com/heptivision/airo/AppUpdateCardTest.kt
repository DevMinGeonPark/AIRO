package com.heptivision.airo

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewModelScope
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.heptivision.airo.core.design.AiroTheme
import com.heptivision.airo.data.update.*
import com.heptivision.airo.feature.profile.*
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

class AppUpdateCardTest {
    @get:Rule val compose = createComposeRule()
    private class Updates : AppUpdates {
        var latest = false
        var offline = false
        var cached = false
        var downloadCount = 0
        val release = UpdateRelease(UpdateArtifact("demo", "com.heptivision.airo.demo", "0.3.2-demo", 5,
            "airo-android-demo-0.3.2.apk", 70000000, "0".repeat(64), 26), "2026-09-18", listOf("설정에서 업데이트", "저장한 여행 유지"))
        override suspend fun restore() = if (cached) release else null
        override suspend fun check(): UpdateRelease? {
            delay(100)
            if (offline) throw UpdateException("업데이트 서버에 연결하지 못했어요.")
            return if (latest) null else release
        }
        override suspend fun download(release: UpdateRelease, progress: (Long) -> Unit) {
            downloadCount++
            progress(35000000)
            delay(2000)
            cached = true
        }
        override suspend fun installationFile(release: UpdateRelease): File = error("This UI fixture must not launch an actual installation")
    }
    private fun waitText(text: String) { compose.waitUntil(10_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() } }
    private fun tap(text: String) { compose.onNodeWithText(text).performScrollTo().performClick() }

    @Test fun latestOfflineRetryCancellationAndPermissionExplanation() {
        val fixture = Updates()
        lateinit var model: UpdateViewModel
        compose.runOnUiThread { model = UpdateViewModel(fixture) }
        compose.setContent { AiroTheme { Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) { AppUpdateCard(model) } } }
        try {
            waitText("업데이트 확인")
            fixture.latest = true
            tap("업데이트 확인"); waitText("최신 버전을 사용하고 있어요.")
            fixture.offline = true
            tap("업데이트 확인"); waitText("업데이트 서버에 연결하지 못했어요.")
            fixture.offline = false; fixture.latest = false
            tap("업데이트 확인"); waitText("새 버전 0.3.2-demo")
            assertEquals(0, fixture.downloadCount)
            tap("업데이트 다운로드"); waitText("다운로드 중 50%")
            tap("다운로드 취소"); waitText("다운로드를 취소했어요.")
            tap("업데이트 다운로드"); waitText("다운로드 완료 · 설치할 준비가 됐어요.")
            tap("지금 설치"); waitText("업데이트 설치 허용")
            compose.onNodeWithText("나중에").performClick(); waitText("지금 설치")
            tap("지금 설치"); compose.onNodeWithText("설정 열기").performClick()
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            val installer = AndroidUpdateInstaller(InstrumentationRegistry.getInstrumentation().targetContext)
            assertFalse(installer.canInstall())
            device.waitForIdle()
            device.pressBack()
            waitText("설치 권한을 허용하지 않았어요. 파일은 보관되어 있어요.")
            assertEquals(2, fixture.downloadCount)
        } finally { compose.runOnUiThread { model.viewModelScope.cancel() } }
    }
}
