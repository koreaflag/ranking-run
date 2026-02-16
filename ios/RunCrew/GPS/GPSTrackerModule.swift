import Foundation
import CoreLocation

// MARK: - GPSTrackerModule
// React Native bridge module exposing GPS tracking to JavaScript.
//
// This is the outermost layer - it adapts between the React Native
// event/promise interface and the internal GPS tracking pipeline.
//
// Threading model:
// - RN bridge methods are called on the RN bridge queue
// - CLLocationManager runs on the main thread (iOS requirement)
// - GPS processing runs on a dedicated background queue
// - Events are sent on any thread (RCTEventEmitter handles dispatch)
//
// Module name: "GPSTrackerModule" (must match Android for cross-platform parity)

@objc(GPSTrackerModule)
final class GPSTrackerModule: RCTEventEmitter {

    // MARK: - Properties

    private let session = RunSession()
    private var locationEngine: LocationEngine?
    private var sensorFusion: SensorFusionManager?
    private var batteryOptimizer: BatteryOptimizer?

    /// Background processing queue
    private let processingQueue = DispatchQueue(
        label: "com.runcrew.gps.module",
        qos: .userInitiated
    )

    /// Whether JS has registered event listeners
    private var hasListeners: Bool = false

    // MARK: - RCTEventEmitter Overrides

    override static func moduleName() -> String! {
        return "GPSTrackerModule"
    }

    /// Must run on main queue because CLLocationManager requires it.
    @objc override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return [
            "GPSTracker_onLocationUpdate",
            "GPSTracker_onGPSStatusChange",
            "GPSTracker_onRunningStateChange"
        ]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    // MARK: - Bridge Methods

    @objc(startTracking:rejecter:)
    func startTracking(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let currentState = session.withLock { session.trackingState }

        if currentState == .tracking {
            reject(
                GPSErrorCode.serviceUnavailable.rawValue,
                "Tracking is already active",
                nil
            )
            return
        }

        // Check location services
        guard CLLocationManager.locationServicesEnabled() else {
            reject(
                GPSErrorCode.gpsDisabled.rawValue,
                "Location services are disabled",
                nil
            )
            return
        }

        // Initialize components
        let engine = LocationEngine()
        let fusion = SensorFusionManager(session: session)
        let optimizer = BatteryOptimizer()

        engine.delegate = self
        fusion.delegate = self
        optimizer.delegate = self

        self.locationEngine = engine
        self.sensorFusion = fusion
        self.batteryOptimizer = optimizer

        session.withLock {
            session.reset()
            session.setTrackingState(.tracking)
            session.setStartTime(Date())
        }

        // Check permission and start
        if engine.checkPermission() {
            engine.startUpdating()
            fusion.startAllSensors()
            resolve(nil)
        } else {
            // Request permission - will auto-start on grant via delegate
            engine.requestPermission()
            // We resolve immediately; the JS side should listen for status events
            resolve(nil)
        }
    }

    @objc(stopTracking:rejecter:)
    func stopTracking(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let currentState = session.withLock { session.trackingState }

        guard currentState != .idle else {
            reject(
                GPSErrorCode.serviceUnavailable.rawValue,
                "Tracking is not active",
                nil
            )
            return
        }

        tearDownTracking()

        session.withLock {
            session.setTrackingState(.idle)
        }

        resolve(nil)
    }

    @objc(pauseTracking:rejecter:)
    func pauseTracking(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let currentState = session.withLock { session.trackingState }

        guard currentState == .tracking else {
            reject(
                GPSErrorCode.serviceUnavailable.rawValue,
                "Cannot pause: tracking is not active",
                nil
            )
            return
        }

        // Stop location updates but keep sensors alive for resume
        locationEngine?.stopUpdating()

        session.withLock {
            session.setTrackingState(.paused)
        }

        resolve(nil)
    }

    @objc(resumeTracking:rejecter:)
    func resumeTracking(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let currentState = session.withLock { session.trackingState }

        guard currentState == .paused else {
            reject(
                GPSErrorCode.serviceUnavailable.rawValue,
                "Cannot resume: tracking is not paused",
                nil
            )
            return
        }

        locationEngine?.startUpdating()

        session.withLock {
            session.setTrackingState(.tracking)
        }

        resolve(nil)
    }

    @objc(getRawGPSPoints:rejecter:)
    func getRawGPSPoints(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        processingQueue.async { [weak self] in
            guard let self = self else { return }

            let points = self.session.withLock {
                self.session.rawPoints.map { $0.toDictionary() }
            }

            resolve(points)
        }
    }

