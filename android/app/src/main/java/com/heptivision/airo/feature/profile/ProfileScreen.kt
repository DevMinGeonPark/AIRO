package com.heptivision.airo.feature.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.heptivision.airo.BuildConfig
import com.heptivision.airo.core.design.*
import com.heptivision.airo.data.auth.Account

@Composable fun ProfileScreen(account: Account, updates: UpdateViewModel, onSignOut: () -> Unit) {
    var confirm by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        AiroLogo()
        Text("내 정보", style = MaterialTheme.typography.headlineLarge)
        AiroCard {
            Icon(Icons.Outlined.AccountCircle, null, tint = AirBlue, modifier = Modifier.size(32.dp))
            Text(if (BuildConfig.DEMO) "여행자 · 데모" else account.email.ifBlank { "여행자" }, style = MaterialTheme.typography.titleMedium)
            Text(if (BuildConfig.DEMO) "실제 계정과 분리된 샘플 여행입니다." else "웹과 앱에서 같은 여행을 이어갈 수 있어요.", color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
        Text("설정", style = MaterialTheme.typography.titleLarge)
        AppUpdateCard(updates)
        AiroCard {
            Text("AIRO for Android", style = MaterialTheme.typography.titleMedium)
            Text("어디로든, AI와 함께.", color = Muted, style = MaterialTheme.typography.bodyMedium)
            HorizontalDivider()
            Text("버전 ${BuildConfig.VERSION_NAME}", color = Muted, style = MaterialTheme.typography.bodySmall)
            Text("지도 © OpenStreetMap contributors · CARTO\nAIRO · AGPL-3.0", color = Muted, style = MaterialTheme.typography.bodySmall)
        }
        OutlinedButton(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
            Icon(Icons.AutoMirrored.Outlined.Logout, null, Modifier.size(18.dp)); Spacer(Modifier.width(10.dp)); Text("로그아웃")
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("로그아웃할까요?") }, text = { Text("저장한 여행은 계정에 남아 있어요. 다시 로그인하면 이어갈 수 있습니다.") },
        confirmButton = { TextButton(onClick = { confirm = false; onSignOut() }) { Text("로그아웃") } }, dismissButton = { TextButton(onClick = { confirm = false }) { Text("취소") } })
}
