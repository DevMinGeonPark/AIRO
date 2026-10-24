package com.heptivision.airo.feature.resources

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*

@Composable fun StopChoices(data: TripResources, selected: List<String>, enabled: Boolean, onChange: (List<String>) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    Text("연결할 날짜·장소", style = MaterialTheme.typography.titleSmall)
    Text(if (selected.isEmpty()) "여행 전체 자료로 보관합니다." else "${selected.size}개 장소에 연결", color = Muted, style = MaterialTheme.typography.bodySmall)
    OutlinedTextField(query, { query = it.take(200) }, label = { Text("장소 또는 일차 검색") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    data.stops.sortedWith(stopOrder).filter { query.isBlank() || it.name.contains(query, true) || dayLabel(it.day).contains(query) || data.trip?.dayDate(it.day)?.contains(query) == true }.forEach { stop ->
        val checked = stop.matches(selected)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked, { chosen -> onChange(if (chosen) (selected + stop.id).distinct() else selected.filterNot { it == stop.id || it == stop.sourceId }) }, enabled = enabled && (checked || selected.size < 100), modifier = Modifier.semantics { contentDescription = "연결: ${stop.name}" })
            Column(Modifier.weight(1f)) { Text(stop.name); Text("${dayLabel(stop.day)} · ${data.trip?.dayDate(stop.day).orEmpty()}", color = Muted, style = MaterialTheme.typography.labelSmall) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun DocumentEditor(data: TripResources, name: String, originalIds: List<String>, busy: Boolean, error: String?, preview: () -> Unit, close: () -> Unit, save: (List<String>) -> Unit) {
    var ids by rememberSaveable { mutableStateOf(originalIds) }
    ModalBottomSheet(onDismissRequest = { if (!busy) close() }, containerColor = Panel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("PDF 연결", style = MaterialTheme.typography.headlineSmall)
            Text(name, style = MaterialTheme.typography.titleMedium)
            TextButton(preview, enabled = !busy) { Text("원본 미리보기") }
            ErrorNotice(error)
            PrimaryButton("PDF 저장", { save(ids) }, busy = busy)
            StopChoices(data, ids, !busy) { ids = it }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ReservationEditor(data: TripResources, original: Reservation, state: ResourcesState, close: () -> Unit, reload: () -> Unit, save: (Reservation, Int) -> Unit) {
    var name by rememberSaveable { mutableStateOf(original.name) }
    var url by rememberSaveable { mutableStateOf(original.bookingUrl.orEmpty()) }
    var booking by rememberSaveable { mutableStateOf(original.bookingStatus) }
    var payment by rememberSaveable { mutableStateOf(original.paymentStatus) }
    var reference by rememberSaveable { mutableStateOf(original.reference.orEmpty()) }
    var note by rememberSaveable { mutableStateOf(original.note.orEmpty()) }
    var ids by rememberSaveable { mutableStateOf((original.stopIds + listOfNotNull(original.stopId)).distinct()) }
    var docs by rememberSaveable { mutableStateOf(original.documentSha256s) }
    // A refreshed revision is adopted only after the user explicitly reloads a conflict.
    var revision by rememberSaveable { mutableIntStateOf(data.reservations.revision) }
    var reloading by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(reloading, state.loading, state.error, data.reservations.revision) { if (reloading && !state.loading && state.error == null) { revision = data.reservations.revision; reloading = false } }
    val value = original.copy(name = name.trim(), bookingUrl = url.trim().ifBlank { null }, bookingStatus = booking, paymentStatus = payment,
        reference = reference.trim().ifBlank { null }, note = note.trim().ifBlank { null }, stopId = null, stopIds = ids, documentSha256s = docs)
    val valid = runCatching { value.validate() }.isSuccess
    ModalBottomSheet(onDismissRequest = { if (!state.busy) close() }, containerColor = Panel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(if (data.reservations.entries.any { it.id == original.id }) "예약 수정" else "예약 추가", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(name, { name = it.take(200) }, label = { Text("예약 이름") }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
            OutlinedTextField(url, { url = it.take(2048) }, label = { Text("예약 페이지 (HTTPS)") }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy, isError = url.isNotBlank() && safeHttps(url) == null)
            Text("예약 상태")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { bookingLabels.forEach { (id, label) -> FilterChip(booking == id, { booking = id }, label = { Text(label) }, enabled = !state.busy) } }
            Text("결제 상태")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { paymentLabels.forEach { (id, label) -> FilterChip(payment == id, { payment = id }, label = { Text(label) }, enabled = !state.busy) } }
            OutlinedTextField(reference, { reference = it.take(300) }, label = { Text("예약 번호 (선택)") }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
            OutlinedTextField(note, { note = it.take(4000) }, label = { Text("예약 메모 (선택)") }, modifier = Modifier.fillMaxWidth(), minLines = 5, maxLines = 10, textStyle = MaterialTheme.typography.bodyLarge.copy(lineHeight = 28.sp), placeholder = { Text("체크인: 15:00\nPIN: 0123#") }, enabled = !state.busy)
            ErrorNotice(state.error, if (state.conflict) ({ reloading = true; reload() }) else null)
            if (state.conflict) Text("작성한 내용은 유지됩니다. 최신 예약을 다시 불러온 뒤 확인하고 저장하세요.", color = Muted)
            PrimaryButton("예약 저장", { save(value, revision) }, busy = state.busy || state.loading, enabled = valid && !state.conflict && !reloading)
            if (data.documents.isNotEmpty()) {
                Text("예약에 사용할 PDF", style = MaterialTheme.typography.titleSmall)
                data.documents.forEach { doc -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(doc.sha256 in docs, { docs = if (it) (docs + doc.sha256).distinct() else docs - doc.sha256 }, enabled = !state.busy, modifier = Modifier.semantics { contentDescription = "PDF 선택: ${doc.name}" })
                    Text(doc.name, Modifier.weight(1f))
                } }
            }
            StopChoices(data, ids, !state.busy) { ids = it }
        }
    }
}
