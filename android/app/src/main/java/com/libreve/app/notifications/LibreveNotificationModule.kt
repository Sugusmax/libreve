package com.libreve.app.notifications

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LibreveNotificationModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "LibreveNotifications"

  @ReactMethod
  fun scheduleDaily(
    title: String,
    body: String,
    coverUri: String,
    hour: Int,
    minute: Int,
    promise: Promise,
  ) {
    try {
      LibreveNotificationScheduler.schedule(
        context.applicationContext,
        title,
        body,
        coverUri,
        hour,
        minute,
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LIBREVE_NOTIFICATION_SCHEDULE", error.message, error)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    try {
      LibreveNotificationScheduler.cancel(context.applicationContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LIBREVE_NOTIFICATION_CANCEL", error.message, error)
    }
  }
}
