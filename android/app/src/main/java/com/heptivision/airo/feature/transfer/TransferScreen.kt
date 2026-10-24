package com.heptivision.airo.feature.transfer

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.core.design.*
import kotlinx.coroutines.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun TransferScreen(model: TransferViewModel, onOpen: (String) -> Unit, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val importing = model.tripId == null
    val chooseInput = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) model.read { context.contentResolver.openInputStream(uri) }
    }
    val chooseOutput = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val text = model.preparedExport
        if (uri != null && text != null) scope.launch {
            try { withContext(Dispatchers.IO) { requireNotNull(context.contentResolver.openOutputStream(uri)).use { it.write(text.toByteArray()) } }; model.written() }
            catch (error: Exception) { if (error is CancellationException) throw error; model.report(error) }
        } else if (uri != null) model.report(IllegalArgumentException("저장할 자료를 다시 준비해 주세요."))
    }
    LaunchedEffect(model) { model.exportFiles.collect { chooseOutput.launch("airo-${model.tripId}.json") } }
    Scaffold(containerColor = Ink, topBar = { TopAppBar(title = { Text(if (importing) "여행 가져오기" else "여행 내보내기") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "뒤로") } }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Ink)) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            AiroCard {
                Icon(if (importing) Icons.Outlined.FileUpload else Icons.Outlined.FileDownload, null, tint = AirBlue, modifier = Modifier.size(32.dp))
                Text(if (importing) "준비하던 여행 그대로" else "내 여행의 사본", style = MaterialTheme.typography.headlineSmall)
                Text(if (importing) "AIRO에서 내보낸 JSON 여행 파일을 선택하세요. 일정, 예산, 즐겨찾기와 예약 자료를 함께 가져옵니다. 최대 8MB입니다." else "일정, 예산, 즐겨찾기와 예약 자료가 하나의 JSON 파일에 담깁니다. 파일 앱에서 보관할 위치를 고르세요.", color = Muted)
            }
            ErrorNotice(state.error)
            if (importing) {
                PrimaryButton("여행 파일 선택", { chooseInput.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }, busy = state.busy)
                state.archive?.let { archive -> AiroCard {
                    Text(archive.trip.title, style = MaterialTheme.typography.titleLarge)
                    Text("${archive.stops.size}개의 일정 · ${archive.documents().size}개의 예약 문서", color = Muted)
                    Text(archive.trip.startDate ?: "출발일 미정", color = Muted)
                    if (state.imported == null) PrimaryButton("이 여행 가져오기", model::import, busy = state.busy)
                } }
                state.imported?.let { result ->
                    Text(if (result.imported) "여행을 가져왔어요." else "이미 가져온 여행이에요. 기존 편집 내용은 유지됩니다.", color = AirBlue)
                    PrimaryButton("여행 열기", { onOpen(result.tripId) })
                }
            } else {
                PrimaryButton("파일로 내보내기", model::export, busy = state.busy)
                if (state.exported) Text("여행 파일을 저장했어요.", color = AirBlue)
            }
        }
    }
}
