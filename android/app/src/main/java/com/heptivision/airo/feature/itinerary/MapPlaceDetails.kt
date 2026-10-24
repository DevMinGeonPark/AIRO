package com.heptivision.airo.feature.itinerary

import android.content.ClipData
import android.content.ClipboardManager
import com.heptivision.airo.core.platform.openBookingLink
import com.heptivision.airo.core.platform.openPlaceMap
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.wireJson

@Composable fun MapPlaceDetails(stop: Stop, attachments: TripAttachments, state: ProgressState, progress: ProgressViewModel,
    onTracking: () -> Unit, trip: Trip, photos: com.heptivision.airo.data.photos.PlacePhotoLinks, onEdit: () -> Unit, onDocument: (TripDocument) -> Unit, onResources: () -> Unit, onChat: () -> Unit) {
    val context = LocalContext.current
    var error by remember { mutableStateOf(false) }
    val rings = remember { wireJson.decodeFromString<List<List<List<Double>>>>(context.assets.open("south-korea-rings.json").bufferedReader().use { it.readText() }) }
    val domestic = remember(stop.lat, stop.lng) { isSouthKorea(stop.lat, stop.lng, rings) }
    fun open(url: String) { error = !openPlaceMap(context, url) }
    Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SelectionContainer(Modifier.weight(1f)) { Text(stop.name, style = MaterialTheme.typography.titleSmall) }
            IconButton({ context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("AIRO 장소", stop.localPlaceName())) }) {
                Icon(Icons.Outlined.ContentCopy, "현지 장소명 복사", Modifier.size(16.dp), tint = Muted)
            }
        }
        stop.note?.takeIf { it.isNotBlank() }?.let { PlaceNote(stop.name, it) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            placeMapLinks(stop, domestic).forEach { (label, url) -> OutlinedButton({ open(url) }, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)) { Text(label, style = MaterialTheme.typography.labelSmall) } }
        }
        attachments.reservations.forEach { reservation -> Text("${reservation.name} · ${bookingLabels[reservation.bookingStatus]} · ${paymentLabels[reservation.paymentStatus]}", color = AirBlue, style = MaterialTheme.typography.bodySmall) }
        attachments.documents.forEach { doc -> OutlinedButton({ onDocument(doc) }, Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Description, null, Modifier.size(16.dp)); Text(doc.name, Modifier.weight(1f).padding(start = 8.dp), style = MaterialTheme.typography.labelSmall) } }
        bookingLinks(stop, attachments.reservations).forEach { link -> TextButton({ if (!openBookingLink(context, link.url)) error = true }) { Text(link.label, style = MaterialTheme.typography.labelSmall) } }
        if (error) Text("주소를 열 수 있는 앱을 확인해 주세요.", color = Muted, style = MaterialTheme.typography.bodySmall)
    }
    Column(Modifier.padding(horizontal = 16.dp)) { PlaceMemories(trip, stop, state.data?.timeZone ?: "Asia/Seoul", photos) }
    ProgressDetails(stop, trip.startDate, state, progress, onTracking)
    Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow { TextButton(onEdit) { Text("장소 편집", style = MaterialTheme.typography.labelSmall) }; TextButton(onResources) { Text("자료·예약 관리", style = MaterialTheme.typography.labelSmall) }; TextButton(onChat) { Text("이 장소로 AI 대화", style = MaterialTheme.typography.labelSmall) } }
    }
}
