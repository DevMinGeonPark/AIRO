package com.heptivision.airo.feature.chat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.core.design.*
import com.heptivision.airo.data.ai.AiDevice

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ChatScreen(model: ChatViewModel, onResources: () -> Unit = {}, onBudget: () -> Unit = {}, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var draft by rememberSaveable { mutableStateOf("") }
    var connections by rememberSaveable { mutableStateOf(false) }
    var selectedDevice by rememberSaveable { mutableStateOf<String?>(null) }
    var revoking by remember { mutableStateOf<AiDevice?>(null) }
    var copied by remember { mutableStateOf(false) }
    val list = rememberLazyListState()
    val ready = state.devices.firstOrNull { it.id == selectedDevice && it.ready() } ?: state.devices.firstOrNull { it.ready() }
    LaunchedEffect(state.unsentMessage) { state.unsentMessage?.let { if (draft.isEmpty()) draft = it } }
    LifecycleEventEffect(Lifecycle.Event.ON_START) { model.start() }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { model.pause() }
    DisposableEffect(model) { onDispose { model.pause() } }
    LaunchedEffect(state.messages.size, state.output) { if (list.layoutInfo.totalItemsCount > 0) list.animateScrollToItem(list.layoutInfo.totalItemsCount - 1) }
    Scaffold(containerColor = Ink, modifier = Modifier.imePadding(), topBar = {
        TopAppBar(title = { Text("AI와 계획하기") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "일정으로") } }, actions = { IconButton({ connections = true }) { Icon(Icons.Outlined.Computer, "내 AI 연결") } }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Ink))
    }, bottomBar = {
        Surface(color = Panel) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (model.ai.demo) "샘플 여행에서는 AI 연결을 사용하지 않습니다." else if (state.pending != null) "Codex · ${state.devices.find { it.id == state.pending!!.deviceId }?.name ?: "연결한 컴퓨터"}" else ready?.let { "Codex · ${it.name}" } ?: "내 컴퓨터의 Codex를 연결해 주세요.", color = Muted, style = MaterialTheme.typography.labelSmall)
            if (state.pending != null) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (state.paused) OutlinedButton(model::resume) { Text("대화 이어받기") }
                TextButton(model::cancel) { Text("대화 중지") }
                if (state.busy) CircularProgressIndicator(Modifier.padding(10.dp).size(20.dp), strokeWidth = 2.dp)
            }
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(draft, { if (it.length <= 600) draft = it }, placeholder = { Text("내일은 카페에 들르고 싶어") }, modifier = Modifier.weight(1f), maxLines = 4, enabled = state.pending == null && !model.ai.demo)
                FilledIconButton({ ready?.let { model.send(it, draft) { draft = "" } } }, enabled = ready != null && state.pending == null && draft.isNotBlank(), modifier = Modifier.size(52.dp)) { Icon(Icons.AutoMirrored.Outlined.Send, "메시지 보내기") }
            }
        } }
    }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), state = list, contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { ErrorNotice(state.connectionError) }
            state.contextLabel?.let { label -> item { AiroCard { Text("함께 활용할 자료", color = AirBlue, style = MaterialTheme.typography.labelMedium); Text(label); Text("여행에 저장된 내용과 선택한 자료를 참고해 답변합니다.", color = Muted, style = MaterialTheme.typography.bodySmall) } } }
            if (state.completed) item { AiroCard {
                Text("처리 결과 확인", style = MaterialTheme.typography.titleMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onBack) { Text("일정 확인") }; TextButton(onResources) { Text("자료·예약 확인") }; TextButton(onBudget) { Text("예산 확인") }
                }
            } }
            if (state.messages.isEmpty()) item { AiroCard {
                AiroLogo(markOnly = true)
                Text("생각을 여행으로", style = MaterialTheme.typography.headlineSmall)
                Text("가고 싶은 곳, 바꾸고 싶은 시간, 여행의 분위기를 이야기해 주세요. 연결한 컴퓨터가 켜져 있으면 여기서 이어갈 수 있어요.", color = Muted)
                TextButton({ connections = true }) { Text("내 AI 연결하기") }
            } }
            items(state.messages, key = { it.id }) { message ->
                Surface(color = if (message.role == "user") Raised else Panel, shape = androidx.compose.foundation.shape.RoundedCornerShape(18.dp)) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (message.role == "user") "나" else "Codex", color = AirBlue, style = MaterialTheme.typography.labelSmall)
                        Text(message.content, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            if (state.output.isNotEmpty()) item { AiroCard { Text("Codex", color = AirBlue, style = MaterialTheme.typography.labelSmall); Text(state.output) } }
            if (state.error != null) item { ErrorNotice(state.error) }
        }
    }
    if (connections) ModalBottomSheet(onDismissRequest = { connections = false }, containerColor = Panel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("내 AI 연결", style = MaterialTheme.typography.headlineSmall)
            Text("컴퓨터의 Codex에서 연결을 시작하고, 같은 AIRO 계정으로 승인하세요. ChatGPT 구독으로 로그인한 Codex가 필요합니다.", color = Muted)
            if (model.ai.demo) Text("계정 여행에서 내 AI를 연결할 수 있어요.", color = AirBlue)
            else PrimaryButton(if (copied) "연결 요청을 복사했어요" else "Codex 연결 요청 복사", {
                val text = "AIRO 플러그인을 설치하고 내 Codex를 아이로 앱과 연결해줘. 공식 설치 안내: ${model.ai.server}/docs/codex/install — 설치된 플러그인의 연결 스킬로 진행하고, 브라우저에서 내가 연결을 승인할 수 있게 해줘."
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("AIRO 연결 요청", text)); copied = true
            })
            ErrorNotice(state.connectionError)
            state.devices.forEach { device -> AiroCard {
                Text(device.name, style = MaterialTheme.typography.titleMedium)
                Text(device.label(), color = if (device.ready()) AirBlue else Muted)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (device.ready()) TextButton({ selectedDevice = device.id; connections = false }) { Text("이 기기 사용") }
                    if (device.revokedAt == null) TextButton({ revoking = device }) { Text("연결 해제") }
                }
            } }
            if (!model.ai.demo && state.devices.isEmpty()) Text("아직 연결한 컴퓨터가 없어요.", color = Muted)
            Text("연결한 컴퓨터가 꺼지면 대화를 처리할 수 없습니다.", color = Muted, style = MaterialTheme.typography.bodySmall)
        }
    }
    revoking?.let { device -> AlertDialog(onDismissRequest = { revoking = null }, title = { Text("연결을 해제할까요?") }, text = { Text("${device.name}의 진행 중인 대화도 중지됩니다.") }, confirmButton = { TextButton({ model.revoke(device); revoking = null }) { Text("해제") } }, dismissButton = { TextButton({ revoking = null }) { Text("취소") } }) }
}
