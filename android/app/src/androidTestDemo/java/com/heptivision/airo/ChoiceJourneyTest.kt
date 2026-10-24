package com.heptivision.airo

import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelStore
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.security.SecretStore
import com.heptivision.airo.data.photos.PlacePhotoLinks
import com.heptivision.airo.data.trips.*
import com.heptivision.airo.feature.itinerary.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.maplibre.android.maps.MapView
import org.maplibre.android.style.sources.GeoJsonSource
import java.time.Instant

class ChoiceJourneyTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private class Memory : SecretStore {
        val values = mutableMapOf<String,String>()
        override fun read(key:String)=values[key]
        override fun write(key:String,value:String?) { if(value==null)values.remove(key) else values[key]=value }
    }
    private fun map(view:View):MapView?=if(view is MapView)view else if(view is ViewGroup)(0 until view.childCount).firstNotNullOfOrNull { map(view.getChildAt(it)) } else null
    private fun inspect(pins:Int,roads:Int,done:Int=0) {
        var match=false
        var observed=""
        try { compose.waitUntil(15000) {
            compose.runOnUiThread { map(compose.activity.window.decorView)?.let { view -> view.getMapAsync { m ->
                // MapLibre can return the same GeoJSON feature from adjacent tiles.
                val features=m.style?.getSourceAs<GeoJsonSource>("airo-stops")?.querySourceFeatures(null).orEmpty().distinctBy { "${it.getStringProperty("id")}:${it.geometry()}" }
                val count=m.queryRenderedFeatures(RectF(0f,0f,view.width.toFloat(),view.height.toFloat()),"airo-route-line").distinctBy { it.id() }.size
                observed="pins=${features.size}, renderedRoads=$count, done=${features.count { it.getBooleanProperty("done") }}, camera=${m.cameraPosition}"
                match=features.size==pins&&count==roads&&features.count { it.getBooleanProperty("done") }==done
            } } };match
        } } catch (e: Throwable) { throw AssertionError("Expected pins=$pins roads=$roads done=$done; observed $observed",e) }
    }
    @Test fun oneMealSlotShowsAlternativesSelectsRouteAndChangingCandidateClearsOldCompletion() {
        val memory=Memory();val real=DemoTripRepository(memory);val store=ViewModelStore()
        val choice=StopChoice("점심","meal",listOf(ChoiceCandidate("A","후보 A",12.4765,41.8989),ChoiceCandidate("B","후보 B",12.475,41.8995)),1)
        val trip=runBlocking { real.importArchive(ArchiveFile(sourceKey="choice-native-test",exportedAt=Instant.now().toString(),trip=ArchiveTrip("선택형 일정","2026-10-01"),stops=listOf(
            ArchiveStop("hotel","숙소",12.4768,41.8992,1,0),ArchiveStop("meal","점심",12.4765,41.8989,1,1,"12:00",choice=choice),ArchiveStop("park","다음 일정",12.4735,41.899,1,2)),data=JsonObject(emptyMap()))).tripId }
        fun road(a:Stop,b:Stop)=RoadRoute(listOf(listOf(a.lng,a.lat),listOf(a.lng,b.lat),listOf(b.lng,b.lat)))
        val repo=object:TripRepository by real {
            override suspend fun route(tripId:String,from:Stop,to:Stop)=road(from,to)
            override suspend fun choiceRoute(tripId:String,input:ChoiceRouteInput):RoadRoute {
                val stops=real.detail(tripId).stops
                fun resolve(id:String,candidateId:String?):Stop {
                    val stop=stops.first { it.id==id };return candidateId?.let { c -> stop.withCandidate(stop.choice!!.candidates.first { it.id==c }) }?:stop
                }
                return road(resolve(input.fromId,input.fromCandidateId),resolve(input.toId,input.toCandidateId))
            }
        }
        val itinerary=ItineraryViewModel(trip,repo);val progress=ProgressViewModel(trip,repo);val preparation=PreparationViewModel(trip,repo)
        store.put("itinerary",itinerary);store.put("progress",progress);store.put("preparation",preparation)
        try {
            compose.setContent { AiroTheme { Surface(color=Ink) { Box(Modifier.safeDrawingPadding()) { ItineraryScreen(itinerary,progress,preparation,PlacePhotoLinks(memory,"demo"){"fixture"},{},{},{},{},onBack={}) } } } }
            compose.waitUntil(15000) { compose.onAllNodesWithTag("day-card").fetchSemanticsNodes().isNotEmpty() && progress.state.value.data!=null }
            inspect(4,0)
            compose.onNodeWithContentDescription("점심 일정 완료").assertIsNotEnabled()
            compose.onNodeWithContentDescription("점심 지도에서 보기").performClick()
            compose.onNodeWithText("B 후보 B").performScrollTo().performClick()
            compose.waitUntil(10000) { itinerary.state.value.detail?.stops?.get(1)?.choice?.selectedId=="B" }
            inspect(3,2)
            compose.onNodeWithContentDescription("장소 정보 닫기").performScrollTo().performClick()
            compose.onNodeWithTag("day-stop-list").performScrollToNode(hasContentDescription("후보 B 일정 완료"))
            compose.onNodeWithContentDescription("후보 B 일정 완료").performClick();inspect(3,1,1)
            compose.waitUntil(10000) { !progress.state.value.busy }
            compose.onNodeWithContentDescription("후보 B 지도에서 보기").performClick()
            compose.onNodeWithText("A 후보 A").performScrollTo().performClick()
            compose.waitUntil(10000) { itinerary.state.value.detail?.stops?.get(1)?.choice?.selectedId=="A" && progress.state.value.data?.entries?.isEmpty()==true }
            inspect(3,2)
            compose.onNodeWithText("선택 해제 · 다시 고르기").performScrollTo().performClick()
            compose.waitUntil(10000) { itinerary.state.value.detail?.stops?.get(1)?.pendingChoice()==true }
            inspect(4,0)
            val final=runBlocking { real.detail(trip) };assertEquals(3,final.stops.size);assertEquals("12:00",final.stops[1].time);assertEquals(1,final.stops[1].position)
        } finally { compose.runOnUiThread { store.clear() } }
    }
}
