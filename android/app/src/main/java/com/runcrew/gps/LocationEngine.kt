package com.runcrew.gps

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.GnssStatus
import android.location.LocationManager
import android.os.Build
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

        // Cold start: GPS accuracy must be below this before data is used (unified with iOS)
        private const val COLD_START_ACCURACY_THRESHOLD = 20f

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
        fun onMilestoneReached(km: Int, splitPaceSecondsPerKm: Int, totalTimeSeconds: Int)
        fun onError(code: String, message: String)
    }

    var listener: Listener? = null

    // --- Components ---

    private val coordinateConverter = CoordinateConverter()
    internal val kalmanFilter = KalmanFilter(coordinateConverter)
    private val outlierDetector = OutlierDetector()
    private val batteryOptimizer = BatteryOptimizer()

    // Sensor components are initialized lazily (need SensorManager from context)
    internal var sensorFusionManager: SensorFusionManager? = null
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

    // --- Satellite tracking ---

    @Volatile
    private var satelliteCount = 0
    @Volatile
    private var usedSatelliteCount = 0

    private var gnssStatusCallback: GnssStatus.Callback? = null

    // --- Previous filtered location for distance calculation ---

    @Volatile
    private var previousFilteredLat = 0.0
    @Volatile
    private var previousFilteredLng = 0.0

    // --- Milestone (split) tracking ---

    @Volatile
    private var previousMilestoneDistance = 0.0
    @Volatile
    private var previousMilestoneTime = 0L  // elapsed ms at last km milestone

    // --- Indoor / pedometer fallback ---

    private val pedometerHandler = android.os.Handler(Looper.getMainLooper())
    private var pedometerFallbackRunnable: Runnable? = null
    @Volatile
    private var pedometerBaseSteps = 0
    @Volatile
    private var gpsDistanceAtLost = 0.0

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
        listener?.onGPSStatusChange("searching", null, usedSatelliteCount)

        // Reset all filter state
        kalmanFilter.reset()
        coordinateConverter.reset()
        outlierDetector.reset()
        batteryOptimizer.reset()
        sensorFusionManager?.reset()
        previousFilteredLat = 0.0
        previousFilteredLng = 0.0
        previousMilestoneDistance = 0.0
        previousMilestoneTime = 0L

        // Start sensors
        sensorFusionManager?.start()

        // Start satellite tracking
        registerGnssStatusCallback()

        // Start GPS
        requestLocationUpdates()
    }

    /**
     * Stop all GPS updates and sensor listeners.
     */
    fun stop() {
        stopPedometerFallback()
        removeLocationUpdates()
        unregisterGnssStatusCallback()
        sensorFusionManager?.stop()
        session.stop()

        if (currentGpsStatus != "disabled") {
            currentGpsStatus = "disabled"
            listener?.onGPSStatusChange("disabled", null, usedSatelliteCount)
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
            .setWaitForAccurateLocation(true)
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

    @Synchronized
    private fun requestLocationUpdates() {
        // Clean up any existing callback before creating a new one
        removeLocationUpdates()

        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            BatteryOptimizer.INTERVAL_MOVING_MS
        )
            .setMinUpdateIntervalMillis(BatteryOptimizer.FASTEST_INTERVAL_MOVING_MS)
            .setMinUpdateDistanceMeters(0f)
            .setWaitForAccurateLocation(true)
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
                        listener?.onGPSStatusChange("lost", null, usedSatelliteCount)
                        startPedometerFallback()
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

    @Synchronized
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

        // Reject stale/cached locations from FusedLocationProvider.
        // Android can return a cached cell-tower position with decent accuracy (~15m)
        // but from a completely different location. Use elapsedRealtimeNanos to detect this.
        val locationAgeMs = (android.os.SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000L
        if (locationAgeMs > 10_000L) {
            Log.d(TAG, "Rejected stale cached location: ${locationAgeMs}ms old")
            return
        }

        val point = GPSPoint.fromLocation(location)

        // Always store raw point (for server upload)
        session.addRawPoint(point)

        // --- Cold start gate ---
        if (!coldStartComplete) {
            if (point.horizontalAccuracy <= COLD_START_ACCURACY_THRESHOLD) {
                coldStartComplete = true
                currentGpsStatus = "locked"
                listener?.onGPSStatusChange("locked", point.horizontalAccuracy, usedSatelliteCount)
            } else {
                // Check timeout
                if (System.currentTimeMillis() - coldStartBeginTime > COLD_START_TIMEOUT_MS) {
                    // Accept what we have and proceed
                    coldStartComplete = true
                    currentGpsStatus = "locked"
                    listener?.onGPSStatusChange("locked", point.horizontalAccuracy, usedSatelliteCount)
                    Log.w(TAG, "Cold start timeout. Proceeding with accuracy: ${point.horizontalAccuracy}m")
                } else {
                    // Still waiting for accurate fix
                    listener?.onGPSStatusChange("searching", point.horizontalAccuracy, usedSatelliteCount)
                    return
                }
            }
        }

        // Update GPS status if accuracy degrades
        if (point.horizontalAccuracy > OutlierDetector.MAX_ACCURACY_METERS) {
            if (currentGpsStatus != "lost") {
                currentGpsStatus = "lost"
                listener?.onGPSStatusChange("lost", point.horizontalAccuracy, usedSatelliteCount)
                startPedometerFallback()
            }
        } else if (currentGpsStatus != "locked") {
            currentGpsStatus = "locked"
            listener?.onGPSStatusChange("locked", point.horizontalAccuracy, usedSatelliteCount)
            stopPedometerFallback()
        }

        // If session is paused, don't process further
        if (!session.isActive()) return

        // --- Layer 1+2: Outlier detection (includes validity check) ---
        val outlierResult = outlierDetector.evaluate(point)
        if (outlierResult is OutlierDetector.OutlierResult.Rejected) {
            Log.d(TAG, "Point rejected: ${outlierResult.reason}")
            return
        }

        // --- Spike detection: reject physically impossible jumps BEFORE kalman update ---
        // Compare raw GPS against the last *filtered* position (matched with iOS).
        // The Kalman filter smooths position, so raw-vs-filtered distance can appear
        // larger than actual movement. Use generous limits to avoid rejecting valid points.
        if (previousFilteredLat != 0.0) {
            val rawDist = GeoMath.haversineDistance(
                previousFilteredLat, previousFilteredLng,
                point.latitude, point.longitude
            )
            val timeDelta = (point.timestamp - (session.filteredLocations.lastOrNull()?.timestamp ?: point.timestamp)) / 1000.0
            // 15 m/s limit — generous to account for Kalman filter lag
            val maxPlausibleDist = kotlin.math.max(15.0 * kotlin.math.max(timeDelta, 0.5), 10.0)
            if (rawDist > maxPlausibleDist) {
                Log.d(TAG, "Spike rejected: raw-vs-filtered ${rawDist}m > ${maxPlausibleDist}m")
                return
            }
            // Background GPS guard: when update interval is large (>5s),
            // GPS may report stale/cell-tower positions. Cap distance to 50m (matched with iOS).
            if (timeDelta > 5.0 && rawDist > 50.0) {
                Log.d(TAG, "Background spike rejected: ${rawDist}m in ${timeDelta}s")
                return
            }
        }

        // --- Layer 3: Kalman Filter ---
        // Update process noise from accelerometer BEFORE Kalman update (matched with iOS)
        stationaryDetector?.let { detector ->
            val accelVarianceG2 = (detector.currentAccelVariance / (9.81 * 9.81)).coerceAtLeast(0.001)
            kalmanFilter.updateProcessNoise(accelVarianceG2)
        }
        kalmanFilter.updateSpeedAdaptiveQ()

        val filterResult = kalmanFilter.process(point) ?: return

        // --- Layer 4: Sensor Fusion ---
        val fusion = sensorFusionManager
        fusion?.onFilteredLocationReady(
            point, filterResult.latitude, filterResult.longitude,
            filterResult.speed, filterResult.bearing
        )

        // Best altitude: barometer if available, else Kalman-filtered GPS alt
        val bestAltitude = fusion?.getBestAltitude(filterResult.altitude) ?: filterResult.altitude

        // --- Stationary suppression: clamp position + don't accumulate distance ---
        // Android FusedLocationProvider has significantly more GPS drift than iOS
        // Core Location, especially indoors. When stationary, lock the emitted position
        // to the last known good location to prevent the map marker from wandering.
        val isStationary = fusion?.isStationary() ?: false
        val rawDist = if (previousFilteredLat == 0.0) {
            0.0
        } else {
            GeoMath.haversineDistance(
                previousFilteredLat, previousFilteredLng,
                filterResult.latitude, filterResult.longitude
            )
        }

        val emitLat: Double
        val emitLng: Double
        val distFromPrev: Double

        if (isStationary) {
            // Safety net: if detector says stationary but movement is clearly
            // significant (> 2m), the detector is wrong — still count distance and update position
            if (rawDist > 2.0) {
                emitLat = filterResult.latitude
                emitLng = filterResult.longitude
                distFromPrev = rawDist
            } else {
                // Clamp position to last known location — prevents GPS drift on map
                emitLat = if (previousFilteredLat != 0.0) previousFilteredLat else filterResult.latitude
                emitLng = if (previousFilteredLng != 0.0) previousFilteredLng else filterResult.longitude
                distFromPrev = 0.0
            }
        } else {
            emitLat = filterResult.latitude
            emitLng = filterResult.longitude
            // Normal case: ignore tiny movements (< 0.3m) as noise
            distFromPrev = if (rawDist >= 0.3) rawDist else 0.0
        }

        val cumulativeDistance = session.totalDistance + distFromPrev

        val filteredLocation = FilteredLocation(
            latitude = emitLat,
            longitude = emitLng,
            altitude = bestAltitude,
            speed = if (isStationary) 0.0 else filterResult.speed,
            bearing = filterResult.bearing,
            timestamp = point.timestamp,
            distanceFromPrevious = distFromPrev,
            cumulativeDistance = cumulativeDistance,
            isInterpolated = false
        )

        session.addFilteredLocation(filteredLocation)
        // Only update previous position when actually moving — keeps the anchor stable during stationary
        if (!isStationary || previousFilteredLat == 0.0) {
            previousFilteredLat = filterResult.latitude
            previousFilteredLng = filterResult.longitude
        }

        // Adaptive GPS interval based on movement and battery state
        val isMoving = !isStationary
        val movementChanged = batteryOptimizer.updateMovementState(isMoving)
        val batteryChanged = batteryOptimizer.updateBatteryState(context)
        if (movementChanged || batteryChanged) {
            updateLocationInterval()
        }

        // Emit to listener
        listener?.onFilteredLocationUpdate(filteredLocation, session)

        // Milestone detection: emit split event at every km boundary
        val prevKm = (previousMilestoneDistance / 1000).toInt()
        val currentKm = (cumulativeDistance / 1000).toInt()
        if (currentKm > prevKm && currentKm > 0) {
            val elapsedMs = session.getElapsedTime()
            val elapsedSec = (elapsedMs / 1000).toInt()
            val splitSeconds = ((elapsedMs - previousMilestoneTime) / 1000).toInt()
            val splitPace = if (splitSeconds > 0) splitSeconds else 0
            previousMilestoneTime = elapsedMs
            listener?.onMilestoneReached(currentKm, splitPace, elapsedSec)
        }
        previousMilestoneDistance = cumulativeDistance
    }

    // --- Indoor / Pedometer Fallback ---

    /**
     * Start emitting pedometer-based distance events when GPS is lost.
     * Fires every 2 seconds, using step count * stride for distance.
     */
    private fun startPedometerFallback() {
        if (pedometerFallbackRunnable != null) return
        val fusion = sensorFusionManager ?: return

        pedometerBaseSteps = fusion.stepDetector.totalSteps
        gpsDistanceAtLost = session.totalDistance
        Log.i(TAG, "Starting pedometer fallback (baseSteps=$pedometerBaseSteps, gpsDistAtLost=$gpsDistanceAtLost)")

        val runnable = object : Runnable {
            override fun run() {
                emitPedometerUpdate()
                pedometerHandler.postDelayed(this, 2000)
            }
        }
        pedometerFallbackRunnable = runnable
        pedometerHandler.postDelayed(runnable, 2000)
    }

    private fun stopPedometerFallback() {
        pedometerFallbackRunnable?.let {
            pedometerHandler.removeCallbacks(it)
        }
        pedometerFallbackRunnable = null
    }

    /**
     * Emit a synthetic location event using step-based distance.
     */
    private fun emitPedometerUpdate() {
        if (session.state != RunSession.State.TRACKING) {
            stopPedometerFallback()
            return
        }

        val fusion = sensorFusionManager ?: return
        val stepDelta = fusion.stepDetector.totalSteps - pedometerBaseSteps
        if (stepDelta <= 0) return

        val distance = stepDelta * fusion.stepDetector.currentStrideEstimate
        val newCumulativeDistance = gpsDistanceAtLost + distance

        // Only move forward
        if (newCumulativeDistance <= session.totalDistance) return

        // Dead reckoning for position
        val dr = fusion.attemptDeadReckoning()
        val lat = dr?.latitude ?: previousFilteredLat
        val lon = dr?.longitude ?: previousFilteredLng

        val distFromPrev = newCumulativeDistance - session.totalDistance

        val filteredLocation = FilteredLocation(
            latitude = lat,
            longitude = lon,
            altitude = fusion.getBestAltitude(0.0),
            speed = if (fusion.isStationary()) 0.0 else fusion.stepDetector.currentStrideEstimate * 2.0,
            bearing = 0.0,
            timestamp = System.currentTimeMillis(),
            distanceFromPrevious = distFromPrev,
            cumulativeDistance = newCumulativeDistance,
            isInterpolated = true
        )

        session.addFilteredLocation(filteredLocation)

        // Emit to listener (listener adds distanceSource via the event builder)
        listener?.onFilteredLocationUpdate(filteredLocation, session)

        // Milestone detection
        val prevKm = (previousMilestoneDistance / 1000).toInt()
        val currentKm = (newCumulativeDistance / 1000).toInt()
        if (currentKm > prevKm && currentKm > 0) {
            val elapsedMs = session.getElapsedTime()
            val elapsedSec = (elapsedMs / 1000).toInt()
            val splitSeconds = ((elapsedMs - previousMilestoneTime) / 1000).toInt()
            val splitPace = if (splitSeconds > 0) splitSeconds else 0
            previousMilestoneTime = elapsedMs
            listener?.onMilestoneReached(currentKm, splitPace, elapsedSec)
        }
        previousMilestoneDistance = newCumulativeDistance
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

    // --- GNSS satellite tracking ---

    private fun registerGnssStatusCallback() {
        if (!hasLocationPermission()) return
        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return

        val callback = object : GnssStatus.Callback() {
            override fun onSatelliteStatusChanged(status: GnssStatus) {
                satelliteCount = status.satelliteCount
                var used = 0
                for (i in 0 until status.satelliteCount) {
                    if (status.usedInFix(i)) used++
                }
                usedSatelliteCount = used
            }
        }
        gnssStatusCallback = callback

        try {
            locationManager.registerGnssStatusCallback(callback, android.os.Handler(Looper.getMainLooper()))
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException registering GNSS status callback", e)
        }
    }

    private fun unregisterGnssStatusCallback() {
        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        gnssStatusCallback?.let { callback ->
            locationManager.unregisterGnssStatusCallback(callback)
        }
        gnssStatusCallback = null
        satelliteCount = 0
        usedSatelliteCount = 0
    }
}
