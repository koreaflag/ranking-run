import Foundation
import React

/// React Native Bridge Module for GPS Tracking
@objc(GPSTrackerModule)
class GPSTrackerModule: RCTEventEmitter {
    private var locationEngine: LocationEngine?
    private var hasListeners = false

    override init() {
        super.init()
        WatchSessionManager.shared.activate()
        setupEngine()
        // Send idle state to clear any stale applicationContext from previous sessions
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            if WatchSessionManager.shared.currentRunPhase == "idle" {
                WatchSessionManager.shared.sendRunStateUpdate(["phase": "idle"])
            }
        }
    }

    private func setupEngine() {
        let engine = LocationEngine()

        engine.onLocationUpdate = { [weak self] event in
            self?.sendEventIfListening("GPSTracker_onLocationUpdate", body: event)
        }

        engine.onGPSStatusChange = { [weak self] event in
            self?.sendEventIfListening("GPSTracker_onGPSStatusChange", body: event)
        }

        engine.onRunningStateChange = { [weak self] event in
            self?.sendEventIfListening("GPSTracker_onRunningStateChange", body: event)
        }

        engine.onWatchLocationUpdate = { event in
            WatchSessionManager.shared.sendLocationUpdate(event)
        }

        engine.onMilestoneReached = { km, splitPace, totalTime in
            WatchSessionManager.shared.sendMilestone(km: km, splitPace: splitPace, totalTime: totalTime)
        }

        locationEngine = engine
    }

    // MARK: - RCTEventEmitter

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

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    private func sendEventIfListening(_ name: String, body: Any?) {
        guard hasListeners else { return }
        sendEvent(withName: name, body: body)
    }

    // MARK: - Exported Methods

    @objc
    func startTracking(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.startTracking()
            resolve(nil)
            WatchSessionManager.shared.sendRunStateUpdate([
                "phase": "running",
                "distanceMeters": 0,
                "durationSeconds": 0,
                "currentPace": 0,
                "avgPace": 0,
                "calories": 0
            ])
        }
    }

    @objc
    func stopTracking(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.stopTracking()
            resolve(nil)
            WatchSessionManager.shared.sendRunStateUpdate(["phase": "completed"])
        }
    }

    @objc
    func pauseTracking(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        locationEngine?.pauseTracking()
        resolve(nil)
        WatchSessionManager.shared.sendRunStateUpdate(["phase": "paused"])
    }

    @objc
    func resumeTracking(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        locationEngine?.resumeTracking()
        resolve(nil)
        WatchSessionManager.shared.sendRunStateUpdate(["phase": "running"])
    }

    @objc
    func getRawGPSPoints(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let points = locationEngine?.getRawGPSPoints() ?? []
        resolve(points)
    }

    @objc
    func getFilteredRoute(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        let route = locationEngine?.getFilteredRoute() ?? []
        resolve(route)
    }

    @objc
    func getCurrentStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        let status = locationEngine?.getCurrentStatus() ?? "disabled"
        resolve(status)
    }

    @objc
    func requestLocationPermission() {
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.requestPermission()
        }
    }
}
