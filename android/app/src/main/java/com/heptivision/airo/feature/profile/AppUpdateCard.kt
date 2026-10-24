package com.heptivision.airo.feature.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.BuildConfig
import com.heptivision.airo.core.design.*
import com.heptivision.airo.data.update.AndroidUpdateInstaller
import java.util.Locale

@Composable fun AppUpdateCard(model: UpdateViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val installer = remember(context) { AndroidUpdateInstaller(context) }
    var showPermission by rememberSaveable { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        model.message(if (installer.canInstall()) "설치 권한을 허용했어요. ‘지금 설치’를 눌러 이어가세요."
            else "설치 권한을 허용하지 않았어요. 파일은 보관되어 있어요.")
    }
    val installation = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        model.message("설치 화면을 닫았어요. 설치를 취소했다면 다시 진행할 수 있어요.")
    }
    LaunchedEffect(model, installer) {
        model.installationFiles.collect { file ->
            try {
                if (installer.canInstall()) installation.launch(installer.installIntent(file))
                else showPermission = true
            } catch (_: Exception) { model.report("설치 화면을 열지 못했어요. 기기의 앱 설치 설정을 확인해 주세요.") }
        }
    }
    AiroCard {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Outlined.SystemUpdate, null, tint = AirBlue)
            Text("앱 업데이트", style = MaterialTheme.typography.titleMedium)
        }
        Text("현재 버전 ${BuildConfig.VERSION_NAME}", color = Muted, style = MaterialTheme.typography.bodyMedium)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            when (state.phase) {
                UpdatePhase.IDLE -> Text("새 버전이 있는지 확인해 보세요.")
                UpdatePhase.CHECKING -> { LinearProgressIndicator(Modifier.fillMaxWidth()); Text("업데이트 확인 중…") }
                UpdatePhase.LATEST -> Text("최신 버전을 사용하고 있어요.", color = AirBlue)
                else -> state.release?.let { release ->
                    Text("새 버전 ${release.artifact.version}", style = MaterialTheme.typography.titleSmall)
                    Text("${release.releasedAt.take(10)} · ${String.format(Locale.KOREA, "%.1f", release.artifact.bytes / 1048576.0)} MB", color = Muted)
                    release.releaseNotes.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium) }
                }
            }
            if (state.phase == UpdatePhase.DOWNLOADING) {
                val total = state.release?.artifact?.bytes ?: 1L
                val fraction = (state.received.toFloat() / total).coerceIn(0f, 1f)
                LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
                Text(if (fraction == 1f) "설치 파일 검증 중…" else "다운로드 중 ${(fraction * 100).toInt()}%")
                TextButton(onClick = model::cancel) { Text("다운로드 취소") }
            }
            if (state.phase == UpdatePhase.VERIFYING) { LinearProgressIndicator(Modifier.fillMaxWidth()); Text("설치 파일 확인 중…") }
            if (state.phase == UpdatePhase.READY) Text("다운로드 완료 · 설치할 준비가 됐어요.", color = AirBlue)
            state.message?.let { Text(it, color = Muted, style = MaterialTheme.typography.bodyMedium) }
        }
        ErrorNotice(state.error)
        if (state.phase == UpdatePhase.AVAILABLE) {
            Text("다운로드할 때 데이터가 사용돼요. Wi-Fi 연결을 권장합니다.", color = Muted, style = MaterialTheme.typography.bodySmall)
            PrimaryButton("업데이트 다운로드", model::download)
        }
        if (state.phase == UpdatePhase.READY) {
            Text("Android 설치 화면에서 업데이트를 승인해 주세요. 저장한 여행과 로그인은 유지됩니다.", color = Muted, style = MaterialTheme.typography.bodySmall)
            PrimaryButton("지금 설치", onClick = {
                if (installer.canInstall()) model.prepareInstall() else showPermission = true
            })
        }
        if (!state.busy) OutlinedButton(onClick = model::check, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("업데이트 확인") }
    }
    if (showPermission) AlertDialog(onDismissRequest = { showPermission = false }, title = { Text("업데이트 설치 허용") },
        text = { Text("다음 Android 설정에서 AIRO의 ‘이 출처 허용’을 켠 뒤 돌아와 ‘지금 설치’를 눌러 주세요.") },
        confirmButton = { TextButton(onClick = {
            showPermission = false
            try { permission.launch(installer.permissionIntent()) }
            catch (_: Exception) { model.report("설정 화면을 열지 못했어요. Android 설정에서 AIRO의 앱 설치 권한을 확인해 주세요.") }
        }) { Text("설정 열기") } }, dismissButton = { TextButton(onClick = { showPermission = false }) { Text("나중에") } })
}
