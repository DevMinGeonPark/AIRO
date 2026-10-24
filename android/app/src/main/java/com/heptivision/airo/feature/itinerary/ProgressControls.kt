package com.heptivision.airo.feature.itinerary

import android.Manifest
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*
import kotlinx.coroutines.delay

/** Foreground platform LocationManager only, explicitly started by the user; no location history. */
@Composable fun progressTracking(model: ProgressViewModel): () -> Unit {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val state by model.state.collectAsStateWithLifecycle()
    fun allowed(permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) model.tracking(true)
        else model.locationStatus("위치 권한이 꺼져 있어요. 직접 체크하거나 앱 설정에서 허용해 주세요.")
    }
    LaunchedEffect(model, owner) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            model.active(true)
            try {
                model.refresh()
                var ticks = 0
                while (true) { delay(1000); model.automatic(); if (++ticks % 60 == 0) model.refresh() }
            } finally { model.active(false) }
        }
    }
    LifecycleResumeEffect(model, state.tracking) {
        val manager = context.getSystemService(LocationManager::class.java)
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) { model.location(ProgressPosition(location.latitude, location.longitude, location.accuracy.toDouble(), location.time)) }
            override fun onProviderDisabled(provider: String) { model.locationStatus("기기 위치 설정을 확인하거나 직접 체크해 주세요.") }
            override fun onProviderEnabled(provider: String) = Unit
            @Deprecated("Platform legacy callback") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }
        if (state.tracking) {
            if (!allowed(Manifest.permission.ACCESS_FINE_LOCATION) && !allowed(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                model.tracking(false); model.locationStatus("위치 권한이 꺼져 있어요. 직접 체크하거나 앱 설정에서 허용해 주세요.")
            } else try {
                val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter {
                    (it != LocationManager.GPS_PROVIDER || allowed(Manifest.permission.ACCESS_FINE_LOCATION)) && manager.isProviderEnabled(it)
                }
                if (providers.isEmpty()) model.locationStatus("기기 위치 설정을 확인하거나 직접 체크해 주세요.")
                providers.forEach {
                    manager.requestLocationUpdates(it, 3000L, 0f, listener, Looper.getMainLooper())
                    manager.getLastKnownLocation(it)?.let(listener::onLocationChanged)
                }
            } catch (_: SecurityException) { model.tracking(false); model.locationStatus("위치 권한을 확인해 주세요.") }
        }
        onPauseOrDispose { manager.removeUpdates(listener) }
    }
    return {
        if (state.tracking) model.tracking(false)
        else if (allowed(Manifest.permission.ACCESS_FINE_LOCATION) || allowed(Manifest.permission.ACCESS_COARSE_LOCATION)) model.tracking(true)
        else permission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
    }
}

@Composable fun StopProgressCheck(stop: Stop, state: ProgressState, model: ProgressViewModel, compact: Boolean = false) {
    val done = state.data?.entry(stop)?.done == true
    val scale = remember(stop.id) { Animatable(1f) }
    var before by remember(stop.id) { mutableStateOf(done) }
    val tint by animateColorAsState(if (done) Color(0xFF76D8AC) else Muted, tween(180), label = "completion-color")
    LaunchedEffect(done) {
        val changed = before != done; before = done
        if (changed && done && android.animation.ValueAnimator.areAnimatorsEnabled()) {
            scale.snapTo(1f); scale.animateTo(1.3f, tween(110)); scale.animateTo(1f, tween(220))
        } else scale.snapTo(1f)
    }
    val icon: @Composable () -> Unit = {
        Icon(if (done) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked, if (compact) "${stop.name} 일정 완료" else null,
            tint = tint, modifier = Modifier.size(18.dp).graphicsLayer { scaleX = scale.value; scaleY = scale.value })
    }
    val semantics = Modifier.semantics { stateDescription = if (done) "완료" else "미완료" }
    val toggle = { model.toggle(stop) }
    if (compact) IconButton(toggle, enabled = state.data != null && !stop.pendingChoice(), modifier = semantics.size(44.dp)) { icon() }
    else TextButton(toggle, enabled = state.data != null && !stop.pendingChoice(), modifier = semantics) { icon(); Text(if (done) "완료" else "완료 체크", Modifier.padding(start = 6.dp)) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ProgressSummary(stops: List<Stop>, state: ProgressState, model: ProgressViewModel, onTracking: () -> Unit, compact: Boolean = false) {
    var settings by rememberSaveable { mutableStateOf(false) }
    var mode by rememberSaveable { mutableStateOf("either") }
    Column(Modifier.fillMaxWidth().padding(if (compact) 8.dp else 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(state.data?.let { "일정 완료 ${stops.count { s -> it.entry(s)?.done == true }} / ${stops.size}" } ?: "진행 상태 확인 중…", Modifier.weight(1f), style = MaterialTheme.typography.labelMedium)
            Box(Modifier.size(12.dp)) { if (state.busy) CircularProgressIndicator(Modifier.fillMaxSize(), strokeWidth = 1.5.dp) }
            if (compact) IconButton({ settings = true }, modifier = Modifier.size(36.dp, 40.dp)) { Icon(Icons.Outlined.Tune, "시간·GPS 자동 체크 설정", Modifier.size(18.dp)) }
        }
        if (!compact) {
            if (state.busy) Text("${state.pendingCount}개 변경 저장 중…", color = Muted, style = MaterialTheme.typography.labelSmall)
            TextButton({ settings = true }) { Text("시간·GPS 자동 체크 설정") }
        }
        state.error?.let {
            if (compact) TextButton(model::refresh) { Text("저장 실패 · 다시 확인", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error) }
            else { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall); TextButton(model::refresh) { Text("진행 상태 다시 불러오기") } }
        }
    }
    if (settings) ModalBottomSheet(onDismissRequest = { settings = false }, containerColor = Panel,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("시간·GPS 자동 체크", style = MaterialTheme.typography.titleLarge)
            Text("현재 표시한 ${stops.size}곳에 적용합니다. 오늘 일정의 예정 시간이 지나거나 도착 범위 안에 들어오면 완료해요. 여행 화면을 열어둔 동안 동작합니다.", style = MaterialTheme.typography.bodySmall, color = Muted)
            OptionMenu("체크 방법", mode, progressModes) { mode = it }
            val zone = state.data?.timeZone ?: "Asia/Seoul"
            val zones = (listOf(zone, "Asia/Seoul", "Asia/Tokyo", "Asia/Taipei", "Asia/Singapore", "Asia/Bangkok", "Europe/Paris", "Europe/London", "America/New_York", "America/Los_Angeles", "Pacific/Honolulu", "UTC")).distinct()
            OptionMenu("일정 시간대", zone, zones.associateWith { it }, state.data != null) { model.change(ProgressMutation(action = "timezone", timeZone = it)) }
            Text("시간이 없는 장소는 ‘위치 또는 시간’에서 GPS로만 판단해요. 직접 해제한 일정은 다시 자동 체크하지 않아요.", style = MaterialTheme.typography.bodySmall, color = Muted)
            PrimaryButton("이 일정에 적용", {
                if (model.configure(stops, mode)) {
                    if (mode in listOf("location", "either") && !state.tracking) onTracking()
                    settings = false
                }
            }, enabled = state.data != null && stops.isNotEmpty())
            LocationProgressControl(state, onTracking)
            ErrorNotice(state.error)
            TextButton({ settings = false }) { Text("닫기") }
        }
    }
}

