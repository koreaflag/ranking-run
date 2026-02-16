package com.runcrew.gps.util

/**
 * Adaptive GPS polling interval based on movement state.
 *
 * Strategy:
 *  - Moving:     1000 ms interval (high frequency for accuracy)
 *  - Stationary: 5000 ms interval (save battery while standing still)
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
    }

    @Volatile
    private var isMoving: Boolean = true

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

    fun getCurrentInterval(): Long {
        return if (isMoving) INTERVAL_MOVING_MS else INTERVAL_STATIONARY_MS
    }

    fun getCurrentFastestInterval(): Long {
        return if (isMoving) FASTEST_INTERVAL_MOVING_MS else FASTEST_INTERVAL_STATIONARY_MS
    }

    fun isCurrentlyMoving(): Boolean = isMoving

    fun reset() {
        isMoving = true
        lastIntervalChangeTime = 0L
    }
}
