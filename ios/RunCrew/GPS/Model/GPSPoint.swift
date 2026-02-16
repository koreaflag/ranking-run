import Foundation
import CoreLocation

// MARK: - RawGPSPoint
// Matches shared-interfaces.md RawGPSPoint exactly.
// Pure data structure representing an unfiltered GPS measurement.

struct RawGPSPoint {
    let latitude: Double
    let longitude: Double
    let altitude: Double          // GPS raw altitude (meters)
    let speed: Double             // GPS Doppler speed (m/s)
    let bearing: Double           // Degrees 0-360
    let horizontalAccuracy: Double // Meters
    let verticalAccuracy: Double   // Meters
    let speedAccuracy: Double      // m/s, -1 if unavailable
    let timestamp: Double          // Unix timestamp in milliseconds
    let provider: String           // Always "gps" on iOS

    // MARK: - Factory

    /// Creates a RawGPSPoint from a CLLocation.
    /// Extracts speedAccuracy on iOS 15+ and falls back to -1 on older versions.
    static func from(location: CLLocation) -> RawGPSPoint {
        var speedAcc: Double = -1.0
        if #available(iOS 15.0, *) {
            speedAcc = location.speedAccuracy >= 0 ? location.speedAccuracy : -1.0
        }

        return RawGPSPoint(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            altitude: location.altitude,
            speed: max(location.speed, 0),
            bearing: location.course >= 0 ? location.course : 0,
            horizontalAccuracy: location.horizontalAccuracy,
            verticalAccuracy: location.verticalAccuracy,
            speedAccuracy: speedAcc,
            timestamp: location.timestamp.timeIntervalSince1970 * 1000.0,
            provider: "gps"
        )
    }

    // MARK: - Serialization

    /// Converts to a dictionary for React Native bridge serialization.
    func toDictionary() -> [String: Any] {
        return [
            "latitude": latitude,
            "longitude": longitude,
            "altitude": altitude,
            "speed": speed,
            "bearing": bearing,
            "horizontalAccuracy": horizontalAccuracy,
            "verticalAccuracy": verticalAccuracy,
            "speedAccuracy": speedAccuracy,
            "timestamp": timestamp,
            "provider": provider
        ]
    }
}
