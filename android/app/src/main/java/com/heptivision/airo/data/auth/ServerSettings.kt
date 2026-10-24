package com.heptivision.airo.data.auth

import android.content.Context
import com.heptivision.airo.BuildConfig
import okhttp3.HttpUrl.Companion.toHttpUrl

fun serverOrigin(value: String, allowLocalHttp: Boolean = false): String {
    val url = value.trim().toHttpUrl()
    require(url.username.isEmpty() && url.password.isEmpty() && url.query == null && url.fragment == null && url.encodedPath == "/") { "경로나 계정 정보 없이 서버 주소만 입력해 주세요." }
    require(url.isHttps || (allowLocalHttp && url.host in listOf("127.0.0.1", "localhost", "10.0.2.2"))) { "HTTPS 서버 주소를 입력해 주세요." }
    return url.toString().trimEnd('/')
}
class ServerSettings(context: Context) {
    private val preferences = context.getSharedPreferences("airo_server", Context.MODE_PRIVATE)
    fun read(): String = preferences.getString("origin", null)?.let { runCatching { serverOrigin(it, BuildConfig.DEBUG) }.getOrNull() } ?: BuildConfig.API_BASE_URL
    fun write(value: String) { check(preferences.edit().putString("origin", serverOrigin(value, BuildConfig.DEBUG)).commit()) }
}
