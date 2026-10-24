package com.heptivision.airo.data.trips

import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.ApiException
import com.heptivision.airo.core.network.wireJson
import com.heptivision.airo.core.security.SecretStore
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.time.LocalDate
import java.util.UUID

/** Available only in the separately named demo flavor. No HTTP client or production account. */
class DemoTripRepository(private val store: SecretStore, private val bundledRoads: Map<String, RoadRoute> = emptyMap()) : TripRepository {
    private val lock = Mutex()
    private var trips = store.read("demo_trips")?.let { runCatching { wireJson.decodeFromString<List<TripDetail>>(it) }.getOrNull() } ?: seed()
    private fun commit(next: List<TripDetail>) {
        // Keep the old state if disk/Keystore persistence fails.
        store.write("demo_trips", wireJson.encodeToString(next))
        trips = next
    }
    private fun requireTrip(id: String) = trips.firstOrNull { it.trip.id == id } ?: throw ApiException(404, "여행을 찾을 수 없습니다.")
    override suspend fun list() = lock.withLock { TripList(trips.map { TripSummary(it.trip, it.stops) }, "pro") }
    override suspend fun detail(id: String) = lock.withLock { requireTrip(id).let { it.copy(attachments = it.resources.attachments(), roads = if (id == "demo-rome") bundledRoads + it.roads else it.roads) } }
    override suspend fun create(input: TripInput) = lock.withLock {
        Trip(UUID.randomUUID().toString(), "demo", input.title, input.startDate).also { commit(listOf(TripDetail(it)) + trips) }
    }
    override suspend fun update(id: String, input: TripInput): Trip = lock.withLock {
        val updated = requireTrip(id).trip.copy(title = input.title, startDate = input.startDate)
        commit(trips.map { if (it.trip.id == id) it.copy(trip = updated) else it }); updated
    }
    override suspend fun delete(id: String) = lock.withLock { requireTrip(id); commit(trips.filterNot { it.trip.id == id }) }
    override suspend fun saveStop(tripId: String, stopId: String?, input: StopInput) = lock.withLock {
        val current = requireTrip(tripId)
        if (stopId != null && current.stops.none { it.id == stopId }) throw ApiException(404, "장소를 찾을 수 없습니다.")
        commit(trips.map { detail ->
            if (detail.trip.id != tripId) detail else {
                val existing = detail.stops.find { it.id == stopId }
                val position = if (existing?.day == input.day) existing.position else (detail.stops.filter { it.day == input.day }.maxOfOrNull { it.position } ?: -1) + 1
                val stop = Stop(stopId ?: UUID.randomUUID().toString(), tripId, input.name, input.lng, input.lat, input.day, position, input.time, input.note, input.mapQuery, input.mode, existing?.sourceId, existing?.choice)
                detail.copy(stops = (detail.stops.filterNot { it.id == stopId } + stop).sortedWith(stopOrder))
            }
        })
    }
    override suspend fun deleteStop(tripId: String, stopId: String) = lock.withLock {
        requireTrip(tripId)
        commit(trips.map { if (it.trip.id == tripId) it.copy(stops = it.stops.filterNot { stop -> stop.id == stopId }) else it })
    }
    override suspend fun moveStop(tripId: String, stopId: String, day: Int, position: Int) = lock.withLock {
        require(day in 0..3650 && position >= 0)
        val detail = requireTrip(tripId)
        val moving = detail.stops.find { it.id == stopId } ?: throw ApiException(404, "장소를 찾을 수 없습니다.")
        val target = detail.stops.filter { it.day == day && it.id != stopId }.sortedWith(stopOrder).toMutableList()
        target.add(position.coerceAtMost(target.size), moving.copy(day = day))
        val reordered = target.mapIndexed { index, stop -> stop.copy(position = index) }
        val others = detail.stops.filter { it.day != day && it.id != stopId }
        commit(trips.map { if (it.trip.id == tripId) it.copy(stops = (others + reordered).sortedWith(stopOrder)) else it })
    }
    override suspend fun search(query: String) = seed().flatMap { it.stops }.distinctBy { it.name }
        .filter { it.name.contains(query, true) || it.mapQuery.orEmpty().contains(query, true) || query.contains("로마") }
        .map { Place(it.id, it.name, it.lat, it.lng, "로마, 이탈리아 · 샘플 장소") }
    override suspend fun budget(tripId: String) = lock.withLock { requireTrip(tripId).expenseBudget }
    override suspend fun saveBudget(tripId: String, budget: ExpenseBudget): ExpenseBudget = lock.withLock {
        budget.validate()
        val detail = requireTrip(tripId)
        if (detail.expenseBudget.revision != budget.revision) throw ApiException(409, "다른 화면에서 예산이 변경됐습니다. 최신 예산을 불러온 뒤 다시 저장해 주세요.")
        val updated = budget.copy(revision = budget.revision + 1)
        commit(trips.map { if (it.trip.id == tripId) it.copy(expenseBudget = updated) else it })
        updated
    }
    override suspend fun resources(tripId: String) = lock.withLock {
        val detail = requireTrip(tripId)
        detail.resources.copy(trip = detail.trip, stops = detail.stops, places = (detail.resources.places + detail.stops.map { SavedPlace(it.id, it.name, it.lat, it.lng, it.day) }).distinctBy { it.id })
    }
    override suspend fun bookmark(tripId: String, placeId: String, saved: Boolean) = lock.withLock {
        val detail = requireTrip(tripId)
        val ids = if (saved) (detail.resources.savedPlaceIds + placeId).distinct() else detail.resources.savedPlaceIds - placeId
        val stop = detail.stops.find { it.id == placeId }
        val places = if (stop != null) (detail.resources.places + SavedPlace(stop.id, stop.name, stop.lat, stop.lng, stop.day)).distinctBy { it.id } else detail.resources.places
        commit(trips.map { if (it.trip.id == tripId) it.copy(resources = it.resources.copy(places = places, savedPlaceIds = ids)) else it })
    }
    override suspend fun savePlace(tripId: String, place: SavePlaceInput) = lock.withLock {
        val detail = requireTrip(tripId)
        val saved = SavedPlace(place.id, place.name, place.lat, place.lng, place.day, place.category, addr = place.address)
        val resources = detail.resources.copy(places = (detail.resources.places + saved).distinctBy { it.id }, savedPlaceIds = (detail.resources.savedPlaceIds + place.id).distinct())
        commit(trips.map { if (it.trip.id == tripId) it.copy(resources = resources) else it })
    }
    override suspend fun document(tripId: String, document: TripDocument): ByteArray = lock.withLock {
        requireTrip(tripId).archive?.documents()?.find { it.sha256 == document.sha256 }?.bytes() ?: throw ApiException(404, "예약 문서를 찾을 수 없습니다.")
    }
    private fun validateLinks(detail: TripDetail, ids: List<String>) {
        require(ids.size <= 100 && ids.distinct().size == ids.size && ids.all { id -> detail.stops.any { it.id == id || it.sourceId == id } }) { "여행에 없는 장소에는 연결할 수 없습니다." }
    }
    private fun archiveData(detail: TripDetail, data: JsonObject): ArchiveFile = (detail.archive ?: ArchiveFile(
        sourceKey = "export:${detail.trip.id}", exportedAt = java.time.Instant.now().toString(),
        trip = ArchiveTrip(detail.trip.title, detail.trip.startDate), stops = emptyList(), data = JsonObject(emptyMap())
    )).copy(data = data)
    override suspend fun attachDocument(tripId: String, input: DocumentInput): TripDocument = lock.withLock {
        val detail = requireTrip(tripId)
        validateLinks(detail, input.stopIds)
        val bytes = java.util.Base64.getDecoder().decode(input.base64)
        require(bytes.size in 1..MAX_PDF_BYTES && bytes.copyOfRange(0, minOf(5, bytes.size)).toString(Charsets.US_ASCII) == "%PDF-" && bytes.takeLast(1024).toByteArray().toString(Charsets.US_ASCII).contains("%%EOF")) { "2MB 이하의 올바른 PDF를 선택하세요." }
        require(input.name.trim().length in 1..300)
        val hash = java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        val documents = detail.archive?.documents().orEmpty().toMutableList()
        val index = documents.indexOfFirst { it.sha256 == hash }
        val doc = if (index >= 0) documents[index].copy(stopIds = input.stopIds) else ArchiveDocument(input.name.trim(), "application/pdf", input.base64, hash, input.stopIds)
        if (index >= 0) documents[index] = doc else documents.add(doc)
        require(documents.size <= 20) { "여행에는 PDF를 최대 20개 보관할 수 있습니다." }
        val data = detail.archive?.data.orEmpty().toMutableMap().apply { put("documents", wireJson.encodeToJsonElement(documents)) }
        require(JsonObject(data).toString().toByteArray().size <= MAX_ARCHIVE_BYTES) { "여행 자료 전체 크기가 8MB를 넘습니다." }
        val metadata = documents.mapIndexed { i, d -> TripDocument(i, d.name, d.mime, d.sha256, d.stopIds, d.bytes().size.toLong()) }
        commit(trips.map { if (it.trip.id == tripId) it.copy(archive = archiveData(detail, JsonObject(data)), resources = it.resources.copy(documents = metadata)) else it })
        metadata.first { it.sha256 == hash }
    }
    override suspend fun linkDocument(tripId: String, input: DocumentLinks): TripDocument {
        val doc = lock.withLock { requireTrip(tripId).archive?.documents()?.find { it.sha256 == input.sha256 } ?: throw ApiException(404, "문서를 찾을 수 없습니다.") }
        return attachDocument(tripId, DocumentInput(doc.name, doc.base64, input.stopIds))
    }
    override suspend fun saveReservation(tripId: String, input: ReservationInput): ReservationBook = lock.withLock {
        input.reservation.validate()
        val detail = requireTrip(tripId)
        val book = detail.resources.reservations
        if (book.revision != input.revision) throw ApiException(409, "예약이 변경됐습니다. 최신 내용을 불러온 뒤 다시 저장하세요.")
        validateLinks(detail, (input.reservation.stopIds + listOfNotNull(input.reservation.stopId)).distinct())
        require(input.reservation.documentSha256s.all { hash -> detail.resources.documents.any { it.sha256 == hash } }) { "여행에 없는 문서에는 연결할 수 없습니다." }
        val updated = book.copy(revision = book.revision + 1, entries = book.entries.filterNot { it.id == input.reservation.id } + input.reservation)
        require(updated.entries.size <= 500)
        val data = detail.archive?.data.orEmpty().toMutableMap().apply { put("reservations", wireJson.encodeToJsonElement(updated)) }
        commit(trips.map { if (it.trip.id == tripId) it.copy(archive = archiveData(detail, JsonObject(data)), resources = it.resources.copy(reservations = updated)) else it })
        updated
    }
    override suspend fun importArchive(archive: ArchiveFile): ImportResult = lock.withLock {
        trips.find { it.archive?.sourceKey == archive.sourceKey }?.let { return@withLock ImportResult(it.trip.id, false) }
        val id = UUID.randomUUID().toString()
        val trip = Trip(id, "demo", archive.trip.title, archive.trip.startDate, archive.trip.createdAt ?: java.time.Instant.now().toString())
        val stops = archive.stops.map { Stop(UUID.randomUUID().toString(), id, it.name, it.lng, it.lat, it.day, it.position, it.time, it.note, it.mapQuery, it.mode, it.sourceId, it.choice) }
        val resources = TripResources(archive.places(), archive.savedIds(), archive.documents().mapIndexed { index, doc -> TripDocument(index, doc.name, doc.mime, doc.sha256, doc.stopIds, doc.bytes().size.toLong()) }, trip, stops, archive.reservations())
        val detail = TripDetail(trip, stops.sortedWith(stopOrder), archive.messages.map { Message(UUID.randomUUID().toString(), it.role, it.content) }, archive.budget(), resources, archive,
            itineraryProgress = archive.data["itineraryProgress"]?.let { wireJson.decodeFromJsonElement<TripProgress>(it) } ?: TripProgress(),
            predepartureChecklist = archive.data["predepartureChecklist"]?.let { wireJson.decodeFromJsonElement<Preparation>(it) })
        commit(listOf(detail) + trips)
        ImportResult(id, true)
    }
    override suspend fun exportArchive(tripId: String): String = lock.withLock {
        val detail = requireTrip(tripId)
        val now = java.time.Instant.now().toString()
        val data = detail.archive?.data.orEmpty().toMutableMap()
        // Preserve every original data field, including PDF base64 and source hashes.
        val existingPlaces = (data["food"] as? JsonArray).orEmpty().associateBy { it.jsonObject["id"]?.jsonPrimitive?.content }
        data["food"] = JsonArray(detail.resources.places.map { place -> existingPlaces[place.id] ?: buildJsonObject {
            put("id", place.id); put("name", place.name); put("lat", place.lat); put("lng", place.lng); put("day", place.day)
            put("kind", place.kind); put("cuisine", place.kind); put("stopId", ""); place.addr?.let { put("addr", it) }
        } })
        fun source(id: String) = detail.stops.find { it.id == id }?.let { it.sourceId ?: it.id } ?: id
        (data["documents"] as? JsonArray)?.let { docs -> data["documents"] = JsonArray(docs.map { doc ->
            val original = doc.jsonObject
            if (original["stopIds"] !is JsonArray) doc else JsonObject(original + ("stopIds" to JsonArray(original.getValue("stopIds").jsonArray.map { JsonPrimitive(source(it.jsonPrimitive.content)) })))
        }) }
        data["reservations"] = wireJson.encodeToJsonElement(detail.resources.reservations.copy(entries = detail.resources.reservations.entries.map { it.copy(stopId = it.stopId?.let(::source), stopIds = it.stopIds.map(::source)) }))
        data["expenseBudget"] = wireJson.encodeToJsonElement(detail.expenseBudget)
        data["savedPlaceIds"] = wireJson.encodeToJsonElement(detail.resources.savedPlaceIds)
        data["itineraryProgress"] = wireJson.encodeToJsonElement(detail.itineraryProgress.copy(
            rules = detail.itineraryProgress.rules.map { it.copy(stopId = source(it.stopId)) },
            entries = detail.itineraryProgress.entries.map { it.copy(stopId = source(it.stopId)) }))
        detail.predepartureChecklist?.let { data["predepartureChecklist"] = wireJson.encodeToJsonElement(it) }
        if (tripId == "demo-rome" && bundledRoads.isNotEmpty()) data["routes"] = wireJson.encodeToJsonElement(bundledRoads)
        encodeArchive(ArchiveFile(sourceKey = detail.archive?.sourceKey ?: "export:$tripId", exportedAt = now,
            trip = ArchiveTrip(detail.trip.title, detail.trip.startDate, detail.trip.createdAt.ifBlank { now }),
            stops = detail.stops.sortedWith(stopOrder).map { ArchiveStop(it.sourceId ?: it.id, it.name, it.lng, it.lat, it.day, it.position, it.time, it.note, it.mapQuery, it.mode, it.choice) },
            messages = detail.messages.mapIndexed { index, message -> ArchiveMessage(message.role, message.content,
                detail.archive?.messages?.getOrNull(index)?.takeIf { it.role == message.role && it.content == message.content }?.createdAt ?: now) }, data = JsonObject(data)))
    }
    override suspend fun route(tripId: String, from: Stop, to: Stop): RoadRoute = detail(tripId).savedRoad(RoutePair(from, to))
        ?: throw ApiException(503, "데모에 저장된 도로 경로가 없어요. 계정 여행에서는 새 경로를 찾을 수 있습니다.")
    override suspend fun images(tripId: String): List<TripImage> = lock.withLock { requireTrip(tripId).archive?.images().orEmpty().map { it.metadata() } }
    override suspend fun image(tripId: String, image: TripImage): ByteArray = lock.withLock {
        requireTrip(tripId).archive?.images()?.find { it.sha256 == image.sha256 }?.bytes() ?: throw ApiException(404, "이미지를 찾을 수 없습니다.")
    }
    override suspend fun selectChoice(tripId: String, selection: ChoiceSelection): Stop = lock.withLock {
        val detail = requireTrip(tripId)
        val stop = detail.stops.find { it.id == selection.stopId } ?: throw ApiException(404, "일정을 찾을 수 없습니다.")
        val choice = stop.choice ?: throw ApiException(400, "선택형 일정이 아닙니다.")
        if (selection.revision != choice.revision) throw ApiException(409, "후보가 변경됐어요. 최신 일정을 확인해 주세요.")
        val candidate = selection.candidateId?.let { id -> choice.candidates.find { it.id == id } ?: throw ApiException(400, "후보를 찾을 수 없습니다.") }
        if (selection.candidateId == choice.selectedId) return@withLock stop
        val saved = (candidate?.let(stop::withCandidate) ?: stop.withCandidate(choice.candidates.first()).copy(name = choice.label, note = null, mapQuery = null, mode = "ground"))
            .copy(choice = choice.copy(revision = choice.revision + 1, selectedId = selection.candidateId))
        val entries = detail.itineraryProgress.entries.filterNot { it.stopId == stop.id || it.stopId == stop.progressKey() }
        val progress = detail.itineraryProgress.let { if (entries == it.entries) it else it.copy(revision = it.revision + 1, entries = entries) }
        commit(trips.map { if (it.trip.id == tripId) it.copy(stops = it.stops.map { s -> if (s.id == stop.id) saved else s }, itineraryProgress = progress) else it })
        saved
    }
    override suspend fun progress(tripId: String) = lock.withLock { requireTrip(tripId).itineraryProgress }
    override suspend fun updateProgress(tripId: String, value: ProgressMutation): TripProgress = lock.withLock {
        val detail = requireTrip(tripId)
        val current = detail.itineraryProgress
        if (current.revision != value.revision) throw ApiException(409, "다른 곳에서 일정 진행 상태가 변경됐어요. 최신 상태를 확인해 주세요.")
        val now = java.time.Instant.now()
        val stop = value.stopId?.let { id -> detail.stops.find { it.progressKey() == id || it.id == id } ?: throw ApiException(400, "장소를 찾을 수 없습니다.") }
        if (value.action == "manual" && value.done == true && stop?.pendingChoice() == true) throw ApiException(400, "후보를 먼저 선택하세요.")
        val changed = when (value.action) {
            "manual" -> current.copy(entries = current.entries.filterNot { it.stopId == stop!!.progressKey() || it.stopId == stop.id } + ProgressEntry(stop!!.progressKey(), value.done == true, "manual", if (value.done == true) now.toString() else null, now.toString()))
            "resume" -> current.copy(entries = current.entries.filterNot { it.stopId == stop!!.progressKey() || it.stopId == stop.id })
            "rule" -> {
                val rule = requireNotNull(value.rule)
                val target = detail.stops.find { it.progressKey() == rule.stopId || it.id == rule.stopId } ?: throw ApiException(400, "장소를 찾을 수 없습니다.")
                require(rule.mode in progressModes && rule.radiusMeters in 100..1000)
                require(rule.mode == "manual" || detail.trip.startDate != null && (rule.mode == "location" || validStopTime(target.time))) { "자동 체크에는 시작일과 일정 시간이 필요해요." }
                current.copy(rules = current.rules.filterNot { it.stopId == target.progressKey() || it.stopId == target.id } + rule.copy(stopId = target.progressKey()))
            }
            "timezone" -> { java.time.ZoneId.of(value.timeZone); current.copy(timeZone = requireNotNull(value.timeZone)) }
            "automatic" -> current.copy(entries = current.entries + automaticProgress(current, detail, now, value.position).map { (target, source) -> ProgressEntry(target.progressKey(), true, source, now.toString(), now.toString()) })
            else -> throw ApiException(400, "체크 방법을 확인해 주세요.")
        }
        if (changed == current) return@withLock current
        val saved = changed.copy(revision = current.revision + 1)
        commit(trips.map { if (it.trip.id == tripId) it.copy(itineraryProgress = saved) else it })
        saved
    }
    override suspend fun preparation(tripId: String) = lock.withLock { requireTrip(tripId).predepartureChecklist ?: defaultPreparation() }
    override suspend fun savePreparation(tripId: String, value: Preparation): Preparation = lock.withLock {
        val current = requireTrip(tripId).predepartureChecklist ?: defaultPreparation()
        if (value.revision != current.revision) throw ApiException(409, "다른 곳에서 Todo가 변경됐어요. 작성한 내용은 유지됩니다.")
        require(value.items.size <= 100 && value.items.map { it.id }.distinct().size == value.items.size)
        value.items.forEach { require(it.category in todoCategories && it.title.length in 1..200 && it.title.isNotBlank()); UUID.fromString(it.id) }
        val saved = value.copy(revision = value.revision + 1)
        commit(trips.map { if (it.trip.id == tripId) it.copy(predepartureChecklist = saved) else it })
        saved
    }
    companion object {
        fun seed(): List<TripDetail> {
            val trip = Trip("demo-rome", "demo", "로마, 느리게 걷는 3일", LocalDate.now().plusDays(14).toString())
            fun stop(id: String, name: String, lat: Double, lng: Double, day: Int, position: Int, time: String, note: String, query: String) = Stop(id, trip.id, name, lng, lat, day, position, time, note, query)
            return listOf(TripDetail(trip, listOf(
                stop("pantheon", "판테온", 41.89861, 12.47687, 1, 0, "10:00", "천장으로 들어오는 빛을 바라보기", "Pantheon Roma"),
                stop("coffee", "산테우스타키오 카페", 41.89816, 12.47477, 1, 1, "11:30", "바에 서서 에스프레소 한 잔", "Sant'Eustachio Il Caffè"),
                stop("navona", "나보나 광장", 41.89916, 12.47307, 1, 2, "14:00", "광장을 천천히 걷고, 골목에서 점심", "Piazza Navona"),
                stop("trevi", "트레비 분수", 41.90093, 12.48331, 2, 0, "09:00", "사람이 모이기 전 이른 아침에", "Fontana di Trevi"),
                stop("spanish", "스페인 계단", 41.90599, 12.48278, 2, 1, "11:00", "근처 골목에서 젤라토 먹기", "Scalinata di Trinità dei Monti"),
                stop("colosseum", "콜로세움", 41.89021, 12.49223, 3, 0, "10:00", "예약 시간을 미리 확인하기", "Colosseo"),
            )))
        }
    }
}
