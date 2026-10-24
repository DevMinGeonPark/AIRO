package com.heptivision.airo.core.design

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/** A full-height reading surface with a fixed close control and its own scrolling body. */
@Composable fun SidePanel(title: String, subtitle: String, onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        var visible by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { visible = true }
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.matchParentSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose))
            AnimatedVisibility(visible, modifier = Modifier.align(Alignment.CenterEnd), enter = slideInHorizontally { it }) {
                Surface(Modifier.widthIn(max = 520.dp).fillMaxWidth(.96f).fillMaxHeight(), color = Panel, shape = RoundedCornerShape(topStart = 24.dp, bottomStart = 24.dp)) {
                    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
                        Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(subtitle, color = Muted, style = MaterialTheme.typography.labelMedium)
                                Text(title, style = MaterialTheme.typography.titleLarge)
                            }
                            IconButton(onClose) { Icon(Icons.Outlined.Close, "$subtitle 닫기") }
                        }
                        HorizontalDivider(color = Hairline)
                        content()
                    }
                }
            }
        }
    }
}
