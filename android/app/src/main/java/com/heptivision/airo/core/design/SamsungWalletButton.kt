package com.heptivision.airo.core.design

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.heptivision.airo.core.platform.*

/** Opens the installed Wallet. Adding a new pass is a separate issuer/partner flow. */
@Composable fun SamsungWalletButton() {
    val context = LocalContext.current
    var available by remember { mutableStateOf(samsungWalletAvailable(context)) }
    var failed by remember { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { available = samsungWalletAvailable(context) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedButton({ failed = !openSamsungWallet(context) }, enabled = available, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.AccountBalanceWallet, null, Modifier.size(18.dp))
            Text("삼성월렛 열기", Modifier.padding(start = 8.dp))
        }
        Text(if (!available) "삼성월렛이 설치된 지원 기기에서 열 수 있어요." else if (failed) "삼성월렛을 열지 못했어요. 앱 설치·설정을 확인해 주세요." else "월렛에 보관한 탑승권과 티켓을 확인하세요.", color = Muted, style = MaterialTheme.typography.bodySmall)
    }
}
