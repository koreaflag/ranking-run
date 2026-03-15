import Foundation
import CoreLocation
import UIKit

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

    /// Battery level threshold below which we suggest reduced accuracy mode.
    /// 15% matches iOS low-power-mode alert level.
    private let criticalBatteryLevel: Float = 0.15

    /// Whether reduced accuracy was triggered by critically low battery.
    private(set) var isCriticalBatteryMode = false

    init(locationManager: CLLocationManager) {
        self.locationManager = locationManager
        // Enable battery monitoring so UIDevice.current.batteryLevel returns a valid value
        UIDevice.current.isBatteryMonitoringEnabled = true
    }

    /// Check if battery is critically low (< 15%) and not charging.
    /// Returns true if GPS accuracy should be reduced to conserve power.
    func shouldReduceAccuracyForBattery() -> Bool {
        let batteryLevel = UIDevice.current.batteryLevel
        let batteryState = UIDevice.current.batteryState
        // batteryLevel returns -1.0 if monitoring is not enabled or unavailable
        guard batteryLevel >= 0 else { return false }
        let isCharging = (batteryState == .charging || batteryState == .full)
        return batteryLevel < criticalBatteryLevel && !isCharging
    }

    /// Called when stationary state is detected
    func onStationary() {
        if stationaryStartTime == nil {
            stationaryStartTime = Date()
        }

        // Switch to low accuracy if stationary long enough OR battery critically low
        if isHighAccuracy {
            if shouldReduceAccuracyForBattery() {
                isCriticalBatteryMode = true
                switchToLowAccuracy()
                return
            }
            guard let start = stationaryStartTime,
                  Date().timeIntervalSince(start) >= stationaryThreshold else { return }
            switchToLowAccuracy()
        }
    }

    /// Called when movement is detected — immediately restore high accuracy GPS.
    func onMoving() {
        stationaryStartTime = nil
        isCriticalBatteryMode = false
        if !isHighAccuracy {
            switchToHighAccuracy()
        }
    }

    /// Periodic battery check during active tracking.
    /// Call this from LocationEngine on each GPS update to detect critical battery
    /// even while moving. When battery is critical, switch to kCLLocationAccuracyBest
    /// (still good enough for running but saves power vs BestForNavigation).
    func checkBatteryLevel() {
        if shouldReduceAccuracyForBattery() && !isCriticalBatteryMode {
            isCriticalBatteryMode = true
            applyAccuracy(kCLLocationAccuracyBest)
            // Don't set isHighAccuracy to false here — movement is still happening,
            // we just downgrade from BestForNavigation to Best to save battery.
        } else if !shouldReduceAccuracyForBattery() && isCriticalBatteryMode {
            isCriticalBatteryMode = false
            if isHighAccuracy {
                applyAccuracy(kCLLocationAccuracyBestForNavigation)
            }
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
        isCriticalBatteryMode = false
        if !isHighAccuracy {
            switchToHighAccuracy()
        }
    }
}
