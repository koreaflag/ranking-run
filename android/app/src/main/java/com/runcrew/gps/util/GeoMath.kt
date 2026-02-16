package com.runcrew.gps.util

import kotlin.math.*

/**
 * Geodesic math utilities for distance, bearing, and speed calculations.
 * All distance results are in meters, speeds in m/s, bearings in degrees [0, 360).
 */
object GeoMath {

    private const val EARTH_RADIUS_METERS = 6_371_000.0

    /**
     * Haversine distance between two WGS-84 coordinates.
     * Returns distance in meters.
     */
    fun haversineDistance(
        lat1: Double, lng1: Double,
        lat2: Double, lng2: Double
    ): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val radLat1 = Math.toRadians(lat1)
        val radLat2 = Math.toRadians(lat2)

        val a = sin(dLat / 2).pow(2) +
                cos(radLat1) * cos(radLat2) * sin(dLng / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))

        return EARTH_RADIUS_METERS * c
    }

    /**
     * Initial bearing (forward azimuth) from point 1 to point 2.
     * Returns degrees in [0, 360).
     */
    fun bearing(
        lat1: Double, lng1: Double,
        lat2: Double, lng2: Double
    ): Double {
        val radLat1 = Math.toRadians(lat1)
        val radLat2 = Math.toRadians(lat2)
        val dLng = Math.toRadians(lng2 - lng1)

        val x = sin(dLng) * cos(radLat2)
        val y = cos(radLat1) * sin(radLat2) -
                sin(radLat1) * cos(radLat2) * cos(dLng)

        val bearing = Math.toDegrees(atan2(x, y))
        return (bearing + 360) % 360
    }

    /**
     * Speed between two points given their timestamps.
     * Returns m/s. Returns 0 if timestamps are identical.
     */
    fun speed(
        lat1: Double, lng1: Double, timestamp1: Long,
        lat2: Double, lng2: Double, timestamp2: Long
    ): Double {
        val dt = (timestamp2 - timestamp1) / 1000.0 // seconds
        if (dt <= 0) return 0.0
        val dist = haversineDistance(lat1, lng1, lat2, lng2)
        return dist / dt
    }

    /**
     * 3D distance including altitude difference.
     * Uses Haversine for horizontal + Pythagorean for vertical.
     */
    fun distance3D(
        lat1: Double, lng1: Double, alt1: Double,
        lat2: Double, lng2: Double, alt2: Double
    ): Double {
        val horizontalDist = haversineDistance(lat1, lng1, lat2, lng2)
        val verticalDist = alt2 - alt1
        return sqrt(horizontalDist.pow(2) + verticalDist.pow(2))
    }

    /**
     * Decompose speed into north and east velocity components (m/s).
     * Bearing is in degrees clockwise from north.
     */
    fun velocityComponents(speed: Double, bearingDegrees: Double): Pair<Double, Double> {
        val bearingRad = Math.toRadians(bearingDegrees)
        val vNorth = speed * cos(bearingRad)
        val vEast = speed * sin(bearingRad)
        return vNorth to vEast
    }

    /**
     * Speed from north/east velocity components.
     */
    fun speedFromComponents(vNorth: Double, vEast: Double): Double {
        return sqrt(vNorth.pow(2) + vEast.pow(2))
    }

    /**
     * Bearing from north/east velocity components.
     * Returns degrees in [0, 360).
     */
    fun bearingFromComponents(vNorth: Double, vEast: Double): Double {
        val bearing = Math.toDegrees(atan2(vEast, vNorth))
        return (bearing + 360) % 360
    }
}
