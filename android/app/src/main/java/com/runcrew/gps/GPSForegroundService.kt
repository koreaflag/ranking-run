package com.runcrew.gps

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps GPS tracking alive while the app is in the background.
 *
 * Android requires a foreground service with a persistent notification for any
 * continuous location access when the app is not visible. This service:
 *   - Displays a notification showing distance and duration
 *   - Keeps the process alive during Doze mode
 *   - Is typed as "location" (required on Android 14+)
 *
 * The service does not own the LocationEngine; it merely keeps the process alive.
 * The GPSTrackerModule binds to this service and manages the engine lifecycle.
 */
class GPSForegroundService : Service() {

    companion object {
        private const val TAG = "GPSForegroundService"
        const val CHANNEL_ID = "running_tracker"
        const val CHANNEL_NAME = "Running Tracker"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.runcrew.gps.ACTION_START"
        const val ACTION_STOP = "com.runcrew.gps.ACTION_STOP"
        const val ACTION_UPDATE_NOTIFICATION = "com.runcrew.gps.ACTION_UPDATE_NOTIFICATION"

        const val EXTRA_DISTANCE = "distance"
        const val EXTRA_DURATION = "duration"

        fun startService(context: Context) {
            val intent = Intent(context, GPSForegroundService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, GPSForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }

        fun updateNotification(context: Context, distanceMeters: Double, durationMs: Long) {
            val intent = Intent(context, GPSForegroundService::class.java).apply {
                action = ACTION_UPDATE_NOTIFICATION
                putExtra(EXTRA_DISTANCE, distanceMeters)
                putExtra(EXTRA_DURATION, durationMs)
            }
            context.startService(intent)
        }
    }

    inner class LocalBinder : Binder() {
        fun getService(): GPSForegroundService = this@GPSForegroundService
    }

    private val binder = LocalBinder()
    private var isRunning = false

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startForegroundTracking()
            ACTION_STOP -> stopForegroundTracking()
            ACTION_UPDATE_NOTIFICATION -> {
                val distance = intent.getDoubleExtra(EXTRA_DISTANCE, 0.0)
                val duration = intent.getLongExtra(EXTRA_DURATION, 0L)
                updateNotificationContent(distance, duration)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        super.onDestroy()
    }

    private fun startForegroundTracking() {
        if (isRunning) return
        isRunning = true

        val notification = buildNotification(0.0, 0L)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service", e)
            stopSelf()
        }
    }

    private fun stopForegroundTracking() {
        isRunning = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun updateNotificationContent(distanceMeters: Double, durationMs: Long) {
        if (!isRunning) return

        val notification = buildNotification(distanceMeters, durationMs)
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun buildNotification(distanceMeters: Double, durationMs: Long): Notification {
        val distanceKm = distanceMeters / 1000.0
        val distanceText = "%.2f km".format(distanceKm)

        val totalSeconds = durationMs / 1000
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        val durationText = if (hours > 0) {
            "%d:%02d:%02d".format(hours, minutes, seconds)
        } else {
            "%02d:%02d".format(minutes, seconds)
        }

        // Intent to reopen the app when notification is tapped
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else {
            null
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("RunCrew - Running")
            .setContentText("$distanceText | $durationText")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .apply {
                if (pendingIntent != null) {
                    setContentIntent(pendingIntent)
                }
            }
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows running distance and duration while tracking"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}
