package com.heptivision.airo.feature.itinerary

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.Stop
import com.heptivision.airo.core.model.placeMapLinks
import com.heptivision.airo.core.platform.openPlaceMap

fun isAccommodation(stop: Stop): Boolean = stop.mode == "stay" || Regex("숙소|호텔|hotel|hostel|airbnb|inn", RegexOption.IGNORE_CASE).containsMatchIn("${stop.name} ${stop.note.orEmpty()} ${stop.mapQuery.orEmpty()}")

@Composable fun DayAccommodationSheet(day: Int, stays: List<Stop>, onClose: () -> Unit) {
    val context = LocalContext.current
    var error by remember { mutableStateOf(false) }
    SidePanel(if (day == 0) "출국 전날" else "Day $day", "숙소 정보", onClose) {
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            if (error) item { Text("주소를 열 수 있는 앱을 확인해 주세요.", color = Muted) }
            if (stays.isEmpty()) item { AiroCard { Text("이 날에 등록된 숙소가 없습니다.", color = Muted) } }
            items(stays, key = { it.id }) { stop ->
                AiroCard {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Icon(Icons.Outlined.Home, null, tint = AirBlue); Column(Modifier.weight(1f)) { Text(stop.name, style = MaterialTheme.typography.titleMedium); Text("${stop.time?.let { "$it · " } ?: ""}숙소", color = Muted, style = MaterialTheme.typography.bodySmall) } }
                    stop.note?.takeIf { it.isNotBlank() }?.let { PlaceNote(stop.name, it) }
                    OutlinedButton({
                        error = !openPlaceMap(context, placeMapLinks(stop, false).first().second)
                    }, Modifier.fillMaxWidth().padding(top = 10.dp)) { Icon(Icons.Outlined.OpenInNew, null); Text("지도에서 열기", Modifier.padding(start = 6.dp)) }
                }
            }
        }
    }
}
