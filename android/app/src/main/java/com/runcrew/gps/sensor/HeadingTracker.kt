package com.runcrew.gps.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log

/**
 * Tracks device heading using the rotation vector sensor (magnetometer + gyro fusion).
 * Provides true heading in degrees (0-360) suitable for map rotation.
 *
 * Uses Android's fused rotation vector which combines accelerometer, magnetometer,
 * and gyroscope for stable, low-drift heading — equivalent to iOS CLHeading.trueHeading.
 */
class HeadingTracker(
    private val sensorManager: SensorManager
) : SensorEventListener {

    companion object {
        private const val TAG = "HeadingTracker"

        /** Low-pass smoothing factor. Higher = more smoothing, slower response. */
        private const val ALPHA = 0.25

        /** Minimum heading change to emit an update (degrees) */
        private const val MIN_CHANGE_DEGREES = 1.0
    }

    interface Listener {
        fun onHeadingUpdate(heading: Double)
    }

    private var listener: Listener? = null
    private var isRunning = false

    @Volatile
    var currentHeading: Double = 0.0
        private set

    private var smoothedHeading: Double = -1.0
    private var lastEmittedHeading: Double = -1.0

    private val rotationMatrix = FloatArray(9)
    private val orientationAngles = FloatArray(3)

    fun setListener(l: Listener?) {
        listener = l
    }

    fun start() {
        if (isRunning) return

        // Prefer rotation vector (magnetometer + gyro = true north heading),
        // fall back to game rotation vector (gyro-only, relative heading).
        val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)

        if (sensor == null) {
            Log.w(TAG, "No rotation vector sensor available")
            return
        }

        sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
        isRunning = true
    }

    fun stop() {
        if (!isRunning) return
        sensorManager.unregisterListener(this)
        isRunning = false
        smoothedHeading = -1.0
        lastEmittedHeading = -1.0
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ROTATION_VECTOR &&
            event.sensor.type != Sensor.TYPE_GAME_ROTATION_VECTOR) return

        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
        SensorManager.getOrientation(rotationMatrix, orientationAngles)

        // azimuth is orientationAngles[0] in radians (-π to π)
        val azimuthDeg = ((Math.toDegrees(orientationAngles[0].toDouble()) + 360) % 360)

        // Circular low-pass filter (handles 0/360 wraparound)
        if (smoothedHeading < 0) {
            smoothedHeading = azimuthDeg
        } else {
            var delta = azimuthDeg - smoothedHeading
            if (delta > 180) delta -= 360
            if (delta < -180) delta += 360
            smoothedHeading = (smoothedHeading + (1 - ALPHA) * delta + 360) % 360
        }

        currentHeading = smoothedHeading

        // Only emit when heading changes enough to avoid excessive callbacks
        if (lastEmittedHeading < 0 || Math.abs(circularDelta(smoothedHeading, lastEmittedHeading)) >= MIN_CHANGE_DEGREES) {
            lastEmittedHeading = smoothedHeading
            listener?.onHeadingUpdate(smoothedHeading)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // No-op
    }

    fun reset() {
        smoothedHeading = -1.0
        lastEmittedHeading = -1.0
        currentHeading = 0.0
    }

    private fun circularDelta(a: Double, b: Double): Double {
        var d = a - b
        if (d > 180) d -= 360
        if (d < -180) d += 360
        return d
    }
}
