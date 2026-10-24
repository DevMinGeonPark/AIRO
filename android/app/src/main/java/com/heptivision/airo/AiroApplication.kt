package com.heptivision.airo

import android.app.Application
import com.heptivision.airo.core.network.HttpTransport
import com.heptivision.airo.core.network.AccountClient
import com.heptivision.airo.data.ai.AiRepository
import com.heptivision.airo.core.security.SessionVault
import com.heptivision.airo.data.auth.AuthRepository
import com.heptivision.airo.data.auth.ServerSettings
import com.heptivision.airo.data.trips.*
import com.heptivision.airo.data.update.*

class AiroApplication : Application() {
    private var current: AppContainer? = null
    val container: AppContainer get() = current ?: AppContainer(this, ServerSettings(this).read()).also { current = it }
    fun selectServer(value: String) {
        check(container.auth.session.value == null) { "로그아웃한 뒤 서버를 변경해 주세요." }
        ServerSettings(this).write(value)
        current = AppContainer(this, ServerSettings(this).read())
    }
}

/** The only composition root; features depend on repositories, never construct clients. */
class AppContainer(application: Application, baseUrl: String) {
    private val vault = SessionVault(application)
    private val http = HttpTransport()
    val auth = AuthRepository(baseUrl, http, vault, BuildConfig.DEMO)
    val photos = com.heptivision.airo.data.photos.PlacePhotoLinks(vault, baseUrl) { auth.session.value?.user?.id }
    val ai = AiRepository(AccountClient(baseUrl, http, auth), vault, auth, BuildConfig.DEMO)
    val trips: TripRepository = if (BuildConfig.DEMO) DemoTripRepository(vault, readDemoRoads(application))
        else CloudTripRepository(baseUrl, http, auth)
    val updates: AppUpdates = UpdateRepository(
        UpdateIdentity(BuildConfig.APPLICATION_ID, if (BuildConfig.DEMO) "demo" else "cloud", BuildConfig.VERSION_CODE.toLong(), android.os.Build.VERSION.SDK_INT),
        java.io.File(application.cacheDir, "updates"), AndroidUpdateInstaller(application)::verify,
    )
}
