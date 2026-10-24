package com.heptivision.airo.feature.itinerary

import android.content.ActivityNotFoundException
import com.heptivision.airo.core.platform.openBookingLink
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.BuildConfig
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*
import com.heptivision.airo.feature.trips.TripFormSheet
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ItineraryScreen(model: ItineraryViewModel, progress: ProgressViewModel, preparation: PreparationViewModel, photos: com.heptivision.airo.data.photos.PlacePhotoLinks, onBudget: () -> Unit, onResources: (TravelContext) -> Unit,
    onChat: (TravelContext) -> Unit, onExport: () -> Unit, onHistory: () -> Unit = {}, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val detail = state.detail
    val choiceRoutes by model.choiceRoutes.state.collectAsStateWithLifecycle()
    val progressState by progress.state.collectAsStateWithLifecycle()
    val onTracking = progressTracking(progress)
    val currentLocation = rememberCurrentLocation()
    LaunchedEffect(detail) { progress.schedule(detail); progress.automatic() }
    val wide = LocalConfiguration.current.screenWidthDp >= 1024
    val largeText = LocalConfiguration.current.fontScale > 1.2f
    var day by rememberSaveable { mutableIntStateOf(-1) }
    var today by remember { mutableStateOf(LocalDate.now()) }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    var editingId by rememberSaveable { mutableStateOf<String?>(null) }
    var editor by rememberSaveable { mutableStateOf(false) }
    var pickedLat by rememberSaveable { mutableStateOf<Double?>(null) }
    var pickedLng by rememberSaveable { mutableStateOf<Double?>(null) }
    var tripForm by rememberSaveable { mutableStateOf(false) }
    var deleteTrip by rememberSaveable { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var controls by rememberSaveable { mutableStateOf(false) }
    var dayOpen by rememberSaveable { mutableStateOf(true) }
    var schedule by rememberSaveable { mutableStateOf(false) }
    var choosingDay by rememberSaveable { mutableStateOf(false) }
    var preparationInline by rememberSaveable { mutableStateOf(false) }
    var preparationOpen by rememberSaveable { mutableStateOf(false) }
    var accommodationOpen by rememberSaveable { mutableStateOf(false) }
    var mapError by remember { mutableStateOf<String?>(null) }
    var frame by rememberSaveable { mutableIntStateOf(0) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { today = LocalDate.now(); if (!state.loading && !state.saving) model.refresh() }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(60_000); today = LocalDate.now() } }
    LaunchedEffect(detail?.trip?.id) { if (day == -1 && detail != null) day = if (wide) -2 else nearestDay(detail.trip, (detail.stops.map { it.day } + 1).distinct(), today) }
    val currentDay = day.takeIf { it >= 0 }
    val days = (detail?.stops.orEmpty().map { it.day } + listOfNotNull(currentDay, 0, 1)).distinct().sorted()
    val stops = detail?.stops.orEmpty().filter { currentDay == null || it.day == currentDay }.sortedWith(stopOrder)
    val completed = remember(detail?.stops, progressState.data) { completedStopIds(detail?.stops.orEmpty(), progressState.data) }
    val remaining = remember(stops, completed) { remainingStops(stops, completed) }
    val visibleRoads = remember(remaining, state.roadsByPair, state.routeDay, currentDay) {
        if (state.routeDay == currentDay) roadPairs(remaining).mapNotNull { state.roadsByPair[it.key] } else emptyList()
    }
    LaunchedEffect(remaining, selected) { model.choiceRoutes.show(remaining, selected) }
    val playback = rememberTripPlayback(remaining)
    val playbackScope = rememberCoroutineScope()
    val playbackPlan = remember(remaining, visibleRoads) { playbackPlan(remaining, visibleRoads) }
    fun startPlayback() { selected = null; schedule = false; playback.start(playbackScope, playbackPlan) { selected = it } }
    val ordinals = remember(stops) { stopOrdinals(stops) }
    val flights = remember(remaining) { flightArcs(remaining) }
    LaunchedEffect(currentDay, detail?.trip?.id, completed) { if (day != -1) model.routes(currentDay, completedIds = completed) }
    fun changeDay(n: Int?) { playback.stop(); day = n ?: -2; selected = null; model.routes(n) }
    fun overview() { changeDay(null); dayOpen = true; preparationInline = false; schedule = false; frame++ }
    fun showPreparation() { selected = null; schedule = false; dayOpen = true; preparationInline = true }
    fun step(delta: Int) { if (currentDay == null) changeDay(if (delta > 0) days.first() else days.last()) else days.getOrNull(days.indexOf(currentDay) + delta)?.let(::changeDay) }
    fun add(lat: Double? = null, lng: Double? = null) { playback.stop(); model.resetForm(); editingId = null; pickedLat = lat; pickedLng = lng; editor = true }
    fun edit(stop: Stop) { playback.stop(); model.resetForm(); editingId = stop.id; pickedLat = null; pickedLng = null; editor = true }
    val travelContext = TravelContext(currentDay, selected)
    val threshold = with(LocalDensity.current) { 64.dp.toPx() }
    fun Modifier.daySwipe() = pointerInput(currentDay, days) {
        var dragged = 0f
        detectHorizontalDragGestures(onDragStart = { dragged = 0f }, onHorizontalDrag = { change, amount -> change.consume(); dragged += amount },
            onDragEnd = { if (kotlin.math.abs(dragged) > threshold) step(if (dragged < 0) 1 else -1) })
    }
    BackHandler(playback.playing) { playback.stop(); selected = null }
    BackHandler(selected != null && !playback.playing && !editor && !schedule) { selected = null }
    BackHandler(!playback.playing && selected == null && !controls && !editor && !tripForm && !schedule) { controls = true }
    BoxWithConstraints(Modifier.fillMaxSize().background(Ink)) {
        val stageHeight = maxHeight
        val panelExpanded = dayOpen && (wide || selected == null)
        val sideWidth = if (wide && panelExpanded) 288.dp else 0.dp
        val topRoom = if (playback.playing) 80.dp else if (wide) 96.dp else if (!panelExpanded) 72.dp else (stageHeight * .52f).coerceAtMost(200.dp + 44.dp * stops.size)
        val bottomRoom = if (playback.playing) 70.dp else if (selected == null) (if (controls) 138.dp else 70.dp) else (stageHeight * .46f).coerceAtMost(380.dp) + 28.dp
        if (detail == null) {
            if (state.loading) LoadingState() else Column(Modifier.padding(24.dp)) { TextButton(onBack) { Text("내 여행으로") }; ErrorNotice(state.error, model::refresh) }
        } else {
            NativeMap(stops, Modifier.fillMaxSize().padding(start = sideWidth), offline = BuildConfig.DEMO, roads = visibleRoads, choiceRoads = choiceRoutes.roads, flights = flights, completedIds = completed, progressReady = progressState.data != null,
                selectedId = selected, frameKey = "${detail.trip.id}:$currentDay:$frame", onSelect = { playback.stop(); selected = it; schedule = false },
                movingPoint = playback.point, playbackLeg = playback.leg,
                userLocation = currentLocation.point,
                frameInsets = PaddingValues(start = 48.dp, end = 48.dp, top = (topRoom + if (controls && !wide) 70.dp else 0.dp).coerceAtMost(stageHeight * .6f), bottom = bottomRoom.coerceAtMost(stageHeight * .46f)),
                showLabels = currentDay != null,
                onLongPress = { lat, lng -> add(lat, lng) }, onError = { mapError = it }, onMapTap = { controls = !controls })
            MapAttribution(BuildConfig.DEMO, Modifier.align(Alignment.BottomStart).padding(start = sideWidth).background(Ink.copy(alpha = .8f)))
            Column(Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = if (controls || wide) 148.dp else 92.dp).widthIn(max = 280.dp), horizontalAlignment = Alignment.End) {
                Surface(shape = CircleShape, color = Panel, border = BorderStroke(1.dp, Hairline)) {
                    IconButton({ playback.stop(); selected = null; currentLocation.locate() }, enabled = !currentLocation.busy, modifier = Modifier.semantics { contentDescription = "현재 위치" }) {
                        if (currentLocation.busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Outlined.MyLocation, null)
                    }
                }
                if (currentLocation.busy) Surface(shape = RoundedCornerShape(12.dp), color = Panel) { Text("현재 위치 확인 중…", Modifier.padding(10.dp), style = MaterialTheme.typography.bodySmall) }
            }
            if (controls || wide) {
                Column(Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(start = sideWidth).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Surface(shape = RoundedCornerShape(18.dp), color = Panel.copy(alpha = .96f), border = BorderStroke(1.dp, Hairline)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "내 여행으로") }
                            Text(detail.trip.title, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Box {
                                IconButton({ menu = true }) { Icon(Icons.Outlined.MoreHoriz, "여행 메뉴") }
                                DropdownMenu(menu, { menu = false }) {
                                    DropdownMenuItem(text = { Text("여행 예산") }, onClick = { menu = false; onBudget() })
                                    DropdownMenuItem(text = { Text("변경 이력") }, onClick = { menu = false; onHistory() })
                                    DropdownMenuItem(text = { Text("여행 내보내기") }, onClick = { menu = false; onExport() })
                                    DropdownMenuItem(text = { Text("여행 정보 수정") }, onClick = { menu = false; model.resetForm(); tripForm = true })
                                    DropdownMenuItem(text = { Text("새로고침") }, onClick = { menu = false; model.refresh() })
                                    DropdownMenuItem(text = { Text("조작부 숨기기") }, onClick = { menu = false; controls = false })
                                    DropdownMenuItem(text = { Text("여행 삭제", color = MaterialTheme.colorScheme.error) }, onClick = { menu = false; model.resetForm(); deleteTrip = true })
                                }
                            }
                        }
                    }
                }
                if (selected == null) Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(start = sideWidth).padding(horizontal = 12.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Surface(shape = CircleShape, color = Panel) { IconButton({ selected = null; frame++ }) { Icon(Icons.Outlined.CenterFocusStrong, "모든 장소 보기") } }
                    }
                    if (state.error != null || mapError != null) Surface(shape = RoundedCornerShape(12.dp), color = Panel) { Text(state.error ?: mapError.orEmpty(), Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall, color = Muted) }
                    Surface(shape = RoundedCornerShape(20.dp), color = Panel, border = BorderStroke(1.dp, Hairline)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            MapAction("일정", Icons.Outlined.FormatListBulleted) { selected = null; schedule = true }
                            MapAction("여행 자료", Icons.Outlined.Description) { onResources(TravelContext(currentDay)) }
                            MapAction("AI", Icons.Outlined.ChatBubbleOutline) { onChat(travelContext) }
                            MapAction("장소 추가", Icons.Outlined.Add) { add() }
                        }
                    }
                }
            } else Surface(Modifier.align(Alignment.TopEnd).padding(12.dp), shape = CircleShape, color = Panel.copy(alpha = .9f)) {
                IconButton({ controls = true }) { Icon(Icons.Outlined.Tune, "조작부 표시") }
            }
            if (!playback.playing && panelExpanded) Surface(Modifier.align(Alignment.TopStart).then(if (wide) Modifier.width(sideWidth).fillMaxHeight() else Modifier.padding(start = 12.dp, top = if (controls) 78.dp else 12.dp)
                .width((maxWidth * .6f).coerceAtMost(250.dp)).heightIn(max = stageHeight * .52f)).testTag("day-card").then(if (!preparationInline) Modifier.daySwipe() else Modifier),
                shape = RoundedCornerShape(if (wide) 0.dp else 14.dp), color = Panel.copy(alpha = .96f), border = BorderStroke(1.dp, Hairline)) {
                if (preparationInline && !preparationOpen) PreparationSheet(preparation, detail.trip.calendarLabel(0, today), embedded = true,
                    onResize = { preparationOpen = true }) { preparationInline = false }
                else if (!preparationInline) Column {
                    if (wide) Text("나의 일정", Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton({ step(-1) }, enabled = currentDay == null || days.indexOf(currentDay) > 0, modifier = Modifier.size(40.dp, 48.dp)) { Icon(Icons.Outlined.ChevronLeft, "이전 날짜") }
                        Column(Modifier.weight(1f).heightIn(min = 56.dp).clickable { dayOpen = false }.padding(vertical = 8.dp)
                            .semantics { contentDescription = "Day 일정 접기" }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Text(currentDay?.let { if (it == 0) "출국 전날" else "Day $it" } ?: "전체 일정", style = MaterialTheme.typography.labelLarge)
                            Text(currentDay?.let { detail.trip.calendarLabel(it, today) } ?: "${stops.size}곳", style = MaterialTheme.typography.labelSmall, color = Muted, maxLines = 1)
                            Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.ExpandLess, null, Modifier.size(16.dp), tint = Muted); Text("접기", color = Muted, style = MaterialTheme.typography.labelSmall) }
                        }
                        IconButton({ step(1) }, enabled = currentDay == null || days.indexOf(currentDay) < days.lastIndex, modifier = Modifier.size(40.dp, 48.dp)) { Icon(Icons.Outlined.ChevronRight, "다음 날짜") }
                    }
                    if (panelExpanded) {
                        ProgressSummary(stops, progressState, progress, onTracking, compact = true)
                        if (currentDay == 0 || currentDay == 1) TextButton(::showPreparation) { Icon(Icons.Outlined.Checklist, null, Modifier.size(18.dp)); Text("출국 전날 Todo", style = MaterialTheme.typography.labelSmall) }
                        if (currentDay != null) TextButton({ accommodationOpen = true }, Modifier.semantics { contentDescription = "${if (currentDay == 0) "출국 전날" else "Day $currentDay"} 숙소 정보" }) { Icon(Icons.Outlined.Home, null, Modifier.size(18.dp)); Text("숙소 정보", style = MaterialTheme.typography.labelSmall) }
                        HorizontalDivider(color = Hairline)
                        LazyColumn(Modifier.weight(1f, fill = false).testTag("day-stop-list"), contentPadding = PaddingValues(4.dp)) {
                            items(stops, key = { it.id }) { stop ->
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Row(Modifier.weight(1f).heightIn(min = 44.dp).clickable { selected = stop.id; schedule = false }
                                    .background(if (selected == stop.id) Raised else androidx.compose.ui.graphics.Color.Transparent, RoundedCornerShape(8.dp)).padding(horizontal = 4.dp, vertical = 6.dp)
                                    .semantics { contentDescription = "${stop.name} 지도에서 보기" }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Box(Modifier.size(22.dp).background(AirBlue, CircleShape), contentAlignment = Alignment.Center) { Text(if (stop.mode == "flight") "✈" else ordinals[stop.id].toString(), color = Ink, style = MaterialTheme.typography.labelSmall) }
                                    if (!largeText) stop.time?.takeIf { it.isNotBlank() }?.let { Text(it.take(5), color = Muted, style = MaterialTheme.typography.labelSmall) }
                                    Column(Modifier.weight(1f)) {
                                        if (largeText) stop.time?.takeIf { it.isNotBlank() }?.let { Text(it.take(5), color = Muted, style = MaterialTheme.typography.labelSmall) }
                                        Text(stop.displayName(), maxLines = if (largeText) 2 else 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall,
                                            textDecoration = if (progressState.data?.entry(stop)?.done == true) androidx.compose.ui.text.style.TextDecoration.LineThrough else null,
                                            color = if (progressState.data?.entry(stop)?.done == true) Muted else MaterialTheme.colorScheme.onSurface)
                                    }
                                }
                                StopProgressCheck(stop, progressState, progress, compact = true)
                                }
                            }
                            if (stops.isEmpty()) item { Text("이 날은 아직 비어 있어요", Modifier.padding(12.dp), color = Muted, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton({ choosingDay = true }) { Text("날짜 선택", style = MaterialTheme.typography.labelSmall) }
                        TextButton({ selected = null; schedule = true }) { Text("상세 일정", style = MaterialTheme.typography.labelSmall) }
                    }
                }
            }
            if (!playback.playing && !panelExpanded) Surface(Modifier.align(Alignment.TopStart).padding(start = 12.dp, top = if (controls || wide) 78.dp else 12.dp),
                shape = RoundedCornerShape(24.dp), color = Panel.copy(alpha = .96f), border = BorderStroke(1.dp, Hairline)) {
                TextButton({ dayOpen = true; if (!wide) selected = null }, Modifier.testTag("day-collapsed").semantics { contentDescription = "Day 일정 펼치기" }, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)) {
                    Icon(Icons.Outlined.CalendarMonth, null, Modifier.size(18.dp))
                    Text((currentDay?.let { if (it == 0) "출국 전날" else "Day $it" } ?: "전체 일정") + " · 펼치기", Modifier.padding(horizontal = 8.dp), style = MaterialTheme.typography.labelMedium)
                    Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp))
                }
            }
            if (selected == null && (state.routing || state.routeError != null)) Surface(Modifier.align(Alignment.BottomStart).padding(start = sideWidth + 12.dp, end = 12.dp, bottom = if (controls || wide) 160.dp else 38.dp),
                shape = RoundedCornerShape(12.dp), color = Panel.copy(alpha = .96f), border = BorderStroke(1.dp, Hairline)) {
                Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (state.routing) "길을 따라 경로를 찾는 중…" else state.routeError.orEmpty(), Modifier.weight(1f, fill = false), style = MaterialTheme.typography.bodySmall, color = Muted)
                    if (!state.routing) TextButton({ model.routes(currentDay, retry = true) }) { Text("다시 시도") }
                }
            }
            if (playback.playing) Surface(Modifier.align(Alignment.TopStart).padding(start = sideWidth + 12.dp, top = 12.dp), color = Panel, shape = RoundedCornerShape(24.dp)) { TextButton({ playback.stop(); selected = null }) { Icon(Icons.Outlined.Stop, null); Text("경로 재생 멈추기") } }
            detail.stops.find { it.id == selected && !playback.playing }?.let { stop ->
                Surface(Modifier.align(Alignment.BottomStart).padding(start = sideWidth + 12.dp, end = 12.dp, bottom = 28.dp)
                    .widthIn(max = 340.dp).fillMaxWidth().heightIn(max = (stageHeight * .46f).coerceAtMost(380.dp)).testTag("map-place-card"),
                    shape = RoundedCornerShape(16.dp), color = Panel, border = BorderStroke(1.dp, Hairline)) {
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        Row(Modifier.padding(start = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Day ${stop.day}" + (stop.time?.let { " · $it" } ?: ""), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = Muted)
                            IconButton({ selected = null }) { Icon(Icons.Outlined.Close, "장소 정보 닫기") }
                        }
                        TextButton(::overview, Modifier.padding(horizontal = 8.dp)) {
                            Icon(Icons.Outlined.ZoomOutMap, null, Modifier.size(16.dp)); Text("전체 일정 보기", Modifier.padding(start = 6.dp))
                        }
                        stop.choice?.let { choice ->
                            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("${choice.label} · ${if (choice.kind == "meal") "식사" else "선택 일정"}", style = MaterialTheme.typography.titleMedium)
                                Text(if (stop.pendingChoice()) "${choice.candidates.size}곳 중 선택하면 경로가 확정됩니다." else "선택한 경로 · 다른 후보로 바꿀 수 있어요", color = Muted, style = MaterialTheme.typography.bodySmall)
                                if (stop.pendingChoice()) Text(if (choiceRoutes.loading) "후보 경로를 확인하는 중…" else if (choiceRoutes.failed) "일부 후보 경로를 불러오지 못했어요." else "점선은 후보 경로입니다.", color = Muted, style = MaterialTheme.typography.bodySmall)
                                choice.candidates.forEachIndexed { index, candidate ->
                                    OutlinedButton({ model.selectChoice(stop, candidate.id) { progress.refresh() } }, enabled = !state.saving && !progressState.busy,
                                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                                        Text("${if (candidate.id == choice.selectedId) "✓" else ('A' + index)} ${candidate.name}")
                                    }
                                }
                                if (!stop.pendingChoice()) TextButton({ model.selectChoice(stop, null) { progress.refresh() } }, enabled = !state.saving && !progressState.busy) { Text("선택 해제 · 다시 고르기") }
                                if (state.saving) LinearProgressIndicator(Modifier.fillMaxWidth())
                                ErrorNotice(state.formError) { model.resetForm(); model.refresh(force = true) }
                            }
                        }
                        if (!stop.pendingChoice()) MapPlaceDetails(stop, detail.attachments.forStop(stop), progressState, progress, onTracking, detail.trip, photos,
                            onEdit = { edit(stop) }, onDocument = { doc -> onResources(TravelContext(stop.day, stop.id, listOf(doc.sha256))) },
                            onResources = { onResources(TravelContext(stop.day, stop.id)) }, onChat = { onChat(TravelContext(stop.day, stop.id)) })
                    }
                }
            }
        }
    }
    currentLocation.error?.let { message -> AlertDialog(onDismissRequest = currentLocation.dismiss,
        title = { Text("현재 위치") }, text = { Text(message) },
        confirmButton = { TextButton(currentLocation.settings) { Text("위치 설정") } },
        dismissButton = { TextButton(currentLocation.dismiss) { Text("닫기") } }) }
    if (choosingDay && detail != null) ModalBottomSheet(onDismissRequest = { choosingDay = false }, containerColor = Panel) {
        LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(24.dp)) {
            item { Text("여행 날짜", style = MaterialTheme.typography.headlineSmall); TextButton({ changeDay(nearestDay(detail.trip, days, today)); choosingDay = false }) { Text("오늘과 가장 가까운 일정") } }
            item { TextButton({ changeDay(null); choosingDay = false }, Modifier.fillMaxWidth()) { Text("전체 일정") } }
            items(days) { n -> TextButton({ changeDay(n); choosingDay = false }, Modifier.fillMaxWidth()) { Text("${dayLabel(n)} · ${detail.trip.calendarLabel(n, today)}") } }
            item { TextButton({ changeDay((days.maxOrNull() ?: 1) + 1); choosingDay = false }, enabled = days.max() < 3650) { Text("새 일차") } }
        }
    }
    if (schedule && detail != null) ModalBottomSheet(onDismissRequest = { schedule = false }, containerColor = Panel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        LazyColumn(Modifier.fillMaxWidth().testTag("schedule-list").daySwipe(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Row(verticalAlignment = Alignment.CenterVertically) {
                Text(currentDay?.let { "${dayLabel(it)} · ${detail.trip.dayDate(it)}" } ?: "전체 일정", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                IconButton({ add() }) { Icon(Icons.Outlined.Add, "장소 추가") }
                IconButton({ schedule = false }) { Icon(Icons.Outlined.Close, "일정 닫기") }
            } }
            if (currentDay != null) item { TextButton(::overview) { Icon(Icons.Outlined.ZoomOutMap, null); Text("전체 일정 보기") } }
            if (state.formError != null) item { ErrorNotice(state.formError) }
            if (state.routeError != null) item { ErrorNotice(state.routeError) }
            item { ProgressSummary(stops, progressState, progress, onTracking) }
            if (remaining.size > 1) item {
                OutlinedButton(::startPlayback, enabled = playbackPlan.ready, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.PlayArrow, null); Text(currentDay?.let { "${it}일차 따라가기" } ?: "전체 경로 따라가기") }
                if (!playbackPlan.ready) Text(if (state.routing) "경로 준비 중" else "도로 경로 확인 필요", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
            if (stops.isNotEmpty() && remaining.isEmpty()) item { Text("이 일정은 모두 완료했어요. 체크를 해제하면 경로에 다시 포함됩니다.", color = AirBlue) }
            if (currentDay == null || currentDay == 0 || currentDay == 1) item { OutlinedButton(::showPreparation, Modifier.fillMaxWidth()) { Text("출국 전날 Todo") } }
            if (stops.isEmpty()) item { AiroCard { Text("비워둔 하루도 좋아요", style = MaterialTheme.typography.titleLarge); Text("장소를 찾아 추가하거나 지도를 길게 눌러보세요.", color = Muted); PrimaryButton("첫 장소 추가", { add() }) } }
            items(stops, key = { it.id }) { stop ->
                val dayStops = stops.filter { it.day == stop.day }
                val index = dayStops.indexOf(stop)
                StopCard(stop, index + 1, selected == stop.id, { selected = stop.id; schedule = false }, { edit(stop) },
                    index > 0 && !state.saving, index < dayStops.lastIndex && !state.saving, { model.moveStop(stop, index - 1) }, { model.moveStop(stop, index + 1) },
                    detail.attachments.forStop(stop), onDocument = { doc -> onResources(TravelContext(currentDay, stop.id, listOf(doc.sha256))) },
                    onResources = { onResources(TravelContext(currentDay, stop.id)) }, onChat = { onChat(TravelContext(currentDay, stop.id)) })
            }
        }
    }
    if (editor && detail != null) StopEditorSheet(detail.stops.find { it.id == editingId }, currentDay ?: 1, pickedLat, pickedLng, state,
        onDismiss = { editor = false }, onSearch = model::search,
        onSave = { input -> model.saveStop(editingId, input) { day = input.day; editor = false; frame++ } },
        onDelete = editingId?.let { id -> { model.deleteStop(id) { editor = false; selected = null; frame++ } } })
    if (tripForm && detail != null) TripFormSheet(detail.trip, state.saving, state.formError, { tripForm = false }) { model.updateTrip(it) { tripForm = false } }
    if (preparationOpen && detail != null) PreparationSheet(preparation, detail.trip.calendarLabel(0, today), onResize = { preparationOpen = false }) { preparationOpen = false; preparationInline = false }
    if (accommodationOpen && currentDay != null) DayAccommodationSheet(currentDay, detail?.stops.orEmpty().filter { it.day == currentDay && isAccommodation(it) }, onClose = { accommodationOpen = false })
    if (deleteTrip && detail != null) AlertDialog(onDismissRequest = { if (!state.saving) deleteTrip = false },
        title = { Text("여행을 삭제할까요?") }, text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("‘${detail.trip.title}’의 일정과 여행 자료가 함께 삭제됩니다. 되돌릴 수 없습니다.")
            ErrorNotice(state.formError)
        } }, confirmButton = { TextButton(onClick = { model.deleteTrip(onBack) }, enabled = !state.saving) { Text(if (state.saving) "삭제 중…" else "여행 삭제", color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton(onClick = { deleteTrip = false }, enabled = !state.saving) { Text("취소") } })
}

@Composable private fun MapAction(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, click: () -> Unit) {
    TextButton(click, contentPadding = PaddingValues(horizontal = 4.dp, vertical = 10.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) { Icon(icon, null, Modifier.size(22.dp)); Text(label, style = MaterialTheme.typography.labelSmall) }
    }
}
@Composable private fun StopCard(stop: Stop, number: Int, selected: Boolean, onSelect: () -> Unit, onEdit: () -> Unit,
    canMoveUp: Boolean, canMoveDown: Boolean, onMoveUp: () -> Unit, onMoveDown: () -> Unit,
    attachments: TripAttachments, onDocument: (TripDocument) -> Unit, onResources: () -> Unit, onChat: () -> Unit) {
    val context = LocalContext.current
    var mapError by remember { mutableStateOf(false) }
    fun open(url: String) { try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: ActivityNotFoundException) { mapError = true } }
    Surface(onClick = onSelect, shape = RoundedCornerShape(16.dp), color = if (selected) Raised else Panel, border = BorderStroke(1.dp, if (selected) AirBlue else Hairline), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(28.dp).background(AirBlue, CircleShape), contentAlignment = Alignment.Center) { Text(number.toString(), color = Ink, style = MaterialTheme.typography.labelMedium) }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(stop.time?.take(5) ?: "시간 미정", color = AirBlue, style = MaterialTheme.typography.labelSmall)
                    Text(stop.displayName(), style = MaterialTheme.typography.titleMedium)
                }
                IconButton(onEdit, Modifier.size(48.dp)) { Icon(Icons.Outlined.Edit, "${stop.name} 편집", modifier = Modifier.size(18.dp), tint = Muted) }
            }
            if (stop.mode == "flight") Text("항공편으로 도착", color = AirBlue, style = MaterialTheme.typography.labelSmall)
            attachments.reservations.forEach { r -> Text("${r.name} · ${bookingLabels[r.bookingStatus]} · ${paymentLabels[r.paymentStatus]}", color = AirBlue, style = MaterialTheme.typography.bodySmall) }
            attachments.documents.forEach { doc -> OutlinedButton({ onDocument(doc) }, Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Description, null); Text(doc.name, Modifier.weight(1f).padding(start = 8.dp)) } }
            bookingLinks(stop, attachments.reservations).forEach { link -> TextButton({ if (!openBookingLink(context, link.url)) mapError = true }) { Text(link.label) } }
            if (!stop.note.isNullOrBlank()) PlaceNote(stop.name, stop.note)
            if (selected) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("방문 순서", color = Muted, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                    IconButton(onMoveUp, enabled = canMoveUp) { Icon(Icons.Outlined.KeyboardArrowUp, "${stop.name} 앞 순서로") }
                    IconButton(onMoveDown, enabled = canMoveDown) { Icon(Icons.Outlined.KeyboardArrowDown, "${stop.name} 뒤 순서로") }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton({ open("geo:${stop.lat},${stop.lng}?q=${Uri.encode(stop.mapQuery ?: "${stop.lat},${stop.lng}(${stop.name})")}") }) { Text("지도 앱에서 열기") }
                    TextButton(onResources) { Text("자료·예약 관리") }
                    TextButton(onChat) { Text("이 장소로 AI 대화") }
                }
            }
            if (mapError) Text("주소를 열 수 있는 앱을 찾지 못했습니다.", color = Muted, style = MaterialTheme.typography.bodySmall)
        }
    }
}
