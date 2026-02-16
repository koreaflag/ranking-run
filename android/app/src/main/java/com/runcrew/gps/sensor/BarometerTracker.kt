package com.runcrew.gps.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * Tracks relative altitude changes using the barometric pressure sensor.
 *
 * Barometric altitude is significantly more precise than GPS altitude for
 * relative elevation changes (sub-meter resolution vs 10-30m GPS vertical error).
 *
 * The tracker maintains a reference pressure set at session start and computes
 * relative altitude change using the barometric formula. It does NOT provide
 * absolute altitude -- that comes from calibrating with the first GPS altitude.
 */
class BarometerTracker(
    private val sensorManager: SensorManager
) : SensorEventListener {

    companion object {
        // Standard sea level pressure (hPa). Used only as a reference for the formula;
        // actual accuracy comes from the relative difference, not the absolute value.
        private const val STANDARD_PRESSURE_HPA = SensorManager.PRESSURE_STANDARD_ATMOSPHERE

        // Smoothing factor for low-pass filter on pressure readings.
        // Lower = more smoothing. 0.1 gives ~10-sample averaging.
        private const val SMOOTHING_ALPHA = 0.1
    }

    fun interface AltitudeListener {
        fun onAltitudeChanged(relativeAltitude: Double, absoluteAltitude: Double)
    }

    private val listeners = mutableListOf<AltitudeListener>()

    @Volatile
    var isAvailable: Boolean = false
        private set

    @Volatile
    var currentRelativeAltitude: Double = 0.0
        private set

    @Volatile
    var currentAbsoluteAltitude: Double = 0.0
        private set

    private var referencePressure: Float = 0f
    private var smoothedPressure: Float = 0f
    private var gpsBaseAltitude: Double = 0.0
    private var initialized = false
    private var registered = false

    fun start() {
        if (registered) return
        val barometer = sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)
        if (barometer != null) {
            sensorManager.registerListener(this, barometer, SensorManager.SENSOR_DELAY_NORMAL)
            isAvailable = true
            registered = true
        } else {
            isAvailable = false
        }
    }

    fun stop() {
        if (!registered) return
        sensorManager.unregisterListener(this)
        registered = false
    }

    /**
     * Set the GPS altitude at session start so we can output absolute altitude.
     * Called once when the first valid GPS fix arrives.
     */
    fun setBaseAltitude(gpsAltitude: Double) {
        gpsBaseAltitude = gpsAltitude
    }

    fun addListener(listener: AltitudeListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: AltitudeListener) {
        listeners.remove(listener)
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_PRESSURE) return

        val rawPressure = event.values[0]
        if (rawPressure <= 0) return

        if (!initialized) {
            referencePressure = rawPressure
            smoothedPressure = rawPressure
            initialized = true
            return
        }

        // Low-pass filter to smooth pressure readings
        smoothedPressure += (SMOOTHING_ALPHA * (rawPressure - smoothedPressure)).toFloat()

        // Compute altitude using barometric formula
        // Altitude = 44330 * (1 - (P / P0)^(1/5.255))
        val relativeAlt = SensorManager.getAltitude(referencePressure, smoothedPressure).toDouble()
        currentRelativeAltitude = relativeAlt
        currentAbsoluteAltitude = gpsBaseAltitude + relativeAlt

        for (listener in listeners) {
            listener.onAltitudeChanged(relativeAlt, currentAbsoluteAltitude)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }

    fun reset() {
        referencePressure = 0f
        smoothedPressure = 0f
        gpsBaseAltitude = 0.0
        currentRelativeAltitude = 0.0
        currentAbsoluteAltitude = 0.0
        initialized = false
    }
}
