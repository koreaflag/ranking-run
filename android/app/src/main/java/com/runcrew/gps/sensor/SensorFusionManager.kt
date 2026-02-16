package com.runcrew.gps.sensor

import android.hardware.SensorManager
import com.runcrew.gps.filter.KalmanFilter
import com.runcrew.gps.filter.StationaryDetector
import com.runcrew.gps.model.GPSPoint
import com.runcrew.gps.util.GeoMath

/**
 * Coordinates all sensor modules and the Kalman filter into a unified
 * sensor fusion pipeline.
 *
 * Responsibilities:
 *   - Feed accelerometer variance to Kalman filter Q matrix tuning
 *   - Provide barometric altitude to replace GPS altitude in output
 *   - Enable dead reckoning when GPS signal is lost (step count * stride * bearing)
 *   - Manage lifecycle of all sensor listeners
 */
class SensorFusionManager(
    private val sensorManager: SensorManager,
    private val kalmanFilter: KalmanFilter,
    private val stationaryDetector: StationaryDetector
) {
    val stepDetector = StepDetector(sensorManager)
    val barometerTracker = BarometerTracker(sensorManager)

    @Volatile
    private var lastKnownLatitude: Double = 0.0
    @Volatile
    private var lastKnownLongitude: Double = 0.0
    @Volatile
    private var lastKnownBearing: Double = 0.0
    @Volatile
    private var lastGpsTimestamp: Long = 0L

    // Dead reckoning accumulator
    @Volatile
    private var deadReckoningSteps: Int = 0
    @Volatile
    private var isDeadReckoning: Boolean = false

    fun start() {
        stationaryDetector.start()
        stepDetector.start()
        barometerTracker.start()

        // Feed accelerometer variance into Kalman filter dynamically
        // The StationaryDetector already tracks accel variance; we read it
        // from there rather than registering a duplicate listener.

        // Count steps for dead reckoning
        stepDetector.addListener { _ ->
            if (isDeadReckoning) {
                deadReckoningSteps++
            }
        }
    }

    fun stop() {
        stationaryDetector.stop()
        stepDetector.stop()
        barometerTracker.stop()
    }

    /**
     * Called after each GPS point passes through the Kalman filter.
     * Updates internal state for sensor fusion corrections.
     */
    fun onFilteredLocationReady(
        point: GPSPoint,
        filteredLat: Double,
        filteredLng: Double,
        filteredSpeed: Double,
        filteredBearing: Double
    ) {
        lastKnownLatitude = filteredLat
        lastKnownLongitude = filteredLng
        lastKnownBearing = filteredBearing
        lastGpsTimestamp = point.timestamp

        // Update sensor modules with current speed
        stepDetector.updateSpeed(filteredSpeed)
        stationaryDetector.updateGpsSpeed(filteredSpeed)

        // Feed accelerometer variance to Kalman filter Q-matrix tuning
        kalmanFilter.accelerometerVariance = stationaryDetector.currentAccelVariance.coerceAtLeast(0.1)

        // If GPS altitude is available, set barometer base on first fix
        if (point.altitude != 0.0 && !barometerTracker.isAvailable) {
            // No barometer -- altitude comes from GPS directly
        } else if (point.altitude != 0.0 && barometerTracker.currentRelativeAltitude == 0.0) {
            barometerTracker.setBaseAltitude(point.altitude)
        }

        // GPS is alive, disable dead reckoning
        isDeadReckoning = false
        deadReckoningSteps = 0
    }

    /**
     * Get the current best altitude estimate.
     * Prefers barometric altitude over GPS altitude.
     */
    fun getBestAltitude(gpsAltitude: Double): Double {
        return if (barometerTracker.isAvailable && barometerTracker.currentAbsoluteAltitude != 0.0) {
            barometerTracker.currentAbsoluteAltitude
        } else {
            gpsAltitude
        }
    }

    /**
     * Attempt dead reckoning to estimate position when GPS is lost.
     * Uses: last known position + step count * stride * bearing
     *
     * Returns [latitude, longitude] or null if dead reckoning is not possible.
     */
    fun attemptDeadReckoning(): DeadReckoningResult? {
        if (!isDeadReckoning) {
            isDeadReckoning = true
            deadReckoningSteps = 0
            return null
        }

        if (deadReckoningSteps == 0) return null

        val distance = deadReckoningSteps * stepDetector.currentStrideEstimate
        val bearingRad = Math.toRadians(lastKnownBearing)

        // Approximate new position using flat-earth approximation (valid for short distances)
        val dNorth = distance * kotlin.math.cos(bearingRad)
        val dEast = distance * kotlin.math.sin(bearingRad)

        val newLat = lastKnownLatitude + dNorth / 111_320.0
        val newLng = lastKnownLongitude + dEast / (111_320.0 * kotlin.math.cos(Math.toRadians(lastKnownLatitude)))

        return DeadReckoningResult(
            latitude = newLat,
            longitude = newLng,
            distance = distance,
            steps = deadReckoningSteps
        )
    }

    /**
     * Check if the runner is currently stationary.
     */
    fun isStationary(): Boolean {
        return stationaryDetector.currentState == StationaryDetector.MovementState.STATIONARY
    }

    fun reset() {
        stationaryDetector.reset()
        stepDetector.reset()
        barometerTracker.reset()
        lastKnownLatitude = 0.0
        lastKnownLongitude = 0.0
        lastKnownBearing = 0.0
        lastGpsTimestamp = 0L
        deadReckoningSteps = 0
        isDeadReckoning = false
    }

    data class DeadReckoningResult(
        val latitude: Double,
        val longitude: Double,
        val distance: Double,
        val steps: Int
    )
}
