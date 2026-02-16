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
        private const val ACCEL_VARIANCE_THRESHOLD = 0.15

        // Speed below which GPS alone suggests stationary (m/s)
        private const val SPEED_THRESHOLD = 0.3

        // Window duration for accelerometer variance calculation (ms)
        private const val WINDOW_DURATION_MS = 3000L

        // Minimum time in a state before transition is allowed (debounce)
        private const val MIN_STATE_DURATION_MS = 2000L
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
     */
    fun updateGpsSpeed(speedMs: Double) {
        lastGpsSpeed = speedMs
        evaluateState()
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
        evaluateState()
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

    private fun evaluateState() {
        val now = System.currentTimeMillis()
        val timeSinceLastChange = now - lastStateChangeTime

        // Debounce: don't change state too rapidly
        if (timeSinceLastChange < MIN_STATE_DURATION_MS) return

        val isLowAccel = currentAccelVariance < ACCEL_VARIANCE_THRESHOLD
        val isLowSpeed = lastGpsSpeed < SPEED_THRESHOLD

        val newState = if (isLowAccel && isLowSpeed) {
            MovementState.STATIONARY
        } else {
            MovementState.MOVING
        }

        if (newState != currentState) {
            val durationInPreviousState = timeSinceLastChange
            currentState = newState
            lastStateChangeTime = now

            for (listener in listeners) {
                listener.onStateChanged(newState, durationInPreviousState)
            }
        }
    }

    fun reset() {
        currentState = MovementState.STATIONARY
        lastStateChangeTime = System.currentTimeMillis()
        lastGpsSpeed = 0.0
        currentAccelVariance = 0.0
        accelSamples.clear()
    }
}
