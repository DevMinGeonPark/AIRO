package com.heptivision.airo.feature.itinerary

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.notePins
import com.heptivision.airo.core.model.notePreview

@Composable fun PlaceNote(name: String, note: String) {
    var open by rememberSaveable(name, note) { mutableStateOf(false) }
    val pins = remember(note) { notePins(note) }
    Surface(onClick = { open = true }, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).semantics { contentDescription = "$name 메모 펼치기" },
        shape = RoundedCornerShape(16.dp), color = Raised, border = BorderStroke(1.dp, Hairline)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (pins.isEmpty()) "메모" else "PIN · 메모", Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
                Text("펼치기", style = MaterialTheme.typography.labelMedium, color = AirBlue)
                Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp), tint = AirBlue)
            }
            pins.firstOrNull()?.let { Text(it.value, fontSize = 28.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold) }
            Text(notePreview(note).joinToString("\n"), maxLines = 3, overflow = TextOverflow.Ellipsis, color = Muted,
                style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 24.sp))
        }
    }
    if (open) SidePanel(name, "장소 메모", onClose = { open = false }) {
        val context = LocalContext.current
        var copied by remember(note) { mutableStateOf<String?>(null) }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).testTag("place-note-body").padding(24.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)) {
            pins.forEach { pin ->
                Surface(Modifier.fillMaxWidth(), color = Raised, shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, Hairline)) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(pin.label, color = Muted, style = MaterialTheme.typography.labelLarge)
                        SelectionContainer { Text(pin.value, fontSize = if (pin.value.length > 10) 32.sp else 44.sp, lineHeight = 54.sp, fontWeight = FontWeight.Bold) }
                        OutlinedButton({
                            context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("PIN", pin.value))
                            copied = pin.value
                        }) { Icon(Icons.Outlined.ContentCopy, null, Modifier.size(18.dp)); Text(if (copied == pin.value) "복사됨" else "PIN 복사", Modifier.padding(start = 8.dp)) }
                    }
                }
            }
            Text("전체 메모", color = Muted, style = MaterialTheme.typography.labelLarge)
            SelectionContainer {
                Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    note.split(Regex("\\r?\\n\\s*\\r?\\n")).forEach { paragraph ->
                        Text(paragraph, style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 30.sp))
                    }
                }
            }
        }
    }
}
