import Foundation
import CoreLocation

/// Adaptive GPS accuracy control for battery optimization
class BatteryOptimizer {
    private weak var locationManager: CLLocationManager?
    private(set) var isHighAccuracy = true
    var isLowAccuracy: Bool { !isHighAccuracy }
    private var stationaryStartTime: Date?

    /// Time to wait before switching to low accuracy when stationary (seconds).
    /// Increased from 30s to 60s — the old 30s value was too aggressive and caused
    /// a feedback loop: GPS downgrades → poor speed readings → can't detect resume →
    /// stays in stationary → GPS stays downgraded. 60s provides a better buffer
    /// while still saving battery during genuine long stops (traffic lights, rest).
    private let stationaryThreshold: TimeInterval = 60.0

    init(locationManager: CLLocationManager) {
        self.locationManager = locationManager
    }

    /// Called when stationary state is detected
    func onStationary() {
        if stationaryStartTime == nil {
            stationaryStartTime = Date()
        }

        guard let start = stationaryStartTime,
              Date().timeIntervalSince(start) >= stationaryThreshold,
              isHighAccuracy else { return }

        switchToLowAccuracy()
    }

    /// Called when movement is detected — immediately restore high accuracy GPS.
    func onMoving() {
        stationaryStartTime = nil
        if !isHighAccuracy {
            switchToHighAccuracy()
        }
    }

    /// Proactively restore high accuracy when accelerometer detects motion,
    /// even before the StationaryDetector formally transitions to .moving.
    /// This breaks the feedback loop where poor GPS prevents detecting resume.
    func onAccelerometerMotionDetected() {
        if !isHighAccuracy {
            switchToHighAccuracy()
        }
    }

    private func switchToLowAccuracy() {
        // Use kCLLocationAccuracyBest instead of kCLLocationAccuracyNearestTenMeters.
        // NearestTenMeters causes GPS to report 10-65m accuracy, which triggers the
        // OutlierDetector's 30m threshold and the Kalman filter's urban inflation,
        // resulting in missed/lagging data when the user starts moving again.
        // kCLLocationAccuracyBest still saves some battery vs BestForNavigation
        // (no magnetometer/gyro fusion) while keeping accuracy under 10m.
        applyAccuracy(kCLLocationAccuracyBest)
        isHighAccuracy = false
    }

    private func switchToHighAccuracy() {
        applyAccuracy(kCLLocationAccuracyBestForNavigation)
        isHighAccuracy = true
    }

    /// Apply accuracy setting, synchronously if on main thread to avoid delay.
    private func applyAccuracy(_ accuracy: CLLocationAccuracy) {
        if Thread.isMainThread {
            locationManager?.desiredAccuracy = accuracy
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.locationManager?.desiredAccuracy = accuracy
            }
        }
    }

    func reset() {
        stationaryStartTime = nil
        if !isHighAccuracy {
            switchToHighAccuracy()
        }
    }
}
