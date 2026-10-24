package com.heptivision.airo

import com.heptivision.airo.data.update.*
import com.heptivision.airo.core.network.wireJson
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class UpdateRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()
    private val bytes = ByteArray(128 * 1024) { (it % 251).toByte() }
    private val artifact = UpdateArtifact("cloud", "com.heptivision.airo", "0.3.1", 4,
        "airo-android-cloud-0.3.1.apk", bytes.size.toLong(), MessageDigest.getInstance("SHA-256").digest(bytes).hex(), 26)
    private val identity = UpdateIdentity("com.heptivision.airo", "cloud", 3, 36)
    private fun manifest(value: UpdateArtifact = artifact) = UpdateManifest(1, "2026-09-18", listOf("설정에서 업데이트"), listOf(value))
    private fun release(value: UpdateArtifact = artifact) = UpdateRelease(value, "2026-09-18", listOf("설정에서 업데이트"))
    private fun client(server: MockWebServer) = OkHttpClient.Builder().addInterceptor { chain ->
        assertEquals("airo.dev-heptivision.com", chain.request().url.host)
        assertEquals("https", chain.request().url.scheme)
        assertNull(chain.request().header("Authorization"))
        chain.proceed(chain.request().newBuilder().url(server.url(chain.request().url.encodedPath)).build())
    }.build()

    @Test fun selectsOnlyMatchingNewerVersionAndRejectsUntrustedFilenames() {
        assertEquals(4, identity.select(manifest())!!.artifact.versionCode.toInt())
        assertNull(identity.copy(versionCode = 4).select(manifest()))
        assertNull(identity.copy(versionCode = 5).select(manifest()))
        listOf(
            artifact.copy(file = "https://other.test/evil.apk"), artifact.copy(file = "../evil.apk"),
            artifact.copy(file = "airo-android-cloud-0.3.1.apk?redirect=evil"), artifact.copy(applicationId = "other"),
            artifact.copy(flavor = "demo"), artifact.copy(minSdk = 37), artifact.copy(bytes = 201L * 1024 * 1024),
            artifact.copy(sha256 = "f"), artifact.copy(version = "0.3.1-demo"),
        ).forEach { assertTrue(runCatching { identity.select(manifest(it)) }.exceptionOrNull() is UpdateException) }
        assertTrue(runCatching { identity.select(manifest().copy(artifacts = listOf(artifact, artifact))) }.isFailure)
        assertTrue(runCatching { identity.select(manifest().copy(schemaVersion = 2)) }.isFailure)
    }

    @Test fun streamsVerifiedApkAndRestoresAfterProcessDeathWithoutCredentials() = runBlocking {
        val server = MockWebServer(); server.start()
        val verified = AtomicInteger()
        val directory = temporary.newFolder()
        val repository = UpdateRepository(identity, directory, { _, _ -> verified.incrementAndGet() }, client(server))
        try {
            server.enqueue(MockResponse().setBody(wireJson.encodeToString(manifest())))
            val found = repository.check()!!
            assertEquals("/downloads/airo-android-latest.json", server.takeRequest().path)
            server.enqueue(MockResponse().setBody(Buffer().write(bytes)))
            val progress = mutableListOf<Long>()
            repository.download(found) { progress.add(it) }
            assertEquals(bytes.size.toLong(), progress.last())
            assertTrue(progress.zipWithNext().all { (a, b) -> a <= b })
            assertArrayEquals(bytes, repository.installationFile(found).readBytes())
            assertEquals(found, UpdateRepository(identity, directory, { _, _ -> verified.incrementAndGet() }, client(server)).restore())
            assertEquals(3, verified.get())
            assertNull(UpdateRepository(identity.copy(versionCode = 4), directory, { _, _ -> fail("Already installed") }, client(server)).restore())
            assertTrue(directory.resolve("packages").listFiles()!!.isEmpty())
        } finally { server.shutdown() }
    }

    @Test fun checksumSizeAndPackageFailuresNeverLeaveInstallableFile() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            for (mode in listOf("hash", "size", "signature")) {
                val directory = temporary.newFolder()
                val repository = UpdateRepository(identity, directory, { _, _ -> if (mode == "signature") throw UpdateException("wrong signer") }, client(server))
                val data = if (mode == "size") bytes.copyOf(bytes.size - 1) else bytes
                server.enqueue(MockResponse().setBody(Buffer().write(data)))
                val candidate = if (mode == "hash") release(artifact.copy(sha256 = "0".repeat(64))) else release()
                assertTrue(runCatching { repository.download(candidate) {} }.exceptionOrNull() is UpdateException)
                assertFalse(directory.resolve("ready.json").exists())
                assertTrue(directory.resolve("packages").listFiles().orEmpty().isEmpty())
            }
        } finally { server.shutdown() }
    }

    @Test fun refusesRedirectsAndOversizedManifests() = runBlocking {
        val server = MockWebServer(); server.start()
        try {
            val repository = UpdateRepository(identity, temporary.newFolder(), { _, _ -> }, client(server))
            server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", server.url("/untrusted")))
            assertTrue(runCatching { repository.check() }.exceptionOrNull() is UpdateException)
            server.enqueue(MockResponse().setBody(" ".repeat(65537)))
            assertTrue(runCatching { repository.check() }.exceptionOrNull() is UpdateException)
            server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", server.url("/untrusted")))
            assertTrue(runCatching { repository.download(release()) {} }.exceptionOrNull() is UpdateException)
            assertEquals(3, server.requestCount)
        } finally { server.shutdown() }
    }

    @Test fun cancellationClosesDownloadAndRetryWorks() = runBlocking {
        val server = MockWebServer(); server.start()
        val directory = temporary.newFolder()
        try {
            val repository = UpdateRepository(identity, directory, { _, _ -> }, client(server))
            server.enqueue(MockResponse().setBody(Buffer().write(bytes)).throttleBody(1024, 1, TimeUnit.SECONDS))
            val received = CompletableDeferred<Unit>()
            val download = launch { repository.download(release()) { received.complete(Unit) } }
            withTimeout(5000) { received.await() }
            withTimeout(2000) { download.cancelAndJoin() }
            assertTrue(directory.resolve("packages").listFiles().orEmpty().isEmpty())
            server.enqueue(MockResponse().setBody(Buffer().write(bytes)))
            repository.download(release()) {}
            assertNotNull(repository.restore())
            directory.resolve("packages/${artifact.file}").writeBytes(ByteArray(bytes.size))
            assertNull(repository.restore())
            assertFalse(directory.resolve("ready.json").exists())
        } finally { server.shutdown() }
    }
}
