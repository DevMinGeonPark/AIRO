package com.heptivision.airo.feature.resources

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.MAX_PDF_BYTES
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest

/** Copies only bounded content into app-private storage. The source URI never becomes a file path. */
suspend fun copyPdf(context: Context, uri: Uri, directory: File): Pair<File, String> = withContext(Dispatchers.IO) {
    require(uri.scheme == "content") { "파일 선택기에서 PDF를 선택해 주세요." }
    val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }?.take(300)?.ifBlank { null } ?: "여행 자료.pdf"
    val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) { val n = input.read(buffer); if (n < 0) break; require(output.size() + n <= MAX_PDF_BYTES) { "2MB 이하의 PDF를 선택해 주세요." }; output.write(buffer, 0, n) }
        output.toByteArray()
    } ?: error("파일을 읽을 수 없습니다. 다시 선택해 주세요.")
    require(bytes.take(5).toByteArray().toString(Charsets.US_ASCII) == "%PDF-" && bytes.takeLast(1024).toByteArray().toString(Charsets.US_ASCII).contains("%%EOF")) { "올바른 PDF 파일을 선택해 주세요." }
    directory.mkdirs()
    val file = File(directory, "${java.util.UUID.randomUUID()}.pdf")
    try {
        file.writeBytes(bytes)
        PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)).use { require(it.pageCount > 0) { "빈 PDF는 추가할 수 없습니다." } }
        file to name
    } catch (error: Exception) { file.delete(); throw error }
}
fun pdfHash(file: File): String = MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun PdfPreview(file: File, name: String, onClose: () -> Unit) {
    var page by rememberSaveable(file.path) { mutableIntStateOf(0) }
    var count by remember { mutableIntStateOf(0) }
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    var zoom by rememberSaveable(file.path, page) { mutableFloatStateOf(1f) }
    var pan by remember(file.path, page) { mutableStateOf(Offset.Zero) }
    LaunchedEffect(file.path, page, retry) {
        bitmap = null; error = null
        try {
            val rendered = withContext(Dispatchers.IO) {
                PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)).use { renderer ->
                    renderer.openPage(page.coerceIn(0, renderer.pageCount - 1)).use { p ->
                        val scale = minOf(2f, 2000f / maxOf(p.width, p.height).coerceAtLeast(1))
                        val image = Bitmap.createBitmap((p.width * scale).toInt().coerceAtLeast(1), (p.height * scale).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                        try { image.eraseColor(Color.WHITE); p.render(image, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY) }
                        catch (e: Exception) { image.recycle(); throw e }
                        image to renderer.pageCount
                    }
                }
            }
            bitmap = rendered.first; count = rendered.second
        } catch (e: Exception) { if (e is CancellationException) throw e; error = "PDF를 표시하지 못했습니다. 암호가 없고 손상되지 않은 원본인지 확인하세요." }
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Scaffold(containerColor = Ink, modifier = Modifier.fillMaxSize().safeDrawingPadding(), topBar = {
            TopAppBar(title = { Text(name, maxLines = 2, style = MaterialTheme.typography.titleSmall) }, navigationIcon = { IconButton(onClose) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "PDF 닫기") } }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Panel))
        }, bottomBar = {
            Surface(color = Panel) { Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                IconButton({ page-- }, enabled = page > 0) { Icon(Icons.Outlined.ChevronLeft, "이전 페이지") }
                Text(if (count > 0) "${page + 1} / $count" else "PDF", style = MaterialTheme.typography.labelMedium)
                IconButton({ page++ }, enabled = page + 1 < count) { Icon(Icons.Outlined.ChevronRight, "다음 페이지") }
                IconButton({ zoom = (zoom - .5f).coerceAtLeast(1f); if (zoom == 1f) pan = Offset.Zero }, enabled = zoom > 1f) { Icon(Icons.Outlined.ZoomOut, "축소") }
                IconButton({ zoom = (zoom + .5f).coerceAtMost(4f) }, enabled = zoom < 4f) { Icon(Icons.Outlined.ZoomIn, "확대") }
            } }
        }) { padding ->
            Box(Modifier.fillMaxSize().padding(padding).clipToBounds().pointerInput(file.path, page) {
                detectTransformGestures { _, delta, scale, _ -> zoom = (zoom * scale).coerceIn(1f, 4f); val x = size.width * (zoom - 1f) / 2; val y = size.height * (zoom - 1f) / 2; pan = Offset((pan.x + delta.x).coerceIn(-x, x), (pan.y + delta.y).coerceIn(-y, y)) }
            }, contentAlignment = Alignment.Center) {
                val image = bitmap
                if (image != null) Image(image.asImageBitmap(), "${page + 1}페이지", Modifier.fillMaxSize().graphicsLayer { scaleX = zoom; scaleY = zoom; translationX = pan.x; translationY = pan.y })
                else if (error == null) LoadingState("PDF를 열고 있어요")
                else Column(Modifier.padding(24.dp)) { ErrorNotice(error) { retry++ } }
            }
        }
    }
}
