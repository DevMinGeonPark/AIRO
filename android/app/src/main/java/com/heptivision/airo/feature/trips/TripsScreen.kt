package com.heptivision.airo.feature.trips

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.BuildConfig
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun TripsScreen(model: TripsViewModel, onImport: () -> Unit, onOpen: (String) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    var creating by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("전체") }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { if (!state.loading) model.refresh() }
    val trips = state.data?.trips.orEmpty()
    val visible = trips.filter { it.trip.title.contains(query, true) && when(filter) {
        "예정·진행" -> it.status() != "지난 여행"
        "지난 여행" -> it.status() == "지난 여행"
        else -> true
    } }
    val limit = state.data?.plan == "free" && trips.size >= 3
    Scaffold(containerColor = Ink, floatingActionButton = {
        if (!limit && state.data != null) ExtendedFloatingActionButton(onClick = { model.clearFormError(); creating = true }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("새 여행") }, modifier = Modifier.semantics { contentDescription = "새 여행" }, containerColor = AirBlue, contentColor = Ink, shape = RoundedCornerShape(18.dp))
    }) { padding ->
        PullToRefreshBox(isRefreshing = state.loading && state.data != null, onRefresh = model::refresh, modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 24.dp, end = 24.dp, top = 20.dp, bottom = 100.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    AiroLogo()
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (BuildConfig.DEMO) Text("DEMO", color = AirBlue, style = MaterialTheme.typography.labelSmall)
                        IconButton(onImport) { Icon(Icons.Outlined.FileUpload, "여행 가져오기") }
                    }
                } }
                item { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("내 여행", style = MaterialTheme.typography.headlineLarge)
                    Text("마음이 향하는 곳, 하나씩 담아보세요.", color = Muted, style = MaterialTheme.typography.bodyMedium)
                } }
                if (trips.isNotEmpty()) {
                    item { OutlinedTextField(query, { query = it }, placeholder = { Text("여행 이름으로 찾기") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) }
                    item { LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(listOf("전체", "예정·진행", "지난 여행")) { label -> FilterChip(selected = label == filter, onClick = { filter = label }, label = { Text(label) }, shape = RoundedCornerShape(12.dp)) }
                    } }
                }
                if (state.error != null) item { ErrorNotice(state.error, model::refresh) }
                if (state.loading && state.data == null) item { Box(Modifier.fillMaxWidth().height(250.dp)) { LoadingState() } }
                if (state.data != null && visible.isEmpty()) item {
                    AiroCard {
                        Icon(Icons.Outlined.Luggage, null, tint = AirBlue, modifier = Modifier.size(32.dp))
                        Text(if (trips.isEmpty()) "첫 여행을 담아볼까요?" else "찾는 여행이 없어요", style = MaterialTheme.typography.titleLarge)
                        Text(if (trips.isEmpty()) "떠나고 싶은 도시와 날짜를 정해보세요. 장소와 일정은 언제든 바꿀 수 있어요." else "검색어나 필터를 바꿔보세요.", color = Muted)
                        if (trips.isEmpty()) PrimaryButton("첫 여행 만들기", { model.clearFormError(); creating = true })
                    }
                }
                items(visible, key = { it.trip.id }) { summary -> TripCard(summary) { onOpen(summary.trip.id) } }
                if (limit) item { Text("무료 플랜의 여행 3개를 모두 사용하고 있어요.", color = Muted, style = MaterialTheme.typography.bodySmall) }
                if (trips.isNotEmpty()) item { Text("${trips.size}개의 여행 · 아래로 당겨 새로고침", color = Muted, style = MaterialTheme.typography.labelSmall) }
            }
        }
    }
    if (creating) TripFormSheet(saving = state.saving, error = state.formError, onDismiss = { creating = false }, onSave = { input ->
        model.create(input) { id -> creating = false; onOpen(id) }
    })
}

@Composable private fun TripCard(summary: TripSummary, onClick: () -> Unit) {
    Surface(onClick = onClick, color = Panel, shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, Hairline), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Raised, shape = RoundedCornerShape(9.dp)) { Text(summary.status(), Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = if (summary.status() == "지난 여행") Muted else AirBlue, style = MaterialTheme.typography.labelSmall) }
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, "여행 열기", tint = Muted, modifier = Modifier.size(20.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(summary.trip.title, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(summary.period(), color = Muted, style = MaterialTheme.typography.bodyMedium)
            }
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Route, null, tint = AirBlue, modifier = Modifier.size(18.dp))
                Text(if (summary.stops.isEmpty()) "첫 장소를 추가해 보세요" else "${summary.stops.map { it.day }.distinct().size}일의 일정 · ${summary.stops.size}개의 장소", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
            if (summary.stops.isNotEmpty()) Text(summary.stops.sortedWith(stopOrder).take(3).joinToString("  ·  ") { it.name }, maxLines = 2, overflow = TextOverflow.Ellipsis, color = Ivory, style = MaterialTheme.typography.bodySmall)
        }
    }
}
