package com.runcrew.gps.filter

import com.runcrew.gps.model.GPSPoint
import com.runcrew.gps.util.GeoMath

/**
 * Multi-layered outlier detection for raw GPS points.
 *
 * Rejection criteria (any one triggers rejection):
 *   1. horizontalAccuracy > 30 m
 *   2. Speed between consecutive points > 15 m/s (~54 km/h, well above max running speed)
 *   3. Acceleration > 8 m/s^2 over 3 consecutive points (rejects the middle point)
 *   4. Timestamp is > 10 seconds old (stale data)
 *   5. Invalid coordinate range
 */
class OutlierDetector {

    companion object {
        const val MAX_ACCURACY_METERS = 30f
        const val MAX_SPEED_MS = 15.0              // ~54 km/h, sprint world record ~12 m/s
        const val MAX_ACCELERATION_MS2 = 8.0       // m/s^2
        const val MAX_STALENESS_MS = 10_000L       // 10 seconds

        // Adaptive speed thresholds based on recent activity
        private const val WALKING_SPEED_THRESHOLD = 2.0    // m/s (~7.2 km/h)
        private const val WALKING_MAX_SPEED_MS = 6.0       // m/s (~21.6 km/h) — generous for walking
        private const val RUNNING_MAX_SPEED_MS = MAX_SPEED_MS

        // Number of recent speeds to average for adaptive threshold
        private const val SPEED_HISTORY_SIZE = 10
    }

    // Circular buffer of the last 3 accepted points for acceleration check
    private val recentPoints = ArrayDeque<GPSPoint>(4)

    // Recent speed history for adaptive threshold
    private val recentSpeeds = ArrayDeque<Double>(SPEED_HISTORY_SIZE + 1)

    /**
     * Evaluate whether a new GPS point should be accepted or rejected.
     *
     * @param point The raw GPS point to evaluate.
     * @return An [OutlierResult] indicating acceptance or rejection with a reason.
     */
    @Synchronized
    fun evaluate(point: GPSPoint): OutlierResult {
        // Layer 1: Validity checks
        if (!isValidCoordinate(point.latitude, point.longitude)) {
            return OutlierResult.Rejected("Invalid coordinates: ${point.latitude}, ${point.longitude}")
        }

        if (point.horizontalAccuracy > MAX_ACCURACY_METERS) {
            return OutlierResult.Rejected(
                "Accuracy too low: ${point.horizontalAccuracy}m > ${MAX_ACCURACY_METERS}m"
            )
        }

        // Staleness check: reject points with timestamps more than 10s in the past
        val now = System.currentTimeMillis()
        if (now - point.timestamp > MAX_STALENESS_MS) {
            return OutlierResult.Rejected(
                "Stale data: ${now - point.timestamp}ms old > ${MAX_STALENESS_MS}ms"
            )
        }

        // Layer 2: Speed check against previous accepted point (adaptive threshold)
        val lastAccepted = recentPoints.lastOrNull()
        if (lastAccepted != null) {
            val dist = GeoMath.haversineDistance(
                lastAccepted.latitude, lastAccepted.longitude,
                point.latitude, point.longitude
            )
            val dtSec = (point.timestamp - lastAccepted.timestamp) / 1000.0
            val speed = if (dtSec > 0) dist / dtSec else 0.0
            val adaptiveMaxSpeed = getAdaptiveSpeedThreshold()
            if (speed > adaptiveMaxSpeed) {
                return OutlierResult.Rejected(
                    "Speed too high: %.1f m/s > %.1f m/s (adaptive)".format(speed, adaptiveMaxSpeed)
                )
            }
            // Background GPS guard: when update interval is large (>5s),
            // GPS may report stale/cell-tower positions. Cap distance to prevent
            // straight-line jumps. Raised from 30m to 50m to avoid rejecting valid
            // GPS updates after brief signal gaps (matched with iOS).
            if (dtSec > 5.0 && dist > 50.0) {
                return OutlierResult.Rejected(
                    "Background jump: %.0fm in %.1fs".format(dist, dtSec)
                )
            }
        }

        // Layer 3: Acceleration check over 3 consecutive points
        // If we have at least 2 previous points, check if adding this one creates
        // impossible acceleration at the middle point.
        if (recentPoints.size >= 2) {
            val p1 = recentPoints[recentPoints.size - 2]
            val p2 = recentPoints[recentPoints.size - 1]
            val p3 = point

            val accel = calculateAcceleration(p1, p2, p3)
            if (accel > MAX_ACCELERATION_MS2) {
                // The middle point (p2) is suspicious. However, since p2 was already
                // accepted, we flag the new point as potentially problematic.
                // In practice, this means the transition p2->p3 is too abrupt.
                return OutlierResult.Rejected(
                    "Acceleration too high: %.1f m/s^2 > %.1f m/s^2".format(accel, MAX_ACCELERATION_MS2)
                )
            }
        }

        // Point accepted -- add to history
        recentPoints.addLast(point)
        if (recentPoints.size > 3) {
            recentPoints.removeFirst()
        }

        // Track speed for adaptive threshold
        if (lastAccepted != null) {
            val dist = GeoMath.haversineDistance(
                lastAccepted.latitude, lastAccepted.longitude,
                point.latitude, point.longitude
            )
            val dtSec = (point.timestamp - lastAccepted.timestamp) / 1000.0
            if (dtSec > 0) {
                recentSpeeds.addLast(dist / dtSec)
                if (recentSpeeds.size > SPEED_HISTORY_SIZE) {
                    recentSpeeds.removeFirst()
                }
            }
        }

        return OutlierResult.Accepted
    }

    /**
     * Calculate the magnitude of acceleration at the middle point p2.
     * Uses finite difference: a = (v23 - v12) / dt_avg
     */
    private fun calculateAcceleration(p1: GPSPoint, p2: GPSPoint, p3: GPSPoint): Double {
        val dt12 = (p2.timestamp - p1.timestamp) / 1000.0
        val dt23 = (p3.timestamp - p2.timestamp) / 1000.0
        if (dt12 <= 0 || dt23 <= 0) return 0.0

        val v12 = GeoMath.haversineDistance(
            p1.latitude, p1.longitude, p2.latitude, p2.longitude
        ) / dt12

        val v23 = GeoMath.haversineDistance(
            p2.latitude, p2.longitude, p3.latitude, p3.longitude
        ) / dt23

        val dtAvg = (dt12 + dt23) / 2.0
        return kotlin.math.abs(v23 - v12) / dtAvg
    }

    /**
     * Return an adaptive max speed threshold based on recent average speed.
     * If the user is walking (low average speed), use a lower threshold to catch
     * GPS jumps that would look normal at running pace.
     */
    private fun getAdaptiveSpeedThreshold(): Double {
        if (recentSpeeds.isEmpty()) return RUNNING_MAX_SPEED_MS

        val avgSpeed = recentSpeeds.average()
        return if (avgSpeed < WALKING_SPEED_THRESHOLD) {
            WALKING_MAX_SPEED_MS
        } else {
            RUNNING_MAX_SPEED_MS
        }
    }

    private fun isValidCoordinate(lat: Double, lng: Double): Boolean {
        return lat in -90.0..90.0 && lng in -180.0..180.0 &&
                !(lat == 0.0 && lng == 0.0) // Reject null island
    }

    @Synchronized
    fun reset() {
        recentPoints.clear()
        recentSpeeds.clear()
    }

    sealed class OutlierResult {
        object Accepted : OutlierResult()
        data class Rejected(val reason: String) : OutlierResult()
    }
}
