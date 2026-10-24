package com.heptivision.airo.feature.share

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.wireJson
import com.heptivision.airo.feature.resources.copyPdf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.io.File

@Serializable data class SharedItem(val id: String, val name: String, val path: String? = null, val link: String? = null, val owner: String? = null, val tripId: String? = null)
data class ShareState(val item: SharedItem? = null, val busy: Boolean = false, val error: String? = null)
class ShareViewModel(app: Application, private val saved: SavedStateHandle) : AndroidViewModel(app) {
    private var currentAccount: String? = null
    private val directory = File(app.cacheDir, "incoming")
    private val _state = MutableStateFlow(ShareState(saved.get<String>("incoming")?.let { runCatching { wireJson.decodeFromString<SharedItem>(it) }.getOrNull() }))
    val state = _state.asStateFlow()
    private fun update(item: SharedItem?) { saved["incoming"] = item?.let { wireJson.encodeToString(it) }; _state.update { it.copy(item = item, error = null) } }
    fun clear() { _state.value.item?.path?.let { path -> val file = File(path); if (file.parentFile?.canonicalPath == directory.canonicalPath) file.delete() }; update(null); _state.update { it.copy(error = null) } }
    fun account(userId: String?) {
        currentAccount = userId
        val item = _state.value.item ?: return
        if (item.owner != null && item.owner != userId) clear()
        else if (userId != null && item.owner == null) update(item.copy(owner = userId))
    }
    fun choose(tripId: String) { _state.value.item?.let { update(it.copy(tripId = tripId)) } }
    fun receive(intent: Intent, userId: String?) {
        if (_state.value.busy) return
        currentAccount = userId
        clear()
        _state.update { it.copy(busy = true) }
        // Capture granted URI/text before the Activity clears its consumed launch intent.
        @Suppress("DEPRECATION") val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) ?: intent.clipData?.takeIf { it.itemCount == 1 }?.getItemAt(0)?.uri
        val type = intent.type
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.take(8192)
        viewModelScope.launch {
            try {
                val id = java.util.UUID.randomUUID().toString()
                val item = when {
                    type == "application/pdf" && uri != null -> { val (file, name) = copyPdf(getApplication(), uri, directory); SharedItem(id, name, path = file.path, owner = userId) }
                    type == "text/plain" -> {
                        val urls = Regex("https://[^\\s<>\"']+").findAll(text.orEmpty()).mapNotNull { safeHttps(it.value.trimEnd(')', ']', '.', ',', ';')) }.distinct().toList()
                        require(urls.size == 1) { "예약 페이지의 HTTPS 링크 한 개를 공유해 주세요." }
                        SharedItem(id, "공유한 예약 링크", link = urls.single(), owner = userId)
                    }
                    else -> error("PDF 파일 또는 예약 페이지 링크를 공유해 주세요.")
                }
                if (userId != null && userId != currentAccount) { item.path?.let { File(it).delete() } }
                else update(item.copy(owner = currentAccount))
            } catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(error = e.message ?: "공유한 자료를 읽지 못했습니다.") } }
            finally { _state.update { it.copy(busy = false) } }
        }
    }
}
