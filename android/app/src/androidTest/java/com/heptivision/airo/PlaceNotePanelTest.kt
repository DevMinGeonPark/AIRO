package com.heptivision.airo

import android.content.ActivityNotFoundException
import android.content.ClipboardManager
import android.content.ContextWrapper
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.heptivision.airo.core.design.AiroTheme
import com.heptivision.airo.core.model.Stop
import com.heptivision.airo.core.model.placeMapLinks
import com.heptivision.airo.core.platform.openPlaceMap
import com.heptivision.airo.feature.itinerary.PlaceNote
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

class PlaceNotePanelTest {
    @get:Rule val compose = createComposeRule()
    @Test fun pinCopyFullNoteScrollAndCloseRemainReachable() {
        val note = "체크인: 15:00\nPIN: 0012#\n\n" + (1..18).joinToString("\n\n") { "안내 $it: 입구를 지나 오른쪽으로 이동해 주세요. 짐 보관은 안내 데스크에서 가능합니다." } + "\n\n마지막 안내: 체크아웃 11:00"
        compose.setContent { AiroTheme { Box(Modifier.fillMaxSize().padding(16.dp)) { PlaceNote("테스트 숙소", note) } } }
        compose.onNodeWithContentDescription("테스트 숙소 메모 펼치기").performClick()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val config = context.resources.configuration
        compose.onNodeWithText("PIN 복사").performScrollTo().assertIsDisplayed()
        device.takeScreenshot(File(context.getExternalFilesDir(null), "note-pin-${config.screenWidthDp}-${config.fontScale}.png"))
        compose.onNodeWithText("마지막 안내: 체크아웃 11:00").performScrollTo().assertIsDisplayed()
        device.takeScreenshot(File(context.getExternalFilesDir(null), "note-end-${config.screenWidthDp}-${config.fontScale}.png"))
        compose.onNodeWithText("PIN 복사").performScrollTo().performClick()
        compose.runOnIdle { assertEquals("0012#", context.getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.text.toString()) }
        compose.onNodeWithContentDescription("장소 메모 닫기").assertIsDisplayed().performClick()
        compose.onNodeWithTag("place-note-body").assertDoesNotExist()
        compose.onNodeWithContentDescription("테스트 숙소 메모 펼치기").performClick()
        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()
        compose.onNodeWithTag("place-note-body").assertDoesNotExist()
    }
    @Test fun mapsAppIsPreferredAndMissingAppFallsBackWithSameDestinationAndNoOrigin() {
        val calls = mutableListOf<Intent>()
        var missing = false
        val context = object : ContextWrapper(InstrumentationRegistry.getInstrumentation().targetContext) {
            override fun startActivity(intent: Intent) { calls += intent; if (missing && intent.`package` != null) throw ActivityNotFoundException() }
        }
        val url = placeMapLinks(Stop("s", "t", "호텔", 12.4, 41.9, 1, 0), false).last().second
        assertTrue(openPlaceMap(context, url))
        assertEquals("com.google.android.apps.maps", calls.single().`package`)
        assertNull(calls.single().data?.getQueryParameter("origin"))
        assertEquals("navigate", calls.single().data?.getQueryParameter("dir_action"))
        calls.clear(); missing = true
        assertTrue(openPlaceMap(context, url))
        assertEquals(2, calls.size)
        assertNull(calls.last().`package`)
        assertEquals(calls.first().data, calls.last().data)
    }
}
