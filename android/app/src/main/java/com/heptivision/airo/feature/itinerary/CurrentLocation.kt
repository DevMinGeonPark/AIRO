package com.heptivision.airo.feature.itinerary

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.heptivision.airo.core.model.MapLocationPoint
import kotlinx.coroutines.delay

data class CurrentLocationControl(val point: MapLocationPoint?, val busy: Boolean, val error: String?,
    val locate: () -> Unit, val dismiss: () -> Unit, val settings: () -> Unit)

/** Explicit one-shot positioning; independent from automatic completion/location tracking. */
@Composable fun rememberCurrentLocation(): CurrentLocationControl {
    val context = LocalContext.current
    var point by remember { mutableStateOf<MapLocationPoint?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var deviceSettings by remember { mutableStateOf(false) }
    var request by remember { mutableIntStateOf(0) }
    fun allowed(permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    fun start() { request++; error = null; point = null; busy = true }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) start()
        else { busy = false; deviceSettings = false; error = "위치 권한이 꺼져 있어요. 앱 설정에서 위치를 허용해 주세요." }
    }
    LifecycleResumeEffect(request, busy) {
        val manager = context.getSystemService(LocationManager::class.java)
        var listening = false
        val ticket = request
        fun accept(location: Location) {
            val age = SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos
            if (!busy || request != ticket || age !in 0..30_000_000_000L || !location.hasAccuracy() || !location.accuracy.isFinite() || location.accuracy < 0 ||
                !location.latitude.isFinite() || !location.longitude.isFinite() || location.latitude !in -90.0..90.0 || location.longitude !in -180.0..180.0) return
            point = MapLocationPoint(location.latitude, location.longitude, location.accuracy, ticket); busy = false
        }
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) = accept(location)
            override fun onProviderDisabled(provider: String) = Unit
            override fun onProviderEnabled(provider: String) = Unit
            @Deprecated("Platform legacy callback") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }
        if (busy) try {
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter {
                (it != LocationManager.GPS_PROVIDER || allowed(Manifest.permission.ACCESS_FINE_LOCATION)) && manager.isProviderEnabled(it)
            }
            if (providers.isEmpty()) { busy = false; deviceSettings = true; error = "기기의 위치가 꺼져 있거나 위치 제공자를 사용할 수 없어요. 위치 설정을 확인해 주세요." }
            else {
                providers.mapNotNull { manager.getLastKnownLocation(it) }.sortedBy { it.accuracy }.forEach(::accept)
                if (busy) providers.forEach { provider ->
                    manager.requestLocationUpdates(provider, 1000L, 0f, listener, Looper.getMainLooper()); listening = true
                }
            }
        } catch (_: SecurityException) { busy = false; deviceSettings = false; error = "위치 권한을 확인해 주세요." }
          catch (_: IllegalArgumentException) { busy = false; deviceSettings = true; error = "현재 위치를 찾지 못했어요. 기기의 위치 설정을 확인해 주세요." }
        onPauseOrDispose { if (listening) { manager.removeUpdates(listener); if (request == ticket) busy = false } }
    }
    LaunchedEffect(request, busy) {
        if (busy) { delay(15000); busy = false; deviceSettings = true; error = "위치를 확인하는 데 시간이 걸려요. 위치 설정을 확인하거나 다시 눌러 주세요." }
    }
    return CurrentLocationControl(point, busy, error, locate = {
        if (!busy) {
            error = null; point = null
            if (allowed(Manifest.permission.ACCESS_FINE_LOCATION) || allowed(Manifest.permission.ACCESS_COARSE_LOCATION)) start()
            else permission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
        }
    }, dismiss = { error = null }, settings = {
        val intent = if (deviceSettings) Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
            else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        runCatching { context.startActivity(intent) }.onSuccess { error = null }.onFailure { error = "기기 설정에서 AIRO의 위치 권한과 위치 사용을 확인해 주세요." }
    })
}
