package com.heptivision.airo

import android.graphics.Color
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.heptivision.airo.core.design.*
import com.heptivision.airo.data.trips.DemoTripRepository
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import kotlin.math.abs

/** Opt-in public CARTO tile check; no app account or billed API credentials. */
class OnlineMapTest {
    @get:Rule val compose = createComposeRule()
    @Test fun onlineStyleActuallyRendersRoadsAndNumberedPins() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("networkMaps") == "true")
        compose.setContent {
            AiroTheme { NativeMap(DemoTripRepository.seed().first().stops.filter { it.day == 1 }, Modifier.fillMaxSize(), offline = false, frameKey = "online-test") }
        }
        var roadPixels = 0
        var pinPixels = 0
        compose.waitUntil(30_000) {
            val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
            roadPixels = 0; pinPixels = 0
            for (y in bitmap.height / 5 until bitmap.height * 4 / 5 step 2) {
                for (x in bitmap.width / 8 until bitmap.width * 7 / 8 step 2) {
                    val c = bitmap.getPixel(x, y)
                    val r = Color.red(c); val g = Color.green(c); val b = Color.blue(c)
                    if (r in 32..75 && abs(r - g) <= 5 && abs(g - b) <= 5) roadPixels++
                    if (r in 129..139 && g in 160..170 && b >= 250) pinPixels++
                }
            }
            bitmap.recycle()
            roadPixels > 500 && pinPixels > 50
        }
        assertTrue("Expected visible CARTO roads: $roadPixels", roadPixels > 500)
        assertTrue("Expected numbered stop pins: $pinPixels", pinPixels > 50)
    }
}
