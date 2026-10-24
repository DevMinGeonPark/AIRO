package com.heptivision.airo.feature.resources

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.heptivision.airo.core.model.safeHttps
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

private val photoClient = OkHttpClient.Builder().callTimeout(12, TimeUnit.SECONDS).followRedirects(false).build()
@Composable fun PlaceImage(url: String?, name: String) {
    val safe = safeHttps(url) ?: return
    val image by produceState<Bitmap?>(null, safe) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                photoClient.newCall(Request.Builder().url(safe).build()).execute().use { response ->
                    check(response.isSuccessful)
                    val input = response.body?.byteStream() ?: error("empty")
                    val out = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) { val n = input.read(buffer); if (n < 0) break; check(out.size() + n <= 2 * 1024 * 1024); out.write(buffer, 0, n) }
                    val bytes = out.toByteArray()
                    val dimensions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, dimensions)
                    val options = BitmapFactory.Options().apply { inSampleSize = (maxOf(dimensions.outWidth, dimensions.outHeight) / 900).coerceAtLeast(1) }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                }
            }.getOrNull()
        }
    }
    image?.let { Image(it.asImageBitmap(), name, Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Crop) }
}
