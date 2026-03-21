package com.runcrew.gps

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.runcrew.gps.model.FilteredLocation
import com.runcrew.gps.model.RunSession
import com.runcrew.gps.sensor.HeadingTracker

/**
 * React Native native module exposing GPS tracking functionality to JavaScript.
 *
 * Module name: "GPSTrackerModule" (must match on both Android and iOS per shared-interfaces.md)
 *
 * Events emitted (via RCTDeviceEventEmitter):
 *   - GPSTracker_onLocationUpdate:      FilteredLocation at 1Hz during active tracking
 *   - GPSTracker_onGPSStatusChange:     GPS status transitions (searching/locked/lost/disabled)
 *   - GPSTracker_onRunningStateChange:  moving <-> stationary transitions
 *
 * Methods exposed to JS:
 *   - startTracking()       -> Promise<void>
 *   - stopTracking()        -> Promise<void>
 *   - pauseTracking()       -> Promise<void>
 *   - resumeTracking()      -> Promise<void>
 *   - getRawGPSPoints()     -> Promise<RawGPSPoint[]>
 *   - getFilteredRoute()    -> Promise<FilteredLocation[]>
 *   - getCurrentStatus()    -> Promise<GPSStatus>
 */
@ReactModule(name = GPSTrackerModule.NAME)
class GPSTrackerModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), LocationEngine.Listener {

    companion object {
        const val NAME = "GPSTrackerModule"
        private const val TAG = "GPSTrackerModule"

        // Event names matching shared-interfaces.md
        private const val EVENT_LOCATION_UPDATE = "GPSTracker_onLocationUpdate"
        private const val EVENT_GPS_STATUS_CHANGE = "GPSTracker_onGPSStatusChange"
        private const val EVENT_RUNNING_STATE_CHANGE = "GPSTracker_onRunningStateChange"

        private const val EVENT_MILESTONE_REACHED = "GPSTracker_onMilestoneReached"
        private const val EVENT_HEADING_UPDATE = "GPSTracker_onHeadingUpdate"

        // Error codes matching shared-interfaces.md
        private const val ERROR_PERMISSION_DENIED = "PERMISSION_DENIED"
        private const val ERROR_GPS_DISABLED = "GPS_DISABLED"
        private const val ERROR_SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
        private const val ERROR_COLD_START_TIMEOUT = "COLD_START_TIMEOUT"
        private const val ERROR_BACKGROUND_RESTRICTED = "BACKGROUND_RESTRICTED"
    }

