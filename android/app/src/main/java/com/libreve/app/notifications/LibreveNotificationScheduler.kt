package com.libreve.app.notifications

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.libreve.app.R
import java.util.Calendar

object LibreveNotificationScheduler {
  const val CHANNEL_ID = "libreve_recomendaciones"
  const val NOTIFICATION_ID = 9142
  const val REQUEST_CODE = 9142
  const val ACTION_SHOW = "com.libreve.native.SHOW_RECOMMENDATION"

  private const val PREFS_NAME = "libreve_notificaciones"
  private const val KEY_TITLE = "titulo"
  private const val KEY_BODY = "cuerpo"
  private const val KEY_COVER = "caratula"
  private const val KEY_HOUR = "hora"
  private const val KEY_MINUTE = "minuto"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = context.getSystemService(NotificationManager::class.java)
      ?: return

    if (manager.getNotificationChannel(CHANNEL_ID) != null) {
      return
    }

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Recomendaciones de lectura",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Una recomendación o recordatorio de lectura por día."
      setSound(null, null)
      enableVibration(false)
    }

    manager.createNotificationChannel(channel)
  }

  fun schedule(
    context: Context,
    title: String,
    body: String,
    coverUri: String,
    hour: Int,
    minute: Int,
  ) {
    prefs(context).edit()
      .putString(KEY_TITLE, title)
      .putString(KEY_BODY, body)
      .putString(KEY_COVER, coverUri)
      .putInt(KEY_HOUR, hour)
      .putInt(KEY_MINUTE, minute)
      .apply()

    createChannel(context)

    val intent = Intent(context, LibreveNotificationReceiver::class.java).apply {
      action = ACTION_SHOW
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
      ?: return

    val calendar = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, hour.coerceIn(0, 23))
      set(Calendar.MINUTE, minute.coerceIn(0, 59))
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }

    if (calendar.timeInMillis <= System.currentTimeMillis()) {
      calendar.add(Calendar.DAY_OF_YEAR, 1)
    }

    // Inexacto a propósito: no pedimos permiso de alarmas exactas y el sistema
    // puede agrupar alarmas para ahorrar batería.
    alarm.setInexactRepeating(
      AlarmManager.RTC_WAKEUP,
      calendar.timeInMillis,
      AlarmManager.INTERVAL_DAY,
      pendingIntent,
    )
  }

  fun cancel(context: Context) {
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      Intent(context, LibreveNotificationReceiver::class.java).apply {
        action = ACTION_SHOW
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    (context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager)
      ?.cancel(pendingIntent)
    prefs(context).edit().clear().apply()
  }

  fun rescheduleFromPrefs(context: Context) {
    val stored = prefs(context)
    val title = stored.getString(KEY_TITLE, null) ?: return
    val body = stored.getString(KEY_BODY, null) ?: return
    val cover = stored.getString(KEY_COVER, "") ?: ""
    val hour = stored.getInt(KEY_HOUR, 9)
    val minute = stored.getInt(KEY_MINUTE, 0)

    schedule(context, title, body, cover, hour, minute)
  }

  private fun decodeCover(context: Context, value: String?): Bitmap? {
    if (value.isNullOrBlank()) {
      return null
    }

    return try {
      val uri = Uri.parse(value)

      if (uri.scheme == "file") {
        uri.path?.let(BitmapFactory::decodeFile)
      } else {
        context.contentResolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
      }
    } catch (error: Exception) {
      Log.w("LibreveNotification", "No se pudo cargar la carátula", error)
      null
    }
  }

  @SuppressLint("MissingPermission")
  fun show(context: Context) {
    val stored = prefs(context)
    val title = stored.getString(KEY_TITLE, null) ?: return
    val body = stored.getString(KEY_BODY, "") ?: ""
    val cover = decodeCover(context, stored.getString(KEY_COVER, null))

    createChannel(context)

    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      return
    }

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
    val contentIntent = if (launch != null) {
      PendingIntent.getActivity(
        context,
        REQUEST_CODE + 1,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    } else {
      null
    }

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(
        if (cover != null) {
          NotificationCompat.BigPictureStyle()
            .bigPicture(cover)
            .bigLargeIcon(null as Bitmap?)
            .setBigContentTitle(title)
            .setSummaryText(body)
        } else {
          NotificationCompat.BigTextStyle().bigText(body)
        },
      )
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .apply {
        if (contentIntent != null) {
          setContentIntent(contentIntent)
        }
      }
      .build()

    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
  }
}
