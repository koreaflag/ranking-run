import Foundation
import CoreLocation

// MARK: - BatteryOptimizer
// Adapts GPS accuracy settings based on running state to conserve battery.
//
// Strategy from ios-gps.md:
// - When stationary: reduce to kCLLocationAccuracyHundredMeters
// - When moving: restore to kCLLocationAccuracyBest
// - On stop: call stopUpdatingLocation() immediately
//
// This class does not own the CLLocationManager. It computes the
// recommended accuracy and the caller (LocationEngine) applies it.

protocol BatteryOptimizerDelegate: AnyObject {
    func batteryOptimizer(_ optimizer: BatteryOptimizer, recommendedAccuracy accuracy: CLLocationAccuracy)
}

final class BatteryOptimizer {

    weak var delegate: BatteryOptimizerDelegate?

    // Minimum time in stationary state before reducing accuracy (seconds)
    private let stationaryDelay: TimeInterval = 5.0

    // Time when stationary state was first detected
    private var stationaryStartTime: Date?

    // Whether accuracy has been reduced
    private(set) var isReducedAccuracy: Bool = false

    // MARK: - State Updates

    /// Call when the running state changes.
    func onRunningStateChanged(_ state: RunningState) {
        switch state {
        case .stationary:
            if stationaryStartTime == nil {
                stationaryStartTime = Date()
            }
        case .moving:
            stationaryStartTime = nil
            if isReducedAccuracy {
                isReducedAccuracy = false
                delegate?.batteryOptimizer(self, recommendedAccuracy: kCLLocationAccuracyBest)
            }
        }
    }

    /// Call periodically (e.g., each location update) to check if accuracy should be reduced.
    func tick() {
        guard let startTime = stationaryStartTime,
              !isReducedAccuracy else { return }

        let elapsed = Date().timeIntervalSince(startTime)
        if elapsed >= stationaryDelay {
            isReducedAccuracy = true
            delegate?.batteryOptimizer(self, recommendedAccuracy: kCLLocationAccuracyHundredMeters)
        }
    }

    /// Reset state when tracking stops or a new session begins.
    func reset() {
        stationaryStartTime = nil
        isReducedAccuracy = false
    }
}
