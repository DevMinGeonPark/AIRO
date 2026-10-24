package com.heptivision.airo

import android.Manifest
import android.content.Context
import android.graphics.RectF
import android.location.Criteria
import android.location.Location
import android.location.LocationManager
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.heptivision.airo.core.design.Ink
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import com.heptivision.airo.core.design.AiroTheme
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.core.security.SecretStore
import com.heptivision.airo.data.photos.PlacePhotoLinks
import com.heptivision.airo.data.trips.*
import com.heptivision.airo.feature.itinerary.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.maplibre.android.maps.MapView
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.sources.GeoJsonSource
import java.time.LocalDate
import java.time.ZoneOffset

/** Synthetic, offline repository; real native map, check controls and Android LocationManager callbacks. */
class CompletionJourneyTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class Memory : SecretStore {
        private val values = mutableMapOf<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
    }
    private fun map(view: View): MapView? = if (view is MapView) view else if (view is ViewGroup) (0 until view.childCount).firstNotNullOfOrNull { map(view.getChildAt(it)) } else null
    private fun inspect(predicate: (List<org.maplibre.geojson.Feature>, Int, Int) -> Boolean) {
        var matches = false
        compose.waitUntil(15_000) {
            compose.runOnUiThread { map(compose.activity.window.decorView)?.let { view -> view.getMapAsync { map ->
                val style = map.style
                val pins = style?.getSourceAs<GeoJsonSource>("airo-stops")?.querySourceFeatures(null).orEmpty()
                val roads = map.queryRenderedFeatures(RectF(0f, 0f, view.width.toFloat(), view.height.toFloat()), "airo-route-line").size
                val pulses = if ((style?.getLayerAs<CircleLayer>("airo-completion-pulse")?.circleOpacity?.value ?: 0f) > 0f)
                    style?.getSourceAs<GeoJsonSource>("airo-completion")?.querySourceFeatures(null)?.size ?: 0 else 0
                matches = predicate(pins, roads, pulses)
            } } }
            matches
        }
    }
    private fun show(repo: TripRepository, memory: Memory, store: ViewModelStore): ProgressViewModel {
        val itinerary = ItineraryViewModel("demo-rome", repo)
        val progress = ProgressViewModel("demo-rome", repo)
        val preparation = PreparationViewModel("demo-rome", repo)
        store.put("itinerary", itinerary); store.put("progress", progress); store.put("preparation", preparation)
        compose.setContent { AiroTheme { Surface(color = Ink) { Box(Modifier.safeDrawingPadding()) { ItineraryScreen(itinerary, progress, preparation, PlacePhotoLinks(memory, "demo") { "fixture" }, {}, {}, {}, {}, onBack = {}) } } } }
        compose.waitUntil(15_000) { compose.onAllNodesWithTag("day-card").fetchSemanticsNodes().isNotEmpty() && progress.state.value.data != null }
        // The fixture clock is UTC; device-local midnight can otherwise choose Day 2.
        run {
            compose.onNodeWithText("날짜 선택").performClick(); compose.onNodeWithText("1일차", substring = true).performClick()
        }
        return progress
    }
    private fun screenshot(name: String) {
        compose.waitForIdle(); Thread.sleep(350) // TextureView compositor follows native source updates.
        val resolver = compose.activity.contentResolver
        val values = android.content.ContentValues().apply {
            put(android.provider.MediaStore.Downloads.DISPLAY_NAME, "$name.png")
            put(android.provider.MediaStore.Downloads.MIME_TYPE, "image/png")
            put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "Download/airo-progress")
            put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)!!
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        resolver.openOutputStream(uri)!!.use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
        resolver.update(uri, android.content.ContentValues().apply { put(android.provider.MediaStore.Downloads.IS_PENDING, 0) }, null, null)
    }
    @Test fun checkAnimatesAndRemovesRouteBeforeServerReplyUndoRestoresAndFailureRollsBack() {
        val memory = Memory(); val real = DemoTripRepository(memory, readDemoRoads(compose.activity)); val store = ViewModelStore()
        var gate: CompletableDeferred<Unit>? = CompletableDeferred()
        var fail = false
        val repo = object : TripRepository by real {
            override suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress {
                gate?.await()
                if (fail) { fail = false; throw ApiException(503, "synthetic failure") }
                return real.updateProgress(tripId, value)
            }
        }
        try {
            val progress = show(repo, memory, store)
            inspect { pins, roads, _ -> pins.size == 3 && roads == 2 }
            compose.mainClock.autoAdvance = false
            compose.onNodeWithContentDescription("판테온 일정 완료").performClick()
            compose.mainClock.advanceTimeBy(160)
            inspect { pins, roads, pulses -> pins.any { it.getStringProperty("id") == "pantheon" && it.getBooleanProperty("done") } && roads == 1 && pulses > 0 }
            assertTrue(progress.state.value.busy)
            assertTrue(runBlocking { real.progress("demo-rome").entries.isEmpty() })
            screenshot("immediate-check-pulse-before-save")
            compose.mainClock.autoAdvance = true
            compose.onNodeWithTag("day-stop-list").performScrollToNode(hasContentDescription("산테우스타키오 카페 일정 완료"))
            compose.onNodeWithContentDescription("산테우스타키오 카페 일정 완료").performClick()
            inspect { _, roads, _ -> roads == 0 }
            compose.onNodeWithContentDescription("산테우스타키오 카페 일정 완료").performClick()
            inspect { _, roads, _ -> roads == 1 }
            gate!!.complete(Unit); gate = null
            compose.waitUntil(10_000) { !progress.state.value.busy }
            compose.onNodeWithTag("day-stop-list").performScrollToNode(hasContentDescription("판테온 일정 완료"))
            compose.onNodeWithContentDescription("판테온 일정 완료").performClick()
            inspect { pins, roads, _ -> pins.none { it.getBooleanProperty("done") } && roads == 2 }
            compose.waitUntil(10_000) { !progress.state.value.busy }
            gate = CompletableDeferred(); fail = true
            compose.onNodeWithContentDescription("판테온 일정 완료").performClick()
            inspect { _, roads, _ -> roads == 1 }
            gate!!.complete(Unit); gate = null
            compose.waitUntil(10_000) { progress.state.value.error != null && !progress.state.value.busy }
            inspect { pins, roads, _ -> pins.none { it.getBooleanProperty("done") } && roads == 2 }
            screenshot("failed-check-restores-route")
        } finally { gate?.complete(Unit); compose.mainClock.autoAdvance = true; compose.runOnUiThread { store.clear() } }
    }
    @Test fun daySettingsApplyTimeRulesTogetherWithoutCheckingFutureTravel() {
        val memory = Memory(); val real = DemoTripRepository(memory, readDemoRoads(compose.activity)); val store = ViewModelStore()
        try {
            val progress = show(real, memory, store)
            compose.onNodeWithContentDescription("시간·GPS 자동 체크 설정").performClick()
            compose.onNodeWithText("위치 또는 시간").performScrollTo().performClick()
            compose.onNodeWithText("시간으로 자동 체크").performClick()
            compose.onNodeWithText("이 일정에 적용").performScrollTo().performClick()
            compose.waitUntil(10_000) { !progress.state.value.busy && progress.state.value.data?.rules?.size == 3 }
            assertTrue(progress.state.value.data!!.rules.all { it.mode == "time" })
            assertTrue(runBlocking { real.progress("demo-rome").entries.isEmpty() })
            assertFalse(progress.state.value.tracking)
        } finally { compose.runOnUiThread { store.clear() } }
    }

    @Suppress("DEPRECATION")
    @Test fun todayTimeAndRealLocationManagerCallbackMarkPinsAndExcludeCompletedStops() {
        val memory = Memory(); val real = DemoTripRepository(memory, readDemoRoads(compose.activity)); val store = ViewModelStore()
        val id = "demo-rome"
        runBlocking {
            real.update(id, TripInput("자동 진행", LocalDate.now(ZoneOffset.UTC).toString()))
            val first = real.detail(id).stops[0]
            real.saveStop(id, first.id, StopInput(first.name, first.lng, first.lat, 1, "00:00"))
            var data = real.updateProgress(id, ProgressMutation(action = "timezone", timeZone = "UTC"))
            data = real.updateProgress(id, ProgressMutation(revision = data.revision, action = "rule", rule = ProgressRule("pantheon", "time")))
            real.updateProgress(id, ProgressMutation(revision = data.revision, action = "rule", rule = ProgressRule("coffee", "location")))
        }
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val app = compose.activity.packageName
        automation.grantRuntimePermission(app, Manifest.permission.ACCESS_COARSE_LOCATION)
        automation.grantRuntimePermission(app, Manifest.permission.ACCESS_FINE_LOCATION)
        android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("appops set $app android:mock_location allow")).use { it.readBytes() }
        val manager = compose.activity.getSystemService(LocationManager::class.java)
        manager.addTestProvider(LocationManager.GPS_PROVIDER, false, false, false, false, true, true, true, Criteria.POWER_LOW, Criteria.ACCURACY_FINE)
        manager.setTestProviderEnabled(LocationManager.GPS_PROVIDER, true)
        try {
            val progress = show(real, memory, store)
            compose.waitUntil(10_000) { progress.state.value.data?.entries?.any { it.stopId == "pantheon" && it.source == "time" && it.done } == true }
            inspect { pins, roads, _ -> pins.any { it.getStringProperty("id") == "pantheon" && it.getBooleanProperty("done") } && roads == 1 }
            compose.onNodeWithTag("day-stop-list").performScrollToNode(hasContentDescription("산테우스타키오 카페 지도에서 보기"))
            compose.onNodeWithContentDescription("산테우스타키오 카페 지도에서 보기").performClick()
            compose.onNodeWithText("위치 자동 체크 시작").performScrollTo().performClick()
            compose.waitUntil(5000) { progress.state.value.tracking }
            val coffee = runBlocking { real.detail(id).stops.first { it.id == "coffee" } }
            manager.setTestProviderLocation(LocationManager.GPS_PROVIDER, Location(LocationManager.GPS_PROVIDER).apply {
                latitude = coffee.lat; longitude = coffee.lng; accuracy = 5f; time = System.currentTimeMillis(); elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
            })
            compose.waitUntil(15_000) { progress.state.value.data?.entries?.any { it.stopId == "coffee" && it.source == "location" && it.done } == true }
            inspect { pins, roads, _ -> pins.count { it.getBooleanProperty("done") } == 2 && roads == 0 }
            screenshot("gps-and-time-completed-pins")
            compose.waitUntil(10_000) { !progress.state.value.busy }
            assertEquals(2, runBlocking { real.progress(id).entries.count { it.done } })
        } finally {
            compose.runOnUiThread { store.clear() }
            manager.removeTestProvider(LocationManager.GPS_PROVIDER)
            android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("appops set $app android:mock_location ignore")).use { it.readBytes() }
        }
    }
}
