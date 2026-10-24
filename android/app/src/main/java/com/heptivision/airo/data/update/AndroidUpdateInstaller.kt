package com.heptivision.airo.data.update

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.heptivision.airo.BuildConfig
import java.io.File
import java.security.MessageDigest

class AndroidUpdateInstaller(private val context: Context) {
    fun canInstall() = context.packageManager.canRequestPackageInstalls()
    fun permissionIntent() = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
    fun installIntent(file: File): Intent {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        return Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .apply { clipData = ClipData.newRawUri("AIRO 업데이트", uri) }
    }

    @Suppress("DEPRECATION")
    fun verify(file: File, artifact: UpdateArtifact) {
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val manager = context.packageManager
        val installed = manager.getPackageInfo(context.packageName, flags)
        val archive = manager.getPackageArchiveInfo(file.absolutePath, flags)
            ?: throw UpdateException("유효한 Android 설치 파일이 아니에요.")
        val code = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else archive.versionCode.toLong()
        if (archive.packageName != context.packageName || archive.packageName != artifact.applicationId ||
            code != artifact.versionCode || code <= BuildConfig.VERSION_CODE || archive.versionName != artifact.version ||
            archive.applicationInfo?.minSdkVersion != artifact.minSdk || artifact.minSdk > Build.VERSION.SDK_INT) {
            throw UpdateException("현재 앱에 맞는 설치 파일이 아니에요.")
        }
        // Deliberately require the same signing certificate as this distribution, including debug builds.
        if (signers(installed).isEmpty() || signers(installed) != signers(archive)) {
            throw UpdateException("앱 서명이 일치하지 않아 설치할 수 없어요.")
        }
    }

    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> =
        (if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures)
            ?.map { MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).hex() }?.toSet().orEmpty()
}
