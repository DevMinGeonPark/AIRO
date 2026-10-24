package com.heptivision.airo

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.provider.MediaStore
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import java.util.regex.Pattern

class PlaceMemoriesJourneyTest {
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
    private fun waitText(text: String) { compose.waitUntil(15_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() } }
    @Test fun systemPhotoPickerLinksOnlyChosenPhotoAndSurvivesRecreationThenUnlinksWithoutDeletingOriginal() {
        compose.onNodeWithText("내 여행 시작하기").performScrollTo().performClick()
        compose.onNodeWithText("샘플 여행 둘러보기").performScrollTo().performClick()
        waitText("로마, 느리게 걷는 3일")
        compose.onNodeWithText("로마, 느리게 걷는 3일").performClick()
        compose.waitUntil(15_000) { compose.onAllNodesWithContentDescription("판테온 지도에서 보기").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("판테온 지도에서 보기").performClick()
        val resolver = compose.activity.contentResolver
        val uri = requireNotNull(resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "airo-place-memory-${System.currentTimeMillis()}.png")
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.DATE_TAKEN, System.currentTimeMillis() + 1000)
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }))
        try {
            val bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.MAGENTA) }
            resolver.openOutputStream(uri)!!.use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
            resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            compose.onNodeWithText("사진 연결").performScrollTo().performClick()
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            requireNotNull(device.wait(Until.findObject(By.descStartsWith("Photo taken on")), 15_000)).click()
            requireNotNull(device.wait(Until.findObject(By.text(Pattern.compile("Add.*|Done"))), 10_000)).click()
            compose.waitUntil(15_000) { compose.onAllNodesWithContentDescription("연결한 사진").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithContentDescription("연결한 사진").performScrollTo().assertIsDisplayed()
            val store = (compose.activity.application as AiroApplication).container.photos
            val photo = runBlocking { store.list("demo-rome", "pantheon").single() }
            resolver.openInputStream(android.net.Uri.parse(photo.uri))!!.use { stream ->
                val decoded = BitmapFactory.decodeStream(stream)!!
                assertEquals(Color.MAGENTA, decoded.getPixel(16, 16)); decoded.recycle()
            }
            assertTrue(resolver.persistedUriPermissions.any { it.uri.toString() == photo.uri && it.isReadPermission })
            compose.activityRule.scenario.recreate()
            compose.waitUntil(15_000) { compose.onAllNodesWithContentDescription("연결한 사진").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithContentDescription("연결한 사진").performScrollTo().assertIsDisplayed()
            assertTrue(runBlocking { store.list("demo-rome", "coffee").isEmpty() })
            // The photos scroll horizontally; scroll the surrounding place card vertically to expose its controls.
            compose.onNodeWithTag("map-place-card").performTouchInput { swipeUp(startY = height * .85f, endY = height * .45f) }
            compose.onNodeWithContentDescription("사진 연결 해제").assertIsDisplayed().performClick()
            try { compose.waitUntil(10_000) { compose.onAllNodesWithContentDescription("사진 연결 해제").fetchSemanticsNodes().isEmpty() } }
            catch (failure: Throwable) { throw AssertionError("Stored links: ${runBlocking { store.list("demo-rome", "pantheon").size }}\n" + compose.onRoot().printToString(), failure) }
            assertTrue(runBlocking { store.list("demo-rome", "pantheon").isEmpty() })
            resolver.openInputStream(uri)!!.use { assertTrue(it.read() >= 0) }
            assertEquals(android.content.pm.PackageManager.PERMISSION_DENIED, compose.activity.checkSelfPermission(android.Manifest.permission.READ_MEDIA_IMAGES))
        } finally {
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            if (device.currentPackageName?.contains("photopicker") == true || device.currentPackageName?.contains("providers.media") == true) device.pressBack()
            resolver.delete(uri, null, null)
        }
    }
}
