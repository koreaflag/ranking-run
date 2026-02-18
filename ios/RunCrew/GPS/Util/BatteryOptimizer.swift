import Foundation
import CoreLocation

/// Adaptive GPS accuracy control for battery optimization
class BatteryOptimizer {
    private weak var locationManager: CLLocationManager?
    private var isHighAccuracy = true
    private var stationaryStartTime: Date?

    /// Time to wait before switching to low accuracy when stationary (seconds)
    private let stationaryThreshold: TimeInterval = 10.0

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

    /// Called when movement is detected
    func onMoving() {
        stationaryStartTime = nil
        if !isHighAccuracy {
            switchToHighAccuracy()
        }
    }

    private func switchToLowAccuracy() {
        DispatchQueue.main.async { [weak self] in
            self?.locationManager?.desiredAccuracy = kCLLocationAccuracyHundredMeters
            self?.isHighAccuracy = false
        }
    }

    private func switchToHighAccuracy() {
        DispatchQueue.main.async { [weak self] in
            self?.locationManager?.desiredAccuracy = kCLLocationAccuracyBest
            self?.isHighAccuracy = true
        }
    }

    func reset() {
        stationaryStartTime = nil
        if !isHighAccuracy {
            switchToHighAccuracy()
        }
    }
}