    private var locationEngine: LocationEngine? = null
    private var headingTracker: HeadingTracker? = null
    private var listenerCount = 0
    private var notificationUpdateCounter = 0
    private val trackingLock = Any()

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        val engine = LocationEngine(reactApplicationContext)
        engine.listener = this
        engine.initialize()
        // Register step listener to populate rolling cadence window
        engine.sensorFusionManager?.stepDetector?.addListener { _ ->
            val now = System.currentTimeMillis()
            recentStepTimestamps.addLast(now)
            // Cap buffer to prevent unbounded growth
            if (recentStepTimestamps.size > 300) {
                recentStepTimestamps.removeFirst()
            }
        }
        locationEngine = engine
    }

    override fun canOverrideExistingModule(): Boolean = false

    override fun onCatalystInstanceDestroy() {
        headingTracker?.stop()
        headingTracker = null
        locationEngine?.stop()
        locationEngine = null
        super.onCatalystInstanceDestroy()
    }

    // --- Event listener management for RN EventEmitter ---

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount -= count
        if (listenerCount < 0) listenerCount = 0
    }

    // --- Tracking control methods ---

    @ReactMethod
    fun startTracking(promise: Promise) {
        synchronized(trackingLock) {
            try {
                // Check fine location permission
                if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    promise.reject(ERROR_PERMISSION_DENIED, "Fine location permission not granted")
                    return
                }

                // Check background location permission (Android 10+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    if (!hasPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) {
                        Log.w(TAG, "Background location permission not granted. Tracking may stop in background.")
                        // Don't reject -- allow foreground-only tracking, but warn
                    }
                }

                // Check POST_NOTIFICATIONS permission (Android 13+)
                // Required for foreground service notification
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    if (!hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
                        Log.w(TAG, "POST_NOTIFICATIONS permission not granted. Foreground service notification may not appear.")
                        // Don't reject -- the service can still run, but the notification won't show
                        // The JS layer should request this permission before calling startTracking
                    }
                }

                val engine = locationEngine
                if (engine == null) {
                    promise.reject(ERROR_SERVICE_UNAVAILABLE, "LocationEngine not initialized")
                    return
                }

                // Start foreground service for background tracking
                GPSForegroundService.startService(reactApplicationContext)

                // Reset cadence tracking for new session
                recentStepTimestamps.clear()

                // Start the engine (GPS + sensors)
                engine.start()

                promise.resolve(null)
            } catch (e: Exception) {
                Log.e(TAG, "Error starting tracking", e)
                promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to start tracking: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun stopTracking(promise: Promise) {
        synchronized(trackingLock) {
            try {
                locationEngine?.stop()
                GPSForegroundService.stopService(reactApplicationContext)
                promise.resolve(null)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping tracking", e)
                promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to stop tracking: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun pauseTracking(promise: Promise) {
        synchronized(trackingLock) {
            try {
                locationEngine?.pause()
                promise.resolve(null)
            } catch (e: Exception) {
                Log.e(TAG, "Error pausing tracking", e)
                promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to pause tracking: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun resumeTracking(promise: Promise) {
        synchronized(trackingLock) {
            try {
                // Re-check permission — user could revoke between pause/resume
                if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    promise.reject(ERROR_PERMISSION_DENIED, "Fine location permission was revoked")
                    return
                }

                locationEngine?.resume()
                promise.resolve(null)
            } catch (e: Exception) {
                Log.e(TAG, "Error resuming tracking", e)
                promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to resume tracking: ${e.message}", e)
            }
        }
    }

    // --- Data retrieval methods ---

    @ReactMethod
    fun getRawGPSPoints(promise: Promise) {
        try {
            val session = locationEngine?.session
            if (session == null) {
                promise.resolve(Arguments.createArray())
                return
            }

            val array = Arguments.createArray()
            for (point in session.rawPoints) {
                array.pushMap(point.toWritableMap())
            }
            promise.resolve(array)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting raw GPS points", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to get raw GPS points: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getFilteredRoute(promise: Promise) {
        try {
            val session = locationEngine?.session
            if (session == null) {
                promise.resolve(Arguments.createArray())
                return
            }

            val array = Arguments.createArray()
            for (location in session.filteredLocations) {
                array.pushMap(location.toWritableMap())
            }
            promise.resolve(array)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting filtered route", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to get filtered route: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getSmoothedRoute(promise: Promise) {
        try {
            val engine = locationEngine
            if (engine == null) {
                val emptyResult = Arguments.createMap()
                emptyResult.putArray("route", Arguments.createArray())
                emptyResult.putDouble("distance", 0.0)
                promise.resolve(emptyResult)
                return
            }

            val smoothed = engine.kalmanFilter.smoothRoute()
            if (smoothed.size < 2) {
                // Not enough data — fall back to original filtered route
                val session = engine.session
                val array = Arguments.createArray()
                if (session != null) {
                    for (location in session.filteredLocations) {
                        array.pushMap(location.toWritableMap())
                    }
                }
                val result = Arguments.createMap()
                result.putArray("route", array)
                result.putDouble("distance", session?.totalDistance ?: 0.0)
                promise.resolve(result)
                return
            }

            // Sanity check: if smoothed covers < half original, fall back
            val origCount = engine.session?.filteredLocations?.size ?: 0
            if (origCount > 10 && smoothed.size < origCount / 2) {
                engine.kalmanFilter.clearHistory()
                val array = Arguments.createArray()
                for (location in engine.session!!.filteredLocations) {
                    array.pushMap(location.toWritableMap())
                }
                val result = Arguments.createMap()
                result.putArray("route", array)
                result.putDouble("distance", engine.session!!.totalDistance)
                promise.resolve(result)
                return
            }

            val array = Arguments.createArray()
            var totalDist = 0.0
            for (i in smoothed.indices) {
                val s = smoothed[i]
                var distFromPrev = 0.0
                if (i > 0) {
                    val prev = smoothed[i - 1]
                    distFromPrev = com.runcrew.gps.util.GeoMath.haversineDistance(
                        prev.latitude, prev.longitude, s.latitude, s.longitude
                    )
                    if (distFromPrev < 0.3) distFromPrev = 0.0
                    totalDist += distFromPrev
                }
                val point = Arguments.createMap()
                point.putDouble("latitude", s.latitude)
                point.putDouble("longitude", s.longitude)
                point.putDouble("altitude", s.altitude)
                point.putDouble("speed", s.speed.toDouble())
                point.putDouble("bearing", s.bearing.toDouble())
                point.putDouble("timestamp", s.timestamp.toDouble())
                point.putDouble("distanceFromPrevious", distFromPrev)
                point.putDouble("cumulativeDistance", totalDist)
                point.putBoolean("isInterpolated", false)
                array.pushMap(point)
            }

            val result = Arguments.createMap()
            result.putArray("route", array)
            result.putDouble("distance", totalDist)
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting smoothed route", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to get smoothed route: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getCurrentStatus(promise: Promise) {
        try {
            val session = locationEngine?.session
            val status = session?.gpsStatus ?: "disabled"
            promise.resolve(status)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting current status", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to get status: ${e.message}", e)
        }
    }

    // --- Heading tracking (magnetometer/rotation vector) ---

    @ReactMethod
    fun startHeadingUpdates(promise: Promise) {
        try {
            if (headingTracker != null) {
                promise.resolve(null)
                return
            }

            val sensorManager = reactApplicationContext.getSystemService(
                android.content.Context.SENSOR_SERVICE
            ) as android.hardware.SensorManager

            val tracker = HeadingTracker(sensorManager)
            tracker.setListener(object : HeadingTracker.Listener {
                override fun onHeadingUpdate(heading: Double) {
                    if (listenerCount <= 0) return
                    val params = Arguments.createMap().apply {
                        putDouble("heading", heading)
                    }
                    sendEvent(EVENT_HEADING_UPDATE, params)
                }
            })
            tracker.start()
            headingTracker = tracker
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting heading updates", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to start heading: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopHeadingUpdates(promise: Promise) {
        try {
            headingTracker?.stop()
            headingTracker = null
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping heading updates", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to stop heading: ${e.message}", e)
        }
    }

    // --- LocationEngine.Listener implementation ---

    // Rolling cadence window: track recent step timestamps for real-time SPM
    private val recentStepTimestamps = ArrayDeque<Long>(120)
    private val CADENCE_WINDOW_MS = 15_000L  // 15-second rolling window

    override fun onFilteredLocationUpdate(location: FilteredLocation, session: RunSession) {
        val sensorFusion = locationEngine?.sensorFusionManager
        // Use real-time stationary state from SensorFusionManager rather than
        // session.isMoving (which only updates on state transitions via listener).
        // This ensures isMoving accurately reflects the current movement state
        // for every GPS update, critical for auto-pause in JS.
        val isCurrentlyMoving = sensorFusion?.let { !it.isStationary() } ?: session.isMoving
        val cadenceSPM = if (isCurrentlyMoving && sensorFusion != null) {
            val stepDetector = sensorFusion.stepDetector
            val now = System.currentTimeMillis()
            // Add steps to rolling window based on total step count delta
            val currentTotal = stepDetector.totalSteps
            val windowCutoff = now - CADENCE_WINDOW_MS
            // Prune old entries
            while (recentStepTimestamps.isNotEmpty() && recentStepTimestamps.first() < windowCutoff) {
                recentStepTimestamps.removeFirst()
            }
            // Calculate cadence from steps in the rolling window
            val stepsInWindow = recentStepTimestamps.size
            if (stepsInWindow > 0) {
                (stepsInWindow.toDouble() / (CADENCE_WINDOW_MS / 1000.0) * 60).toInt()
            } else 0
        } else 0
        val elevGain = sensorFusion?.barometerTracker?.totalElevationGain ?: 0.0
        val elevLoss = sensorFusion?.barometerTracker?.totalElevationLoss ?: 0.0

        val distSource = if (location.isInterpolated) "pedometer" else "gps"
        val eventData = location.toLocationUpdateEvent(isCurrentlyMoving, cadenceSPM, elevGain, elevLoss, distSource)
        sendEvent(EVENT_LOCATION_UPDATE, eventData)

        // Update notification periodically (every 5th update to avoid excessive overhead)
        notificationUpdateCounter++
        if (notificationUpdateCounter % 5 == 0) {
            GPSForegroundService.updateNotification(
                reactApplicationContext,
                session.totalDistance,
                session.getElapsedTime()
            )
        }
    }

    override fun onGPSStatusChange(status: String, accuracy: Float?, satelliteCount: Int) {
        locationEngine?.session?.gpsStatus = status

        val params = Arguments.createMap().apply {
            putString("status", status)
            if (accuracy != null) {
                putDouble("accuracy", accuracy.toDouble())
            } else {
                putNull("accuracy")
            }
            putInt("satelliteCount", satelliteCount)
        }
        sendEvent(EVENT_GPS_STATUS_CHANGE, params)
    }

    override fun onRunningStateChange(state: String, durationMs: Long) {
        val params = Arguments.createMap().apply {
            putString("state", state)
            putDouble("duration", durationMs.toDouble())
        }
        sendEvent(EVENT_RUNNING_STATE_CHANGE, params)
    }

    override fun onMilestoneReached(km: Int, splitPaceSecondsPerKm: Int, totalTimeSeconds: Int) {
        val params = Arguments.createMap().apply {
            putInt("km", km)
            putInt("splitPaceSecondsPerKm", splitPaceSecondsPerKm)
            putInt("totalTimeSeconds", totalTimeSeconds)
        }
        sendEvent(EVENT_MILESTONE_REACHED, params)
    }

    override fun onError(code: String, message: String) {
        Log.e(TAG, "GPS Error [$code]: $message")
        // Errors are surfaced via Promise rejections on the calling methods.
        // Critical errors that occur asynchronously can be sent as GPS status changes.
        if (code == ERROR_PERMISSION_DENIED || code == ERROR_GPS_DISABLED) {
            onGPSStatusChange("disabled", null, 0)
        }
    }

    // --- Private helpers ---

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (listenerCount <= 0) return
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to send event $eventName: ${e.message}")
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(
            reactApplicationContext, permission
        ) == PackageManager.PERMISSION_GRANTED
    }
}
