import Foundation
import CoreLocation

// MARK: - SensorFusionManager
// Coordinates all sensor inputs (GPS, pedometer, motion, altimeter) and
// drives the filtering pipeline to produce FilteredLocation output.
//
// Pipeline: CLLocation -> Validity -> Outlier Removal -> Kalman Filter -> Sensor Fusion -> FilteredLocation
//
// This class is the central orchestrator that:
// 1. Receives raw CLLocation updates from LocationEngine
// 2. Applies the OutlierDetector validity and outlier checks
// 3. Feeds valid points through the KalmanFilter
// 4. Adjusts Kalman Q matrix using MotionTracker acceleration variance
// 5. Corrects altitude using AltimeterTracker barometric data
// 6. Produces FilteredLocation with cumulative distance
// 7. Performs dead reckoning during GPS dropout

protocol SensorFusionDelegate: AnyObject {
    func sensorFusion(_ manager: SensorFusionManager, didProduceFilteredLocation location: FilteredLocation)
    func sensorFusion(_ manager: SensorFusionManager, didChangeRunningState state: RunningState, duration: TimeInterval)
    func sensorFusion(_ manager: SensorFusionManager, didChangeGPSStatus status: GPSStatus)
}

final class SensorFusionManager {

    weak var delegate: SensorFusionDelegate?

    // MARK: - Sub-components

    private var kalmanFilter: KalmanFilter?
    private let outlierDetector = OutlierDetector()
    private let stationaryDetector = StationaryDetector()
    private let pedometerTracker = PedometerTracker()
    private let motionTracker = MotionTracker()
    private let altimeterTracker = AltimeterTracker()
    private let batteryOptimizer = BatteryOptimizer()

    private var converter: CoordinateConverter?

    // MARK: - Session State

    private let session: RunSession

    // GPS dropout tracking for dead reckoning
    private var lastGPSUpdateTime: Date?
    private let gpsDropoutThreshold: TimeInterval = 3.0 // seconds

    // Cold start buffer
    private let coldStartAccuracyThreshold: Double = 15.0 // meters
    private let coldStartTimeout: TimeInterval = 30.0
    private var coldStartTimer: Timer?

    // Duplicate/out-of-order timestamp tracking
    private var lastLocationTimestamp: Double = 0

    // Dead reckoning state
    private var lastHeading: Double = 0
    private var deadReckoningAccumulated: Double = 0

    // MARK: - Initialization

    init(session: RunSession) {
        self.session = session
        stationaryDetector.delegate = self
        pedometerTracker.delegate = self
        motionTracker.delegate = self
        altimeterTracker.delegate = self
        batteryOptimizer.delegate = self
    }

    // MARK: - Lifecycle

    func startAllSensors() {
        let startDate = Date()

        motionTracker.start()
        pedometerTracker.start(from: startDate)
        altimeterTracker.start()

        // Cold start timer
        coldStartTimer = Timer.scheduledTimer(withTimeInterval: coldStartTimeout, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.session.withLock {
                if !self.session.isColdStartComplete {
                    self.session.setColdStartComplete()
                    self.delegate?.sensorFusion(self, didChangeGPSStatus: .lost)
                }
            }
        }
    }

    func stopAllSensors() {
        motionTracker.stop()
        pedometerTracker.stop()
        altimeterTracker.stop()
        coldStartTimer?.invalidate()
        coldStartTimer = nil
        batteryOptimizer.reset()
    }

    // MARK: - Process Location (called by LocationEngine)

    /// Main entry point: receives a raw CLLocation and drives the full pipeline.
    /// Must be called on the processing queue (not main thread).
    func processLocation(_ location: CLLocation) {
        // -- Duplicate / out-of-order defense --
        let timestamp = location.timestamp.timeIntervalSince1970 * 1000.0
        guard timestamp > lastLocationTimestamp else { return }
        lastLocationTimestamp = timestamp

        // -- Store raw point --
        let rawPoint = RawGPSPoint.from(location: location)
        session.withLock {
            session.appendRawPoint(rawPoint)
        }

        // -- Layer 1: Validity check --
        let validityResult = outlierDetector.checkValidity(location)
        switch validityResult {
        case .invalid:
            return
        case .validLowWeight:
            break // Proceed but could weight lower in Kalman (future enhancement)
        case .valid:
            break
        }

        // -- Cold start handling --
        let isColdStartDone = session.withLock { session.isColdStartComplete }
        if !isColdStartDone {
            if location.horizontalAccuracy <= coldStartAccuracyThreshold {
                session.withLock { session.setColdStartComplete() }
                coldStartTimer?.invalidate()
                coldStartTimer = nil
                initializeFilterPipeline(with: location)
                delegate?.sensorFusion(self, didChangeGPSStatus: .locked)
            } else {
                delegate?.sensorFusion(self, didChangeGPSStatus: .searching)
                return
            }
        }

        // -- Layer 2: Outlier removal --
        let outlierResult = outlierDetector.checkOutlier(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            timestamp: timestamp
        )
        switch outlierResult {
        case .invalid:
            return
        default:
            break
        }

        // -- Layer 3: Kalman Filter --
        guard let filter = kalmanFilter else { return }

        // Update acceleration variance from motion tracker
        filter.accelerationVariance = motionTracker.getAccelerationVariance()

        // Predict to current timestamp
        filter.predict(timestamp: timestamp)

        // Speed handling: use GPS speed if valid, otherwise use Kalman estimate
        let speed = location.speed >= 0 ? location.speed : 0
        let bearing = location.course >= 0 ? location.course : lastHeading

        var speedAccuracy: Double = -1.0
        if #available(iOS 15.0, *) {
            speedAccuracy = location.speedAccuracy
        }

