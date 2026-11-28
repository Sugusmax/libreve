package com.libreve.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LibreveNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == LibreveNotificationScheduler.ACTION_SHOW) {
      LibreveNotificationScheduler.show(context)
    }
  }
}
