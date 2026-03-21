package com.runcrew.gps.filter

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Detects whether the runner is stationary or moving by combining:
 *   1. Accelerometer variance over a 3-second sliding window
 *   2. GPS-derived speed
 *
 * Stationary is declared when BOTH:
 *   - Accelerometer variance < threshold (low physical movement)
 *   - GPS speed < 0.3 m/s
 *
 * State transitions are reported to registered listeners.
 */
class StationaryDetector(
    private val sensorManager: SensorManager
) : SensorEventListener {

    companion object {
        // Accelerometer variance threshold for stationary classification.
        // Empirically tuned: a person holding still produces variance ~0.02-0.05 m/s^2,
        // walking produces ~0.5-2.0, running produces ~2.0-8.0.
        private const val ACCEL_VARIANCE_THRESHOLD = 0.25

        // Speed below which GPS alone suggests stationary (m/s)
        // Matched with iOS: 0.3 m/s ~ 1.1 km/h
        private const val SPEED_THRESHOLD = 0.3

        // Speed above which a stationary user is considered moving again (m/s)
        // Matched with iOS: lowered from 0.5 to 0.35 for faster resume detection
        private const val RESUME_SPEED_THRESHOLD = 0.35

        // Window duration for accelerometer variance calculation (ms)
        private const val WINDOW_DURATION_MS = 3000L

        // Minimum time in a state before transition is allowed (debounce)
        // Unified at 2s across iOS/Android for consistent behavior.
        private const val MIN_STATE_DURATION_MS = 2000L

        // Number of consecutive readings required to enter STATIONARY
        // Set to 3 (matched with iOS) to avoid false triggers during brief slow-downs
        private const val REQUIRED_STATIONARY_COUNT = 3

        // Number of consecutive readings required to resume MOVING
        // Set to 1 (matched with iOS) for maximum responsiveness — critical for distance
        private const val REQUIRED_MOVING_COUNT = 1

        // Accelerometer magnitude threshold for movement detection (matched with iOS: 0.2g)
        private const val ACCEL_MAGNITUDE_THRESHOLD = 0.2

        // Number of consecutive accel readings above threshold to resume moving
        private const val REQUIRED_ACCEL_MOVING_COUNT = 3

        // Grace period: ignore the first N evaluations to avoid false stationary
        // detection during cold start (GPS speed may report 0 initially)
        private const val GRACE_EVALUATIONS = 5
    }

    /**
     * Current detected movement state.
     */
    enum class MovementState {
        MOVING,
        STATIONARY
    }

    fun interface StateChangeListener {
        fun onStateChanged(newState: MovementState, durationInPreviousState: Long)
    }

    private val listeners = CopyOnWriteArrayList<StateChangeListener>()

    @Volatile
    var currentState: MovementState = MovementState.STATIONARY
        private set

    @Volatile
    var currentAccelVariance: Double = 0.0
        private set

    private var lastStateChangeTime: Long = System.currentTimeMillis()
    private var lastGpsSpeed: Double = 0.0

    // Hysteresis counters (matched with iOS: separate counts for stationary/moving)
    private var consecutiveStationaryCount: Int = 0
    private var consecutiveMovingCount: Int = 0

    // Grace period counter
    private var totalEvaluationCount: Int = 0

    // Recent speed samples for windowed average (matched with iOS: 5 samples)
    private val recentSpeeds = ArrayDeque<Double>(6)

    // Accelerometer magnitude samples: Pair(timestamp_ms, magnitude)
    private val accelSamples = ArrayDeque<Pair<Long, Double>>(200)

    private var accelerometer: Sensor? = null
    private var registered = false

    fun start() {
        if (registered) return
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
            registered = true
        }
    }

    fun stop() {
        if (!registered) return
        sensorManager.unregisterListener(this)
        registered = false
        accelSamples.clear()
    }

    fun addListener(listener: StateChangeListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: StateChangeListener) {
        listeners.remove(listener)
    }

    /**
     * Feed in the latest GPS-derived speed so the detector can cross-check.
     * Matched with iOS: uses windowed average + instantaneous speed for resume.
     */
    @Synchronized
    fun updateGpsSpeed(speedMs: Double) {
        // Skip invalid speed readings (hasSpeed() returned false → -1)
        if (speedMs < 0) return

        lastGpsSpeed = speedMs
        totalEvaluationCount++

        // Maintain speed window (matched with iOS: 5 samples)
        recentSpeeds.addLast(speedMs)
        if (recentSpeeds.size > 5) recentSpeeds.removeFirst()

        val avgSpeed = if (recentSpeeds.isNotEmpty()) recentSpeeds.average() else 0.0

        when (currentState) {
            MovementState.MOVING -> {
                // Grace period: don't transition to stationary too early
                // GPS speed may report 0 for the first few readings
                if (totalEvaluationCount <= GRACE_EVALUATIONS) return

                // Matched with iOS: use GPS speed alone for stationary detection.
                // Accelerometer variance is unreliable (hand tremor, phone in pocket, etc.)
                val isLowSpeed = avgSpeed < SPEED_THRESHOLD
                if (isLowSpeed) {
                    consecutiveStationaryCount++
                    consecutiveMovingCount = 0
                    if (consecutiveStationaryCount >= REQUIRED_STATIONARY_COUNT) {
                        transitionTo(MovementState.STATIONARY)
                    }
                } else {
                    consecutiveStationaryCount = 0
                }
            }
            MovementState.STATIONARY -> {
                // Use max of instantaneous and average speed for resume check (matched with iOS).
                // The window contains stale zeros from when the user was stopped,
                // which dilute the average and delay resume. A single GPS reading
                // above the threshold is a strong signal of movement.
                val resumeSpeed = kotlin.math.max(speedMs, avgSpeed)
                if (resumeSpeed > RESUME_SPEED_THRESHOLD) {
                    consecutiveMovingCount++
                    if (consecutiveMovingCount >= REQUIRED_MOVING_COUNT) {
                        transitionTo(MovementState.MOVING)
                    }
                }
                // NOTE: intentionally do NOT reset consecutiveMovingCount when speed
                // is below threshold — accelerometer path also increments it.
            }
        }
    }

    /**
     * Feed accelerometer magnitude for movement detection when in stationary state.
     * Matched with iOS: 3 consecutive readings above 0.2g threshold to resume.
     */
    @Synchronized
    fun updateAccelerometerMagnitude(magnitude: Double, isLowAccuracyMode: Boolean = false) {
        if (currentState == MovementState.STATIONARY && magnitude > ACCEL_MAGNITUDE_THRESHOLD) {
            consecutiveMovingCount++
            val threshold = if (isLowAccuracyMode) REQUIRED_MOVING_COUNT else REQUIRED_ACCEL_MOVING_COUNT
            if (consecutiveMovingCount >= threshold) {
                transitionTo(MovementState.MOVING)
            }
        }
    }

    private fun transitionTo(newState: MovementState) {
        if (newState == currentState) return
        val now = System.currentTimeMillis()
        val durationInPreviousState = now - lastStateChangeTime
        currentState = newState
        lastStateChangeTime = now
        consecutiveStationaryCount = 0
        consecutiveMovingCount = 0
        // Clear speed window on transition so stale readings don't affect next state
        recentSpeeds.clear()

        for (listener in listeners) {
            listener.onStateChanged(newState, durationInPreviousState)
        }
    }

    // --- SensorEventListener ---

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return

        val magnitude = kotlin.math.sqrt(
            (event.values[0] * event.values[0] +
             event.values[1] * event.values[1] +
             event.values[2] * event.values[2]).toDouble()
        )

        val now = System.currentTimeMillis()
        synchronized(accelSamples) {
            accelSamples.addLast(now to magnitude)

            // Remove samples outside the window
            while (accelSamples.isNotEmpty() && now - accelSamples.first().first > WINDOW_DURATION_MS) {
                accelSamples.removeFirst()
            }
        }

        currentAccelVariance = computeVariance()

        // Compute acceleration magnitude relative to gravity for movement detection
        // (matched with iOS: uses deviation from 9.81 m/s²)
        val accelMagnitudeG = kotlin.math.abs(magnitude - 9.81) / 9.81
        updateAccelerometerMagnitude(accelMagnitudeG)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }

    // --- Internal ---

    private fun computeVariance(): Double {
        val samples: List<Pair<Long, Double>>
        synchronized(accelSamples) {
            if (accelSamples.size < 10) return 0.0
            samples = accelSamples.toList()
        }

        val magnitudes = samples.map { it.second }
        val mean = magnitudes.average()
        return magnitudes.sumOf { (it - mean) * (it - mean) } / magnitudes.size
    }

    @Synchronized
    fun reset() {
        // Start in MOVING state (matched with iOS) — first movement is natural start.
        // Grace period prevents false stationary during cold start.
        currentState = MovementState.MOVING
        lastStateChangeTime = System.currentTimeMillis()
        lastGpsSpeed = 0.0
        currentAccelVariance = 0.0
        accelSamples.clear()
        recentSpeeds.clear()
        consecutiveStationaryCount = 0
        consecutiveMovingCount = 0
        totalEvaluationCount = 0
    }
}
