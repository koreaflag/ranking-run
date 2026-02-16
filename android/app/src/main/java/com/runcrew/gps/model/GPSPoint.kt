package com.runcrew.gps.model

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/**
 * Raw GPS point captured directly from FusedLocationProvider.
 * Maps to the RawGPSPoint interface in shared-interfaces.md.
 * This data is stored as-is for server upload after the run completes.
 */
data class GPSPoint(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,
    val speed: Float,
    val bearing: Float,
    val horizontalAccuracy: Float,
    val verticalAccuracy: Float,
    val speedAccuracy: Float,       // -1 if unavailable
    val timestamp: Long,            // Unix timestamp in milliseconds
    val elapsedRealtimeNanos: Long, // SystemClock.elapsedRealtimeNanos() for monotonic comparison
    val provider: String            // "gps", "fused", or "network"
) {
    /**
     * Convert to a React Native WritableMap matching the RawGPSPoint interface.
     */
    fun toWritableMap(): WritableMap {
        return Arguments.createMap().apply {
            putDouble("latitude", latitude)
            putDouble("longitude", longitude)
            putDouble("altitude", altitude)
            putDouble("speed", speed.toDouble())
            putDouble("bearing", bearing.toDouble())
            putDouble("horizontalAccuracy", horizontalAccuracy.toDouble())
            putDouble("verticalAccuracy", verticalAccuracy.toDouble())
            putDouble("speedAccuracy", speedAccuracy.toDouble())
            putDouble("timestamp", timestamp.toDouble())
            putString("provider", provider)
        }
    }

    companion object {
        /**
         * Create a GPSPoint from an Android Location object.
         */
        fun fromLocation(location: android.location.Location): GPSPoint {
            return GPSPoint(
                latitude = location.latitude,
                longitude = location.longitude,
                altitude = if (location.hasAltitude()) location.altitude else 0.0,
                speed = if (location.hasSpeed()) location.speed else 0f,
                bearing = if (location.hasBearing()) location.bearing else 0f,
                horizontalAccuracy = if (location.hasAccuracy()) location.accuracy else Float.MAX_VALUE,
                verticalAccuracy = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && location.hasVerticalAccuracy()) {
                    location.verticalAccuracyMeters
                } else {
                    -1f
                },
                speedAccuracy = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && location.hasSpeedAccuracy()) {
                    location.speedAccuracyMetersPerSecond
                } else {
                    -1f
                },
                timestamp = location.time,
                elapsedRealtimeNanos = location.elapsedRealtimeNanos,
                provider = location.provider ?: "fused"
            )
        }
    }
}
