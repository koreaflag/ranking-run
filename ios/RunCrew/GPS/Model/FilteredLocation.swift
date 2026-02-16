import Foundation

// MARK: - FilteredLocation
// Matches shared-interfaces.md FilteredLocation exactly.
// Represents a location after passing through the full filtering pipeline.

struct FilteredLocation {
    let latitude: Double
    let longitude: Double
    let altitude: Double            // Barometer-based corrected altitude
    let speed: Double               // Kalman Filter estimated speed (m/s)
    let bearing: Double             // Degrees 0-360
    let timestamp: Double           // Unix timestamp in milliseconds
    let distanceFromPrevious: Double // Distance from previous point (meters)
    let cumulativeDistance: Double    // Cumulative distance from start (meters)
    let isInterpolated: Bool         // True if estimated via dead reckoning

    // MARK: - Serialization

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

// MARK: - LocationUpdateEvent
// Matches shared-interfaces.md LocationUpdateEvent for event emission.

struct LocationUpdateEvent {
    let latitude: Double
    let longitude: Double
    let altitude: Double
    let speed: Double
    let bearing: Double
    let accuracy: Double
    let timestamp: Double
    let distanceFromStart: Double
    let isMoving: Bool

    static func from(filtered: FilteredLocation, accuracy: Double, isMoving: Bool) -> LocationUpdateEvent {
        return LocationUpdateEvent(
            latitude: filtered.latitude,
            longitude: filtered.longitude,
            altitude: filtered.altitude,
            speed: filtered.speed,
            bearing: filtered.bearing,
            accuracy: accuracy,
            timestamp: filtered.timestamp,
            distanceFromStart: filtered.cumulativeDistance,
            isMoving: isMoving
        )
    }

    func toDictionary() -> [String: Any] {
        return [
            "latitude": latitude,
            "longitude": longitude,
            "altitude": altitude,
            "speed": speed,
            "bearing": bearing,
            "accuracy": accuracy,
            "timestamp": timestamp,
            "distanceFromStart": distanceFromStart,
            "isMoving": isMoving
        ]
    }
}
