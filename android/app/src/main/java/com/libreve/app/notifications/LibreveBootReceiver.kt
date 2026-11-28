package com.libreve.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LibreveBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (
      intent.action == Intent.ACTION_BOOT_COMPLETED ||
      intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      LibreveNotificationScheduler.rescheduleFromPrefs(context)
    }
  }
}
