package com.runcrew.gps.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * Detects steps using the hardware step detector sensor (TYPE_STEP_DETECTOR)
 * or falls back to accelerometer-based peak detection.
 *
 * Also estimates stride length based on running speed:
 *   stride = 0.4 * speed + 0.5 (empirical formula for running)
 *   Clamped to [0.5m, 2.5m] for safety.
 *
 * Used for dead reckoning when GPS signal is lost.
 */
class StepDetector(
    private val sensorManager: SensorManager
) : SensorEventListener {

    companion object {
        private const val MIN_STRIDE_M = 0.5
        private const val MAX_STRIDE_M = 2.5

        // Accelerometer peak detection thresholds (fallback)
        private const val ACCEL_PEAK_THRESHOLD = 12.0 // m/s^2
        private const val MIN_STEP_INTERVAL_MS = 250L // max ~4 steps/sec
    }

    fun interface StepListener {
        fun onStep(strideEstimate: Double)
    }

    private val listeners = mutableListOf<StepListener>()

    @Volatile
    var totalSteps: Int = 0
        private set

    @Volatile
    var currentStrideEstimate: Double = 0.8
        private set

    @Volatile
    private var lastStepTime: Long = 0L

    @Volatile
    private var lastSpeed: Double = 0.0

    private var hardwareStepDetector: Sensor? = null
    private var accelerometer: Sensor? = null
    private var useHardwareDetector = false
    private var registered = false

    // Accelerometer fallback state
    private var lastAccelMagnitude = 0.0
    private var rising = false

    fun start() {
        if (registered) return

        // Prefer hardware step detector
        hardwareStepDetector = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
        if (hardwareStepDetector != null) {
            sensorManager.registerListener(this, hardwareStepDetector, SensorManager.SENSOR_DELAY_FASTEST)
            useHardwareDetector = true
            registered = true
            return
        }

        // Fallback to accelerometer-based detection
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
            useHardwareDetector = false
            registered = true
        }
    }

    fun stop() {
        if (!registered) return
        sensorManager.unregisterListener(this)
        registered = false
    }

    fun addListener(listener: StepListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: StepListener) {
        listeners.remove(listener)
    }

    /**
     * Feed current GPS-derived speed to improve stride estimation.
     */
    fun updateSpeed(speedMs: Double) {
        lastSpeed = speedMs
        currentStrideEstimate = estimateStride(speedMs)
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_STEP_DETECTOR -> {
                onStepDetected()
            }
            Sensor.TYPE_ACCELEROMETER -> {
                processAccelerometerForSteps(event)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }

    private fun onStepDetected() {
        val now = System.currentTimeMillis()
        if (now - lastStepTime < MIN_STEP_INTERVAL_MS) return

        lastStepTime = now
        totalSteps++
        currentStrideEstimate = estimateStride(lastSpeed)

        for (listener in listeners) {
            listener.onStep(currentStrideEstimate)
        }
    }

    /**
     * Simple peak detection on accelerometer magnitude for step counting.
     * Detects a step when the magnitude crosses the threshold going downward (peak).
     */
    private fun processAccelerometerForSteps(event: SensorEvent) {
        val magnitude = kotlin.math.sqrt(
            (event.values[0] * event.values[0] +
             event.values[1] * event.values[1] +
             event.values[2] * event.values[2]).toDouble()
        )

        if (magnitude > ACCEL_PEAK_THRESHOLD && !rising) {
            rising = true
        } else if (magnitude < ACCEL_PEAK_THRESHOLD && rising) {
            rising = false
            onStepDetected()
        }

        lastAccelMagnitude = magnitude
    }

    /**
     * Estimate stride length from current speed.
     * Empirical formula: stride = 0.4 * speed + 0.5
     * Typical values: 2.5 m/s walk -> 1.5m, 4.0 m/s jog -> 2.1m
     */
    private fun estimateStride(speedMs: Double): Double {
        val raw = 0.4 * speedMs + 0.5
        return raw.coerceIn(MIN_STRIDE_M, MAX_STRIDE_M)
    }

    fun reset() {
        totalSteps = 0
        lastStepTime = 0L
        lastSpeed = 0.0
        currentStrideEstimate = 0.8
        rising = false
    }
}
