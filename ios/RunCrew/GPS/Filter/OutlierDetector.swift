import Foundation
import CoreLocation

/// Outlier detection and removal for GPS points
class OutlierDetector {
    private var lastValidLocation: CLLocation?
    private var recentSpeeds: [Double] = []
    private let maxRecentSpeeds = 10

    // Thresholds
    private let maxHorizontalAccuracy: Double = 30.0  // meters
    private let maxSpeed: Double = 15.0                // m/s (~54 km/h)
    private let maxAcceleration: Double = 8.0          // m/s²
    private let maxTimestampAge: TimeInterval = 10.0   // seconds
    private let minTimeBetweenUpdates: TimeInterval = 0.1 // seconds

    private var lastTimestamp: TimeInterval = 0
    private var previousPoints: [(location: CLLocation, speed: Double)] = []

    /// Validate and filter a raw CLLocation
    /// Returns nil if the location should be discarded
    func validate(_ location: CLLocation) -> CLLocation? {
        // Layer 1: Basic validity checks
        guard location.horizontalAccuracy >= 0 else { return nil }
        guard location.horizontalAccuracy <= maxHorizontalAccuracy else { return nil }

        // Timestamp validation
        let currentTime = Date().timeIntervalSince1970
        let locationTime = location.timestamp.timeIntervalSince1970
        guard abs(currentTime - locationTime) <= maxTimestampAge else { return nil }

        // Duplicate timestamp check
        let timestampMs = locationTime * 1000
        guard timestampMs > lastTimestamp + (minTimeBetweenUpdates * 1000) else { return nil }

        // Layer 2: Speed-based outlier detection
        if let lastValid = lastValidLocation {
            let distance = location.distance(from: lastValid)
            let timeDelta = location.timestamp.timeIntervalSince(lastValid.timestamp)

            guard timeDelta > 0 else { return nil }

            let calculatedSpeed = distance / timeDelta
            if calculatedSpeed > maxSpeed {
                return nil
            }

            // Acceleration check using recent points
            if !previousPoints.isEmpty {
                let prevSpeed = previousPoints.last?.speed ?? 0
                let acceleration = abs(calculatedSpeed - prevSpeed) / timeDelta
                if acceleration > maxAcceleration {
                    return nil
                }
            }

            // Update recent speeds for statistical outlier detection
            recentSpeeds.append(calculatedSpeed)
            if recentSpeeds.count > maxRecentSpeeds {
                recentSpeeds.removeFirst()
            }

            // Mahalanobis-like check: reject if speed is >3 std devs from mean
            if recentSpeeds.count >= 5 {
                let mean = recentSpeeds.reduce(0, +) / Double(recentSpeeds.count)
                let variance = recentSpeeds.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(recentSpeeds.count)
                let stdDev = sqrt(variance)
                if stdDev > 0.1 && abs(calculatedSpeed - mean) > 3.0 * stdDev {
                    return nil
                }
            }

            previousPoints.append((location: location, speed: calculatedSpeed))
            if previousPoints.count > 3 { previousPoints.removeFirst() }
        }

        lastValidLocation = location
        lastTimestamp = timestampMs
        return location
    }

    func reset() {
        lastValidLocation = nil
        recentSpeeds.removeAll()
        previousPoints.removeAll()
        lastTimestamp = 0
    }
}
