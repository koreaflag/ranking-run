import Foundation
import CoreLocation
import UIKit
import AVFoundation

/// CLLocationManager wrapper - handles all Core Location interactions
class LocationEngine: NSObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private let outlierDetector = OutlierDetector()
    private let kalmanFilter = KalmanFilter()
    private let stationaryDetector = StationaryDetector()
    private let sensorFusion = SensorFusionManager()
    private let session = RunSession()

    private var cumulativeDistance: Double = 0
    private var previousCumulativeDistance: Double = 0
    private var previousMilestoneTime: Int = 0  // elapsed seconds at last km milestone
    private var lastFilteredLocation: FilteredLocation?
    private var coldStartTimer: Timer?
    private var gpsLostTimer: Timer?
    private var gpsLostTime: Date?
    private var baseAltitude: Double?

    // Indoor / dead-reckoning fallback
    private var pedometerFallbackTimer: Timer?
    private var pedometerBaseDistance: Double = 0  // pedometer totalDistance at GPS-lost time
    private var gpsDistanceAtFallbackStart: Double = 0  // cumulative GPS distance when fallback started

    // Background execution
    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    private var silentAudioPlayer: AVAudioPlayer?

    // Callbacks
    var onLocationUpdate: (([String: Any]) -> Void)?
    var onGPSStatusChange: (([String: Any]) -> Void)?
    var onRunningStateChange: (([String: Any]) -> Void)?
    var onWatchLocationUpdate: (([String: Any]) -> Void)?
    var onMilestoneReached: ((Int, Int, Int) -> Void)?  // (km, splitPaceSecPerKm, totalTimeSeconds)
    var onHeadingUpdate: (([String: Any]) -> Void)?

    private var headingOnly = false  // standalone heading mode (no GPS tracking)

    private var currentGPSStatus: String = "searching"
    private var batteryOptimizer: BatteryOptimizer?
    private var lastHeading: Double = -1  // magnetometer heading (true north)

    override init() {
        super.init()
        // CLLocationManager must be created and configured on main thread.
        // requiresMainQueueSetup() = true in GPSTrackerModule ensures init runs on main.
        // Synchronous setup prevents race where startTracking is called before
        // locationManager is configured.
        setupLocationManager()
    }

    deinit {
        coldStartTimer?.invalidate()
        gpsLostTimer?.invalidate()
        pedometerFallbackTimer?.invalidate()
    }

    private func setupLocationManager() {
        locationManager.delegate = self
        // Navigation-grade accuracy: GPS + magnetometer + gyroscope + accelerometer
        // Highest fidelity on iOS, ideal for running route recording
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = kCLDistanceFilterNone
        locationManager.activityType = .fitness
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.showsBackgroundLocationIndicator = true
        // Heading updates for better bearing between GPS fixes
        locationManager.headingFilter = 1 // degrees — responsive heading for compass UI
        batteryOptimizer = BatteryOptimizer(locationManager: locationManager)
    }

    // MARK: - Public API

    func requestPermission() {
        let status = locationManager.authorizationStatus
        print("[LocationEngine] Current auth status: \(status.rawValue)")
        switch status {
        case .notDetermined:
            // Request Always permission for background GPS tracking during runs
            locationManager.requestAlwaysAuthorization()
        case .authorizedWhenInUse:
            // Upgrade to Always if only WhenInUse was granted
            locationManager.requestAlwaysAuthorization()
        case .denied, .restricted:
            print("[LocationEngine] Location denied - user should enable in Settings")
        case .authorizedAlways:
            print("[LocationEngine] Location already authorized (Always)")
        @unknown default:
            break
        }
    }

    func startTracking() {
        let authStatus = locationManager.authorizationStatus
        switch authStatus {
        case .notDetermined:
            locationManager.requestAlwaysAuthorization()
            return
        case .denied:
            NSLog("[LocationEngine] [\(GPSErrorCode.permissionDenied.rawValue)] Location permission denied")
            updateGPSStatus("disabled")
            return
        case .restricted:
            NSLog("[LocationEngine] [\(GPSErrorCode.backgroundRestricted.rawValue)] Location restricted")
            updateGPSStatus("disabled")
            return
        default:
            break
        }

        session.start()
        outlierDetector.reset()
        kalmanFilter.reset()
        stationaryDetector.reset()
        batteryOptimizer?.reset()
        cumulativeDistance = 0
        previousCumulativeDistance = 0
        previousMilestoneTime = 0
        lastFilteredLocation = nil
        gpsLostTime = nil
        baseAltitude = nil

        sensorFusion.startAll()
        startBackgroundExecution()

        DispatchQueue.main.async { [weak self] in
            self?.locationManager.startUpdatingLocation()
            self?.locationManager.startUpdatingHeading()
        }

        updateGPSStatus("searching")
        startColdStartTimer()
    }

    func stopTracking() {
        session.stop()
        sensorFusion.stopAll()
        batteryOptimizer?.reset()
        coldStartTimer?.invalidate()
        coldStartTimer = nil
        gpsLostTimer?.invalidate()
        gpsLostTimer = nil
        stopPedometerFallback()
        stopBackgroundExecution()

        DispatchQueue.main.async { [weak self] in
            self?.locationManager.stopUpdatingLocation()
            // Keep heading alive if standalone heading mode is active
            if self?.headingOnly != true {
                self?.locationManager.stopUpdatingHeading()
            }
        }
    }

    func pauseTracking() {
        session.pause()
        // Cancel cold start timer during pause to prevent false GPS lock
        coldStartTimer?.invalidate()
        coldStartTimer = nil
    }

    func resumeTracking() {
        session.resume()
        batteryOptimizer?.reset()
        // Restart cold start timer if GPS was still acquiring
        if session.state == .starting {
            startColdStartTimer()
        }
    }

    /// Start heading-only updates (no GPS tracking). Used for compass on WorldScreen.
    func startHeadingOnly() {
        headingOnly = true
        DispatchQueue.main.async { [weak self] in
            self?.locationManager.startUpdatingHeading()
        }
    }

    /// Stop heading-only updates.
    func stopHeadingOnly() {
        guard headingOnly else { return }
        headingOnly = false
        // Only stop heading if GPS tracking is NOT active
        if session.state != .running && session.state != .starting {
            DispatchQueue.main.async { [weak self] in
                self?.locationManager.stopUpdatingHeading()
            }
        }
    }

    func getRawGPSPoints() -> [[String: Any]] {
        return session.rawPoints.map { $0.toDictionary() }
    }

    func getFilteredRoute() -> [[String: Any]] {
        return session.filteredLocations.map { $0.toDictionary() }
    }

    /// RTS Backward Smoother: post-run route correction using future data.
    /// Returns smoothed route and recalculated total distance.
    func getSmoothedRoute() -> (route: [[String: Any]], distance: Double) {
        let smoothed = kalmanFilter.smoothRoute()
        guard smoothed.count >= 2 else {
            // Not enough data — return original route
            return (route: session.filteredLocations.map { $0.toDictionary() },
                    distance: cumulativeDistance)
        }

        // Sanity: if reinit cleared history mid-run, smoothed covers only partial route.
        // Fall back to original route to avoid reporting truncated distance.
        let origCount = session.filteredLocations.count
        if origCount > 10 && smoothed.count < origCount / 2 {
            kalmanFilter.clearHistory()
            return (route: session.filteredLocations.map { $0.toDictionary() },
                    distance: cumulativeDistance)
        }

        // Rebuild route from self-contained smoothed data (no index alignment needed)
        var result: [[String: Any]] = []
        var totalDist: Double = 0

        for i in 0..<smoothed.count {
            let s = smoothed[i]
            var distFromPrev: Double = 0

            if i > 0 {
                let prev = smoothed[i - 1]
                distFromPrev = GeoMath.distance(
                    lat1: prev.lat, lon1: prev.lon,
                    lat2: s.lat, lon2: s.lon
                )
                // Apply same minimum threshold as live tracking
                if distFromPrev < 0.3 { distFromPrev = 0 }
                totalDist += distFromPrev
            }

            result.append([
                "latitude": s.lat,
                "longitude": s.lon,
                "altitude": s.alt,
                "speed": s.speed,
                "bearing": s.bearing,
                "timestamp": s.timestamp,
                "distanceFromPrevious": distFromPrev,
                "cumulativeDistance": totalDist,
                "isInterpolated": false
            ])
        }

        kalmanFilter.clearHistory()
        return (route: result, distance: totalDist)
    }

    func getCurrentStatus() -> String {
        // When actively tracking, return live GPS status
        if session.state == .running || session.state == .starting {
            return currentGPSStatus
        }
        // When not tracking, return based on authorization
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            return "locked"
        case .denied, .restricted:
            return "disabled"
        default:
            return "searching"
        }
    }

    func getSessionState() -> String {
        return session.state.rawValue
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            processLocation(location)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let clError = error as? CLError {
            switch clError.code {
            case .denied:
                NSLog("[LocationEngine] [\(GPSErrorCode.permissionDenied.rawValue)] Location denied via delegate")
                updateGPSStatus("disabled")
            case .locationUnknown:
                NSLog("[LocationEngine] [\(GPSErrorCode.serviceUnavailable.rawValue)] Location unknown")
                updateGPSStatus("searching")
            default:
                NSLog("[LocationEngine] [\(GPSErrorCode.serviceUnavailable.rawValue)] CLError: \(clError.code.rawValue)")
                updateGPSStatus("lost")
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        // Use true heading if available (calibrated with GPS), else magnetic
        if newHeading.trueHeading >= 0 {
            lastHeading = newHeading.trueHeading
        } else if newHeading.magneticHeading >= 0 {
            lastHeading = newHeading.magneticHeading
        }

        // Emit heading event with full accuracy data for JS layer
        if lastHeading >= 0 {
            onHeadingUpdate?([
                "heading": lastHeading,
                "accuracy": newHeading.headingAccuracy,
                "trueHeading": newHeading.trueHeading,
                "magneticHeading": newHeading.magneticHeading
            ])
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            if session.state == .starting || session.state == .running {
                DispatchQueue.main.async { [weak self] in
                    self?.locationManager.startUpdatingLocation()
                }
            }
        case .denied, .restricted:
            updateGPSStatus("disabled")
        default:
            break
        }
    }

    // MARK: - Location Processing Pipeline

    private func processLocation(_ location: CLLocation) {
        guard session.state == .starting || session.state == .running else { return }

        // Store raw point
        let rawPoint = GPSPoint(from: location)
        session.addRawPoint(rawPoint)

        // Layer 1 & 2: Validation + Outlier detection
        guard let validLocation = outlierDetector.validate(location) else { return }

        // Cold start check
        if session.state == .starting {
            if location.horizontalAccuracy <= 20.0 {
                session.markLocked()
                coldStartTimer?.invalidate()
                coldStartTimer = nil
                updateGPSStatus("locked", accuracy: location.horizontalAccuracy)
            } else {
                // Still waiting — send accuracy update for UI
                updateGPSStatus("searching", accuracy: location.horizontalAccuracy)
                return
            }
        }

        // Send live accuracy while running
        if session.state == .running {
            updateGPSStatus("locked", accuracy: location.horizontalAccuracy)
        }

        // Reset GPS lost timer — restart 10s countdown
        gpsLostTimer?.invalidate()
        gpsLostTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: false) { [weak self] _ in
            guard let self = self, self.session.state == .running else { return }
            self.gpsLostTime = Date()
            self.updateGPSStatus("lost")
            self.startPedometerFallback()
        }
        // GPS regained — stop pedometer fallback
        stopPedometerFallback()

        // Update sensor fusion with GPS data
        sensorFusion.onGPSUpdate(validLocation)
        gpsLostTime = nil

        // Spike detection: reject physically impossible jumps BEFORE kalman update
        // to prevent kalman state corruption from bad data.
        // NOTE: We compare raw GPS against the last *filtered* position. The Kalman filter
        // smooths position, so raw-vs-filtered distance can appear larger than actual movement.
        // Use generous limits to avoid rejecting valid points during direction changes or
        // when the filter is lagging behind (e.g., after resuming from stationary).
        if let lastLoc = lastFilteredLocation {
            let rawDist = GeoMath.distance(
                lat1: lastLoc.latitude, lon1: lastLoc.longitude,
                lat2: validLocation.coordinate.latitude, lon2: validLocation.coordinate.longitude
            )
            let timeDelta = (validLocation.timestamp.timeIntervalSince1970 * 1000 - lastLoc.timestamp) / 1000.0
            // 15 m/s limit (maxSpeed from OutlierDetector) — previous 10 m/s was too tight
            // because raw GPS position can diverge from filtered position by several meters,
            // especially after stationary periods when filter state lags behind.
            let maxPlausibleDist = max(15.0 * max(timeDelta, 0.5), 10.0)
            if rawDist > maxPlausibleDist {
                return
            }
            // Background GPS guard: when update interval is large (>5s),
            // GPS may report stale/cell-tower positions. Cap distance to prevent
            // straight-line jumps across the map. Raised from 30m to 50m to avoid
            // rejecting valid GPS updates after brief signal gaps.
            if timeDelta > 5.0 && rawDist > 50.0 {
                return
            }
        }

        // Update Kalman Filter process noise from motion data
        kalmanFilter.updateProcessNoise(
            accelerationVariance: sensorFusion.getAccelerationVariance()
        )
        // Adapt Q based on current estimated speed (walking vs sprinting)
        kalmanFilter.updateSpeedAdaptiveQ()

        // Layer 3: Kalman Filter
        let gpsSpeedValid = validLocation.speed >= 0
        let gpsSpeed = gpsSpeedValid ? validLocation.speed : 0

        let speedAccuracy: Double
        if !gpsSpeedValid {
            // Speed unknown — use huge noise so filter ignores speed measurement
            // and infers velocity purely from position changes
            speedAccuracy = -999
        } else if #available(iOS 15.0, *) {
            speedAccuracy = validLocation.speedAccuracy
        } else {
            speedAccuracy = -1
        }

        let filtered = kalmanFilter.update(
            lat: validLocation.coordinate.latitude,
            lon: validLocation.coordinate.longitude,
            alt: validLocation.altitude,
            speed: gpsSpeed,
            bearing: validLocation.course >= 0 ? validLocation.course : (lastHeading >= 0 ? lastHeading : 0),
            horizontalAccuracy: validLocation.horizontalAccuracy,
            speedAccuracy: speedAccuracy,
            timestamp: validLocation.timestamp.timeIntervalSince1970 * 1000
        )

        // Layer 4: Apply sensor fusion (barometer altitude)
        if baseAltitude == nil { baseAltitude = validLocation.altitude }
        let correctedAltitude = sensorFusion.getCorrectedAltitude()

        // Stationary detection
        let previousState = stationaryDetector.state
        stationaryDetector.updateWithSpeed(filtered.speed)

        let accelMagnitude = sensorFusion.getAccelerationMagnitude()
        stationaryDetector.updateWithAcceleration(
            accelMagnitude,
            isLowAccuracyMode: batteryOptimizer?.isLowAccuracy ?? false
        )

        // Proactively restore GPS accuracy when accelerometer shows motion,
        // even before StationaryDetector formally transitions to .moving.
        // This breaks the feedback loop: low GPS accuracy → bad speed → stuck in stationary.
        if previousState == .stationary && accelMagnitude > 0.12 {
            batteryOptimizer?.onAccelerometerMotionDetected()
        }

        if stationaryDetector.state != previousState {
            let event: [String: Any] = [
                "state": stationaryDetector.state.rawValue,
                "duration": stationaryDetector.getStateDurationMs()
            ]
            onRunningStateChange?(event)
        }

        // Battery optimization
        if stationaryDetector.isStationary {
            batteryOptimizer?.onStationary()
        } else {
            batteryOptimizer?.onMoving()
        }

        // Calculate distance (spike already rejected above)
        // Stationary suppression: clamp position to last known good location
        // to prevent GPS drift from drawing phantom routes (matched with Android).
        var distanceFromPrevious: Double = 0
        var emitLat = filtered.lat
        var emitLon = filtered.lon

        if let lastLoc = lastFilteredLocation {
            let rawDist = GeoMath.distance(
                lat1: lastLoc.latitude, lon1: lastLoc.longitude,
                lat2: filtered.lat, lon2: filtered.lon
            )

            if stationaryDetector.isStationary {
                // Safety net: if detector says stationary but movement is clearly
                // significant (> 2m), the detector is wrong — still count distance
                if rawDist > 2.0 {
                    distanceFromPrevious = rawDist
                } else {
                    // Clamp position to last known location — prevents GPS drift on map
                    emitLat = lastLoc.latitude
                    emitLon = lastLoc.longitude
                }
            } else {
                // Normal case: ignore tiny movements (< 0.3m) as noise
                distanceFromPrevious = rawDist >= 0.3 ? rawDist : 0
            }
            cumulativeDistance += distanceFromPrevious
        }

        let filteredLocation = FilteredLocation(
            latitude: emitLat,
            longitude: emitLon,
            altitude: correctedAltitude,
            speed: filtered.speed,
            bearing: filtered.bearing,
            timestamp: validLocation.timestamp.timeIntervalSince1970 * 1000,
            distanceFromPrevious: distanceFromPrevious,
            cumulativeDistance: cumulativeDistance,
            isInterpolated: false
        )

        session.addFilteredLocation(filteredLocation)
        // Only update lastFilteredLocation when actually moving — keeps the
        // clamping anchor stable during stationary (matched with Android).
        if !stationaryDetector.isStationary || lastFilteredLocation == nil {
            lastFilteredLocation = filteredLocation
        }

        // Emit location update event
        // CMPedometer.currentCadence is steps/second — multiply by 60 for SPM.
        // When stationary, reset cadence to 0 to avoid stale readings.
        let cadenceSPM = stationaryDetector.isStationary ? 0 : Int(sensorFusion.pedometerTracker.currentCadence * 60)
        let event: [String: Any] = [
            "latitude": filteredLocation.latitude,
            "longitude": filteredLocation.longitude,
            "altitude": filteredLocation.altitude,
            "speed": filteredLocation.speed,
            "bearing": filteredLocation.bearing,
            "accuracy": validLocation.horizontalAccuracy,
            "timestamp": filteredLocation.timestamp,
            "distanceFromStart": filteredLocation.cumulativeDistance,
            "isMoving": stationaryDetector.isMoving,
            "cadence": cadenceSPM,
            "elevationGain": sensorFusion.altimeterTracker.totalElevationGain,
            "elevationLoss": sensorFusion.altimeterTracker.totalElevationLoss,
            "distanceSource": "gps"
        ]
        onLocationUpdate?(event)

        // Send location to Watch
        onWatchLocationUpdate?(event)

        // Milestone detection
        let prevKm = Int(previousCumulativeDistance / 1000)
        let currentKm = Int(cumulativeDistance / 1000)
        if currentKm > prevKm && currentKm > 0 {
            let elapsedSeconds = Int(session.getCurrentElapsedTime())
            // Split pace = time for THIS km only, not cumulative average.
            // previousMilestoneTime tracks elapsed time at km (N-1).
            let splitSeconds = elapsedSeconds - previousMilestoneTime
            let splitPace = splitSeconds > 0 ? splitSeconds : 0
            previousMilestoneTime = elapsedSeconds
            onMilestoneReached?(currentKm, splitPace, elapsedSeconds)
        }
        previousCumulativeDistance = cumulativeDistance
    }

    // MARK: - Indoor / Pedometer Fallback

    /// Start emitting pedometer-based distance events when GPS is lost.
    /// Fires every 2 seconds, using Apple-calibrated CMPedometer distance.
    private func startPedometerFallback() {
        guard pedometerFallbackTimer == nil else { return }
        guard sensorFusion.pedometerTracker.isActive else { return }

        pedometerBaseDistance = sensorFusion.pedometerTracker.totalDistance
        gpsDistanceAtFallbackStart = cumulativeDistance
        NSLog("[LocationEngine] Starting pedometer fallback (base: \(pedometerBaseDistance)m, gpsDist: \(gpsDistanceAtFallbackStart)m)")

        pedometerFallbackTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.emitPedometerUpdate()
        }
    }

    private func stopPedometerFallback() {
        guard pedometerFallbackTimer != nil else { return }
        pedometerFallbackTimer?.invalidate()
        pedometerFallbackTimer = nil
    }

    /// Emit a synthetic location event using pedometer distance.
    /// Position is estimated via dead reckoning; distance is from CMPedometer (Apple-calibrated).
    private func emitPedometerUpdate() {
        guard session.state == .running else {
            stopPedometerFallback()
            return
        }

        let pedometer = sensorFusion.pedometerTracker
        let pedometerDelta = pedometer.totalDistance - pedometerBaseDistance
        guard pedometerDelta > 0 else { return }

        // Use dead reckoning for estimated position
        var lat = lastFilteredLocation?.latitude ?? 0
        var lon = lastFilteredLocation?.longitude ?? 0
        let bearing = lastFilteredLocation?.bearing ?? 0

        if let gpsLost = gpsLostTime, let lastLoc = lastFilteredLocation {
            if let dr = sensorFusion.estimatePosition(
                from: lastLoc.latitude,
                lastKnownLon: lastLoc.longitude,
                lastKnownBearing: lastLoc.bearing,
                gpsLostSince: gpsLost
            ) {
                lat = dr.lat
                lon = dr.lon
            }
        }

        // Pedometer-based cumulative distance: GPS distance at fallback start + pedometer delta
        let newCumulativeDistance = gpsDistanceAtFallbackStart + pedometerDelta
        guard newCumulativeDistance > cumulativeDistance else { return }
        cumulativeDistance = newCumulativeDistance

        let cadenceSPM = stationaryDetector.isStationary ? 0 : Int(pedometer.currentCadence * 60)

        let event: [String: Any] = [
            "latitude": lat,
            "longitude": lon,
            "altitude": lastFilteredLocation?.altitude ?? 0,
            "speed": pedometer.currentCadence > 0 ? pedometer.currentCadence * 0.75 : 0,
            "bearing": bearing,
            "accuracy": 100.0,  // Low accuracy indicator for pedometer
            "timestamp": Date().timeIntervalSince1970 * 1000,
            "distanceFromStart": cumulativeDistance,
            "isMoving": pedometer.currentCadence > 0,
            "cadence": cadenceSPM,
            "elevationGain": sensorFusion.altimeterTracker.totalElevationGain,
            "elevationLoss": sensorFusion.altimeterTracker.totalElevationLoss,
            "distanceSource": "pedometer"
        ]
        onLocationUpdate?(event)
        onWatchLocationUpdate?(event)

        // Milestone detection for pedometer updates
        let prevKm = Int(previousCumulativeDistance / 1000)
        let currentKm = Int(cumulativeDistance / 1000)
        if currentKm > prevKm && currentKm > 0 {
            let elapsedSeconds = Int(session.getCurrentElapsedTime())
            let splitSeconds = elapsedSeconds - previousMilestoneTime
            let splitPace = splitSeconds > 0 ? splitSeconds : 0
            previousMilestoneTime = elapsedSeconds
            onMilestoneReached?(currentKm, splitPace, elapsedSeconds)
        }
        previousCumulativeDistance = cumulativeDistance
    }

    // MARK: - GPS Status

    private func updateGPSStatus(_ status: String, accuracy: Double? = nil) {
        guard status != currentGPSStatus || accuracy != nil else { return }
        currentGPSStatus = status
        let event: [String: Any] = [
            "status": status,
            "accuracy": accuracy.map { $0 as Any } ?? (NSNull() as Any),
            "satelliteCount": -1
        ]
        onGPSStatusChange?(event)
    }

    // MARK: - Cold Start

    /// Cold start timeout: 30 seconds.
    /// Generous enough for areas with poor GPS signal (urban canyons, indoors near windows).
    /// After timeout, accepts current accuracy and starts recording anyway to avoid
    /// blocking the user indefinitely. 30s balances user patience vs GPS acquisition time.
    private let coldStartTimeout: TimeInterval = 30.0

    private func startColdStartTimer() {
        coldStartTimer?.invalidate()
        coldStartTimer = Timer.scheduledTimer(withTimeInterval: coldStartTimeout, repeats: false) { [weak self] _ in
            guard let self = self, self.session.state == .starting else { return }
            // Timeout - accept current accuracy and start anyway
            NSLog("[LocationEngine] [\(GPSErrorCode.coldStartTimeout.rawValue)] Cold start timed out after \(self.coldStartTimeout)s — accepting current accuracy")
            self.session.markLocked()
            self.updateGPSStatus("locked")
        }
    }

    // MARK: - Background Execution

    /// Start background task + silent audio session to keep the app alive.
    /// CLLocationManager with background mode handles GPS, but the audio session
    /// prevents iOS from suspending the process entirely (same approach as Nike Run Club).
    private func startBackgroundExecution() {
        // 1. Begin a UIKit background task as safety net
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.backgroundTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(self.backgroundTaskId)
            }
            self.backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "GPSTracking") { [weak self] in
                // Expiration handler — iOS is about to suspend, but location updates
                // will continue thanks to background location mode + audio session
                if let taskId = self?.backgroundTaskId {
                    UIApplication.shared.endBackgroundTask(taskId)
                }
                self?.backgroundTaskId = .invalid
            }
        }

        // 2. Start silent audio session to keep process alive
        startSilentAudioSession()
    }

    private func stopBackgroundExecution() {
        stopSilentAudioSession()
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.backgroundTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(self.backgroundTaskId)
                self.backgroundTaskId = .invalid
            }
        }
    }

    /// Cached silent WAV to avoid regenerating on every background transition
    private static let silentWavData: Data = {
        let sampleRate = 8000  // minimum viable for keeping process alive
        let numSamples = sampleRate  // 1 second
        let bytesPerSample = 2
        let dataSize = numSamples * bytesPerSample

        var wav = Data(capacity: 44 + dataSize)
        wav.append(contentsOf: [0x52, 0x49, 0x46, 0x46]) // "RIFF"
        wav.append(contentsOf: withUnsafeBytes(of: UInt32(36 + dataSize).littleEndian) { Array($0) })
        wav.append(contentsOf: [0x57, 0x41, 0x56, 0x45]) // "WAVE"
        wav.append(contentsOf: [0x66, 0x6D, 0x74, 0x20]) // "fmt "
        wav.append(contentsOf: withUnsafeBytes(of: UInt32(16).littleEndian) { Array($0) })
        wav.append(contentsOf: withUnsafeBytes(of: UInt16(1).littleEndian) { Array($0) }) // PCM
        wav.append(contentsOf: withUnsafeBytes(of: UInt16(1).littleEndian) { Array($0) }) // mono
        wav.append(contentsOf: withUnsafeBytes(of: UInt32(8000).littleEndian) { Array($0) }) // sample rate
        wav.append(contentsOf: withUnsafeBytes(of: UInt32(16000).littleEndian) { Array($0) }) // byte rate
        wav.append(contentsOf: withUnsafeBytes(of: UInt16(2).littleEndian) { Array($0) }) // block align
        wav.append(contentsOf: withUnsafeBytes(of: UInt16(16).littleEndian) { Array($0) }) // bits/sample
        wav.append(contentsOf: [0x64, 0x61, 0x74, 0x61]) // "data"
        wav.append(contentsOf: withUnsafeBytes(of: UInt32(dataSize).littleEndian) { Array($0) })
        wav.append(Data(count: dataSize)) // silence
        return wav
    }()

    private func startSilentAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try audioSession.setActive(true)

            silentAudioPlayer = try AVAudioPlayer(data: Self.silentWavData)
            silentAudioPlayer?.numberOfLoops = -1
            silentAudioPlayer?.volume = 0.0
            silentAudioPlayer?.play()
            NSLog("[LocationEngine] Silent audio session started for background GPS")
        } catch {
            NSLog("[LocationEngine] Failed to start silent audio session: \(error)")
        }
    }

    private func stopSilentAudioSession() {
        silentAudioPlayer?.stop()
        silentAudioPlayer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        NSLog("[LocationEngine] Silent audio session stopped")
    }
}
