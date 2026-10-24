package com.heptivision.airo.data.update

import com.heptivision.airo.core.network.wireJson
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.TimeUnit

const val UPDATE_ORIGIN = "https://airo.dev-heptivision.com"
private const val MAX_APK_BYTES = 200L * 1024 * 1024

class UpdateException(message: String) : IOException(message)
private fun requireUpdate(value: Boolean, message: String = "업데이트 정보를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.") {
    if (!value) throw UpdateException(message)
}

@Serializable data class UpdateArtifact(
    val flavor: String, val applicationId: String, val version: String, val versionCode: Long,
    val file: String, val bytes: Long, val sha256: String, val minSdk: Int,
)
@Serializable data class UpdateManifest(
    val schemaVersion: Int, val releasedAt: String, val releaseNotes: List<String>, val artifacts: List<UpdateArtifact>,
)
@Serializable data class UpdateRelease(val artifact: UpdateArtifact, val releasedAt: String, val releaseNotes: List<String>)

data class UpdateIdentity(val applicationId: String, val flavor: String, val versionCode: Long, val sdk: Int) {
    fun validate(artifact: UpdateArtifact) {
        requireUpdate(artifact.applicationId == applicationId && artifact.flavor == flavor)
        requireUpdate(artifact.versionCode > 0 && artifact.minSdk in 26..100)
        requireUpdate(artifact.bytes in 1..MAX_APK_BYTES && artifact.sha256.matches(Regex("[a-f0-9]{64}")))
        val baseVersion = artifact.version.removeSuffix("-demo")
        requireUpdate(baseVersion.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+")))
        requireUpdate(artifact.version == baseVersion + if (flavor == "demo") "-demo" else "")
        // A filename only: neither Community servers nor manifests can redirect executable downloads.
        requireUpdate(artifact.file == "airo-android-$flavor-$baseVersion.apk")
    }

    fun select(manifest: UpdateManifest): UpdateRelease? {
        requireUpdate(manifest.schemaVersion == 1 && manifest.artifacts.size in 1..8)
        requireUpdate(manifest.releasedAt.length in 1..40 && manifest.releaseNotes.size <= 20 && manifest.releaseNotes.all { it.length <= 500 })
        val artifact = manifest.artifacts.filter { it.applicationId == applicationId && it.flavor == flavor }.singleOrNull()
            ?: throw UpdateException("이 앱에 맞는 업데이트가 아직 준비되지 않았어요.")
        validate(artifact)
        if (artifact.versionCode <= versionCode) return null
        requireUpdate(artifact.minSdk <= sdk, "새 버전은 더 높은 Android 버전이 필요해요.")
        return UpdateRelease(artifact, manifest.releasedAt, manifest.releaseNotes)
    }
}

interface AppUpdates {
    suspend fun restore(): UpdateRelease?
    suspend fun check(): UpdateRelease?
    suspend fun download(release: UpdateRelease, progress: (Long) -> Unit)
    suspend fun installationFile(release: UpdateRelease): File
}

/** Public, fixed-origin distribution; never uses account credentials or the selected trip server. */
class UpdateRepository(
    private val identity: UpdateIdentity,
    private val directory: File,
    private val verifyPackage: (File, UpdateArtifact) -> Unit,
    client: OkHttpClient = OkHttpClient(),
) : AppUpdates {
    private val http = client.newBuilder().followRedirects(false).followSslRedirects(false)
        .callTimeout(5, TimeUnit.MINUTES).readTimeout(30, TimeUnit.SECONDS).build()
    private val packages get() = File(directory, "packages")
    private val receipt get() = File(directory, "ready.json")

    override suspend fun check(): UpdateRelease? = exchange("airo-android-latest.json", 30) { response ->
        val body = response.body ?: throw UpdateException("업데이트 정보를 받지 못했어요.")
        val text = body.byteStream().use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(4096)
            while (true) {
                currentCoroutineContext().ensureActive()
                val count = input.read(buffer)
                if (count == -1) break
                requireUpdate(output.size() + count <= 64 * 1024)
                output.write(buffer, 0, count)
            }
            output.toString(Charsets.UTF_8.name())
        }
        val manifest = try { wireJson.decodeFromString<UpdateManifest>(text) }
        catch (_: IllegalArgumentException) { throw UpdateException("업데이트 정보 형식이 올바르지 않아요.") }
        identity.select(manifest)
    }

