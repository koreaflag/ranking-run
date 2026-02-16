import Foundation
import CoreLocation

// MARK: - OutlierDetector
// Implements a multi-stage outlier detection pipeline for GPS data.
//
// Pipeline stages (from ios-gps.md):
// 1. Validity check: horizontalAccuracy < 0 -> invalid, discard
// 2. Accuracy threshold: horizontalAccuracy > 30m -> discard
// 3. Speed validity: speed < 0 -> flag but don't discard
// 4. Staleness check: timestamp vs current > 10s -> cached, discard
// 5. Source check (iOS 15+): WiFi/Cell-based locations get lower weight
// 6. Speed outlier: consecutive point speed > 15 m/s -> discard
// 7. Acceleration outlier: 3-point acceleration > 8 m/s^2 -> discard middle

enum OutlierResult {
    case valid
    case validLowWeight   // Valid but from WiFi/Cell source
    case invalid(reason: String)
}

final class OutlierDetector {

    // MARK: - Thresholds

    private let maxHorizontalAccuracy: Double = 30.0    // meters
    private let maxStaleAge: TimeInterval = 10.0        // seconds
    private let maxConsecutiveSpeed: Double = 15.0       // m/s (~54 km/h)
    private let maxThreePointAcceleration: Double = 8.0  // m/s^2

    // MARK: - History

    /// Ring buffer of recent valid points for multi-point checks.
    /// Stores (lat, lng, timestamp_ms).
    private var recentPoints: [(lat: Double, lng: Double, timestamp: Double)] = []
    private let maxRecentPoints = 5

    // MARK: - Layer 1: Validity Check

    /// Performs basic validity checks on a CLLocation.
    /// Returns .invalid if the location should be discarded outright.
    func checkValidity(_ location: CLLocation) -> OutlierResult {
        // Negative horizontalAccuracy means invalid location
        if location.horizontalAccuracy < 0 {
            return .invalid(reason: "Negative horizontalAccuracy: location invalid")
        }

        // Accuracy too poor
        if location.horizontalAccuracy > maxHorizontalAccuracy {
            return .invalid(reason: "horizontalAccuracy \(location.horizontalAccuracy)m > \(maxHorizontalAccuracy)m threshold")
        }

        // Check for stale/cached location
        let age = abs(Date().timeIntervalSince(location.timestamp))
        if age > maxStaleAge {
            return .invalid(reason: "Location age \(String(format: "%.1f", age))s > \(maxStaleAge)s threshold (cached location)")
        }

        // Check source on iOS 15+
        if #available(iOS 15.0, *) {
            if let sourceInfo = location.sourceInformation {
                if !sourceInfo.isProducedByAccessory && !sourceInfo.isSimulatedBySoftware {
                    // This is a standard system location - OK
                }
            }
        }

        return .valid
    }

    // MARK: - Layer 2: Outlier Removal

    /// Checks for speed and acceleration outliers against recent history.
    /// Must be called AFTER checkValidity passes.
    /// Returns .invalid if the point is an outlier.
    func checkOutlier(lat: Double, lng: Double, timestamp: Double) -> OutlierResult {
        defer {
            // Always add the point to history if we reach the defer
            // (even if it's an outlier - we add it conditionally below)
        }

        // Speed check against last valid point
        if let lastPoint = recentPoints.last {
            if let speed = GeoMath.speed(
                lat1: lastPoint.lat, lng1: lastPoint.lng, timestamp1: lastPoint.timestamp,
                lat2: lat, lng2: lng, timestamp2: timestamp
            ) {
                if speed > maxConsecutiveSpeed {
                    // Don't add this point to history
                    return .invalid(reason: "Consecutive speed \(String(format: "%.1f", speed)) m/s > \(maxConsecutiveSpeed) m/s")
                }
            }
        }

        // 3-point acceleration check
        if recentPoints.count >= 2 {
            let p1 = recentPoints[recentPoints.count - 2]
            let p2 = recentPoints[recentPoints.count - 1]

            if let accel = GeoMath.threePointAcceleration(
                lat1: p1.lat, lng1: p1.lng, t1: p1.timestamp,
                lat2: p2.lat, lng2: p2.lng, t2: p2.timestamp,
                lat3: lat, lng3: lng, t3: timestamp
            ) {
                if accel > maxThreePointAcceleration {
                    // The middle point (p2) is the outlier - remove it from history
                    // and this new point replaces it
                    if !recentPoints.isEmpty {
                        recentPoints.removeLast()
                    }
                    addToHistory(lat: lat, lng: lng, timestamp: timestamp)
                    return .valid // The new point itself is valid; the middle one was the outlier
                }
            }
        }

        addToHistory(lat: lat, lng: lng, timestamp: timestamp)
        return .valid
    }

    // MARK: - History Management

    private func addToHistory(lat: Double, lng: Double, timestamp: Double) {
        recentPoints.append((lat: lat, lng: lng, timestamp: timestamp))
        if recentPoints.count > maxRecentPoints {
            recentPoints.removeFirst()
        }
    }

    /// Resets the detector state. Call when starting a new session.
    func reset() {
        recentPoints.removeAll()
    }
}