@Composable fun ProgressDetails(stop: Stop, startDate: String?, state: ProgressState, model: ProgressViewModel, onTracking: () -> Unit) {
    val entry = state.data?.entry(stop)
    val rule = state.data?.rule(stop) ?: ProgressRule(stop.progressKey())
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalDivider(color = Hairline)
        Row { Text("일정 진행", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall); StopProgressCheck(stop, state, model) }
        if (entry?.done == true) Text("${when(entry.source) { "time" -> "시간 자동 체크"; "location" -> "위치 자동 체크"; else -> "직접 체크" }} · ${entry.completedAt?.let { java.time.Instant.parse(it).atZone(java.time.ZoneId.of(state.data?.timeZone ?: "Asia/Seoul")).format(java.time.format.DateTimeFormatter.ofPattern("M/d HH:mm")) }}", color = Muted, style = MaterialTheme.typography.bodySmall)
        val modes = progressModes.filterKeys { it == "manual" || startDate != null && (it == "location" || validStopTime(stop.time)) }
        OptionMenu("${stop.name} 체크 방법", rule.mode, modes, state.data != null) { model.change(ProgressMutation(action = "rule", rule = rule.copy(mode = it))) }
        if (startDate == null) Text("자동 체크를 쓰려면 여행 설정에서 시작일을 정해 주세요.", color = Muted, style = MaterialTheme.typography.bodySmall)
        else if (!validStopTime(stop.time)) Text("시간 자동 체크에는 일정의 HH:mm 시간이 필요해요.", color = Muted, style = MaterialTheme.typography.bodySmall)
        if (rule.mode in listOf("location", "either")) {
            OptionMenu("${stop.name} 도착 범위", rule.radiusMeters.toString(), listOf(100, 150, 300, 500, 1000).associate { it.toString() to "${it}m 이내" }, state.data != null) { model.change(ProgressMutation(action = "rule", rule = rule.copy(radiusMeters = it.toInt()))) }
            LocationProgressControl(state, onTracking)
        }
        if (rule.mode in listOf("time", "either")) Text("예정일 ${stop.time} 이후 체크 · ${state.data?.timeZone}", color = Muted, style = MaterialTheme.typography.bodySmall)
        if (entry?.source == "manual" && !entry.done) Text("직접 해제한 일정입니다. 자동 체크가 일시 정지됐어요.", color = Muted, style = MaterialTheme.typography.bodySmall)
        if (entry != null && rule.mode != "manual") TextButton({ model.change(ProgressMutation(action = "resume", stopId = stop.progressKey())) }, enabled = state.data != null && !stop.pendingChoice()) { Text("체크 초기화·자동 체크 다시 허용") }
        ErrorNotice(state.error)
    }
}

@Composable private fun LocationProgressControl(state: ProgressState, toggle: () -> Unit) {
    TextButton(toggle, enabled = state.data?.rules?.any { it.mode in listOf("location", "either") } == true) { Text(if (state.tracking) "위치 자동 체크 중지" else "위치 자동 체크 시작") }
    state.locationStatus?.let { Text(it, color = Muted, style = MaterialTheme.typography.bodySmall) }
}

@Composable fun OptionMenu(label: String, value: String, options: Map<String, String>, enabled: Boolean = true, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Text(label, style = MaterialTheme.typography.labelSmall, color = Muted)
    Box {
        OutlinedButton({ expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(options[value] ?: value) }
        DropdownMenu(expanded, { expanded = false }) { options.forEach { (key, title) -> DropdownMenuItem(text = { Text(title) }, onClick = { expanded = false; onSelect(key) }) } }
    }
}
