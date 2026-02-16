package com.runcrew.gps.util

import kotlin.math.cos

/**
 * Converts between WGS-84 lat/lng (degrees) and a local tangent plane (meters).
 *
 * The Kalman filter operates in meters for linearity. This converter uses a
 * reference point (origin) to define a local ENU (East-North-Up) coordinate
 * frame via simple equirectangular projection, which is sufficiently accurate
 * for the scale of a running session (< 50 km).
 */
class CoordinateConverter {

    companion object {
        private const val EARTH_RADIUS_METERS = 6_371_000.0

        /**
         * Meters per degree of latitude (approximately constant).
         */
        const val METERS_PER_DEG_LAT = 111_320.0

        /**
         * Meters per degree of longitude at a given latitude.
         */
        fun metersPerDegLng(latitudeDegrees: Double): Double {
            return METERS_PER_DEG_LAT * cos(Math.toRadians(latitudeDegrees))
        }
    }

    private var originLat: Double = 0.0
    private var originLng: Double = 0.0
    private var originAlt: Double = 0.0
    private var metersPerDegLngAtOrigin: Double = METERS_PER_DEG_LAT
    private var initialized: Boolean = false

    /**
     * Set the origin reference point. Must be called before any conversions.
     * Typically set to the first valid GPS fix of the session.
     */
    fun setOrigin(latitude: Double, longitude: Double, altitude: Double = 0.0) {
        originLat = latitude
        originLng = longitude
        originAlt = altitude
        metersPerDegLngAtOrigin = metersPerDegLng(latitude)
        initialized = true
    }

    fun isInitialized(): Boolean = initialized

    /**
     * Convert lat/lng/alt to local meters (north, east, up) relative to origin.
     * Returns DoubleArray [northMeters, eastMeters, upMeters].
     */
    fun toMeters(latitude: Double, longitude: Double, altitude: Double = 0.0): DoubleArray {
        check(initialized) { "CoordinateConverter origin not set. Call setOrigin() first." }
        val north = (latitude - originLat) * METERS_PER_DEG_LAT
        val east = (longitude - originLng) * metersPerDegLngAtOrigin
        val up = altitude - originAlt
        return doubleArrayOf(north, east, up)
    }

    /**
     * Convert local meters (north, east, up) back to lat/lng/alt.
     * Returns DoubleArray [latitude, longitude, altitude].
     */
    fun toLatLng(northMeters: Double, eastMeters: Double, upMeters: Double = 0.0): DoubleArray {
        check(initialized) { "CoordinateConverter origin not set. Call setOrigin() first." }
        val lat = originLat + northMeters / METERS_PER_DEG_LAT
        val lng = originLng + eastMeters / metersPerDegLngAtOrigin
        val alt = originAlt + upMeters
        return doubleArrayOf(lat, lng, alt)
    }

    /**
     * Reset the converter. Call setOrigin() again before further use.
     */
    fun reset() {
        initialized = false
        originLat = 0.0
        originLng = 0.0
        originAlt = 0.0
    }
}
