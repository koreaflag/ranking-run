package com.runcrew.gps.model

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/**
 * A location point after passing through the full filtering pipeline
 * (validity check -> outlier removal -> Kalman filter -> sensor fusion).
 * Maps to the FilteredLocation interface in shared-interfaces.md.
 */
data class FilteredLocation(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,            // Barometer-corrected altitude
    val speed: Double,               // Kalman-estimated speed (m/s)
    val bearing: Double,             // 0-360 degrees
    val timestamp: Long,             // Unix timestamp (ms)
    val distanceFromPrevious: Double, // Distance from prior filtered point (meters)
    val cumulativeDistance: Double,    // Total accumulated distance (meters)
    val isInterpolated: Boolean       // True if generated via dead reckoning
) {
    /**
     * Convert to a React Native WritableMap matching the FilteredLocation interface.
     */
    fun toWritableMap(): WritableMap {
        return Arguments.createMap().apply {
            putDouble("latitude", latitude)
            putDouble("longitude", longitude)
            putDouble("altitude", altitude)
            putDouble("speed", speed)
            putDouble("bearing", bearing)
            putDouble("timestamp", timestamp.toDouble())
            putDouble("distanceFromPrevious", distanceFromPrevious)
            putDouble("cumulativeDistance", cumulativeDistance)
            putBoolean("isInterpolated", isInterpolated)
        }
    }

    /**
     * Convert to a LocationUpdateEvent WritableMap for the onLocationUpdate event.
     * Accepts optional sensor data (cadence, elevation) to match iOS parity.
     */
    fun toLocationUpdateEvent(
        isMoving: Boolean,
        cadenceSPM: Int = 0,
        elevationGain: Double = 0.0,
        elevationLoss: Double = 0.0,
        distanceSource: String = "gps"
    ): WritableMap {
        return Arguments.createMap().apply {
            putDouble("latitude", latitude)
            putDouble("longitude", longitude)
            putDouble("altitude", altitude)
            putDouble("speed", speed)
            putDouble("bearing", bearing)
            putDouble("accuracy", if (distanceSource == "pedometer") 100.0 else 0.0)
            putDouble("timestamp", timestamp.toDouble())
            putDouble("distanceFromStart", cumulativeDistance)
            putBoolean("isMoving", isMoving)
            putInt("cadence", cadenceSPM)
            putDouble("elevationGain", elevationGain)
            putDouble("elevationLoss", elevationLoss)
            putString("distanceSource", distanceSource)
        }
    }
}