        // Update with measurement
        filter.update(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            alt: location.altitude,
            speed: speed,
            bearing: bearing,
            horizontalAccuracy: location.horizontalAccuracy,
            verticalAccuracy: location.verticalAccuracy,
            speedAccuracy: speedAccuracy
        )

        // -- Layer 4: Sensor fusion (altitude correction) --
        let filtered = filter.getFilteredPosition()
        let correctedAlt = altimeterTracker.getCorrectedAltitude(gpsAltitude: filtered.alt)

        // Set base altitude on first good reading
        altimeterTracker.setBaseAltitude(location.altitude)

        // Update last heading
        if bearing > 0 {
            lastHeading = bearing
        }

        // -- Produce FilteredLocation --
        produceFilteredLocation(
            lat: filtered.lat,
            lng: filtered.lng,
            alt: correctedAlt,
            speed: filtered.speed,
            bearing: filtered.bearing,
            timestamp: timestamp,
            isInterpolated: false
        )

        // -- GPS status tracking --
        lastGPSUpdateTime = Date()
        let currentStatus = session.withLock { session.gpsStatus }
        if currentStatus != .locked {
            delegate?.sensorFusion(self, didChangeGPSStatus: .locked)
        }

        // -- Battery optimizer tick --
        batteryOptimizer.tick()

        // Reset dead reckoning accumulator
        deadReckoningAccumulated = 0
    }

    // MARK: - Dead Reckoning

    /// Called when pedometer provides a distance delta and GPS has dropped.
    /// Uses pedometer distance + last heading to estimate position.
    private func performDeadReckoning(distanceDelta: Double) {
        guard let filter = kalmanFilter, filter.isInitialized else { return }
        guard distanceDelta > 0.1 else { return }

        let isGPSDropped: Bool
        if let lastGPS = lastGPSUpdateTime {
            isGPSDropped = Date().timeIntervalSince(lastGPS) > gpsDropoutThreshold
        } else {
            isGPSDropped = true
        }

        guard isGPSDropped else { return }

        // Use last known heading and pedometer distance to estimate new position
        let currentPos = filter.getFilteredPosition()
        let dest = GeoMath.destinationPoint(
            lat: currentPos.lat, lng: currentPos.lng,
            bearing: lastHeading, distance: distanceDelta
        )

        deadReckoningAccumulated += distanceDelta

        let timestamp = Date().timeIntervalSince1970 * 1000.0
        let correctedAlt = altimeterTracker.getCorrectedAltitude(gpsAltitude: currentPos.alt)

        produceFilteredLocation(
            lat: dest.latitude,
            lng: dest.longitude,
            alt: correctedAlt,
            speed: currentPos.speed,
            bearing: lastHeading,
            timestamp: timestamp,
            isInterpolated: true
        )

        // Notify GPS lost
        let currentStatus = session.withLock { session.gpsStatus }
        if currentStatus != .lost {
            delegate?.sensorFusion(self, didChangeGPSStatus: .lost)
        }
    }

    // MARK: - Private Helpers

    private func initializeFilterPipeline(with location: CLLocation) {
        converter = CoordinateConverter(
            referenceLat: location.coordinate.latitude,
            referenceLng: location.coordinate.longitude
        )
        kalmanFilter = KalmanFilter(converter: converter!)

        let speed = location.speed >= 0 ? location.speed : 0
        let bearing = location.course >= 0 ? location.course : 0

        var speedAccuracy: Double = -1.0
        if #available(iOS 15.0, *) {
            speedAccuracy = location.speedAccuracy
        }

        kalmanFilter?.initialize(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            alt: location.altitude,
            speed: speed,
            bearing: bearing,
            horizontalAccuracy: location.horizontalAccuracy,
            timestamp: location.timestamp.timeIntervalSince1970 * 1000.0
        )

        // Initialize outlier detector history
        outlierDetector.reset()
        _ = outlierDetector.checkOutlier(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            timestamp: location.timestamp.timeIntervalSince1970 * 1000.0
        )

        // First filtered location
        let correctedAlt = altimeterTracker.getCorrectedAltitude(gpsAltitude: location.altitude)
        altimeterTracker.setBaseAltitude(location.altitude)

        let firstFiltered = FilteredLocation(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            altitude: correctedAlt,
            speed: speed,
            bearing: bearing,
            timestamp: location.timestamp.timeIntervalSince1970 * 1000.0,
            distanceFromPrevious: 0,
            cumulativeDistance: 0,
            isInterpolated: false
        )

        session.withLock {
            session.appendFilteredLocation(firstFiltered)
            session.setLastProcessedTimestamp(firstFiltered.timestamp)
        }

        delegate?.sensorFusion(self, didProduceFilteredLocation: firstFiltered)
    }

    private func produceFilteredLocation(
        lat: Double, lng: Double, alt: Double,
        speed: Double, bearing: Double,
        timestamp: Double, isInterpolated: Bool
    ) {
        // Skip if stationary (no distance accumulation from GPS drift)
        let runningState = session.withLock { session.runningState }

        var distFromPrev = 0.0
        let cumulativeDist: Double

        let lastFiltered = session.withLock { session.filteredLocations.last }

        if let last = lastFiltered {
            if runningState == .moving {
                distFromPrev = GeoMath.haversineDistance(
                    lat1: last.latitude, lng1: last.longitude,
                    lat2: lat, lng2: lng
                )
                // Sanity check: reject distance jumps > 50m between 1Hz updates
                if distFromPrev > 50.0, !isInterpolated {
                    distFromPrev = 0
                }
            }
            cumulativeDist = last.cumulativeDistance + distFromPrev
        } else {
            cumulativeDist = 0
        }

        let filtered = FilteredLocation(
            latitude: lat,
            longitude: lng,
            altitude: alt,
            speed: runningState == .stationary ? 0 : speed,
            bearing: bearing,
            timestamp: timestamp,
            distanceFromPrevious: distFromPrev,
            cumulativeDistance: cumulativeDist,
            isInterpolated: isInterpolated
        )

        session.withLock {
            session.appendFilteredLocation(filtered)
            session.setLastProcessedTimestamp(timestamp)
        }

        delegate?.sensorFusion(self, didProduceFilteredLocation: filtered)
    }

    // MARK: - Reset

    func reset() {
        kalmanFilter?.reset()
        kalmanFilter = nil
        converter = nil
        outlierDetector.reset()
        stationaryDetector.reset()
        pedometerTracker.reset()
        motionTracker.reset()
        altimeterTracker.reset()
        batteryOptimizer.reset()
        coldStartTimer?.invalidate()
        coldStartTimer = nil
        lastGPSUpdateTime = nil
        lastLocationTimestamp = 0
        lastHeading = 0
        deadReckoningAccumulated = 0
    }
}

