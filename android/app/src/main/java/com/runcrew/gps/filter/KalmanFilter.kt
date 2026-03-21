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

        // Process noise base values (matched with iOS)
        // Higher = more responsive to actual movement
        private const val PROCESS_NOISE_POSITION = 1.0
        private const val PROCESS_NOISE_VELOCITY = 3.0

        // Speed-adaptive Q scaling (matched with iOS)
        // Walking: lower Q trusts prediction more (smoother path)
        // Sprinting: higher Q trusts measurements more (responsive)
        private const val WALKING_SPEED_THRESHOLD = 2.0   // m/s
        private const val RUNNING_SPEED_THRESHOLD = 5.0   // m/s
        private const val WALKING_Q_SCALE = 0.6
        private const val JOGGING_Q_SCALE = 1.0
        private const val SPRINTING_Q_SCALE = 1.8

        // Initial position uncertainty (meters)
        private const val INITIAL_POSITION_VARIANCE = 100.0
        // Initial velocity uncertainty (m/s)
        private const val INITIAL_VELOCITY_VARIANCE = 25.0
    }

    // State vector [north, east, up, v_north, v_east, v_up]
    private val x = DoubleArray(STATE_DIM)

    // State covariance matrix P (6x6), stored as flat row-major array
    private val P = DoubleArray(STATE_DIM * STATE_DIM)

    // Dynamic process noise from accelerometer variance (matched with iOS)
    // Scaled from g^2 domain: [0.001, 0.15] -> [0.5, 8.0]
    @Volatile
    var dynamicProcessNoise: Double = 1.0
        private set

    // Speed-adaptive Q scale factor
    @Volatile
    private var speedAdaptiveQScale: Double = 1.0

    /**
     * Update dynamic process noise from accelerometer variance (in g^2).
     * Matched with iOS: variance * 50.0 + 0.5, clamped [0.5, 10.0].
     */
    fun updateProcessNoise(accelerometerVariance: Double) {
        val scaled = accelerometerVariance * 50.0 + 0.5
        dynamicProcessNoise = scaled.coerceIn(0.5, 10.0)
    }

    /**
     * Update speed-adaptive Q scaling based on current estimated speed.
     * Uses linear interpolation between walking and sprinting (matched with iOS).
     */
    fun updateSpeedAdaptiveQ() {
        val currentSpeed = GeoMath.speedFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
        speedAdaptiveQScale = when {
            currentSpeed < WALKING_SPEED_THRESHOLD -> WALKING_Q_SCALE
            currentSpeed > RUNNING_SPEED_THRESHOLD -> SPRINTING_Q_SCALE
            else -> {
                // Linear interpolation between walking and sprinting scales
                val t = (currentSpeed - WALKING_SPEED_THRESHOLD) /
                        (RUNNING_SPEED_THRESHOLD - WALKING_SPEED_THRESHOLD)
                WALKING_Q_SCALE + t * (SPRINTING_Q_SCALE - WALKING_Q_SCALE)
            }
        }
    }

    // Legacy setter for backward compatibility
    @Volatile
    var accelerometerVariance: Double = 1.0
        set(value) {
            field = value.coerceIn(0.1, 10.0)
            updateProcessNoise(value)
        }

    private var lastTimestamp: Long = 0L
    private var initialized = false

    // RTS Smoother: store intermediate states for backward pass
    private data class HistoryEntry(
        val predictedState: DoubleArray,
        val predictedP: DoubleArray,
        val filteredState: DoubleArray,
        val filteredP: DoubleArray,
        val F: DoubleArray, // 6x6 state transition matrix (flat)
        val timestamp: Long,
        val speed: Float,
        val bearing: Float,
    )
    private val history = mutableListOf<HistoryEntry>()

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
    @Synchronized
    fun process(point: GPSPoint): FilterResult? {
        if (!initialized) {
            initialize(point)
            storePassthroughHistory(point)
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
            storePassthroughHistory(point)
            val latLng = coordinateConverter.toLatLng(x[POSITION_NORTH], x[POSITION_EAST], x[POSITION_UP])
            val speed = GeoMath.speedFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
            val bearing = GeoMath.bearingFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
            return FilterResult(latLng[0], latLng[1], latLng[2], speed, bearing)
        }

        lastTimestamp = point.timestamp

        // --- Predict step ---
        val prePredictState = x.copyOf()
        val prePredictP = P.copyOf()
        predict(dt)
        val predictedState = x.copyOf()
        val predictedP = P.copyOf()

        // Build F matrix (flat 6x6) for RTS smoother
        val F = DoubleArray(STATE_DIM * STATE_DIM)
        for (i in 0 until STATE_DIM) F[idx(i, i)] = 1.0
        for (i in 0..2) F[idx(i, i + 3)] = dt

        // --- Update step ---
        val meters = coordinateConverter.toMeters(point.latitude, point.longitude, point.altitude)
        update(point, meters)

        // Store for RTS backward pass
        history.add(HistoryEntry(
            predictedState = predictedState,
            predictedP = predictedP,
            filteredState = x.copyOf(),
            filteredP = P.copyOf(),
            F = F,
            timestamp = point.timestamp,
            speed = point.speed,
            bearing = point.bearing,
        ))

        // Convert back to lat/lng
        val latLng = coordinateConverter.toLatLng(x[POSITION_NORTH], x[POSITION_EAST], x[POSITION_UP])
        val speed = GeoMath.speedFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
        val bearing = GeoMath.bearingFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])

        return FilterResult(latLng[0], latLng[1], latLng[2], speed, bearing)
    }

    /**
     * Prediction step: propagate state and covariance forward by dt seconds.
     * Uses constant-velocity model: position += velocity * dt
     * Process noise Q matched with iOS: base * dynamicProcessNoise * speedAdaptiveQScale
     */
    private fun predict(dt: Double) {
        // State prediction: x_pred = F * x
        x[POSITION_NORTH] += x[VELOCITY_NORTH] * dt
        x[POSITION_EAST] += x[VELOCITY_EAST] * dt
        x[POSITION_UP] += x[VELOCITY_UP] * dt

        // Covariance prediction: P_pred = F * P * F^T + Q
        val pNew = P.copyOf()

        for (posIdx in 0..2) {
            val velIdx = posIdx + 3
            for (j in 0 until STATE_DIM) {
                pNew[idx(posIdx, j)] += dt * P[idx(velIdx, j)]
            }
        }
        for (i in 0 until STATE_DIM) {
            for (posIdx in 0..2) {
                val velIdx = posIdx + 3
                pNew[idx(i, posIdx)] += dt * P[idx(i, velIdx)]
            }
        }
        for (posI in 0..2) {
            val velI = posI + 3
            for (posJ in 0..2) {
                val velJ = posJ + 3
                pNew[idx(posI, posJ)] += dt * dt * P[idx(velI, velJ)]
            }
        }
        System.arraycopy(pNew, 0, P, 0, STATE_DIM * STATE_DIM)

        // Process noise Q (matched with iOS approach)
        // Uses dynamicProcessNoise from accelerometer + speedAdaptiveQScale
        updateSpeedAdaptiveQ()
        val qp = PROCESS_NOISE_POSITION * dynamicProcessNoise * speedAdaptiveQScale
        val qv = PROCESS_NOISE_VELOCITY * dynamicProcessNoise * speedAdaptiveQScale

        val dt2 = dt * dt
        val dt3 = dt2 * dt / 2.0
        val dt4 = dt2 * dt2 / 4.0

        // All 3 axes use the same Q structure (matched with iOS)
        for (i in 0..2) {
            P[idx(i, i)] += qp * dt4
            P[idx(i + 3, i + 3)] += qv * dt2
            P[idx(i, i + 3)] += qp * dt3
            P[idx(i + 3, i)] += qp * dt3
        }
    }

    /**
     * Full 6D measurement update (matched with iOS).
     * Measurement vector z = [north, east, up, v_north, v_east, v_up]
     * H = I_6x6 (identity), R = diagonal measurement noise.
     *
     * Unlike the previous split (3D position + scalar velocity) approach,
     * this preserves cross-correlations between position and velocity,
     * producing more accurate estimates — matching iOS behavior.
     */
    private fun update(point: GPSPoint, meters: DoubleArray) {
        // --- Measurement noise R (matched with iOS) ---
        // Floor: GPS reports optimistic accuracy; actual scatter is always larger.
        // 3.0m floor balances L5 GPS precision with realistic multipath scatter.
        val clamped = point.horizontalAccuracy.toDouble().coerceAtLeast(3.0)
        // Urban canyon inflation: when accuracy > 20m, multipath likely — trust GPS less
        val inflated = if (clamped > 20.0) clamped * 2.0 else clamped
        val posVar = inflated * inflated

        // GPS altitude is inherently inaccurate — use constant high variance (matched with iOS)
        val altVar = 100.0

        // Speed variance (matched with iOS)
        val spdVar: Double = when {
            point.speed < 0 -> 1e6  // Speed unknown — effectively ignore
            point.speedAccuracy > 0 -> {
                val sa = point.speedAccuracy.toDouble()
                sa * sa
            }
            else -> 4.0  // Default fallback (matched with iOS)
        }

        // Build full 6D measurement vector
        val (vNorth, vEast) = if (point.speed >= 0) {
            GeoMath.velocityComponents(point.speed.toDouble(), point.bearing.toDouble())
        } else {
            Pair(0.0, 0.0)
        }
        val z = doubleArrayOf(meters[0], meters[1], meters[2], vNorth, vEast, 0.0)
        val rDiag = doubleArrayOf(posVar, posVar, altVar, spdVar, spdVar, spdVar)

        // Innovation: y = z - H*x (H = I, so y = z - x)
        val y = DoubleArray(STATE_DIM)
        for (i in 0 until STATE_DIM) {
            y[i] = z[i] - x[i]
        }

        // Innovation covariance: S = P + R (since H = I)
        val S = DoubleArray(STATE_DIM * STATE_DIM)
        System.arraycopy(P, 0, S, 0, STATE_DIM * STATE_DIM)
        for (i in 0 until STATE_DIM) {
            S[idx(i, i)] += rDiag[i]
        }

        // S inverse (6x6)
        val Sinv = invert6x6(S) ?: return

        // Kalman gain: K = P * S^-1 (since H = I, K = P * (P + R)^-1)
        val K = matMul6x6(P, Sinv)

        // State update: x = x + K * y
        val correction = matVecMul6(K, y)
        for (i in 0 until STATE_DIM) {
            x[i] += correction[i]
        }

        // Covariance update: P = (I - K) * P (since H = I)
        val IminusK = DoubleArray(STATE_DIM * STATE_DIM)
        for (i in 0 until STATE_DIM) IminusK[idx(i, i)] = 1.0
        for (i in 0 until STATE_DIM) {
            for (j in 0 until STATE_DIM) {
                IminusK[idx(i, j)] -= K[idx(i, j)]
            }
        }
        val pNew = matMul6x6(IminusK, P)
        System.arraycopy(pNew, 0, P, 0, STATE_DIM * STATE_DIM)
    }

    /**
     * Get current estimated position in lat/lng/alt.
     */
    @Synchronized
    fun getCurrentPosition(): DoubleArray {
        return coordinateConverter.toLatLng(x[POSITION_NORTH], x[POSITION_EAST], x[POSITION_UP])
    }

    /**
     * Get current estimated speed (m/s).
     */
    @Synchronized
    fun getCurrentSpeed(): Double {
        return GeoMath.speedFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
    }

    /**
     * Get current estimated bearing (degrees).
     */
    @Synchronized
    fun getCurrentBearing(): Double {
        return GeoMath.bearingFromComponents(x[VELOCITY_NORTH], x[VELOCITY_EAST])
    }

    fun isInitialized(): Boolean = initialized

    /**
     * Store a passthrough history entry (used on init/reinit).
     */
    private fun storePassthroughHistory(point: GPSPoint) {
        val identityF = DoubleArray(STATE_DIM * STATE_DIM)
        for (i in 0 until STATE_DIM) identityF[idx(i, i)] = 1.0
        history.add(HistoryEntry(
            predictedState = x.copyOf(),
            predictedP = P.copyOf(),
            filteredState = x.copyOf(),
            filteredP = P.copyOf(),
            F = identityF,
            timestamp = point.timestamp,
            speed = point.speed,
            bearing = point.bearing,
        ))
    }

    /**
     * RTS Backward Smoother: uses future data to correct past estimates.
     * Returns smoothed positions with original GPS metadata.
     */
    data class SmoothedPoint(
        val latitude: Double,
        val longitude: Double,
        val altitude: Double,
        val timestamp: Long,
        val speed: Float,
        val bearing: Float,
    )

    @Synchronized
    fun smoothRoute(): List<SmoothedPoint> {
        if (history.size < 2) return emptyList()

        val N = history.size
        val smoothedStates = Array(N) { DoubleArray(STATE_DIM) }
        val smoothedP = Array(N) { DoubleArray(STATE_DIM * STATE_DIM) }

        // Initialize backward pass with last filtered state
        System.arraycopy(history[N - 1].filteredState, 0, smoothedStates[N - 1], 0, STATE_DIM)
        System.arraycopy(history[N - 1].filteredP, 0, smoothedP[N - 1], 0, STATE_DIM * STATE_DIM)

        // Backward pass: k = N-2 down to 0
        for (k in N - 2 downTo 0) {
            val filtS = history[k].filteredState
            val filtP = history[k].filteredP
            val predS = history[k + 1].predictedState
            val predP = history[k + 1].predictedP
            val Fk = history[k + 1].F

            // G = filtP * F^T * inv(predP)
            val predPInv = invert6x6(predP)
            if (predPInv == null) {
                System.arraycopy(filtS, 0, smoothedStates[k], 0, STATE_DIM)
                System.arraycopy(filtP, 0, smoothedP[k], 0, STATE_DIM * STATE_DIM)
                continue
            }
            val FkT = transpose6x6(Fk)
            val G = matMul6x6(matMul6x6(filtP, FkT), predPInv)

            // smoothed[k] = filtered[k] + G * (smoothed[k+1] - predicted[k+1])
            val diff = DoubleArray(STATE_DIM)
            for (i in 0 until STATE_DIM) diff[i] = smoothedStates[k + 1][i] - predS[i]
            val correction = matVecMul6(G, diff)
            for (i in 0 until STATE_DIM) smoothedStates[k][i] = filtS[i] + correction[i]

            // smoothed_P[k] = filtered_P[k] + G * (smoothed_P[k+1] - predicted_P[k+1]) * G^T
            val pDiff = DoubleArray(STATE_DIM * STATE_DIM)
            for (i in pDiff.indices) pDiff[i] = smoothedP[k + 1][i] - predP[i]
            val GT = transpose6x6(G)
            val pCorr = matMul6x6(matMul6x6(G, pDiff), GT)
            for (i in smoothedP[k].indices) smoothedP[k][i] = filtP[i] + pCorr[i]
        }

        // Convert smoothed states to lat/lng
        return smoothedStates.mapIndexed { i, s ->
            val latLng = coordinateConverter.toLatLng(s[POSITION_NORTH], s[POSITION_EAST], s[POSITION_UP])
            SmoothedPoint(latLng[0], latLng[1], latLng[2],
                history[i].timestamp, history[i].speed, history[i].bearing)
        }
    }

    fun clearHistory() {
        history.clear()
    }

    @Synchronized
    fun reset() {
        for (i in x.indices) x[i] = 0.0
        for (i in P.indices) P[i] = 0.0
        lastTimestamp = 0L
        initialized = false
        accelerometerVariance = 1.0
        history.clear()
    }

    // Helper: row-major index into 6x6 flat array
    private fun idx(row: Int, col: Int): Int = row * STATE_DIM + col

    // --- 6x6 matrix operations for RTS smoother ---

    private fun transpose6x6(m: DoubleArray): DoubleArray {
        val r = DoubleArray(STATE_DIM * STATE_DIM)
        for (i in 0 until STATE_DIM) {
            for (j in 0 until STATE_DIM) {
                r[idx(j, i)] = m[idx(i, j)]
            }
        }
        return r
    }

    private fun matMul6x6(a: DoubleArray, b: DoubleArray): DoubleArray {
        val r = DoubleArray(STATE_DIM * STATE_DIM)
        for (i in 0 until STATE_DIM) {
            for (j in 0 until STATE_DIM) {
                var sum = 0.0
                for (k in 0 until STATE_DIM) {
                    sum += a[idx(i, k)] * b[idx(k, j)]
                }
                r[idx(i, j)] = sum
            }
        }
        return r
    }

    private fun matVecMul6(m: DoubleArray, v: DoubleArray): DoubleArray {
        val r = DoubleArray(STATE_DIM)
        for (i in 0 until STATE_DIM) {
            var sum = 0.0
            for (j in 0 until STATE_DIM) {
                sum += m[idx(i, j)] * v[j]
            }
            r[i] = sum
        }
        return r
    }

    /**
     * Invert a 6x6 matrix using Gauss-Jordan elimination.
     * Returns null if the matrix is singular.
     */
    private fun invert6x6(matrix: DoubleArray): DoubleArray? {
        val n = STATE_DIM
        val a = matrix.copyOf()
        val inv = DoubleArray(n * n)
        for (i in 0 until n) inv[idx(i, i)] = 1.0

        for (col in 0 until n) {
            var maxRow = col
            for (row in col + 1 until n) {
                if (kotlin.math.abs(a[idx(row, col)]) > kotlin.math.abs(a[idx(maxRow, col)])) {
                    maxRow = row
                }
            }
            if (maxRow != col) {
                for (j in 0 until n) {
                    val tmpA = a[idx(col, j)]; a[idx(col, j)] = a[idx(maxRow, j)]; a[idx(maxRow, j)] = tmpA
                    val tmpI = inv[idx(col, j)]; inv[idx(col, j)] = inv[idx(maxRow, j)]; inv[idx(maxRow, j)] = tmpI
                }
            }
            val pivot = a[idx(col, col)]
            if (kotlin.math.abs(pivot) < 1e-12) return null
            for (j in 0 until n) {
                a[idx(col, j)] /= pivot
                inv[idx(col, j)] /= pivot
            }
            for (row in 0 until n) {
                if (row == col) continue
                val factor = a[idx(row, col)]
                for (j in 0 until n) {
                    a[idx(row, j)] -= factor * a[idx(col, j)]
                    inv[idx(row, j)] -= factor * inv[idx(col, j)]
                }
            }
        }
        return inv
    }

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
