package com.heptivision.airo

import android.content.Context
import android.content.ContentValues
import android.provider.MediaStore
import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.heptivision.airo.core.model.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.maplibre.android.maps.MapView
import java.util.concurrent.atomic.AtomicInteger

/** Real native widgets and rendered MapLibre geometry, entirely offline with synthetic demo data. */
class WebParityJourneyTest {
    private val compose = createAndroidComposeRule<MainActivity>()
    @get:Rule val rules: RuleChain = RuleChain.outerRule(object : ExternalResource() {
        override fun before() {
            check(BuildConfig.DEMO)
            val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as AiroApplication
            runBlocking { app.container.auth.signOut() }
            app.getSharedPreferences("airo_secure", Context.MODE_PRIVATE).edit().clear().commit()
            app.selectServer(BuildConfig.API_BASE_URL)
        }
    }).around(compose)
    private fun waitText(text: String) {
        compose.waitUntil(15_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }
    private fun enter() {
        compose.onNodeWithText("내 여행 시작하기").performScrollTo().performClick()
        compose.onNodeWithText("샘플 여행 둘러보기").performScrollTo().performClick()
        waitText("로마, 느리게 걷는 3일")
        compose.onNodeWithText("로마, 느리게 걷는 3일").performClick()
        compose.waitUntil(15_000) { compose.onAllNodesWithTag("day-card").fetchSemanticsNodes().isNotEmpty() }
        // Wide screens default to the whole trip, just like the web.
        if (compose.activity.resources.configuration.screenWidthDp >= 1024) {
            compose.onNodeWithText("날짜 선택").performClick()
            compose.onNodeWithText("1일차", substring = true).performClick()
        }
        waitText("일정 완료 0 / 3")
    }
    private fun map(view: View): MapView? = if (view is MapView) view else if (view is ViewGroup) (0 until view.childCount).firstNotNullOfOrNull { map(view.getChildAt(it)) } else null
    private fun renderedRoutes() {
        val count = AtomicInteger()
        compose.waitUntil(20_000) {
            compose.runOnUiThread {
                map(compose.activity.window.decorView)?.let { view -> view.getMapAsync { map ->
                    count.set(map.queryRenderedFeatures(RectF(0f, 0f, view.width.toFloat(), view.height.toFloat()), "airo-route-line").size)
                } }
            }
            count.get() >= 2
        }
        assertTrue("Day 1 must render both actual saved road geometries without pressing a route button", count.get() >= 2)
    }
    private fun screenshot(name: String) {
        compose.waitForIdle()
        Thread.sleep(500)
        val context = compose.activity
        val config = context.resources.configuration
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, "$name.png"); put(MediaStore.Downloads.MIME_TYPE, "image/png")
            put(MediaStore.Downloads.RELATIVE_PATH, "Download/airo-web-parity/${config.screenWidthDp}dp-${config.fontScale}"); put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = requireNotNull(context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        context.contentResolver.openOutputStream(uri)!!.use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
        context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
    }
    @Test fun automaticRoadsLeftDayPanelSelectionAndNativeMapGestures() {
        enter(); renderedRoutes(); screenshot("day-1-automatic-roads")
        val before = compose.onNodeWithTag("native-map").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithContentDescription("판테온 지도에서 보기").performClick()
        compose.onNodeWithTag("map-place-card").assertIsDisplayed()
        compose.onNodeWithContentDescription("일정 닫기").assertDoesNotExist()
        screenshot("selected-place")
        compose.activityRule.scenario.recreate()
        compose.onNodeWithTag("map-place-card").assertIsDisplayed()
        compose.onNodeWithContentDescription("현지 장소명 복사").performScrollTo().performClick()
        compose.runOnUiThread { assertEquals("Pantheon Roma", compose.activity.getSystemService(android.content.ClipboardManager::class.java).primaryClip!!.getItemAt(0).text.toString()) }
        compose.onNodeWithText("전체 일정 보기").performScrollTo().performClick()
        compose.onNodeWithTag("map-place-card").assertDoesNotExist()
        waitText("일정 완료 0 / 6")
        compose.onNodeWithText("날짜 선택").performClick()
        compose.onNodeWithText("1일차", substring = true).performClick()
        compose.onNodeWithContentDescription("Day 일정 접기").performClick()
        compose.onNodeWithTag("day-card").assertDoesNotExist()
        compose.onNodeWithContentDescription("판테온 지도에서 보기").assertDoesNotExist()
        compose.activityRule.scenario.recreate()
        compose.onNodeWithTag("day-collapsed").assertIsDisplayed()
        screenshot("day-collapsed")
        compose.onNodeWithContentDescription("Day 일정 펼치기").performClick()
        compose.onNodeWithContentDescription("판테온 지도에서 보기").assertIsDisplayed()
        compose.onNodeWithTag("day-card").performTouchInput { swipeLeft() }
        waitText("일정 완료 0 / 2")
        compose.onNodeWithTag("native-map").performTouchInput { swipe(androidx.compose.ui.geometry.Offset(width * .85f, height * .75f), androidx.compose.ui.geometry.Offset(width * .65f, height * .75f)) }
        waitText("일정 완료 0 / 2")
        assertEquals(before, compose.onNodeWithTag("native-map").fetchSemanticsNode().boundsInRoot)
        screenshot("day-2")
    }
    @Test fun roadPlaybackUsesNativeMovingLayerAndCanBeStopped() {
        enter(); renderedRoutes()
        compose.onNodeWithText("상세 일정").performClick()
        compose.onNodeWithTag("schedule-list").performScrollToNode(hasText("1일차 따라가기"))
        compose.onNodeWithText("1일차 따라가기").performClick()
        waitText("경로 재생 멈추기")
        compose.onNodeWithTag("map-place-card").assertDoesNotExist()
        val moving = AtomicInteger()
        compose.waitUntil(10_000) {
            compose.runOnUiThread { map(compose.activity.window.decorView)?.let { view -> view.getMapAsync { map -> moving.set(map.queryRenderedFeatures(RectF(0f, 0f, view.width.toFloat(), view.height.toFloat()), "airo-moving-pin").size) } } }
            moving.get() > 0
        }
        screenshot("native-route-playback")
        compose.onNodeWithText("경로 재생 멈추기").performClick()
        compose.onNodeWithText("경로 재생 멈추기").assertDoesNotExist()
        compose.onNodeWithTag("day-card").assertIsDisplayed()
    }
    @Test fun nativeCompletionAndDayZeroPreparationPersist() {
        enter()
        compose.onNodeWithContentDescription("판테온 일정 완료").performClick()
        waitText("일정 완료 1 / 3")
        compose.activityRule.scenario.recreate()
        waitText("일정 완료 1 / 3")
        assertTrue(runBlocking { (compose.activity.application as AiroApplication).container.trips.progress("demo-rome").entries.single().done })
        // Checking an item must never silently ask for location permission.
        assertEquals(android.content.pm.PackageManager.PERMISSION_DENIED, compose.activity.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION))
        compose.onNodeWithContentDescription("이전 날짜").performClick()
        waitText("출국 전날")
        compose.onNodeWithText("출국 전날 Todo").performClick()
        compose.onNodeWithContentDescription("Todo 크게 보기").assertIsDisplayed()
        compose.onNodeWithContentDescription("Todo 크게 보기").performClick()
        compose.onNodeWithTag("preparation-list").performScrollToNode(hasText("새 할 일"))
        compose.onNodeWithText("새 할 일").performTextInput("네이티브 준비 목록 검증")
        compose.onNodeWithTag("preparation-list").performScrollToNode(hasContentDescription("Todo 작게 보기"))
        compose.onNodeWithContentDescription("Todo 작게 보기").performClick()
        compose.onNodeWithTag("preparation-list").performScrollToNode(hasText("새 할 일"))
        compose.onNodeWithText("네이티브 준비 목록 검증").assertExists()
        compose.onNodeWithTag("preparation-list").performScrollToNode(hasContentDescription("Todo 크게 보기"))
        compose.onNodeWithContentDescription("Todo 크게 보기").performClick()
        compose.onNodeWithTag("preparation-list").performScrollToNode(hasText("추가", substring = false))
        compose.onNodeWithText("추가", substring = false).performClick()
        compose.onNodeWithTag("preparation-list").performScrollToNode(hasText("저장하고 닫기"))
        compose.onNodeWithText("저장하고 닫기").assertIsEnabled().performClick()
        try { compose.waitUntil(10_000) { compose.onAllNodesWithTag("preparation-list").fetchSemanticsNodes().isEmpty() } }
        catch (error: Throwable) { screenshot("todo-save-failure"); throw AssertionError(compose.onRoot().printToString(), error) }
        compose.onNodeWithContentDescription("다음 날짜").performClick()
        compose.onNodeWithText("출국 전날 Todo").performClick()
        compose.onNodeWithTag("preparation-list").performScrollToNode(hasText("네이티브 준비 목록 검증"))
        compose.onNodeWithText("네이티브 준비 목록 검증").assertIsDisplayed()
        screenshot("day-0-todo")
        assertEquals(9, runBlocking { (compose.activity.application as AiroApplication).container.trips.preparation("demo-rome").items.size })
    }
}