// MARK: - StationaryDetectorDelegate

extension SensorFusionManager: StationaryDetectorDelegate {
    func stationaryDetector(_ detector: StationaryDetector, didChangeState state: RunningState) {
        let duration: TimeInterval
        session.withLock {
            let previousStartTime = session.runningStateStartTime
            session.setRunningState(state)
            duration = Date().timeIntervalSince(previousStartTime)
        }

        batteryOptimizer.onRunningStateChanged(state)
        delegate?.sensorFusion(self, didChangeRunningState: state, duration: duration)
    }
}

// MARK: - PedometerTrackerDelegate

extension SensorFusionManager: PedometerTrackerDelegate {
    func pedometerTracker(
        _ tracker: PedometerTracker,
        didUpdateSteps steps: Int,
        distance: Double,
        distanceDelta: Double
    ) {
        // Use pedometer distance for dead reckoning when GPS is lost
        performDeadReckoning(distanceDelta: distanceDelta)
    }
}

// MARK: - MotionTrackerDelegate

extension SensorFusionManager: MotionTrackerDelegate {
    func motionTracker(
        _ tracker: MotionTracker,
        didUpdateAcceleration x: Double, y: Double, z: Double,
        heading: Double
    ) {
        // Feed acceleration to stationary detector
        stationaryDetector.feedAcceleration(x: x, y: y, z: z)

        // Update heading for dead reckoning
        if heading >= 0 {
            lastHeading = heading
        }
    }
}

// MARK: - AltimeterTrackerDelegate

extension SensorFusionManager: AltimeterTrackerDelegate {
    func altimeterTracker(
        _ tracker: AltimeterTracker,
        didUpdateRelativeAltitude relativeAltitude: Double,
        pressure: Double
    ) {
        // Altitude data is consumed passively via getCorrectedAltitude()
        // No active processing needed here.
    }
}

// MARK: - BatteryOptimizerDelegate

extension SensorFusionManager: BatteryOptimizerDelegate {
    func batteryOptimizer(_ optimizer: BatteryOptimizer, recommendedAccuracy accuracy: CLLocationAccuracy) {
        // This is forwarded up to LocationEngine via the delegate chain.
        // SensorFusionManager doesn't own the CLLocationManager.
        // LocationEngine observes this via BatteryOptimizer directly.
    }
}
