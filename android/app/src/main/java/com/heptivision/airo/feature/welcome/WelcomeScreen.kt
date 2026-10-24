package com.heptivision.airo.feature.welcome

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.heptivision.airo.R
import com.heptivision.airo.core.design.*
import com.heptivision.airo.data.trips.DemoTripRepository
import com.heptivision.airo.data.trips.readDemoRoads
import com.heptivision.airo.core.model.roadPairs

/** Existing official brand/photo assets; the interactive example never calls AI or writes an account. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun WelcomeScreen(onStart: () -> Unit) {
    var preview by rememberSaveable { mutableStateOf(false) }
    var credits by rememberSaveable { mutableStateOf(false) }
    var day by rememberSaveable { mutableIntStateOf(1) }
    val uri = LocalUriHandler.current
    Column(Modifier.fillMaxSize().background(Ink).verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            AiroLogo()
            Text("어디로든, AI와 함께.", style = MaterialTheme.typography.labelSmall, color = Muted)
        }
        Text("마음 가는 대로,\n여행은 나답게.", style = MaterialTheme.typography.displaySmall)
        Box(Modifier.fillMaxWidth().height(232.dp).clip(RoundedCornerShape(24.dp))) {
            Image(painterResource(R.drawable.rome_alley), "햇빛이 내려앉은 로마의 골목", Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Ink.copy(alpha = .85f)))))
            Column(Modifier.align(Alignment.BottomStart).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("ROME · 나만의 속도로", color = AirBlue, style = MaterialTheme.typography.labelSmall)
                Text("계획은 가볍게, 여행은 깊게.", style = MaterialTheme.typography.titleLarge)
            }
        }
        Text("떠오른 생각을 일정으로,\n일정과 예약, 예산을 한곳으로.", color = Muted, style = MaterialTheme.typography.bodyLarge)
        PrimaryButton("내 여행 시작하기", onStart)
        OutlinedButton({ preview = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), shape = RoundedCornerShape(16.dp)) { Text("예시 여행 둘러보기") }
        Text("로그인하면 웹에서 준비하던 여행을 이어갈 수 있어요.", color = Muted, style = MaterialTheme.typography.bodySmall)
        TextButton({ credits = true }, modifier = Modifier.heightIn(min = 44.dp)) { Text("사진·지도 출처", color = Muted, style = MaterialTheme.typography.labelSmall) }
    }
    if (preview) ModalBottomSheet(onDismissRequest = { preview = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Panel) {
        val context = androidx.compose.ui.platform.LocalContext.current
        val routes = remember { readDemoRoads(context) }
        val stops = remember(day) { DemoTripRepository.seed().first().stops.filter { it.day == day } }
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("로마의 오후", style = MaterialTheme.typography.headlineSmall)
            Text("예시 여행 · 미리 준비한 일정으로 둘러보세요.", color = Muted, style = MaterialTheme.typography.bodySmall)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf(1 to "골목 산책", 2 to "분수와 광장", 3 to "오래된 로마")) { (number, label) -> FilterChip(day == number, { day = number }, label = { Text(label) }) }
            }
            Box(Modifier.fillMaxWidth().height(250.dp).clip(RoundedCornerShape(20.dp))) {
                NativeMap(stops, Modifier.fillMaxSize(), offline = true, interactive = true, frameKey = "preview:$day",
                    roads = roadPairs(stops).mapNotNull { routes["${it.from.id}->${it.to.id}"]?.coordinates })
                MapAttribution(true, Modifier.align(Alignment.BottomStart).background(Ink.copy(alpha = .85f)))
            }
            stops.forEachIndexed { index, stop -> Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${index + 1}", color = AirBlue, style = MaterialTheme.typography.titleMedium)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${stop.time} · ${stop.name}", style = MaterialTheme.typography.titleMedium)
                    Text(stop.note.orEmpty(), color = Muted, style = MaterialTheme.typography.bodySmall)
                }
            } }
            Text("가고 싶은 곳을 대화로 전하고, 지도에서 순서를 다듬어 보세요. 예약 자료와 여행 예산도 함께 챙길 수 있어요.", color = Muted, style = MaterialTheme.typography.bodyMedium)
            PrimaryButton("내 여행 시작하기", { preview = false; onStart() })
        }
    }
    if (credits) AlertDialog(onDismissRequest = { credits = false }, title = { Text("사진·지도 출처") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("로마 골목: Tobias Tullius · Unsplash\n원본 사진을 화면에 맞게 잘라 표시했습니다.", color = Muted)
            TextButton({ uri.openUri("https://unsplash.com/photos/Jfm2JZ6XguM") }) { Text("사진 원본") }
            TextButton({ uri.openUri("https://unsplash.com/license") }) { Text("Unsplash License") }
            Text("지도: © OpenStreetMap contributors\n계정 지도: © CARTO", color = Muted)
            TextButton({ uri.openUri("https://www.openstreetmap.org/copyright") }) { Text("지도 저작권과 라이선스") }
        }
    }, confirmButton = { TextButton({ credits = false }) { Text("닫기") } })
}
