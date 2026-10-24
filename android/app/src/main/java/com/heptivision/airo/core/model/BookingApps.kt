package com.heptivision.airo.core.model

import java.net.URI

const val SAMSUNG_WALLET_PACKAGE = "com.samsung.android.spay"
/** Package IDs verified against each provider's own /.well-known/assetlinks.json. */
private val bookingPackages = mapOf("trip.com" to "ctrip.english", "agoda.com" to "com.agoda.mobile.consumer",
    "booking.com" to "com.booking", "airbnb.com" to "com.airbnb.android", "airbnb.co.kr" to "com.airbnb.android",
    "expedia.com" to "com.expedia.bookings", "expedia.co.kr" to "com.expedia.bookings")
fun bookingAppPackage(raw: String): String? {
    val value = safeHttps(raw) ?: return null
    val uri = URI(value)
    if (uri.port !in listOf(-1, 443)) return null
    val host = uri.host.lowercase()
    return bookingPackages.entries.firstOrNull { host == it.key || host.endsWith(".${it.key}") }?.value
}
