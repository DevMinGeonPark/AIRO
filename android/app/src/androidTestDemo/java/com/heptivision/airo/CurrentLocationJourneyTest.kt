package com.heptivision.airo

import android.Manifest
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
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.security.SecretStore
import com.heptivision.airo.data.photos.PlacePhotoLinks
import com.heptivision.airo.data.trips.*
import com.heptivision.airo.feature.itinerary.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapView
import org.maplibre.android.style.sources.GeoJsonSource

class CurrentLocationJourneyTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class Memory : SecretStore {
        val values = mutableMapOf<String,String>()
        override fun read(key:String)=values[key]
        override fun write(key:String,value:String?) { if(value==null)values.remove(key) else values[key]=value }
    }
    private fun map(view:View):MapView?=if(view is MapView)view else if(view is ViewGroup)(0 until view.childCount).firstNotNullOfOrNull { map(view.getChildAt(it)) } else null
    private fun show(store:ViewModelStore):ProgressViewModel {
        val memory=Memory();val repo=DemoTripRepository(memory,readDemoRoads(compose.activity))
        val itinerary=ItineraryViewModel("demo-rome",repo);val progress=ProgressViewModel("demo-rome",repo);val preparation=PreparationViewModel("demo-rome",repo)
        store.put("itinerary",itinerary);store.put("progress",progress);store.put("preparation",preparation)
        compose.setContent { AiroTheme { Surface(color=Ink) { Box(Modifier.safeDrawingPadding()) { ItineraryScreen(itinerary,progress,preparation,PlacePhotoLinks(memory,"demo"){"fixture"},{},{},{},{},onBack={}) } } } }
        compose.waitUntil(15000) { compose.onAllNodesWithContentDescription("현재 위치").fetchSemanticsNodes().isNotEmpty() && progress.state.value.data!=null }
        return progress
    }
    private fun inspect(located:Boolean) {
        var match=false
        compose.waitUntil(15000) {
            compose.runOnUiThread { map(compose.activity.window.decorView)?.getMapAsync { map ->
                val features=map.style?.getSourceAs<GeoJsonSource>("airo-user-location")?.querySourceFeatures(null)
                val target=map.cameraPosition.target
                match=features!=null && if(located) features.isNotEmpty() && target!=null && kotlin.math.abs(target.latitude-41.901)<.0001 && kotlin.math.abs(target.longitude-12.48)<.0001 else features.isEmpty()
            } };match
        }
    }
    @Test fun permissionDenialExplainsSettingsAndAllowsRetry() {
        val store=ViewModelStore()
        try {
            show(store);compose.onNodeWithContentDescription("현재 위치").assertIsDisplayed().performClick()
            val device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            val deny=device.wait(Until.findObject(By.res("com.android.permissioncontroller","permission_deny_button")),5000)
            deny?.click()
            compose.onNodeWithText("위치 권한이 꺼져 있어요. 앱 설정에서 위치를 허용해 주세요.").assertIsDisplayed()
            compose.onNodeWithText("위치 설정").assertIsDisplayed();compose.onNodeWithText("닫기").performClick()
            compose.onNodeWithContentDescription("현재 위치").assertIsEnabled()
        } finally { compose.runOnUiThread { store.clear() } }
    }
    @Suppress("DEPRECATION")
    @Test fun locatesAndRecentersWithoutCompletingStopsAndCancelsWhenBackgrounded() {
        val automation=InstrumentationRegistry.getInstrumentation().uiAutomation;val app=compose.activity.packageName
        automation.grantRuntimePermission(app,Manifest.permission.ACCESS_COARSE_LOCATION);automation.grantRuntimePermission(app,Manifest.permission.ACCESS_FINE_LOCATION)
        android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("appops set $app android:mock_location allow")).use { it.readBytes() }
        val manager=compose.activity.getSystemService(LocationManager::class.java);val store=ViewModelStore()
        manager.addTestProvider(LocationManager.GPS_PROVIDER,false,false,false,false,true,true,true,Criteria.POWER_LOW,Criteria.ACCURACY_FINE)
        manager.setTestProviderEnabled(LocationManager.GPS_PROVIDER,true)
        fun fix(stale:Boolean=false)=manager.setTestProviderLocation(LocationManager.GPS_PROVIDER,Location(LocationManager.GPS_PROVIDER).apply {
            latitude=41.901;longitude=12.48;accuracy=5f;time=System.currentTimeMillis()-(if(stale)60000 else 0);elapsedRealtimeNanos=SystemClock.elapsedRealtimeNanos()-(if(stale)60_000_000_000 else 0)
        })
        try {
            val progress=show(store);inspect(false)
            compose.onNodeWithContentDescription("현재 위치").performClick();fix();inspect(true)
            assertFalse(progress.state.value.tracking);assertTrue(progress.state.value.data!!.entries.isEmpty())
            compose.runOnUiThread { map(compose.activity.window.decorView)?.getMapAsync { it.moveCamera(CameraUpdateFactory.newLatLng(LatLng(41.91,12.49))) } }
            compose.onNodeWithContentDescription("현재 위치").performClick();inspect(true)
            compose.waitForIdle()
            val screenshot=automation.takeScreenshot()
            java.io.File(compose.activity.getExternalFilesDir(null),"current-location.png").outputStream().use { screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) };screenshot.recycle()
            manager.removeTestProvider(LocationManager.GPS_PROVIDER)
            manager.addTestProvider(LocationManager.GPS_PROVIDER,false,false,false,false,true,true,true,Criteria.POWER_LOW,Criteria.ACCURACY_FINE)
            manager.setTestProviderEnabled(LocationManager.GPS_PROVIDER,true)
            fix(true)
            compose.waitUntil(5000) { manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let { SystemClock.elapsedRealtimeNanos()-it.elapsedRealtimeNanos>30_000_000_000L }==true }
            compose.onNodeWithContentDescription("현재 위치").performClick();compose.onNodeWithContentDescription("현재 위치").assertIsNotEnabled()
            compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED);fix()
            compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
            compose.onNodeWithContentDescription("현재 위치").assertIsEnabled();inspect(false)
            compose.onNodeWithContentDescription("현재 위치").performClick();inspect(true)
        } finally {
            compose.runOnUiThread { store.clear() };manager.removeTestProvider(LocationManager.GPS_PROVIDER)
            android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("appops set $app android:mock_location ignore")).use { it.readBytes() }
        }
    }
}
