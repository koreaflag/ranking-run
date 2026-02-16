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

        // Error codes matching shared-interfaces.md
        private const val ERROR_PERMISSION_DENIED = "PERMISSION_DENIED"
        private const val ERROR_GPS_DISABLED = "GPS_DISABLED"
        private const val ERROR_SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
        private const val ERROR_COLD_START_TIMEOUT = "COLD_START_TIMEOUT"
        private const val ERROR_BACKGROUND_RESTRICTED = "BACKGROUND_RESTRICTED"
    }

    private var locationEngine: LocationEngine? = null
    private var listenerCount = 0
    private var notificationUpdateCounter = 0

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        val engine = LocationEngine(reactApplicationContext)
        engine.listener = this
        engine.initialize()
        locationEngine = engine
    }

    override fun canOverrideExistingModule(): Boolean = false

    override fun onCatalystInstanceDestroy() {
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

            val engine = locationEngine
            if (engine == null) {
                promise.reject(ERROR_SERVICE_UNAVAILABLE, "LocationEngine not initialized")
                return
            }

            // Start foreground service for background tracking
            GPSForegroundService.startService(reactApplicationContext)

            // Start the engine (GPS + sensors)
            engine.start()

            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting tracking", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to start tracking: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopTracking(promise: Promise) {
        try {
            locationEngine?.stop()
            GPSForegroundService.stopService(reactApplicationContext)
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping tracking", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to stop tracking: ${e.message}", e)
        }
    }

    @ReactMethod
    fun pauseTracking(promise: Promise) {
        try {
            locationEngine?.pause()
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error pausing tracking", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to pause tracking: ${e.message}", e)
        }
    }

    @ReactMethod
    fun resumeTracking(promise: Promise) {
        try {
            locationEngine?.resume()
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error resuming tracking", e)
            promise.reject(ERROR_SERVICE_UNAVAILABLE, "Failed to resume tracking: ${e.message}", e)
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

    // --- LocationEngine.Listener implementation ---

    override fun onFilteredLocationUpdate(location: FilteredLocation, session: RunSession) {
        val eventData = location.toLocationUpdateEvent(session.isMoving)
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
