package com.heptivision.airo.feature.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.BuildConfig
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.userMessage
import com.heptivision.airo.data.trips.TripRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

 data class HistoryState(val rows: List<TripChange> = emptyList(), val detail: ChangeDetail? = null, val expectedLatest: String? = null,
    val busy: Boolean = false, val error: String? = null, val message: String? = null, val more: Boolean = false)
class HistoryViewModel(private val tripId: String, private val repository: TripRepository) : ViewModel() {
    private val _state = MutableStateFlow(HistoryState())
    val state = _state.asStateFlow()
    init { load() }
    private fun work(block: suspend () -> Unit) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null, message = null) }
        viewModelScope.launch { try { block() } catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(error = e.userMessage()) } } finally { _state.update { it.copy(busy = false) } } }
    }
    fun load(more: Boolean = false) = work {
        val rows = repository.changes(tripId, if (more) _state.value.rows.lastOrNull()?.id else null).changes
        _state.update { it.copy(rows = if (more) (it.rows + rows).distinctBy { r -> r.id } else rows, more = rows.size >= 50, detail = null) }
    }
    fun select(id: String) = work {
        val detail = repository.change(tripId, id)
        val latest = repository.changes(tripId).changes.firstOrNull()?.id
        _state.update { it.copy(detail = detail, expectedLatest = latest) }
    }
    fun close() { if (!_state.value.busy) _state.update { it.copy(detail = null) } }
    fun revert() = work {
        val detail = _state.value.detail ?: return@work
        val latest = _state.value.expectedLatest ?: return@work
        repository.revert(tripId, detail.id, latest)
        val rows = repository.changes(tripId).changes
        _state.update { it.copy(rows = rows, detail = null, message = "선택한 변경을 되돌렸어요. 일정과 자료에서 결과를 확인하세요.", more = rows.size >= 50) }
    }
}
private val prettyJson = Json { prettyPrint = true }
private fun JsonElement?.readable(): String = when (this) { null, JsonNull -> "없음"; is JsonPrimitive -> content; else -> prettyJson.encodeToString(JsonElement.serializer(), this) }
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun HistoryScreen(model: HistoryViewModel, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    var confirm by rememberSaveable { mutableStateOf(false) }
    Scaffold(containerColor = Ink, topBar = { TopAppBar(title = { Text("변경 이력") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "일정으로") } }, actions = { IconButton({ model.load() }, enabled = !state.busy) { Icon(Icons.Outlined.Refresh, "이력 새로고침") } }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Ink)) }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Text("자료·예약·예산의 변경 내용을 확인하고, 원래 상태로 되돌릴 수 있어요.", color = Muted); ErrorNotice(state.error) { model.load() } }
            if (state.busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            state.message?.let { item { Text(it, color = AirBlue) } }
            if (state.rows.isEmpty() && !state.busy) item { Text(if (BuildConfig.DEMO) "샘플 여행은 변경 이력을 보관하지 않습니다. 계정 여행에서 사용할 수 있어요." else "아직 기록된 변경이 없어요.", color = Muted) }
            items(state.rows, key = { it.id }) { row -> OutlinedButton({ model.select(row.id) }, Modifier.fillMaxWidth(), enabled = !state.busy) {
                Column(Modifier.fillMaxWidth().padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(row.fields.joinToString(" · ") { changeLabels[it] ?: it }); Text(changeTime(row.createdAt), color = Muted, style = MaterialTheme.typography.labelSmall); Text("변경 내용 보기", style = MaterialTheme.typography.labelMedium) }
            } }
            if (state.more) item { TextButton({ model.load(true) }, enabled = !state.busy) { Text("이전 이력 더 보기") } }
        }
    }
    state.detail?.let { detail -> ModalBottomSheet(onDismissRequest = model::close, containerColor = Panel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("변경 내용", style = MaterialTheme.typography.headlineSmall)
            Text(changeTime(detail.createdAt), color = Muted)
            ErrorNotice(state.error)
            detail.changes.forEach { (field, value) ->
                Text(changeLabels[field] ?: field, color = AirBlue, style = MaterialTheme.typography.titleMedium)
                val delta = value as? JsonObject
                Text("변경 전", style = MaterialTheme.typography.labelLarge)
                ChangeText(delta?.get("before").readable())
                Text("변경 후", style = MaterialTheme.typography.labelLarge)
                ChangeText(delta?.get("after").readable())
            }
            Text("되돌리면 이 변경 직전 값으로 복원됩니다. 이후 같은 자료가 바뀐 경우 서버가 충돌을 알려줍니다.", color = Muted)
            PrimaryButton("이 변경 되돌리기", { confirm = true }, busy = state.busy, enabled = state.expectedLatest != null && state.error == null)
            if (state.error != null) TextButton({ model.select(detail.id) }, enabled = !state.busy) { Text("최신 내용 다시 검토") }
        }
    } }
    if (confirm && state.detail != null) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("검토한 변경을 되돌릴까요?") }, text = { Text("문서 연결·예약·예산 중 이 기록에 포함된 항목이 변경 전 상태로 복원됩니다.") }, confirmButton = { TextButton({ confirm = false; model.revert() }) { Text("되돌리기") } }, dismissButton = { TextButton({ confirm = false }) { Text("취소") } })
}
@Composable private fun ChangeText(value: String) {
    var expanded by rememberSaveable(value.hashCode()) { mutableStateOf(false) }
    Text(if (expanded) value else value.take(1600), style = MaterialTheme.typography.bodySmall, color = Muted)
    if (value.length > 1600) TextButton({ expanded = !expanded }) { Text(if (expanded) "접기" else "전체 내용 보기") }
}
private fun changeTime(value: String) = runCatching { java.time.Instant.parse(value).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy.M.d HH:mm")) }.getOrDefault(value)
