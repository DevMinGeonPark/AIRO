package com.heptivision.airo.core.platform

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.heptivision.airo.core.model.*

/** Keep the original HTTPS destination. A provider that cannot handle it falls back to Android's URL resolver. */
fun openBookingLink(context: Context, raw: String): Boolean {
    val url = bookingLink(raw)?.url ?: return false
    fun launch(packageName: String?): Boolean = try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (packageName != null) setPackage(packageName)
        })
        true
    } catch (_: ActivityNotFoundException) { false } catch (_: SecurityException) { false }
    val target = bookingAppPackage(url)
    return target?.let(::launch) == true || launch(null)
}

fun samsungWalletAvailable(context: Context): Boolean = context.packageManager.getLaunchIntentForPackage(SAMSUNG_WALLET_PACKAGE) != null
fun openSamsungWallet(context: Context): Boolean {
    val launch = context.packageManager.getLaunchIntentForPackage(SAMSUNG_WALLET_PACKAGE) ?: return false
    return try { context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true }
    catch (_: ActivityNotFoundException) { false } catch (_: SecurityException) { false }
}
