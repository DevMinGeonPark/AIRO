package com.heptivision.airo

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.wireJson
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class PlaybackAndMapsTest {
    @Test fun playbackWaitsForMissingLegsAndMovesByDistanceAlongTheRoad() {
        val a = Stop("a", "t", "A", 0.0, 0.0, 1, 0)
        val b = a.copy(id = "b", lng = .001, position = 1)
        val c = a.copy(id = "c", lng = .005, position = 2)
        val path = listOf(listOf(0.0, 0.0), listOf(.00001, 0.0), listOf(.001, 0.0))
        val incomplete = playbackPlan(listOf(a,b,c), listOf(path))
        assertFalse(incomplete.ready); assertEquals(1, incomplete.missing)
        val complete = playbackPlan(listOf(a,b,c.copy(mode = "flight")), listOf(path))
        assertTrue(complete.ready); assertTrue(complete.legs.last().flight)
        val leg = complete.legs.first(); val cumulative = measurePath(leg.path)
        val middle = pointOnPath(leg, cumulative, .5)
        assertEquals(.0005, middle.lng, .0000001)
        assertEquals(90.0, middle.heading, .001)
        assertEquals(.001, pointOnPath(leg, cumulative, 1.0).lng, .0000001)
    }
    @Test fun nativeMapProvidersMatchWebForKoreaAirportsIslandsAndNearbyForeignPlaces() {
        val rings = wireJson.decodeFromString<List<List<List<Double>>>>(File("src/main/assets/south-korea-rings.json").readText())
        listOf(37.5665 to 126.978, 37.4602 to 126.4407, 33.4996 to 126.5312, 37.242 to 131.869).forEach { (lat,lng) -> assertTrue(isSouthKorea(lat,lng,rings)) }
        listOf(35.179 to 129.9, 34.202 to 129.287, 38.4 to 125.4, 41.9 to 12.48).forEach { (lat,lng) -> assertFalse(isSouthKorea(lat,lng,rings)) }
        val stop = Stop("a", "t", "공항 A&B", 126.4407, 37.4602, 1, 0)
        assertTrue(placeMapLinks(stop, true).all { it.second.startsWith("https://") })
        assertTrue(placeMapLinks(stop, true)[1].second.contains("%26"))
        assertEquals("구글지도", placeMapLinks(stop, false).first().first)
    }
}
