package com.heptivision.airo.core.model

/** One foreground location fix; never persisted or sent to the trip server. */
data class MapLocationPoint(val lat: Double, val lng: Double, val accuracy: Float, val requestId: Int) {
    val zoom: Double get() = if (accuracy > 1000) 12.0 else if (accuracy > 100) 14.0 else 16.0
}
