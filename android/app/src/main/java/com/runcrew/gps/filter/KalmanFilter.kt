package com.runcrew.gps.filter

import com.runcrew.gps.model.GPSPoint
import com.runcrew.gps.util.CoordinateConverter
import com.runcrew.gps.util.GeoMath

/**
 * 6-dimensional linear Kalman filter for GPS smoothing.
 *
 * State vector x = [north, east, up, v_north, v_east, v_up]
 * where north/east/up are in meters relative to a local origin.
 *
 * The filter operates in a local tangent plane (meters) to preserve linearity.
 * CoordinateConverter handles lat/lng <-> meters conversion.
 *
 * Matrices:
 *   F (state transition): constant-velocity model with dt
 *   H (observation):      identity for position, optional for velocity
 *   Q (process noise):    tuned by accelerometer variance
 *   R (measurement noise): GPS horizontalAccuracy^2 on diagonal
 *   P (state covariance):  propagated by standard Kalman equations
 */
class KalmanFilter(
    private val coordinateConverter: CoordinateConverter
) {
    companion object {
        private const val STATE_DIM = 6
        private const val POSITION_NORTH = 0
        private const val POSITION_EAST = 1
        private const val POSITION_UP = 2
        private const val VELOCITY_NORTH = 3
        private const val VELOCITY_EAST = 4
        private const val VELOCITY_UP = 5

        // Default process noise standard deviations
        private const val DEFAULT_ACCEL_NOISE = 1.5  // m/s^2 for running
        private const val DEFAULT_VERTICAL_NOISE = 0.5

        // Initial position uncertainty (meters)
        private const val INITIAL_POSITION_VARIANCE = 100.0
        // Initial velocity uncertainty (m/s)
        private const val INITIAL_VELOCITY_VARIANCE = 25.0
    }

    // State vector [north, east, up, v_north, v_east, v_up]
    private val x = DoubleArray(STATE_DIM)

    // State covariance matrix P (6x6), stored as flat row-major array
    private val P = DoubleArray(STATE_DIM * STATE_DIM)

    // Process noise scaling: adjusted by accelerometer variance
    @Volatile
    var accelerometerVariance: Double = 1.0
        set(value) {
            field = value.coerceIn(0.1, 10.0)
        }

    private var lastTimestamp: Long = 0L
    private var initialized = false

    /**
     * Initialize the filter with the first GPS observation.
     */
    fun initialize(point: GPSPoint) {
        if (!coordinateConverter.isInitialized()) {
            coordinateConverter.setOrigin(point.latitude, point.longitude, point.altitude)
        }

        val meters = coordinateConverter.toMeters(point.latitude, point.longitude, point.altitude)
        x[POSITION_NORTH] = meters[0]
        x[POSITION_EAST] = meters[1]
        x[POSITION_UP] = meters[2]

        // Initialize velocity from GPS speed and bearing if available
        if (point.speed > 0) {
            val (vn, ve) = GeoMath.velocityComponents(point.speed.toDouble(), point.bearing.toDouble())
            x[VELOCITY_NORTH] = vn
            x[VELOCITY_EAST] = ve
        } else {
            x[VELOCITY_NORTH] = 0.0
            x[VELOCITY_EAST] = 0.0
        }
        x[VELOCITY_UP] = 0.0

        // Initialize P as diagonal
        for (i in 0 until STATE_DIM * STATE_DIM) P[i] = 0.0
        P[idx(POSITION_NORTH, POSITION_NORTH)] = INITIAL_POSITION_VARIANCE
        P[idx(POSITION_EAST, POSITION_EAST)] = INITIAL_POSITION_VARIANCE
        P[idx(POSITION_UP, POSITION_UP)] = INITIAL_POSITION_VARIANCE
        P[idx(VELOCITY_NORTH, VELOCITY_NORTH)] = INITIAL_VELOCITY_VARIANCE
        P[idx(VELOCITY_EAST, VELOCITY_EAST)] = INITIAL_VELOCITY_VARIANCE
        P[idx(VELOCITY_UP, VELOCITY_UP)] = INITIAL_VELOCITY_VARIANCE

        lastTimestamp = point.timestamp
        initialized = true
    }

    /**
     * Process a new GPS observation. Returns the filtered state as
     * [latitude, longitude, altitude, speed, bearing].
     *
     * Returns null if the filter is not yet initialized.
     */
    fun process(point: GPSPoint): FilterResult? {
        if (!initialized) {
            initialize(point)
            val latLng = coordinateConverter.toLatLng(x[POSITION_NORTH], x[POSITION_EAST], x[POSITION_UP])
            val speed = GeoMath.speedFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
            val bearing = GeoMath.bearingFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
            return FilterResult(latLng[0], latLng[1], latLng[2], speed, bearing)
        }

        val dt = (point.timestamp - lastTimestamp) / 1000.0 // seconds
        if (dt <= 0) return null // Reject non-advancing timestamps
        if (dt > 30.0) {
            // Too large a gap -- reinitialize rather than extrapolate wildly
            initialize(point)
            val latLng = coordinateConverter.toLatLng(x[POSITION_NORTH], x[POSITION_EAST], x[POSITION_UP])
            val speed = GeoMath.speedFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
            val bearing = GeoMath.bearingFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
            return FilterResult(latLng[0], latLng[1], latLng[2], speed, bearing)
        }

        lastTimestamp = point.timestamp

        // --- Predict step ---
        predict(dt)

        // --- Update step ---
        val meters = coordinateConverter.toMeters(point.latitude, point.longitude, point.altitude)
        update(point, meters)

        // Convert back to lat/lng
        val latLng = coordinateConverter.toLatLng(x[POSITION_NORTH], x[POSITION_EAST], x[POSITION_UP])
        val speed = GeoMath.speedFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
        val bearing = GeoMath.bearingFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])

        return FilterResult(latLng[0], latLng[1], latLng[2], speed, bearing)
    }

    /**
     * Prediction step: propagate state and covariance forward by dt seconds.
     * Uses constant-velocity model: position += velocity * dt
     */
    private fun predict(dt: Double) {
        // State prediction: x_pred = F * x
        // F is identity + dt in off-diagonal velocity->position blocks
        x[POSITION_NORTH] += x[VELOCITY_NORTH] * dt
        x[POSITION_EAST] += x[VELOCITY_EAST] * dt
        x[POSITION_UP] += x[VELOCITY_UP] * dt

        // Covariance prediction: P_pred = F * P * F^T + Q
        // F * P * F^T for a constant-velocity model:
        // We compute this explicitly for the 6x6 case for clarity and performance.
        val pNew = P.copyOf()

        // P[pos, pos] += dt * (P[pos, vel] + P[vel, pos]) + dt^2 * P[vel, vel]
        for (posIdx in 0..2) {
            val velIdx = posIdx + 3
            for (j in 0 until STATE_DIM) {
                pNew[idx(posIdx, j)] += dt * P[idx(velIdx, j)]
            }
        }
        // Symmetrically update columns
        for (i in 0 until STATE_DIM) {
            for (posIdx in 0..2) {
                val velIdx = posIdx + 3
                pNew[idx(i, posIdx)] += dt * P[idx(i, velIdx)]
            }
        }
        // Add dt^2 * P[vel, vel] to P[pos, pos]
        for (posI in 0..2) {
            val velI = posI + 3
            for (posJ in 0..2) {
                val velJ = posJ + 3
                pNew[idx(posI, posJ)] += dt * dt * P[idx(velI, velJ)]
            }
        }

        // Copy pNew back
        System.arraycopy(pNew, 0, P, 0, STATE_DIM * STATE_DIM)

        // Add process noise Q
        val accelNoise = DEFAULT_ACCEL_NOISE * kotlin.math.sqrt(accelerometerVariance)
        val qAccel = accelNoise * accelNoise
        val qVert = DEFAULT_VERTICAL_NOISE * DEFAULT_VERTICAL_NOISE

        // Q contribution to position: 0.25 * dt^4 * q (from double integration)
        // Q contribution to velocity: dt^2 * q
        // Q cross-terms: 0.5 * dt^3 * q
        val dt2 = dt * dt
        val dt3 = dt2 * dt
        val dt4 = dt3 * dt

        // North/East process noise
        for (i in 0..1) {
            P[idx(i, i)] += 0.25 * dt4 * qAccel
            P[idx(i + 3, i + 3)] += dt2 * qAccel
            P[idx(i, i + 3)] += 0.5 * dt3 * qAccel
            P[idx(i + 3, i)] += 0.5 * dt3 * qAccel
        }
        // Vertical process noise
        P[idx(2, 2)] += 0.25 * dt4 * qVert
        P[idx(5, 5)] += dt2 * qVert
        P[idx(2, 5)] += 0.5 * dt3 * qVert
        P[idx(5, 2)] += 0.5 * dt3 * qVert
    }

    /**
     * Update step: incorporate GPS measurement.
     *
     * Measurement vector z = [north, east, up] (position only).
     * If GPS provides speed, we also use [v_north, v_east] measurements.
     */
    private fun update(point: GPSPoint, meters: DoubleArray) {
        val horizontalAccuracy = point.horizontalAccuracy.toDouble().coerceAtLeast(1.0)
        val verticalAccuracy = if (point.verticalAccuracy > 0) {
            point.verticalAccuracy.toDouble()
        } else {
            horizontalAccuracy * 3.0 // GPS vertical accuracy is typically ~3x worse
        }

        // Position-only update (3 measurements: north, east, up)
        // H = [I_3x3  0_3x3], z = [north, east, up]
        val z = doubleArrayOf(meters[0], meters[1], meters[2])
        val rDiag = doubleArrayOf(
            horizontalAccuracy * horizontalAccuracy,
            horizontalAccuracy * horizontalAccuracy,
            verticalAccuracy * verticalAccuracy
        )

        // Innovation: y = z - H*x
        val y = DoubleArray(3)
        for (i in 0..2) {
            y[i] = z[i] - x[i]
        }

        // Innovation covariance: S = H*P*H^T + R
        // Since H selects the first 3 rows/cols, S = P[0:3, 0:3] + R
        val S = DoubleArray(9) // 3x3
        for (i in 0..2) {
            for (j in 0..2) {
                S[i * 3 + j] = P[idx(i, j)]
            }
            S[i * 3 + i] += rDiag[i]
        }

        // S inverse (3x3)
        val Sinv = invert3x3(S) ?: return // Singular matrix, skip update

        // Kalman gain: K = P * H^T * S^-1
        // K is 6x3: K[i][j] = sum_k P[i][k] * Sinv[k][j] for k in 0..2
        val K = DoubleArray(STATE_DIM * 3)
        for (i in 0 until STATE_DIM) {
            for (j in 0..2) {
                var sum = 0.0
                for (k in 0..2) {
                    sum += P[idx(i, k)] * Sinv[k * 3 + j]
                }
                K[i * 3 + j] = sum
            }
        }

        // State update: x = x + K * y
        for (i in 0 until STATE_DIM) {
            for (j in 0..2) {
                x[i] += K[i * 3 + j] * y[j]
            }
        }

        // Covariance update: P = (I - K*H) * P
        // (I - K*H)[i][j] = delta_ij - K[i][j] if j < 3, else delta_ij
        val pNew = DoubleArray(STATE_DIM * STATE_DIM)
        for (i in 0 until STATE_DIM) {
            for (j in 0 until STATE_DIM) {
                var sum = P[idx(i, j)]
                for (k in 0..2) {
                    sum -= K[i * 3 + k] * P[idx(k, j)]
                }
                pNew[idx(i, j)] = sum
            }
        }
        System.arraycopy(pNew, 0, P, 0, STATE_DIM * STATE_DIM)

        // Velocity update from GPS speed/bearing if available
        if (point.speed > 0 && point.speedAccuracy > 0) {
            updateVelocity(point)
        }
    }

    /**
     * Separate velocity update using GPS-reported speed and bearing.
     * This is a secondary measurement update for the velocity state components.
     */
    private fun updateVelocity(point: GPSPoint) {
        val (vNorthMeas, vEastMeas) = GeoMath.velocityComponents(
            point.speed.toDouble(), point.bearing.toDouble()
        )
        val speedAcc = point.speedAccuracy.toDouble().coerceAtLeast(0.5)
        val rVel = speedAcc * speedAcc

        // H_vel selects indices 3 and 4; measurement = [v_north, v_east]
        for (velMeasIdx in 0..1) {
            val stateIdx = velMeasIdx + 3
            val innovation = (if (velMeasIdx == 0) vNorthMeas else vEastMeas) - x[stateIdx]
            val s = P[idx(stateIdx, stateIdx)] + rVel
            if (s <= 0) continue

            // Scalar Kalman update for this single measurement
            val kGain = DoubleArray(STATE_DIM)
            for (i in 0 until STATE_DIM) {
                kGain[i] = P[idx(i, stateIdx)] / s
            }

            for (i in 0 until STATE_DIM) {
                x[i] += kGain[i] * innovation
            }

            val pNew = P.copyOf()
            for (i in 0 until STATE_DIM) {
                for (j in 0 until STATE_DIM) {
                    pNew[idx(i, j)] -= kGain[i] * P[idx(stateIdx, j)]
                }
            }
            System.arraycopy(pNew, 0, P, 0, STATE_DIM * STATE_DIM)
        }
    }

    /**
     * Get current estimated position in lat/lng/alt.
     */
    fun getCurrentPosition(): DoubleArray {
        return coordinateConverter.toLatLng(x[POSITION_NORTH], x[POSITION_EAST], x[POSITION_UP])
    }

    /**
     * Get current estimated speed (m/s).
     */
    fun getCurrentSpeed(): Double {
        return GeoMath.speedFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
    }

    /**
     * Get current estimated bearing (degrees).
     */
    fun getCurrentBearing(): Double {
        return GeoMath.bearingFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
    }

    fun isInitialized(): Boolean = initialized

    fun reset() {
        for (i in x.indices) x[i] = 0.0
        for (i in P.indices) P[i] = 0.0
        lastTimestamp = 0L
        initialized = false
        accelerometerVariance = 1.0
    }

    // Helper: row-major index into 6x6 flat array
    private fun idx(row: Int, col: Int): Int = row * STATE_DIM + col

    /**
     * Invert a 3x3 matrix stored as a 9-element row-major array.
     * Returns null if the matrix is singular (determinant near zero).
     */
    private fun invert3x3(m: DoubleArray): DoubleArray? {
        val a = m[0]; val b = m[1]; val c = m[2]
        val d = m[3]; val e = m[4]; val f = m[5]
        val g = m[6]; val h = m[7]; val k = m[8]

        val det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g)
        if (kotlin.math.abs(det) < 1e-12) return null

        val invDet = 1.0 / det
        return doubleArrayOf(
            (e * k - f * h) * invDet, (c * h - b * k) * invDet, (b * f - c * e) * invDet,
            (f * g - d * k) * invDet, (a * k - c * g) * invDet, (c * d - a * f) * invDet,
            (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet
        )
    }

    /**
     * Result of a Kalman filter update cycle.
     */
    data class FilterResult(
        val latitude: Double,
        val longitude: Double,
        val altitude: Double,
        val speed: Double,   // m/s
        val bearing: Double  // degrees [0, 360)
    )
}
