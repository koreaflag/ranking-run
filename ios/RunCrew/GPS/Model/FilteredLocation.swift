import Foundation

/// Filtered location data for UI display
struct FilteredLocation {
    let latitude: Double
    let longitude: Double
    let altitude: Double            // Barometer-based corrected altitude
    let speed: Double               // Kalman Filter estimated speed (m/s)
    let bearing: Double
    let timestamp: TimeInterval     // Unix timestamp (ms)
    let distanceFromPrevious: Double // meters
    let cumulativeDistance: Double    // meters
    let isInterpolated: Bool        // dead reckoning estimated point

    func toDictionary() -> [String: Any] {
        return [
            "latitude": latitude,
            "longitude": longitude,
            "altitude": altitude,
            "speed": speed,
            "bearing": bearing,
            "timestamp": timestamp,
            "distanceFromPrevious": distanceFromPrevious,
            "cumulativeDistance": cumulativeDistance,
            "isInterpolated": isInterpolated
        ]
    }
}
