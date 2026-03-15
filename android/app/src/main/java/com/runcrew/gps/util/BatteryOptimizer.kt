package com.runcrew.gps.util

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

/**
 * Adaptive GPS polling interval based on movement state and battery level.
 *
 * Strategy:
 *  - Moving:     1000 ms interval (high frequency for accuracy)
 *  - Stationary: 5000 ms interval (save battery while standing still)
 *  - Low battery (<15%): 2000 ms interval even when moving (reduced accuracy to save power)
 *
 * The optimizer exposes the desired interval and lets LocationEngine
 * apply it via LocationRequest updates.
 */
class BatteryOptimizer {

    companion object {
        const val INTERVAL_MOVING_MS = 1000L
        const val FASTEST_INTERVAL_MOVING_MS = 500L

        const val INTERVAL_STATIONARY_MS = 5000L
        const val FASTEST_INTERVAL_STATIONARY_MS = 2000L

        // Low-battery intervals: less frequent to conserve power
        const val INTERVAL_LOW_BATTERY_MS = 2000L
        const val FASTEST_INTERVAL_LOW_BATTERY_MS = 1000L

        // Battery level threshold for reduced GPS frequency
        const val LOW_BATTERY_THRESHOLD = 15
    }

    @Volatile
    private var isMoving: Boolean = true

    @Volatile
    private var isLowBattery: Boolean = false

    @Volatile
    private var lastIntervalChangeTime: Long = 0L

    /**
     * Minimum time (ms) between interval changes to avoid rapid toggling.
     */
    private val debounceMs: Long = 3000L

    /**
     * Update the movement state. Returns true if the GPS interval should change.
     */
    fun updateMovementState(moving: Boolean): Boolean {
        if (moving == isMoving) return false

        val now = System.currentTimeMillis()
        if (now - lastIntervalChangeTime < debounceMs) return false

        isMoving = moving
        lastIntervalChangeTime = now
        return true
    }

    /**
     * Check current battery level and update low-battery state.
     * Returns true if the GPS interval should change due to battery level change.
     */
    fun updateBatteryState(context: Context): Boolean {
        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { filter ->
            context.registerReceiver(null, filter)
        }

        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val batteryPercent = if (scale > 0) (level * 100) / scale else 100

        val wasLowBattery = isLowBattery
        isLowBattery = batteryPercent in 0 until LOW_BATTERY_THRESHOLD
        return wasLowBattery != isLowBattery
    }

    fun getCurrentInterval(): Long {
        return when {
            !isMoving -> INTERVAL_STATIONARY_MS
            isLowBattery -> INTERVAL_LOW_BATTERY_MS
            else -> INTERVAL_MOVING_MS
        }
    }

    fun getCurrentFastestInterval(): Long {
        return when {
            !isMoving -> FASTEST_INTERVAL_STATIONARY_MS
            isLowBattery -> FASTEST_INTERVAL_LOW_BATTERY_MS
            else -> FASTEST_INTERVAL_MOVING_MS
        }
    }

    fun isCurrentlyMoving(): Boolean = isMoving

    fun isLowBatteryMode(): Boolean = isLowBattery

    fun reset() {
        isMoving = true
        isLowBattery = false
        lastIntervalChangeTime = 0L
    }
}
