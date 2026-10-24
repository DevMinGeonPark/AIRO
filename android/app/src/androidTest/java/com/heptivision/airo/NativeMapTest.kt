package com.heptivision.airo

import android.graphics.Color
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.heptivision.airo.core.design.AiroTheme
import com.heptivision.airo.core.design.NativeMap
import com.heptivision.airo.data.trips.DemoTripRepository
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class NativeMapTest {
    @get:Rule val compose = createComposeRule()
    @Test fun bundledRomeRendersRoadsWithoutAnyNetwork() {
        compose.setContent {
            AiroTheme { NativeMap(DemoTripRepository.seed().first().stops.filter { it.day == 1 }, Modifier.fillMaxSize(), offline = true, frameKey = "test") }
        }
        // A loaded style and visible pins did not prove roads loaded: malformed polygons
        // used to reject the whole GeoJSON source. Count real rendered road pixels.
        var pixels = 0
        compose.waitUntil(timeoutMillis = 20_000) {
            val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
            pixels = 0
            for (y in bitmap.height / 4 until bitmap.height * 3 / 4 step 2) {
                for (x in bitmap.width / 4 until bitmap.width * 3 / 4 step 2) {
                    val c = bitmap.getPixel(x, y)
                    if (Color.red(c) in 56..66 && Color.green(c) in 62..72 && Color.blue(c) in 73..83) pixels++
                }
            }
            bitmap.recycle()
            pixels > 200
        }
        assertTrue("Bundled map should visibly render roads, observed $pixels road pixels", pixels > 200)
    }
}