    override suspend fun restore(): UpdateRelease? = withContext(Dispatchers.IO) {
        packages.listFiles()?.filter { it.extension == "part" }?.forEach { it.delete() }
        if (!receipt.isFile) return@withContext null
        try {
            requireUpdate(receipt.length() <= 64 * 1024)
            val release = wireJson.decodeFromString<UpdateRelease>(receipt.readText())
            installationFile(release)
            release
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            receipt.delete()
            packages.listFiles()?.forEach { it.delete() }
            null
        }
    }

    override suspend fun download(release: UpdateRelease, progress: (Long) -> Unit) {
        val artifact = release.artifact
        validateNew(artifact)
        exchange(artifact.file) { response ->
            packages.mkdirs()
            requireUpdate(packages.usableSpace > artifact.bytes + 10 * 1024 * 1024, "저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.")
            val body = response.body ?: throw UpdateException("설치 파일을 받지 못했어요.")
            requireUpdate(body.contentLength() == -1L || body.contentLength() == artifact.bytes, "설치 파일 크기가 일치하지 않아요. 다시 다운로드해 주세요.")
            val partial = File(packages, "${UUID.randomUUID()}.part")
            try {
                val digest = MessageDigest.getInstance("SHA-256")
                var received = 0L
                var reported = -1L
                body.byteStream().use { input -> partial.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer)
                        if (count == -1) break
                        received += count
                        requireUpdate(received <= artifact.bytes, "설치 파일 크기가 일치하지 않아요. 다시 다운로드해 주세요.")
                        output.write(buffer, 0, count)
                        digest.update(buffer, 0, count)
                        if (received * 100 / artifact.bytes != reported) {
                            reported = received * 100 / artifact.bytes
                            progress(received)
                        }
                    }
                    output.fd.sync()
                } }
                requireUpdate(received == artifact.bytes && digest.digest().hex() == artifact.sha256, "설치 파일 검증에 실패했어요. 다시 다운로드해 주세요.")
                verifyPackage(partial, artifact)
                currentCoroutineContext().ensureActive()
                val target = File(packages, artifact.file)
                requireUpdate(partial.renameTo(target), "설치 파일을 저장하지 못했어요. 다시 시도해 주세요.")
                val temporaryReceipt = File(directory, "ready.json.tmp")
                temporaryReceipt.writeText(wireJson.encodeToString(release))
                requireUpdate(temporaryReceipt.renameTo(receipt))
                packages.listFiles()?.filter { it != target }?.forEach { it.delete() }
            } finally { partial.delete() }
        }
    }

    override suspend fun installationFile(release: UpdateRelease): File = withContext(Dispatchers.IO) {
        val artifact = release.artifact
        validateNew(artifact)
        val file = File(packages, artifact.file)
        requireUpdate(file.isFile && file.length() == artifact.bytes, "설치 파일이 없어졌어요. 업데이트를 다시 확인해 주세요.")
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                currentCoroutineContext().ensureActive()
                val count = input.read(buffer)
                if (count == -1) break
                digest.update(buffer, 0, count)
            }
        }
        requireUpdate(digest.digest().hex() == artifact.sha256, "설치 파일 검증에 실패했어요. 업데이트를 다시 확인해 주세요.")
        verifyPackage(file, artifact)
        file
    }

    private fun validateNew(artifact: UpdateArtifact) {
        identity.validate(artifact)
        requireUpdate(artifact.versionCode > identity.versionCode && artifact.minSdk <= identity.sdk)
    }

    private suspend fun <T> exchange(file: String, timeoutSeconds: Long = 300, read: suspend (Response) -> T): T = coroutineScope {
        val request = Request.Builder().url("$UPDATE_ORIGIN/downloads/$file")
            .header("Cache-Control", "no-cache, no-store").header("Accept-Encoding", "identity")
            .header("User-Agent", "AIRO-Android-Updater").build()
        val call = http.newCall(request)
        call.timeout().timeout(timeoutSeconds, TimeUnit.SECONDS)
        // Cancel the socket immediately even while the IO worker is blocked on a read.
        val cancellation = launch(Dispatchers.Unconfined, start = CoroutineStart.UNDISPATCHED) {
            try { awaitCancellation() } finally { call.cancel() }
        }
        try {
            withContext(Dispatchers.IO) {
                call.execute().use { response ->
                    requireUpdate(response.code == 200, "업데이트 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.")
                    read(response)
                }
            }
        } catch (error: IOException) {
            currentCoroutineContext().ensureActive()
            throw error
        } finally { cancellation.cancel() }
    }
}

internal fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }
