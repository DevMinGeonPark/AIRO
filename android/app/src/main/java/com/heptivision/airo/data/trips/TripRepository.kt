package com.heptivision.airo.data.trips

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.*
import com.heptivision.airo.data.auth.AuthRepository
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

interface TripRepository {
    suspend fun list(): TripList
    suspend fun detail(id: String): TripDetail
    suspend fun create(input: TripInput): Trip
    suspend fun update(id: String, input: TripInput): Trip
    suspend fun delete(id: String)
    suspend fun saveStop(tripId: String, stopId: String?, input: StopInput)
    suspend fun deleteStop(tripId: String, stopId: String)
    suspend fun moveStop(tripId: String, stopId: String, day: Int, position: Int)
    suspend fun budget(tripId: String): ExpenseBudget
    suspend fun saveBudget(tripId: String, budget: ExpenseBudget): ExpenseBudget
    suspend fun resources(tripId: String): TripResources
    suspend fun bookmark(tripId: String, placeId: String, saved: Boolean)
    suspend fun savePlace(tripId: String, place: SavePlaceInput)
    suspend fun document(tripId: String, document: TripDocument): ByteArray
    suspend fun attachDocument(tripId: String, input: DocumentInput): TripDocument = throw ApiException(503, "이 서버에서는 자료 추가를 지원하지 않습니다.")
    suspend fun linkDocument(tripId: String, input: DocumentLinks): TripDocument = throw ApiException(503, "이 서버에서는 자료 연결을 지원하지 않습니다.")
    suspend fun saveReservation(tripId: String, input: ReservationInput): ReservationBook = throw ApiException(503, "이 서버에서는 예약 관리를 지원하지 않습니다.")
    suspend fun changes(tripId: String, beforeId: String? = null): ChangePage = ChangePage()
    suspend fun change(tripId: String, id: String): ChangeDetail = throw ApiException(404, "변경 이력을 찾을 수 없습니다.")
    suspend fun revert(tripId: String, id: String, latest: String) { throw ApiException(503, "변경을 되돌릴 수 없습니다.") }
    suspend fun importArchive(archive: ArchiveFile): ImportResult
    suspend fun exportArchive(tripId: String): String
    suspend fun search(query: String): List<Place>
    suspend fun route(tripId: String, from: Stop, to: Stop): RoadRoute
    suspend fun choiceRoute(tripId: String, input: ChoiceRouteInput): RoadRoute = throw ApiException(503, "후보 경로를 불러오지 못했습니다.")
    suspend fun selectChoice(tripId: String, selection: ChoiceSelection): Stop = throw ApiException(503, "후보 선택을 지원하지 않습니다.")
    suspend fun progress(tripId: String): TripProgress = TripProgress()
    suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress = throw ApiException(503, "일정 진행 저장을 지원하지 않는 서버입니다.")
    suspend fun preparation(tripId: String): Preparation = defaultPreparation()
    suspend fun savePreparation(tripId: String, value: Preparation): Preparation = throw ApiException(503, "출국 준비 저장을 지원하지 않는 서버입니다.")
    suspend fun images(tripId: String): List<TripImage> = emptyList()
    suspend fun image(tripId: String, image: TripImage): ByteArray = throw ApiException(404, "이미지 원본을 찾을 수 없습니다.")
}

class CloudTripRepository(private val baseUrl: String, private val http: HttpTransport, private val auth: AuthRepository) : TripRepository {
    private suspend fun request(path: String, method: String = "GET", body: String? = null): String {
        val token = auth.accessToken()
        return try { http.request("$baseUrl$path", method, body, mapOf("Authorization" to "Bearer $token")) }
        catch (error: ApiException) {
            if (error.status != 401) throw error
            val refreshed = auth.accessToken(rejectedToken = token)
            http.request("$baseUrl$path", method, body, mapOf("Authorization" to "Bearer $refreshed"))
        }
    }
    private fun path(id: String): String {
        require(Regex("[a-zA-Z0-9-]{1,128}").matches(id)) { "여행 주소가 올바르지 않습니다." }
        return "/api/trips/$id"
    }
    override suspend fun list() = wireJson.decodeFromString<TripList>(request("/api/mobile/trips"))
    override suspend fun detail(id: String) = wireJson.decodeFromString<TripDetail>(request("${path(id)}?include=routes"))
    override suspend fun create(input: TripInput) = wireJson.decodeFromString<TripEnvelope>(request("/api/trips", "POST", wireJson.encodeToString(input))).trip
    override suspend fun update(id: String, input: TripInput) = wireJson.decodeFromString<TripEnvelope>(request(path(id), "PATCH", wireJson.encodeToString(input))).trip
    override suspend fun delete(id: String) { request(path(id), "DELETE") }
    override suspend fun saveStop(tripId: String, stopId: String?, input: StopInput) {
        if (stopId != null) require(Regex("[a-zA-Z0-9-]{1,128}").matches(stopId))
        request(path(tripId) + (stopId?.let { "/stops/$it" } ?: ""), if (stopId == null) "POST" else "PATCH", wireJson.encodeToString(input))
    }
    override suspend fun deleteStop(tripId: String, stopId: String) {
        require(Regex("[a-zA-Z0-9-]{1,128}").matches(stopId))
        request("${path(tripId)}/stops/$stopId", "DELETE")
    }
    override suspend fun moveStop(tripId: String, stopId: String, day: Int, position: Int) {
        require(Regex("[a-zA-Z0-9-]{1,128}").matches(stopId))
        request("${path(tripId)}/stops/$stopId", "PATCH", wireJson.encodeToString(StopPlacement(day, position)))
    }
    override suspend fun budget(tripId: String) = wireJson.decodeFromString<ExpenseBudget>(request("${path(tripId)}/budget"))
    override suspend fun saveBudget(tripId: String, budget: ExpenseBudget) = wireJson.decodeFromString<ExpenseBudget>(request("${path(tripId)}/budget", "PUT", wireJson.encodeToString(budget)))
    override suspend fun resources(tripId: String): TripResources {
        path(tripId)
        return wireJson.decodeFromString(request("/api/mobile/trips/$tripId/resources"))
    }
    override suspend fun bookmark(tripId: String, placeId: String, saved: Boolean) {
        request("${path(tripId)}/saved", "POST", wireJson.encodeToString(BookmarkInput(listOf(placeId), saved)))
    }
    override suspend fun savePlace(tripId: String, place: SavePlaceInput) {
        request("${path(tripId)}/places", "POST", wireJson.encodeToString(place))
    }
    override suspend fun document(tripId: String, document: TripDocument): ByteArray {
        require(Regex("[a-f0-9]{64}").matches(document.sha256))
        val url = "$baseUrl${path(tripId)}/documents/${document.sha256}"
        val token = auth.accessToken()
        val bytes = try { http.download(url, mapOf("Authorization" to "Bearer $token")) }
        catch (error: ApiException) {
            if (error.status != 401) throw error
            http.download(url, mapOf("Authorization" to "Bearer ${auth.accessToken(token)}"))
        }
        val sha = java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        check(sha == document.sha256 && bytes.take(5).toByteArray().toString(Charsets.US_ASCII) == "%PDF-") { "예약 문서 원본을 확인하지 못했습니다." }
        return bytes
    }
    private fun managementPath(tripId: String) = "/api/mobile" + path(tripId).removePrefix("/api")
    override suspend fun attachDocument(tripId: String, input: DocumentInput) = wireJson.decodeFromString<DocumentResult>(request("${managementPath(tripId)}/documents", "POST", wireJson.encodeToString(input))).document
    override suspend fun linkDocument(tripId: String, input: DocumentLinks) = wireJson.decodeFromString<DocumentResult>(request("${managementPath(tripId)}/documents", "PUT", wireJson.encodeToString(input))).document
    override suspend fun saveReservation(tripId: String, input: ReservationInput) = wireJson.decodeFromString<ReservationResult>(request("${managementPath(tripId)}/reservations", "PUT", wireJson.encodeToString(input))).reservations
    override suspend fun changes(tripId: String, beforeId: String?): ChangePage {
        require(beforeId == null || Regex("[1-9]\\d{0,18}").matches(beforeId))
        return wireJson.decodeFromString(request("${managementPath(tripId)}/changes" + (beforeId?.let { "?limit=50&beforeId=$it" } ?: "?limit=50")))
    }
    override suspend fun change(tripId: String, id: String): ChangeDetail {
        require(Regex("[1-9]\\d{0,18}").matches(id))
        return wireJson.decodeFromString(request("${managementPath(tripId)}/changes/$id"))
    }
    override suspend fun revert(tripId: String, id: String, latest: String) {
        require(Regex("[1-9]\\d{0,18}").matches(id) && Regex("[1-9]\\d{0,18}").matches(latest))
        request("${managementPath(tripId)}/changes/$id", "POST", wireJson.encodeToString(RevertInput(latest)))
    }
    override suspend fun importArchive(archive: ArchiveFile) = wireJson.decodeFromString<ImportResult>(request("/api/trips/import", "POST", encodeArchive(archive)))
    override suspend fun exportArchive(tripId: String) = request("${path(tripId)}/export")
    override suspend fun search(query: String) = wireJson.decodeFromString<PlaceList>(request("/api/mobile/places", "POST", wireJson.encodeToString(SearchInput(query)))).places
    override suspend fun route(tripId: String, from: Stop, to: Stop) = wireJson.decodeFromString<RoadRoute>(
        request("${path(tripId)}/routes", "POST", wireJson.encodeToString(RouteInput(from.id, to.id)))
    )
    override suspend fun choiceRoute(tripId: String, input: ChoiceRouteInput): RoadRoute {
        val body = JsonObject(wireJson.encodeToJsonElement(input).jsonObject.filterValues { it != JsonNull })
        return wireJson.decodeFromString(request("${path(tripId)}/routes", "POST", body.toString()))
    }
    override suspend fun selectChoice(tripId: String, selection: ChoiceSelection) = wireJson.decodeFromString<StopEnvelope>(request("${path(tripId)}/choices", "PATCH", wireJson.encodeToString(selection))).stop
    override suspend fun progress(tripId: String) = wireJson.decodeFromString<TripProgress>(request("${path(tripId)}/progress"))
    override suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress {
        // Server validates a strict discriminated union: omit fields belonging to other actions.
        val body = JsonObject(wireJson.encodeToJsonElement(value).jsonObject.filterValues { it != JsonNull })
        return wireJson.decodeFromString(request("${path(tripId)}/progress", "PATCH", body.toString()))
    }
    override suspend fun preparation(tripId: String) = wireJson.decodeFromString<Preparation>(request("${path(tripId)}/predeparture"))
    override suspend fun savePreparation(tripId: String, value: Preparation) = wireJson.decodeFromString<Preparation>(request("${path(tripId)}/predeparture", "PUT", wireJson.encodeToString(value)))
    override suspend fun images(tripId: String) = wireJson.decodeFromString<TripImages>(request("${path(tripId)}/images")).images
    override suspend fun image(tripId: String, image: TripImage): ByteArray {
        require(image.sha256.matches(Regex("[a-f0-9]{64}")) && image.width in 1..4096 && image.height in 1..4096 && image.mime in listOf("image/png", "image/jpeg"))
        val url = "$baseUrl${path(tripId)}/images/${image.sha256}"
        val token = auth.accessToken()
        val bytes = try { http.download(url, mapOf("Authorization" to "Bearer $token"), 2 * 1024 * 1024) }
        catch (error: ApiException) {
            if (error.status != 401) throw error
            http.download(url, mapOf("Authorization" to "Bearer ${auth.accessToken(token)}"), 2 * 1024 * 1024)
        }
        require(java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) } == image.sha256) { "이미지 원본 검증에 실패했습니다." }
        return bytes
    }
}
