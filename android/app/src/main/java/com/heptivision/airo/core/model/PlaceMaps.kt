package com.heptivision.airo.core.model

import java.net.URLEncoder
import kotlin.math.hypot

/** Mirrors the web's offline Natural Earth country lookup, including coastline margin. */
fun isSouthKorea(lat: Double, lng: Double, rings: List<List<List<Double>>>): Boolean {
    if (!lat.isFinite() || !lng.isFinite() || lat !in 33.0..38.7 || lng !in 124.5..132.0) return false
    if (hypot((lng - 131.869) * .8, lat - 37.242) < .025) return true
    return rings.any { ring ->
        var inside = false
        var margin = false
        ring.indices.forEach { i ->
            val a = ring[i]; val b = ring[if (i == 0) ring.lastIndex else i - 1]
            val ax = a[0]; val ay = a[1]; val bx = b[0]; val by = b[1]
            if ((ay > lat) != (by > lat) && lng < (bx - ax) * (lat - ay) / (by - ay) + ax) inside = !inside
            val dx = (bx - ax) * .8; val dy = by - ay; val px = (lng - ax) * .8; val py = lat - ay
            val t = ((px * dx + py * dy) / (dx * dx + dy * dy).takeIf { it != 0.0 }.let { it ?: 1.0 }).coerceIn(0.0, 1.0)
            if (hypot(px - t * dx, py - t * dy) < .012) margin = true
        }
        inside || margin
    }
}
fun placeMapLinks(stop: Stop, domestic: Boolean): List<Pair<String, String>> {
    fun encode(text: String) = URLEncoder.encode(text, "UTF-8").replace("+", "%20")
    val query = encode(stop.mapQuery?.trim()?.takeIf { it.isNotEmpty() } ?: "${stop.lat},${stop.lng}")
    val kakao = "${encode(stop.name)},${stop.lat},${stop.lng}"
    return if (domestic) listOf("네이버지도" to "https://map.naver.com/p/search/${encode(stop.mapQuery?.trim()?.takeIf { it.isNotEmpty() } ?: stop.name)}",
        "카카오맵" to "https://map.kakao.com/link/map/$kakao", "카카오 길찾기" to "https://map.kakao.com/link/to/$kakao")
    // Omit origin: only Google Maps should resolve the user's current location.
    else listOf("구글지도" to "https://www.google.com/maps/search/?api=1&query=$query", "길찾기" to "https://www.google.com/maps/dir/?api=1&destination=$query&dir_action=navigate")
}

/** Saved native/map-search name; never invent a translation from the display name. */
fun Stop.localPlaceName() = mapQuery?.trim()?.takeIf { it.isNotEmpty() } ?: name
