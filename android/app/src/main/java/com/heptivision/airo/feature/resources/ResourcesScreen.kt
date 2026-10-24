package com.heptivision.airo.feature.resources

import com.heptivision.airo.core.platform.openBookingLink
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.wireJson
import com.heptivision.airo.core.network.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ResourcesScreen(model: ResourcesViewModel, directory: File, initial: TravelContext = TravelContext(),
    incomingFile: String? = null, incomingName: String? = null, incomingLink: String? = null,
    onIncomingHandled: () -> Unit = {}, onAI: (TravelContext) -> Unit = {}, onBudget: (String) -> Unit = {},
    images: com.heptivision.airo.feature.itinerary.PreparationViewModel? = null, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(images) { images?.images() }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var filterDay by rememberSaveable { mutableStateOf(initial.day) }
    var filterStop by rememberSaveable { mutableStateOf(initial.stopId) }
    var filter by rememberSaveable { mutableStateOf("") }
    var savedOnly by rememberSaveable { mutableStateOf(false) }
    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var addingId by rememberSaveable { mutableStateOf<String?>(null) }
    var day by rememberSaveable { mutableIntStateOf(1) }
    var pdfPath by rememberSaveable { mutableStateOf<String?>(null) }
    var pdfName by rememberSaveable { mutableStateOf("") }
    var draftPath by rememberSaveable { mutableStateOf<String?>(null) }
    var draftName by rememberSaveable { mutableStateOf("") }
    var linking by rememberSaveable { mutableStateOf<String?>(null) }
    var reservation by rememberSaveable { mutableStateOf<String?>(null) }
    var copying by remember { mutableStateOf(false) }
    var openedInitial by rememberSaveable { mutableStateOf(false) }
    val data = state.data
    val busy = state.busy || copying
    fun openUrl(url: String) { try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: android.content.ActivityNotFoundException) { model.report("이 주소를 열 수 있는 앱을 찾지 못했습니다.") } }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { if (!state.loading && !state.busy) model.refresh() }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            copying = true; model.clear()
            try { val picked = copyPdf(context, uri, directory); draftPath = picked.first.path; draftName = picked.second }
            catch (e: Exception) { if (e is CancellationException) throw e; model.report(e.message ?: "PDF를 읽지 못했습니다.") }
            finally { copying = false }
        }
    }
    LaunchedEffect(incomingFile, incomingLink) {
        if (incomingFile != null) {
            try {
                val file = withContext(Dispatchers.IO) { directory.mkdirs(); File(incomingFile).copyTo(File(directory, "${java.util.UUID.randomUUID()}.pdf")) }
                draftPath = file.path; draftName = incomingName ?: "여행 자료.pdf"; onIncomingHandled()
            } catch (e: Exception) { if (e is CancellationException) throw e; model.report("공유한 PDF를 읽지 못했습니다. 다시 공유해 주세요.") }
        } else if (safeHttps(incomingLink) != null) {
            reservation = wireJson.encodeToString(Reservation(name = "", bookingUrl = incomingLink)); tab = 1; onIncomingHandled()
        }
    }
    LaunchedEffect(model) {
        model.documents.collect { (doc, bytes) ->
            try {
                val file = withContext(Dispatchers.IO) { directory.mkdirs(); File(directory, "${doc.sha256}.pdf").apply { writeBytes(bytes) } }
                pdfPath = file.path; pdfName = doc.name
            } catch (e: Exception) { if (e is CancellationException) throw e; model.report(e.userMessage()) }
        }
    }
    LaunchedEffect(data, state.loading) {
        if (!openedInitial && data != null && !state.loading) {
            openedInitial = true
            initial.documents.firstOrNull()?.let { hash -> data.documents.find { it.sha256 == hash }?.let(model::open) }
        }
    }
    fun matchStop(stop: Stop) = (filterStop == null || stop.matches(listOf(filterStop!!))) && (filterDay == null || stop.day == filterDay)
    fun matches(text: String) = filter.isBlank() || text.contains(filter, true)
    Scaffold(containerColor = Ink, topBar = { TopAppBar(title = { Text("여행 자료") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "일정으로") } }, actions = { IconButton(model::refresh, enabled = !busy) { Icon(Icons.Outlined.Refresh, "자료 새로고침") } }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Ink)) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf("예약 문서", "예약", "저장 장소").withIndex().toList()) { (index, label) -> FilterChip(tab == index, { tab = index }, label = { Text(label) }) }
            }
            if (state.loading && data == null) LoadingState()
            else LazyColumn(Modifier.testTag("resource-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item { ErrorNotice(state.error, model::refresh) }
                if (state.message != null) item { Text(state.message!!, color = AirBlue) }
                if (busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                if (data != null) {
                    item { OutlinedTextField(filter, { filter = it.take(200) }, label = { Text("자료·예약·장소 검색") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
                    item { LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { FilterChip(filterDay == null && filterStop == null, { filterDay = null; filterStop = null }, label = { Text("여행 전체") }) }
                        items(data.stops.map { it.day }.distinct().sorted()) { n -> FilterChip(filterDay == n && filterStop == null, { filterDay = n; filterStop = null }, label = { Text(dayLabel(n)) }) }
                    } }
                    if (filterStop != null) item { Text(data.stops.find { it.matches(listOf(filterStop!!)) }?.name ?: "선택한 장소", color = AirBlue) }
                    if (tab == 0) {
                        if (images != null) item { com.heptivision.airo.feature.itinerary.TripImageSection(images) }
                        item { PrimaryButton("PDF 추가", { picker.launch(arrayOf("application/pdf")) }, enabled = !busy && !state.loading) }
                        item { Text("원본 PDF · 개별 2MB, 최대 20개·전체 자료 8MB\n연결하지 않은 문서는 여행 전체에서 볼 수 있어요.", color = Muted, style = MaterialTheme.typography.bodySmall) }
                        val docs = data.documents.filter { doc -> val linked = data.documentStops(doc); matches(doc.name + " " + linked.joinToString { it.name }) && ((filterDay == null && filterStop == null) || linked.any(::matchStop)) }
                        if (docs.isEmpty()) item { AiroCard { Text("아직 연결된 문서가 없어요", style = MaterialTheme.typography.titleMedium); Text("PDF를 추가해 날짜와 장소에 연결하세요. 전체 자료는 ‘여행 전체’에서 확인할 수 있어요.", color = Muted) } }
                        items(docs, key = { it.sha256 }) { doc -> AiroCard {
                            val linked = data.documentStops(doc)
                            val bookingName = data.reservations.entries.firstOrNull { doc.sha256 in it.documentSha256s }?.name
                            Text(bookingName ?: linked.firstOrNull()?.name ?: "여행 문서", style = MaterialTheme.typography.titleMedium)
                            Text(doc.name, color = Muted, style = MaterialTheme.typography.bodySmall)
                            Text(if (linked.isEmpty()) "여행 전체" else linked.joinToString("\n") { "${dayLabel(it.day)} · ${data.trip?.dayDate(it.day).orEmpty()} · ${it.name}" }, color = Muted, style = MaterialTheme.typography.bodySmall)
                            if (doc.sizeBytes > 0) Text("${(doc.sizeBytes + 1023) / 1024} KB · PDF", color = Muted, style = MaterialTheme.typography.labelSmall)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                TextButton({ model.open(doc) }, enabled = !busy) { Text("PDF 열기") }
                                TextButton({ model.clear(); linking = doc.sha256 }, enabled = !busy) { Text("연결 수정") }
                                TextButton({ onAI(TravelContext(filterDay, filterStop, listOf(doc.sha256))) }) { Text("AI에 활용") }
                            }
                        } }
                    } else if (tab == 1) {
                        item { PrimaryButton("예약 추가", { model.clear(); reservation = wireJson.encodeToString(Reservation(name = "", stopIds = listOfNotNull(filterStop))) }, enabled = !busy && !state.loading) }
                        val entries = data.reservations.entries.filter { r -> val linked = data.stops.filter(r::linkedTo); matches(r.name + " " + r.reference.orEmpty() + " " + linked.joinToString { it.name }) && ((filterDay == null && filterStop == null) || linked.any(::matchStop)) }
                        if (entries.isEmpty()) item { AiroCard { Text("예약을 정리해 두세요", style = MaterialTheme.typography.titleMedium); Text("예약 링크·번호·PDF와 결제 상태를 함께 보관하세요. 메모나 파일 이름만으로 예약 확정을 판단하지 않습니다.", color = Muted) } }
                        items(entries, key = { it.id }) { r -> AiroCard {
                            Text(r.name, style = MaterialTheme.typography.titleMedium)
                            Text("${bookingLabels[r.bookingStatus]} · ${paymentLabels[r.paymentStatus]}", color = AirBlue)
                            val stops = data.stops.filter(r::linkedTo)
                            Text(if (stops.isEmpty()) "여행 전체" else stops.joinToString("\n") { "${dayLabel(it.day)} · ${it.name}" }, color = Muted, style = MaterialTheme.typography.bodySmall)
                            r.reference?.let { Text("예약 번호 · $it") }
                            r.note?.let { com.heptivision.airo.feature.itinerary.PlaceNote(r.name, it) }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                bookingLink(r.bookingUrl)?.let { link -> TextButton({ if (!openBookingLink(context, link.url)) model.report("예약 링크를 열 수 있는 앱을 확인해 주세요.") }) { Text(link.label) } }
                                TextButton({ model.clear(); reservation = wireJson.encodeToString(r) }, enabled = !busy) { Text("예약 수정") }
                                TextButton({ onBudget(r.id) }) { Text("예산 연결") }
                                TextButton({ onAI(TravelContext(filterDay, filterStop, r.documentSha256s)) }) { Text("AI에 활용") }
                            }
                            data.documents.filter { it.sha256 in r.documentSha256s }.forEach { doc -> OutlinedButton({ model.open(doc) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Description, null); Text(doc.name, Modifier.weight(1f).padding(start = 8.dp)) } }
                        } }
                    } else {
                        item { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            FilterChip(savedOnly, { savedOnly = !savedOnly }, label = { Text("즐겨찾기만") })
                            TextButton({ model.clear(); searching = true }, enabled = !busy) { Text("장소 저장") }
                        } }
                        val places = data.places.filter { (!savedOnly || it.id in data.savedPlaceIds) && (filterDay == null || filterDay == it.day) && (filterStop == null || it.id == filterStop) && matches(it.name + " " + it.nameKo.orEmpty() + " " + it.addr.orEmpty()) }
                        if (places.isEmpty()) item { AiroCard { Text("다음에 가고 싶은 곳", style = MaterialTheme.typography.titleLarge); Text("찾아둔 카페나 식당을 저장하고, 원하는 날 일정에 추가하세요.", color = Muted) } }
                        items(places, key = { it.id }) { place -> AiroCard {
                            PlaceImage(place.image, place.name)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(place.nameKo ?: place.name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                                IconButton({ model.bookmark(place) }, enabled = !busy) { Icon(if (place.id in data.savedPlaceIds) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder, "${place.name} 즐겨찾기", tint = AirBlue) }
                            }
                            listOfNotNull(place.addr, place.hours, place.cuisine, place.phone).filter { it.isNotBlank() }.forEach { Text(it, color = Muted, style = MaterialTheme.typography.bodySmall) }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                safeHttps(place.website)?.let { url -> TextButton({ openUrl(url) }) { Text("웹사이트") } }
                                TextButton({ openUrl("geo:${place.lat},${place.lng}?q=${Uri.encode(place.name)}") }) { Text("지도에서 보기") }
                                TextButton({ addingId = place.id; day = place.day.coerceAtLeast(1); model.clear() }, enabled = !busy) { Text("일정에 추가") }
                            }
                        } }
                        if (places.isNotEmpty()) item { Text("© OpenStreetMap contributors", color = Muted, style = MaterialTheme.typography.labelSmall) }
                    }
                }
            }
        }
    }
    if (searching) ModalBottomSheet(onDismissRequest = { if (!busy) searching = false }, containerColor = Panel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("장소 저장", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(query, { query = it.take(200) }, label = { Text("도시와 장소 이름") }, modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !busy)
            PrimaryButton("장소 검색", { model.search(query.trim()) }, busy = busy, enabled = query.trim().length >= 2)
            ErrorNotice(state.error)
            if (state.places?.isEmpty() == true) Text("찾는 장소가 없어요. 도시 이름을 함께 적어보세요.", color = Muted)
            state.places?.forEach { place -> OutlinedButton({ model.save(place) { searching = false } }, Modifier.fillMaxWidth(), enabled = !busy) {
                Column(Modifier.weight(1f).padding(vertical = 8.dp)) { Text(place.name); Text(place.address, color = Muted, style = MaterialTheme.typography.bodySmall) }; Icon(Icons.Outlined.BookmarkAdd, "저장")
            } }
        }
    }
    val adding = data?.places?.find { it.id == addingId }
    if (adding != null) AlertDialog(onDismissRequest = { if (!busy) addingId = null }, title = { Text("어느 날에 들를까요?") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { Text(adding.nameKo ?: adding.name); Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton({ day-- }, enabled = day > 0 && !busy) { Text("−") }; Text(dayLabel(day)); TextButton({ day++ }, enabled = day < 3650 && !busy) { Text("+") }
        }; ErrorNotice(state.error) }
    }, confirmButton = { TextButton({ model.add(adding, day) { addingId = null } }, enabled = !busy) { Text("일정에 추가") } }, dismissButton = { TextButton({ addingId = null }, enabled = !busy) { Text("취소") } })
    if (data != null) {
        draftPath?.let { path -> key(path) { DocumentEditor(data, draftName, listOfNotNull(filterStop), busy, state.error,
            { pdfPath = path; pdfName = draftName }, { File(path).delete(); draftPath = null },
            { ids -> model.attach(File(path), draftName, ids) { File(path).delete(); draftPath = null } }) } }
        data.documents.find { it.sha256 == linking }?.let { doc -> key(doc.sha256) { DocumentEditor(data, doc.name, doc.stopIds, busy, state.error,
            { model.open(doc) }, { linking = null }, { ids -> model.link(doc, ids) { linking = null } }) } }
        reservation?.let { json -> key(json) { ReservationEditor(data, wireJson.decodeFromString(json), state, { reservation = null }, model::refresh) { value, revision -> model.reservation(value, revision) { reservation = null } } } }
    }
    pdfPath?.let { path -> PdfPreview(File(path), pdfName) { pdfPath = null } }
}

@Composable fun ExpandableNote(note: String) {
    var expanded by rememberSaveable(note) { mutableStateOf(false) }
    Text(note, color = Muted, maxLines = if (expanded) Int.MAX_VALUE else 3, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
    if (note.length > 100 || note.count { it == '\n' } >= 3) TextButton({ expanded = !expanded }) { Text(if (expanded) "메모 접기" else "메모 더 보기") }
}
