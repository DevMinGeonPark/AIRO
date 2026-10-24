package com.heptivision.airo.core.design

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.heptivision.airo.R

@Composable fun AiroLogo(modifier: Modifier = Modifier, markOnly: Boolean = false) {
    Image(painterResource(if (markOnly) R.drawable.airo_mark else R.drawable.airo_logo), "아이로 AIRO",
        modifier.then(if (markOnly) Modifier.size(40.dp) else Modifier.width(104.dp).height(42.dp)), colorFilter = ColorFilter.tint(AirBlue))
}

@Composable fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, busy: Boolean = false, enabled: Boolean = true) {
    Button(onClick, modifier.fillMaxWidth().heightIn(min = 56.dp), enabled = enabled && !busy, shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(16.dp)) {
        if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Ink)
        else Text(text)
    }
}

@Composable fun ErrorNotice(message: String?, onRetry: (() -> Unit)? = null) {
    if (message == null) return
    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Outlined.ErrorOutline, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.error)
                Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.weight(1f))
            }
            if (onRetry != null) TextButton(onClick = onRetry) { Text("다시 시도") }
        }
    }
}

@Composable fun LoadingState(label: String = "여행을 불러오고 있어요") {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 2.dp)
        Spacer(Modifier.height(16.dp))
        Text(label, color = Muted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable fun AiroCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = Panel, border = BorderStroke(1.dp, Hairline)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}