    @objc(getFilteredRoute:rejecter:)
    func getFilteredRoute(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        processingQueue.async { [weak self] in
            guard let self = self else { return }

            let locations = self.session.withLock {
                self.session.filteredLocations.map { $0.toDictionary() }
            }

            resolve(locations)
        }
    }

    @objc(getCurrentStatus:rejecter:)
    func getCurrentStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let status = session.withLock { session.gpsStatus }
        resolve(status.rawValue)
    }

    // MARK: - Private Helpers

    private func tearDownTracking() {
        locationEngine?.stopUpdating()
        locationEngine?.tearDown()
        sensorFusion?.stopAllSensors()
        sensorFusion?.reset()
        batteryOptimizer?.reset()

        locationEngine = nil
        sensorFusion = nil
        batteryOptimizer = nil
    }

    private func sendEventSafe(name: String, body: Any?) {
        guard hasListeners else { return }
        sendEvent(withName: name, body: body)
    }
}

// MARK: - LocationEngineDelegate

extension GPSTrackerModule: LocationEngineDelegate {

    func locationEngine(_ engine: LocationEngine, didReceiveLocation location: CLLocation) {
        // Forward to sensor fusion pipeline on processing queue
        // (LocationEngine already dispatches to its processing queue,
        //  but the delegate call arrives there, so we're already off main)
        sensorFusion?.processLocation(location)
    }

    func locationEngine(_ engine: LocationEngine, didFailWithError error: GPSError) {
        let status: GPSStatus
        switch error {
        case .permissionDenied:
            status = .disabled
        case .gpsDisabled:
            status = .disabled
        default:
            status = .lost
        }

        session.withLock {
            session.setGPSStatus(status)
        }

        sendEventSafe(name: "GPSTracker_onGPSStatusChange", body: [
            "status": status.rawValue,
            "accuracy": NSNull(),
            "satelliteCount": -1
        ])
    }

    func locationEngine(_ engine: LocationEngine, didChangeAuthorization authorized: Bool) {
        if authorized {
            let state = session.withLock { session.trackingState }
            if state == .tracking {
                engine.startUpdating()
                sensorFusion?.startAllSensors()
            }
        } else {
            sendEventSafe(name: "GPSTracker_onGPSStatusChange", body: [
                "status": GPSStatus.disabled.rawValue,
                "accuracy": NSNull(),
                "satelliteCount": -1
            ])
        }
    }
}

// MARK: - SensorFusionDelegate

extension GPSTrackerModule: SensorFusionDelegate {

    func sensorFusion(_ manager: SensorFusionManager, didProduceFilteredLocation location: FilteredLocation) {
        let trackingState = session.withLock { session.trackingState }
        guard trackingState == .tracking else { return }

        let isMoving = session.withLock { session.runningState == .moving }

        // Build LocationUpdateEvent matching shared-interfaces.md
        let event = LocationUpdateEvent.from(
            filtered: location,
            accuracy: 0, // Kalman-filtered locations don't have a simple accuracy metric
            isMoving: isMoving
        )

        sendEventSafe(name: "GPSTracker_onLocationUpdate", body: event.toDictionary())
    }

    func sensorFusion(_ manager: SensorFusionManager, didChangeRunningState state: RunningState, duration: TimeInterval) {
        // Notify battery optimizer
        batteryOptimizer?.onRunningStateChanged(state)

        // Emit event matching shared-interfaces.md RunningStateChangeEvent
        sendEventSafe(name: "GPSTracker_onRunningStateChange", body: [
            "state": state.rawValue,
            "duration": duration * 1000.0 // Convert to milliseconds
        ])
    }

    func sensorFusion(_ manager: SensorFusionManager, didChangeGPSStatus status: GPSStatus) {
        let previousStatus = session.withLock { session.gpsStatus }
        guard status != previousStatus else { return }

        session.withLock {
            session.setGPSStatus(status)
        }

        sendEventSafe(name: "GPSTracker_onGPSStatusChange", body: [
            "status": status.rawValue,
            "accuracy": NSNull(), // Could be filled from Kalman uncertainty
            "satelliteCount": -1  // iOS does not expose satellite count
        ])
    }
}

// MARK: - BatteryOptimizerDelegate

extension GPSTrackerModule: BatteryOptimizerDelegate {
    func batteryOptimizer(_ optimizer: BatteryOptimizer, recommendedAccuracy accuracy: CLLocationAccuracy) {
        locationEngine?.updateAccuracy(accuracy)
    }
}
