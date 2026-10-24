package com.heptivision.airo.core.network

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

val wireJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }
class ApiException(val status: Int, message: String) : IOException(message)

class HttpTransport(val client: OkHttpClient = OkHttpClient.Builder()
    .callTimeout(java.time.Duration.ofSeconds(30))
    .followRedirects(false).followSslRedirects(false).build()) {
    suspend fun request(url: String, method: String = "GET", body: String? = null, headers: Map<String, String> = emptyMap()): String =
        exchange(url, method, body, headers, 16 * 1024 * 1024).toString(Charsets.UTF_8)

    suspend fun download(url: String, headers: Map<String, String> = emptyMap(), maxBytes: Int = 8 * 1024 * 1024): ByteArray =
        exchange(url, "GET", null, headers, maxBytes)

    private suspend fun exchange(url: String, method: String, body: String?, headers: Map<String, String>, maxBytes: Int): ByteArray {
        val builder = Request.Builder().url(url)
            .header("Accept", "application/json").header("User-Agent", "AIRO-Android/${com.heptivision.airo.BuildConfig.VERSION_NAME}")
        headers.forEach { (key, value) -> builder.header(key, value) }
        builder.method(method, body?.toRequestBody("application/json; charset=utf-8".toMediaType()))
        val call = client.newCall(builder.build())
        return suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) { if (continuation.isActive) continuation.resumeWithException(e) }
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        try {
                            val bytes = ByteArrayOutputStream().use { output ->
                                response.body?.byteStream()?.use { input ->
                                    val chunk = ByteArray(8192)
                                    while (true) {
                                        val size = input.read(chunk)
                                        if (size < 0) break
                                        if (output.size() + size > maxBytes) throw ApiException(413, "자료가 너무 큽니다. 웹에서 확인해 주세요.")
                                        output.write(chunk, 0, size)
                                    }
                                }
                                output.toByteArray()
                            }
                            if (!response.isSuccessful) {
                                val text = bytes.toString(Charsets.UTF_8)
                                val error = runCatching { wireJson.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()
                                throw ApiException(response.code, error?.takeIf { !it.contains('_') && it.length < 300 } ?: when(response.code) {
                                    401, 403 -> "로그인을 다시 확인해 주세요."
                                    404 -> "여행을 찾을 수 없습니다."
                                    429 -> "요청이 많아요. 잠시 후 다시 시도해 주세요."
                                    else -> "요청을 완료하지 못했어요. 다시 시도해 주세요."
                                })
                            }
                            if (continuation.isActive) continuation.resume(bytes)
                        } catch (error: Exception) { if (continuation.isActive) continuation.resumeWithException(error) }
                    }
                }
            })
        }
    }
}

fun Throwable.userMessage(): String = if (this is ApiException || this is IllegalArgumentException)
    message ?: "입력 내용을 확인해 주세요." else "연결을 확인한 뒤 다시 시도해 주세요."
