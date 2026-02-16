package com.runcrew.gps

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.*
import com.runcrew.gps.filter.KalmanFilter
import com.runcrew.gps.filter.OutlierDetector
import com.runcrew.gps.filter.StationaryDetector
import com.runcrew.gps.model.FilteredLocation
import com.runcrew.gps.model.GPSPoint
import com.runcrew.gps.model.RunSession
import com.runcrew.gps.sensor.SensorFusionManager
import com.runcrew.gps.util.BatteryOptimizer
import com.runcrew.gps.util.CoordinateConverter
import com.runcrew.gps.util.GeoMath

/**
 * Wraps FusedLocationProviderClient and orchestrates the full filtering pipeline:
 *
 *   FusedLocation -> [Validity Check] -> [Outlier Removal] -> [Kalman Filter]
 *                -> [Sensor Fusion] -> FilteredLocation
 *
 * This class owns all filter/sensor components and the RunSession state.
 * It receives raw location callbacks on the main thread and processes them
 * through the pipeline, emitting filtered results to a listener.
 */
class LocationEngine(
    private val context: Context
) {
    companion object {
        private const val TAG = "LocationEngine"

        // Cold start: GPS accuracy must be below this before data is used
        private const val COLD_START_ACCURACY_THRESHOLD = 15f

        // Cold start timeout (ms): if accuracy never drops below threshold
        private const val COLD_START_TIMEOUT_MS = 30_000L

        // GPS status: if no update for this duration, GPS is "lost"
        private const val GPS_LOST_TIMEOUT_MS = 10_000L
    }

    // --- Public listener interface ---

    interface Listener {
        fun onFilteredLocationUpdate(location: FilteredLocation, session: RunSession)
        fun onGPSStatusChange(status: String, accuracy: Float?, satelliteCount: Int)
        fun onRunningStateChange(state: String, durationMs: Long)
        fun onError(code: String, message: String)
    }

    var listener: Listener? = null

    // --- Components ---

    private val coordinateConverter = CoordinateConverter()
    private val kalmanFilter = KalmanFilter(coordinateConverter)
    private val outlierDetector = OutlierDetector()
    private val batteryOptimizer = BatteryOptimizer()

    // Sensor components are initialized lazily (need SensorManager from context)
    private var sensorFusionManager: SensorFusionManager? = null
    private var stationaryDetector: StationaryDetector? = null

    val session = RunSession()

    // --- FusedLocationProvider ---

    private var fusedLocationClient: FusedLocationProviderClient? = null
    private var locationCallback: LocationCallback? = null

    // --- Cold start state ---

    @Volatile
    private var coldStartComplete = false
    @Volatile
    private var coldStartBeginTime = 0L

    // --- GPS status tracking ---

    @Volatile
    private var lastGpsUpdateTime = 0L
    @Volatile
    private var currentGpsStatus = "searching"

    // --- Previous filtered location for distance calculation ---

    @Volatile
    private var previousFilteredLat = 0.0
    @Volatile
    private var previousFilteredLng = 0.0

    /**
     * Initialize the engine. Must be called before start().
     * Sets up sensor managers and FusedLocationProviderClient.
     */
    fun initialize() {
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)

        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as android.hardware.SensorManager
        val statDetector = StationaryDetector(sensorManager)
        stationaryDetector = statDetector
        sensorFusionManager = SensorFusionManager(sensorManager, kalmanFilter, statDetector)

        // Listen for stationary/moving state changes
        statDetector.addListener { newState, duration ->
            val stateStr = when (newState) {
                StationaryDetector.MovementState.MOVING -> "moving"
                StationaryDetector.MovementState.STATIONARY -> "stationary"
            }
            session.isMoving = (newState == StationaryDetector.MovementState.MOVING)
            listener?.onRunningStateChange(stateStr, duration)
        }
    }

    /**
     * Start receiving GPS updates and processing them through the filter pipeline.
     * Requires location permissions to be granted.
     */
    fun start() {
        if (!hasLocationPermission()) {
            listener?.onError("PERMISSION_DENIED", "Location permission not granted")
            return
        }

        if (!isGPSEnabled()) {
            listener?.onError("GPS_DISABLED", "GPS is not enabled in device settings")
            return
        }

        session.start()
        coldStartComplete = false
        coldStartBeginTime = System.currentTimeMillis()
        currentGpsStatus = "searching"
        listener?.onGPSStatusChange("searching", null, 0)

        // Reset all filter state
        kalmanFilter.reset()
        coordinateConverter.reset()
        outlierDetector.reset()
        batteryOptimizer.reset()
        sensorFusionManager?.reset()
        previousFilteredLat = 0.0
        previousFilteredLng = 0.0

        // Start sensors
        sensorFusionManager?.start()

        // Start GPS
        requestLocationUpdates()
    }

    /**
     * Stop all GPS updates and sensor listeners.
     */
    fun stop() {
        removeLocationUpdates()
        sensorFusionManager?.stop()
        session.stop()

        if (currentGpsStatus != "disabled") {
            currentGpsStatus = "disabled"
            listener?.onGPSStatusChange("disabled", null, 0)
        }
    }

    /**
     * Pause tracking: GPS keeps running (for resume accuracy) but points are not recorded.
     */
    fun pause() {
        session.pause()
    }

    /**
     * Resume tracking after pause.
     */
    fun resume() {
        session.resume()
    }

    /**
     * Update the GPS polling interval based on current battery optimization state.
     */
    fun updateLocationInterval() {
        if (fusedLocationClient == null || locationCallback == null) return

        val interval = batteryOptimizer.getCurrentInterval()
        val fastest = batteryOptimizer.getCurrentFastestInterval()

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
            .setMinUpdateIntervalMillis(fastest)
            .setMinUpdateDistanceMeters(0f)
            .setMaxUpdateDelayMillis(0)
            .build()

        try {
            if (hasLocationPermission()) {
                fusedLocationClient?.requestLocationUpdates(request, locationCallback!!, Looper.getMainLooper())
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException updating location interval", e)
        }
    }

    // --- Private: Location request management ---

    private fun requestLocationUpdates() {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            BatteryOptimizer.INTERVAL_MOVING_MS
        )
            .setMinUpdateIntervalMillis(BatteryOptimizer.FASTEST_INTERVAL_MOVING_MS)
            .setMinUpdateDistanceMeters(0f)
            .setMaxUpdateDelayMillis(0)
            .build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                for (location in result.locations) {
                    processRawLocation(location)
                }
            }

            override fun onLocationAvailability(availability: LocationAvailability) {
                if (!availability.isLocationAvailable) {
                    val now = System.currentTimeMillis()
                    if (now - lastGpsUpdateTime > GPS_LOST_TIMEOUT_MS && currentGpsStatus != "lost") {
                        currentGpsStatus = "lost"
                        listener?.onGPSStatusChange("lost", null, 0)
                    }
                }
            }
        }

        try {
            if (hasLocationPermission()) {
                fusedLocationClient?.requestLocationUpdates(request, locationCallback!!, Looper.getMainLooper())
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException requesting location updates", e)
            listener?.onError("PERMISSION_DENIED", "Location permission was revoked")
        }
    }

    private fun removeLocationUpdates() {
        locationCallback?.let { callback ->
            fusedLocationClient?.removeLocationUpdates(callback)
        }
        locationCallback = null
    }

    // --- Private: Filtering Pipeline ---

    /**
     * Main pipeline entry point. Called on the main thread for each raw GPS fix.
     */
    private fun processRawLocation(location: android.location.Location) {
        lastGpsUpdateTime = System.currentTimeMillis()

        val point = GPSPoint.fromLocation(location)

        // Always store raw point (for server upload)
        session.addRawPoint(point)

        // --- Cold start gate ---
        if (!coldStartComplete) {
            if (point.horizontalAccuracy <= COLD_START_ACCURACY_THRESHOLD) {
                coldStartComplete = true
                currentGpsStatus = "locked"
                listener?.onGPSStatusChange("locked", point.horizontalAccuracy, 0)
            } else {
                // Check timeout
                if (System.currentTimeMillis() - coldStartBeginTime > COLD_START_TIMEOUT_MS) {
                    // Accept what we have and proceed
                    coldStartComplete = true
                    currentGpsStatus = "locked"
                    listener?.onGPSStatusChange("locked", point.horizontalAccuracy, 0)
                    Log.w(TAG, "Cold start timeout. Proceeding with accuracy: ${point.horizontalAccuracy}m")
                } else {
                    // Still waiting for accurate fix
                    listener?.onGPSStatusChange("searching", point.horizontalAccuracy, 0)
                    return
                }
            }
        }

        // Update GPS status if accuracy degrades
        if (point.horizontalAccuracy > OutlierDetector.MAX_ACCURACY_METERS) {
            if (currentGpsStatus != "lost") {
                currentGpsStatus = "lost"
                listener?.onGPSStatusChange("lost", point.horizontalAccuracy, 0)
            }
        } else if (currentGpsStatus != "locked") {
            currentGpsStatus = "locked"
            listener?.onGPSStatusChange("locked", point.horizontalAccuracy, 0)
        }

        // If session is paused, don't process further
        if (!session.isActive()) return

        // --- Layer 1+2: Outlier detection (includes validity check) ---
        val outlierResult = outlierDetector.evaluate(point)
        if (outlierResult is OutlierDetector.OutlierResult.Rejected) {
            Log.d(TAG, "Point rejected: ${outlierResult.reason}")
            return
        }

        // --- Layer 3: Kalman Filter ---
        val filterResult = kalmanFilter.process(point) ?: return

        // --- Layer 4: Sensor Fusion ---
        val fusion = sensorFusionManager
        fusion?.onFilteredLocationReady(
            point, filterResult.latitude, filterResult.longitude,
            filterResult.speed, filterResult.bearing
        )

        // Best altitude: barometer if available, else Kalman-filtered GPS alt
        val bestAltitude = fusion?.getBestAltitude(filterResult.altitude) ?: filterResult.altitude

        // --- Stationary suppression: don't accumulate distance while stationary ---
        val isStationary = fusion?.isStationary() ?: false
        val distFromPrev = if (isStationary || previousFilteredLat == 0.0) {
            0.0
        } else {
            GeoMath.haversineDistance(
                previousFilteredLat, previousFilteredLng,
                filterResult.latitude, filterResult.longitude
            )
        }

        val cumulativeDistance = session.totalDistance + distFromPrev

        val filteredLocation = FilteredLocation(
            latitude = filterResult.latitude,
            longitude = filterResult.longitude,
            altitude = bestAltitude,
            speed = if (isStationary) 0.0 else filterResult.speed,
            bearing = filterResult.bearing,
            timestamp = point.timestamp,
            distanceFromPrevious = distFromPrev,
            cumulativeDistance = cumulativeDistance,
            isInterpolated = false
        )

        session.addFilteredLocation(filteredLocation)
        previousFilteredLat = filterResult.latitude
        previousFilteredLng = filterResult.longitude

        // Adaptive GPS interval
        val isMoving = !isStationary
        if (batteryOptimizer.updateMovementState(isMoving)) {
            updateLocationInterval()
        }

        // Emit to listener
        listener?.onFilteredLocationUpdate(filteredLocation, session)
    }

    // --- Permission & GPS availability checks ---

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun isGPSEnabled(): Boolean {
        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        return locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) ?: false
    }
}
