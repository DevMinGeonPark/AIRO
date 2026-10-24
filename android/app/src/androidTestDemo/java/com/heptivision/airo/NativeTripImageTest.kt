package com.heptivision.airo

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.heptivision.airo.core.design.AiroTheme
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.wireJson
import com.heptivision.airo.core.security.SecretStore
import com.heptivision.airo.data.trips.DemoTripRepository
import com.heptivision.airo.feature.itinerary.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.Base64

class NativeTripImageTest {
    @get:Rule val compose = createComposeRule()
    @Test fun importedImageUsesOriginalBytesAndNativeZoomViewer() {
        val bitmap = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(android.graphics.Color.BLUE)
        val bytes = ByteArrayOutputStream().use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, out); out.toByteArray() }; bitmap.recycle()
        val image = ArchivedTripImage("검증 QR 이미지", "image/png", MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }, 48, 48,
            "https://example.test/qr", "2026-09-18T00:00:00Z", Base64.getEncoder().encodeToString(bytes))
        val memory = mutableMapOf<String,String>()
        val repo = DemoTripRepository(object : SecretStore { override fun read(key: String) = memory[key]; override fun write(key: String, value: String?) { if (value == null) memory.remove(key) else memory[key] = value } })
        val archive = ArchiveFile(sourceKey = "fixture-image", exportedAt = "2026-09-18T00:00:00Z", trip = ArchiveTrip("이미지 테스트"), stops = emptyList(), data = buildJsonObject { put("images", wireJson.encodeToJsonElement(listOf(image))) })
        val trip = runBlocking { repo.importArchive(readArchive(encodeArchive(archive))).tripId }
        val model = PreparationViewModel(trip, repo)
        compose.setContent { AiroTheme { TripImageSection(model) } }
        compose.runOnUiThread { model.images() }
        compose.waitUntil(10000) { compose.onAllNodesWithText(image.name).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(image.name).performClick()
        compose.waitUntil(10000) { compose.onAllNodesWithTag("trip-image-preview").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("trip-image-preview").assertIsDisplayed()
        compose.onNodeWithText("확대").performClick()
        compose.onNodeWithText("원래 크기").performClick()
        compose.onNodeWithContentDescription("이미지 닫기").performClick()
        assertArrayEquals(bytes, runBlocking { repo.image(trip, image.metadata()) })
        assertEquals(image.sha256, runBlocking { readArchive(repo.exportArchive(trip)).images().single().sha256 })
    }
}
