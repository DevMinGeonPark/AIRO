package com.heptivision.airo.feature.itinerary

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun PreparationSheet(model: PreparationViewModel, date: String, embedded: Boolean = false, onResize: (() -> Unit)? = null, onClose: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val title = state.title
    val category = state.category
    var discard by rememberSaveable { mutableStateOf(false) }
    var reload by rememberSaveable { mutableStateOf(false) }
    fun close() { if (!state.busy) { if (state.dirty || title.isNotBlank()) discard = true else onClose() } }
    LaunchedEffect(model) { if (state.draft == null) model.load() else model.images() }
    BackHandler { close() }
    val header: @Composable () -> Unit = {
        Column(Modifier.fillMaxWidth().background(Panel)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                if (embedded) IconButton(::close, enabled = !state.busy, modifier = Modifier.size(36.dp, 48.dp)) { Icon(Icons.Outlined.ArrowBack, "일정으로 돌아가기", Modifier.size(18.dp)) }
                Text(if (embedded) "출국 전 Todo" else "출국 전날 Todo", Modifier.weight(1f), style = if (embedded) MaterialTheme.typography.titleSmall else MaterialTheme.typography.headlineSmall)
                onResize?.let { resize -> IconButton(resize, Modifier.size(40.dp, 48.dp)) { Icon(if (embedded) Icons.Outlined.OpenInFull else Icons.Outlined.CloseFullscreen, if (embedded) "Todo 크게 보기" else "Todo 작게 보기", Modifier.size(18.dp)) } }
            }
            Text(if (embedded) "Day 0 · Day 1" else "$date · Day 1까지 확인", color = Muted, style = MaterialTheme.typography.labelSmall)
            if (!embedded) {
                TextButton(::close, enabled = !state.busy) { Icon(Icons.Outlined.ArrowBack, null, Modifier.size(16.dp)); Text("일정으로 돌아가기") }
                Text("챙길 물건부터 비자·예약 확인까지 미리 준비해 두세요. 시간이 필요한 절차는 출국 전날보다 먼저 확인하세요.", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
    val content: @Composable () -> Unit = {
        LazyColumn(Modifier.fillMaxWidth().testTag("preparation-list"), contentPadding = PaddingValues(if (embedded) 10.dp else 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (embedded) stickyHeader { header() } else item { header() }
            if (!embedded) item { TripImageSection(model) }
            item {
                ErrorNotice(state.error)
                if (state.error != null) TextButton({ if (state.dirty) reload = true else model.load() }) { Text(if (state.conflict) "최신 목록 불러오기" else "다시 불러오기") }
                if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                state.draft?.let { draft -> Text("${draft.items.count { it.done }} / ${draft.items.size}개 완료", style = MaterialTheme.typography.titleSmall) }
            }
            state.draft?.let { draft ->
                todoCategories.forEach { (key, label) ->
                    item { Text(label, style = MaterialTheme.typography.titleMedium, color = AirBlue) }
                    items(draft.items.filter { it.category == key }, key = { it.id }) { item ->
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Checkbox(item.done, { model.toggle(item.id) }, enabled = !state.busy && !state.loading, modifier = Modifier.semantics { contentDescription = "${item.title} 준비 완료" })
                            Text(item.title, Modifier.weight(1f), style = if (embedded) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium)
                            if (!embedded) IconButton({ model.remove(item.id) }, enabled = !state.busy) { Icon(Icons.Outlined.DeleteOutline, "${item.title} 삭제", tint = Muted) }
                        }
                    }
                }
                item {
                    OptionMenu("분류", category, todoCategories, !state.busy) { model.category(it) }
                    OutlinedTextField(title, model::title, label = { Text("새 할 일") }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
                    TextButton({ model.add(title, category); model.title(""); focus.clearFocus(); keyboard?.hide() }, enabled = !state.busy && title.isNotBlank() && draft.items.size < 100) { Text("추가") }
                }
            }
            item { Text("일본 여행 공식 사이트", style = MaterialTheme.typography.titleMedium); WebLink("일본 비자 안내·신청 방법", "https://www.kr.emb-japan.go.jp/itpr_ko/visa_application.html") }
            item {
                if (title.isNotBlank()) Text("입력한 할 일은 ‘추가’를 누른 뒤 저장해 주세요.", color = Muted, style = MaterialTheme.typography.bodySmall)
                PrimaryButton("저장하고 닫기", { model.save(onClose) }, busy = state.busy, enabled = state.draft != null && !state.conflict && title.isBlank())
            }
        }
    }
    if (embedded) content() else ModalBottomSheet(onDismissRequest = ::close, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true,
        confirmValueChange = { it != SheetValue.Hidden || (!state.busy && !state.dirty && title.isBlank()).also { canClose -> if (!canClose && !state.busy) discard = true } }), containerColor = Panel) { content() }
    if (discard || reload) AlertDialog(onDismissRequest = { discard = false; reload = false }, title = { Text("작성한 내용을 취소할까요?") }, text = { Text("저장하지 않은 Todo 변경사항과 입력한 할 일이 취소됩니다.") },
        confirmButton = { TextButton({ if (reload) { model.discard(); model.load(); model.title("") } else { model.discard(); onClose() }; discard = false; reload = false }) { Text("변경사항 취소") } },
        dismissButton = { TextButton({ discard = false; reload = false }) { Text("계속 작성") } })
}

@Composable fun TripImageSection(model: PreparationViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    var preview by rememberSaveable { mutableStateOf<String?>(null) }
    AiroCard {
        Text("QR·이미지 자료", style = MaterialTheme.typography.titleMedium)
        if (state.imageError != null) ErrorNotice(state.imageError, model::images)
        else if (state.images == null) Text("이미지 목록을 불러오는 중…", color = Muted)
        else if (state.images!!.isEmpty()) Text("아직 저장한 이미지가 없습니다.", color = Muted, style = MaterialTheme.typography.bodySmall)
        state.images.orEmpty().forEach { image -> OutlinedButton({ preview = image.sha256 }, Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Image, null); Text(image.name, Modifier.weight(1f).padding(start = 8.dp)) } }
        WebLink("Visit Japan Web QR 화면", VISIT_JAPAN_QR_URL)
        SamsungWalletButton()
    }
    state.images?.find { it.sha256 == preview }?.let { image -> TripImageDialog(image, model) { preview = null } }
}

@Composable private fun TripImageDialog(image: TripImage, model: PreparationViewModel, close: () -> Unit) {
    var bitmap by remember(image.sha256) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    val transform = rememberTransformableState { zoom, pan, _ -> scale = (scale * zoom).coerceIn(1f, 5f); offset = if (scale == 1f) Offset.Zero else offset + pan }
    LaunchedEffect(image.sha256, attempt) {
        error = null
        try {
            bitmap = withContext(Dispatchers.IO) {
                val bytes = model.image(image)
                val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                require(options.outWidth == image.width && options.outHeight == image.height && image.width in 1..4096 && image.height in 1..4096)
                options.inJustDecodeBounds = false
                options.inSampleSize = if (maxOf(image.width, image.height) > 2048) 2 else 1
                requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options))
            }
        } catch (failure: Exception) { if (failure is CancellationException) throw failure; error = "이미지를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요." }
    }
    Dialog(close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = Ink) {
            Column(Modifier.safeDrawingPadding().padding(16.dp)) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text(image.name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); IconButton(close) { Icon(Icons.Outlined.Close, "이미지 닫기") } }
                ErrorNotice(error) { attempt++ }
                Box(Modifier.weight(1f).fillMaxWidth().transformable(transform), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    bitmap?.let { Image(it.asImageBitmap(), image.name, Modifier.fillMaxSize().testTag("trip-image-preview").graphicsLayer(scaleX = scale, scaleY = scale, translationX = offset.x, translationY = offset.y)) }
                        ?: if (error == null) CircularProgressIndicator() else Unit
                }
                Row { TextButton({ scale = 1f; offset = Offset.Zero }) { Text("원래 크기") }; TextButton({ scale = (scale + .5f).coerceAtMost(5f) }) { Text("확대") } }
                WebLink("원본 사이트 열기", image.sourceUrl)
            }
        }
    }
}

@Composable private fun WebLink(label: String, url: String) {
    val context = LocalContext.current
    var error by remember { mutableStateOf(false) }
    TextButton({
        try {
            val uri = Uri.parse(url)
            require(uri.scheme == "https" && uri.userInfo == null && !uri.host.isNullOrBlank())
            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) { error = true } catch (_: IllegalArgumentException) { error = true }
    }) { Text(label) }
    if (error) Text("주소를 열 수 없어요. 브라우저 앱을 확인해 주세요.", color = Muted, style = MaterialTheme.typography.bodySmall)
}
