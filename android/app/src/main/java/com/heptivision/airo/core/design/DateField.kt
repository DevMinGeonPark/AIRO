package com.heptivision.airo.core.design

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun DateField(value: String?, onChange: (String?) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    OutlinedButton(onClick = { open = true }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
        Icon(Icons.Outlined.CalendarMonth, null, Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Text(value ?: "출발일은 나중에 정할게요", Modifier.weight(1f))
    }
    if (value != null) TextButton(onClick = { onChange(null) }) { Text("날짜 미정으로 변경") }
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = value?.let { LocalDate.parse(it).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() })
        DatePickerDialog(onDismissRequest = { open = false }, confirmButton = {
            TextButton(onClick = {
                onChange(state.selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }); open = false
            }) { Text("선택") }
        }, dismissButton = { TextButton(onClick = { open = false }) { Text("취소") } }) { DatePicker(state) }
    }
}
