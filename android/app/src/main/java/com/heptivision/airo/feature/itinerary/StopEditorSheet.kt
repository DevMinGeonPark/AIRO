package com.heptivision.airo.feature.itinerary

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.DirectionsWalk
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun StopEditorSheet(
    stop: Stop?, day: Int, pickedLat: Double?, pickedLng: Double?, state: ItineraryState,
    onDismiss: () -> Unit, onSearch: (String) -> Unit, onSave: (StopInput) -> Unit, onDelete: (() -> Unit)?,
) {
    var name by rememberSaveable { mutableStateOf(stop?.name.orEmpty()) }
    var note by rememberSaveable { mutableStateOf(stop?.note.orEmpty()) }
    var selectedDay by rememberSaveable { mutableIntStateOf(stop?.day ?: day) }
    var time by rememberSaveable { mutableStateOf(stop?.time) }
    var lat by rememberSaveable { mutableStateOf(stop?.lat ?: pickedLat) }
    var lng by rememberSaveable { mutableStateOf(stop?.lng ?: pickedLng) }
    var mapQuery by rememberSaveable { mutableStateOf(stop?.mapQuery) }
    var mode by rememberSaveable { mutableStateOf(stop?.mode ?: "ground") }
    var query by rememberSaveable { mutableStateOf("") }
    var selectedPlace by rememberSaveable { mutableStateOf(stop?.name ?: if (pickedLat != null) "지도에서 고른 위치" else null) }
    var showTime by rememberSaveable { mutableStateOf(false) }
    var delete by rememberSaveable { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = { if (!state.saving) onDismiss() }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Panel) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(if (stop == null) "어디에 들를까요?" else "일정 편집", style = MaterialTheme.typography.headlineSmall)
            if (lat == null || selectedPlace == null) {
                Text("도시와 장소 이름을 함께 검색하거나, 지도를 길게 눌러 위치를 골라보세요.", color = Muted, style = MaterialTheme.typography.bodyMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(query, { if (it.length <= 200) query = it }, placeholder = { Text("예: 로마 판테온") }, singleLine = true, shape = RoundedCornerShape(14.dp), modifier = Modifier.weight(1f))
                    FilledIconButton(onClick = { onSearch(query.trim()) }, enabled = query.trim().length >= 2 && !state.searching, modifier = Modifier.size(52.dp)) {
                        if (state.searching) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Ink) else Icon(Icons.Outlined.Search, "장소 검색")
                    }
                }
                ErrorNotice(state.searchError)
                if (state.searchResults?.isEmpty() == true) Text("검색 결과가 없어요. 도시 이름을 더하거나 지도를 길게 눌러 장소를 지정해 주세요.", color = Muted, style = MaterialTheme.typography.bodyMedium)
                state.searchResults?.forEach { place ->
                    ListItem(headlineContent = { Text(place.name) }, supportingContent = { Text(place.address, maxLines = 2) }, leadingContent = { Icon(Icons.Outlined.Place, null, tint = AirBlue) },
                        modifier = Modifier.clickable { lat = place.lat; lng = place.lng; name = place.name; mapQuery = place.name; selectedPlace = place.name })
                }
                if (state.searchResults?.isNotEmpty() == true) Text("© OpenStreetMap contributors", color = Muted, style = MaterialTheme.typography.labelSmall)
            } else {
                Surface(color = Raised, shape = RoundedCornerShape(12.dp)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icons.Outlined.LocationOn, null, tint = AirBlue)
                        Text(selectedPlace.orEmpty(), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = { selectedPlace = null }, enabled = stop?.choice == null) { Text("변경") }
                    }
                }
            }
            OutlinedTextField(name, { if (it.length <= 300) name = it }, label = { Text("장소 이름") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), singleLine = true, enabled = !state.saving && stop?.choice == null)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text("방문할 날", color = Muted)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { selectedDay-- }, enabled = selectedDay > 0 && !state.saving) { Icon(Icons.Outlined.Remove, "이전 일차") }
                    Text(dayLabel(selectedDay), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { selectedDay++ }, enabled = selectedDay < 3650 && !state.saving) { Icon(Icons.Outlined.Add, "다음 일차") }
                }
            }
            OutlinedButton(onClick = { showTime = true }, enabled = !state.saving, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), shape = RoundedCornerShape(14.dp)) {
                Icon(Icons.Outlined.Schedule, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text(time ?: "방문 시간 선택 (선택 사항)")
            }
            if (time != null) TextButton(onClick = { time = null }, enabled = !state.saving) { Text("시간 미정으로 변경") }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(enabled = stop?.choice == null, selected = mode == "ground", onClick = { mode = "ground" }, label = { Text("육상 이동") }, leadingIcon = { Icon(Icons.AutoMirrored.Outlined.DirectionsWalk, null, Modifier.size(18.dp)) })
                FilterChip(enabled = stop?.choice == null, selected = mode == "flight", onClick = { mode = "flight" }, label = { Text("항공편으로 도착") }, leadingIcon = { Icon(Icons.Outlined.Flight, null, Modifier.size(18.dp)) })
            }
            OutlinedTextField(note, { if (it.length <= 4000) note = it }, label = { Text("메모 (선택 사항)") },
                placeholder = { Text("체크인: 15:00\nPIN: 0123#\n\n도착 후 필요한 내용을 적어 주세요.") },
                supportingText = { Text("PIN: 0123처럼 적으면 장소 메모에서 크게 볼 수 있어요.") },
                textStyle = MaterialTheme.typography.bodyLarge.copy(lineHeight = 28.sp), minLines = 5, maxLines = 10,
                modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), enabled = !state.saving && stop?.choice == null)
            ErrorNotice(state.formError)
            PrimaryButton(if (stop == null) "일정에 추가" else "변경 사항 저장", {
                onSave(StopInput(name.trim(), lng!!, lat!!, selectedDay, time, note.trim().ifBlank { null }, mapQuery, mode))
            }, busy = state.saving, enabled = name.isNotBlank() && lat != null && lng != null && selectedPlace != null)
            if (onDelete != null) TextButton(onClick = { delete = true }, modifier = Modifier.fillMaxWidth(), enabled = !state.saving) { Text("일정에서 삭제", color = MaterialTheme.colorScheme.error) }
        }
    }
    if (showTime) {
        val parts = time.orEmpty().split(':')
        val picker = rememberTimePickerState(initialHour = parts.getOrNull(0)?.toIntOrNull() ?: 10, initialMinute = parts.getOrNull(1)?.toIntOrNull() ?: 0, is24Hour = true)
        AlertDialog(onDismissRequest = { showTime = false }, title = { Text("방문 시간") }, text = { TimeInput(picker) }, confirmButton = {
            TextButton(onClick = { time = "%02d:%02d".format(java.util.Locale.ROOT, picker.hour, picker.minute); showTime = false }) { Text("선택") }
        }, dismissButton = { TextButton(onClick = { showTime = false }) { Text("취소") } })
    }
    if (delete) AlertDialog(onDismissRequest = { delete = false }, title = { Text("이 일정을 삭제할까요?") }, text = { Text("${stop?.name} 장소가 여행 일정에서 삭제됩니다.") },
        confirmButton = { TextButton(onClick = { delete = false; onDelete?.invoke() }) { Text("삭제", color = MaterialTheme.colorScheme.error) } }, dismissButton = { TextButton(onClick = { delete = false }) { Text("취소") } })
}
