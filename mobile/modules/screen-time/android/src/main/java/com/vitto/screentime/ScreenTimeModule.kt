package com.vitto.screentime

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Calendar

/**
 * Today's total foreground screen time, read from UsageStatsManager.
 *
 * Privacy rule (mirrors ScreenTimeMetadata in @vitto/core): this module returns
 * ONE summed number. It never returns package names, per-app durations, or
 * categories, and nothing here should ever be extended to. The JS side only
 * needs "how long", never "on what".
 *
 * UNVERIFIED ON-DEVICE: written without an Android SDK on this machine. The
 * APIs used (queryUsageStats, AppOpsManager.OPSTR_GET_USAGE_STATS,
 * Settings.ACTION_USAGE_ACCESS_SETTINGS) are the standard ones and stable since
 * API 21-29, but the build and behaviour have not been checked on a device.
 */
class ScreenTimeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VittoScreenTime")

    /** Whether the user has granted "usage access" in Settings for this app. */
    Function("hasUsageAccess") { hasUsageAccess() }

    /**
     * Usage access cannot be requested with a runtime prompt; the only path is
     * the system Settings page, so this opens it and the caller re-checks
     * `hasUsageAccess` when the app comes back to the foreground.
     */
    Function("openUsageAccessSettings") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    /**
     * Milliseconds of foreground use since local midnight, summed across apps.
     * A Double because Expo's bridge has no 64-bit integer, and a day's worth
     * of milliseconds fits a Double exactly. Async: queryUsageStats can be
     * slow enough to drop frames on the main thread.
     */
    AsyncFunction("getForegroundMillisToday") { getForegroundMillisToday() }
  }

  private fun hasUsageAccess(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    // MODE_DEFAULT means "defer to the manifest permission", which for a
    // signature|privileged permission is a denial for a normal app — but
    // check it rather than assume, as some OEMs grant it.
    return when (mode) {
      AppOpsManager.MODE_ALLOWED -> true
      AppOpsManager.MODE_DEFAULT ->
        context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
      else -> false
    }
  }

  private fun getForegroundMillisToday(): Double {
    if (!hasUsageAccess()) return 0.0
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val now = System.currentTimeMillis()
    val startOfToday = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    // INTERVAL_DAILY buckets are aligned by the system, not to our query, so a
    // bucket can begin before local midnight; filtering on lastTimeUsed keeps
    // only apps actually touched today. This is an approximation of "today"
    // (an app used late last night and again today reports the whole bucket),
    // which is fine for a budget check and avoids a per-event replay.
    val stats = manager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startOfToday, now) ?: return 0.0
    var total = 0L
    for (entry in stats) {
      if (entry.lastTimeUsed >= startOfToday) total += entry.totalTimeInForeground
    }
    // Deliberately a bare total: no package names leave this function.
    return total.toDouble()
  }
}
