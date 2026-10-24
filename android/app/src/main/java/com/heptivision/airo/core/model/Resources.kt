package com.heptivision.airo.core.model

import kotlinx.serialization.Serializable
import kotlin.math.roundToLong

@Serializable data class Expense(
    val id: String, val name: String, val category: String, val day: Int? = null,
    val amount: Double, val currency: String, val exchangeRate: Double, val paid: Boolean, val reservationId: String? = null,
) {
    fun won(): Long = (amount * exchangeRate).roundToLong()
}
@Serializable data class ExpenseBudget(
    val version: Int = 1, val revision: Int = 0, val reserve: Double = 0.0, val entries: List<Expense> = emptyList(),
)
fun ExpenseBudget.validate() {
    require(version == 1 && revision in 0..2147483646 && reserve.isFinite() && reserve in 0.0..1e12 && entries.size <= 500)
    require(entries.map { it.id }.distinct().size == entries.size)
    require(entries.mapNotNull { it.reservationId }.distinct().size == entries.count { it.reservationId != null })
    entries.forEach {
        it.reservationId?.let(java.util.UUID::fromString)
        java.util.UUID.fromString(it.id)
        require(it.name.trim().length in 1..200 && it.category in expenseCategories && it.currency in expenseCurrencies)
        require(it.day == null || it.day in 0..3650)
        require(it.amount.isFinite() && it.amount in 0.0..1e12 && it.exchangeRate.isFinite() && it.exchangeRate > 0 && it.exchangeRate <= 1e6)
        require(it.amount * it.exchangeRate <= 1e12 && (it.currency != "KRW" || it.exchangeRate == 1.0))
    }
}
val expenseCategories = linkedMapOf("flight" to "항공", "stay" to "숙소", "food" to "식비", "transport" to "교통", "activity" to "입장·체험", "shopping" to "쇼핑", "other" to "기타")
val expenseCurrencies = listOf("KRW", "JPY", "USD", "EUR", "GBP", "CNY", "TWD", "THB", "VND", "SGD", "AUD", "CAD")
fun wonLabel(value: Long): String = String.format(java.util.Locale.KOREA, "%,d원", value)

@Serializable data class SavedPlace(
    val id: String, val name: String, val lat: Double, val lng: Double, val day: Int = 1,
    val kind: String = "place", val nameKo: String? = null, val addr: String? = null,
    val hours: String? = null, val website: String? = null,
    val phone: String? = null, val image: String? = null, val cuisine: String? = null,
)
@Serializable data class TripDocument(val index: Int = -1, val name: String, val mime: String = "application/pdf", val sha256: String,
    val stopIds: List<String> = emptyList(), val sizeBytes: Long = 0)
@Serializable data class TripResources(
    val places: List<SavedPlace> = emptyList(), val savedPlaceIds: List<String> = emptyList(),
    val documents: List<TripDocument> = emptyList(),
    val trip: Trip? = null, val stops: List<Stop> = emptyList(), val reservations: ReservationBook = ReservationBook(),
)
@Serializable data class BookmarkInput(val ids: List<String>, val saved: Boolean)
@Serializable data class SavePlaceInput(val id: String, val name: String, val lat: Double, val lng: Double, val day: Int, val address: String = "", val category: String = "place")
