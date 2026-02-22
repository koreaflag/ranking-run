import Foundation
import CoreLocation

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
    private var lastFilteredLocation: FilteredLocation?
    private var coldStartTimer: Timer?
    private var gpsLostTime: Date?
    private var baseAltitude: Double?

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
        // CLLocationManager must be created on main thread
        DispatchQueue.main.async { [weak self] in
            self?.setupLocationManager()
        }
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
            locationManager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            print("[LocationEngine] Location denied - user should enable in Settings")
        case .authorizedWhenInUse, .authorizedAlways:
            print("[LocationEngine] Location already authorized")
        @unknown default:
            break
        }
    }

    func startTracking() {
        let authStatus = locationManager.authorizationStatus
        switch authStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
            return
        case .denied, .restricted:
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
        lastFilteredLocation = nil
        gpsLostTime = nil
        baseAltitude = nil

        sensorFusion.startAll()

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
    }

    func resumeTracking() {
        session.resume()
        batteryOptimizer?.reset()
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
                updateGPSStatus("disabled")
            case .locationUnknown:
                updateGPSStatus("searching")
            default:
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

        // Emit heading event (for standalone compass use on WorldScreen etc.)
        if lastHeading >= 0 {
            onHeadingUpdate?(["heading": lastHeading])
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
            if location.horizontalAccuracy <= 25.0 {
                session.markLocked()
                coldStartTimer?.invalidate()
                coldStartTimer = nil
                updateGPSStatus("locked")
            } else {
                return // Still waiting for GPS lock
            }
        }

        // Update sensor fusion with GPS data
        sensorFusion.onGPSUpdate(validLocation)
        gpsLostTime = nil

        // Update Kalman Filter process noise from motion data
        kalmanFilter.updateProcessNoise(
            accelerationVariance: sensorFusion.getAccelerationVariance()
        )

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
        stationaryDetector.updateWithAcceleration(sensorFusion.getAccelerationMagnitude())

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

        // Calculate distance
        var distanceFromPrevious: Double = 0
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
                }
            } else {
                // Normal case: ignore tiny movements (< 0.3m) as noise
                distanceFromPrevious = rawDist >= 0.3 ? rawDist : 0
            }
            cumulativeDistance += distanceFromPrevious
        }

        let filteredLocation = FilteredLocation(
            latitude: filtered.lat,
            longitude: filtered.lon,
            altitude: correctedAltitude,
            speed: filtered.speed,
            bearing: filtered.bearing,
            timestamp: validLocation.timestamp.timeIntervalSince1970 * 1000,
            distanceFromPrevious: distanceFromPrevious,
            cumulativeDistance: cumulativeDistance,
            isInterpolated: false
        )

        session.addFilteredLocation(filteredLocation)
        lastFilteredLocation = filteredLocation

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
            "cadence": cadenceSPM
        ]
        onLocationUpdate?(event)

        // Send location to Watch
        onWatchLocationUpdate?(event)

        // Milestone detection
        let prevKm = Int(previousCumulativeDistance / 1000)
        let currentKm = Int(cumulativeDistance / 1000)
        if currentKm > prevKm && currentKm > 0 {
            let elapsedSeconds = Int(session.getCurrentElapsedTime())
            let splitPace = cumulativeDistance > 0 ? Int((Double(elapsedSeconds) / (cumulativeDistance / 1000.0))) : 0
            onMilestoneReached?(currentKm, splitPace, elapsedSeconds)
        }
        previousCumulativeDistance = cumulativeDistance
    }

    // MARK: - GPS Status

    private func updateGPSStatus(_ status: String) {
        guard status != currentGPSStatus else { return }
        currentGPSStatus = status
        let event: [String: Any] = [
            "status": status,
            "accuracy": NSNull(),
            "satelliteCount": -1
        ]
        onGPSStatusChange?(event)
    }

    // MARK: - Cold Start

    private func startColdStartTimer() {
        coldStartTimer?.invalidate()
        coldStartTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: false) { [weak self] _ in
            guard let self = self, self.session.state == .starting else { return }
            // Timeout - accept current accuracy and start anyway
            self.session.markLocked()
            self.updateGPSStatus("locked")
        }
    }
}
