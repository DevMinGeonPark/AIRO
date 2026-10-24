package com.heptivision.airo.feature.itinerary

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.heptivision.airo.core.design.Muted
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.platform.openPlaceCalendar
import com.heptivision.airo.data.photos.*
import kotlinx.coroutines.*

@Composable fun PlaceMemories(trip: Trip, stop: Stop, timeZone: String, store: PlacePhotoLinks) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var photos by remember(trip.id, stop.id) { mutableStateOf<List<PlacePhotoLink>>(emptyList()) }
    var error by remember(trip.id, stop.id) { mutableStateOf<String?>(null) }
    var busy by remember(trip.id, stop.id) { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    fun update(action: suspend () -> List<PlacePhotoLink>) {
        busy = true; error = null
        scope.launch {
            try { photos = action() }
            catch (failure: Exception) { if (failure is CancellationException) throw failure; error = failure.message ?: "사진을 연결하지 못했어요. 다시 선택해 주세요." }
            finally { busy = false }
        }
    }
    LaunchedEffect(trip.id, stop.id, attempt) {
        try { photos = store.list(trip.id, stop.progressKey()); error = null }
        catch (failure: Exception) { if (failure is CancellationException) throw failure; error = "사진 연결을 불러오지 못했어요." }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        if (uris.isNotEmpty()) update {
            require((photos.map { it.uri } + uris.map { it.toString() }).distinct().size <= 20) { "한 장소에는 사진을 20장까지 연결할 수 있어요." }
            withContext(Dispatchers.IO) { uris.forEach { uri ->
                require(context.contentResolver.getType(uri)?.startsWith("image/") == true) { "사진 파일을 선택해 주세요." }
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } }
            store.add(trip.id, stop.progressKey(), uris.map { it.toString() })
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton({
                val entry = placeCalendarEntry(trip, stop, timeZone)
                error = if (entry == null) "여행 시작일을 먼저 설정해 주세요."
                    else if (!openPlaceCalendar(context, entry)) "캘린더 앱을 확인해 주세요." else null
            }) { Icon(Icons.Outlined.Event, null, Modifier.size(16.dp)); Text("캘린더에 추가", Modifier.padding(start = 4.dp), style = MaterialTheme.typography.labelSmall) }
            TextButton({ picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = !busy && photos.size < 20) {
                Icon(Icons.Outlined.AddPhotoAlternate, null, Modifier.size(16.dp)); Text("사진 연결", Modifier.padding(start = 4.dp), style = MaterialTheme.typography.labelSmall)
            }
        }
        Text("${trip.dayDate(stop.day)} · 이 장소의 사진은 이 기기에 연결됩니다.", color = Muted, style = MaterialTheme.typography.labelSmall)
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall); TextButton({ attempt++ }) { Text("다시 확인") } }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(photos, key = { it.uri }) { photo ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    PhotoThumbnail(photo.uri) {
                        try { context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(photo.uri), "image/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) }
                        catch (_: ActivityNotFoundException) { error = "사진을 열 수 있는 앱을 확인해 주세요." }
                        catch (_: SecurityException) { error = "원본 사진 접근이 해제됐어요. 사진을 다시 연결해 주세요." }
                    }
                    IconButton({ update { store.remove(trip.id, stop.progressKey(), photo.uri) } }, enabled = !busy) { Icon(Icons.Outlined.LinkOff, "사진 연결 해제", Modifier.size(18.dp)) }
                }
            }
        }
    }
}

@Composable private fun PhotoThumbnail(value: String, open: () -> Unit) {
    val context = LocalContext.current
    var bitmap by remember(value) { mutableStateOf<Bitmap?>(null) }
    var failed by remember(value) { mutableStateOf(false) }
    LaunchedEffect(value) {
        try { bitmap = withContext(Dispatchers.IO) {
            val uri = Uri.parse(value)
            if (Build.VERSION.SDK_INT >= 28) ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                val scale = minOf(1.0, 256.0 / maxOf(info.size.width, info.size.height))
                decoder.setTargetSize(maxOf(1, (info.size.width * scale).toInt()), maxOf(1, (info.size.height * scale).toInt()))
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            } else {
                val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                context.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, options) }
                require(options.outWidth > 0 && options.outHeight > 0)
                options.inSampleSize = 1
                while (maxOf(options.outWidth, options.outHeight) / options.inSampleSize > 256) options.inSampleSize *= 2
                options.inJustDecodeBounds = false
                context.contentResolver.openInputStream(uri)!!.use { requireNotNull(BitmapFactory.decodeStream(it, null, options)) }
            }
        } } catch (failure: Exception) { if (failure is CancellationException) throw failure; failed = true }
    }
    Surface(Modifier.size(88.dp).clickable(onClickLabel = "연결한 사진 열기", onClick = open), shape = MaterialTheme.shapes.small) {
        Box(contentAlignment = Alignment.Center) {
            bitmap?.let { Image(it.asImageBitmap(), "연결한 사진", Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                ?: if (failed) Text("사진 확인 필요", Modifier.padding(6.dp), style = MaterialTheme.typography.labelSmall) else CircularProgressIndicator(Modifier.size(20.dp))
        }
    }
}
