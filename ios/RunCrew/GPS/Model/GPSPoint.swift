import Foundation
import CoreLocation

/// Raw GPS point data model for server storage
struct GPSPoint {
    let latitude: Double
    let longitude: Double
    let altitude: Double
    let speed: Double           // m/s
    let bearing: Double         // 0-360
    let horizontalAccuracy: Double
    let verticalAccuracy: Double
    let speedAccuracy: Double   // -1 if unavailable
    let timestamp: TimeInterval // Unix timestamp (ms)
    let provider: String = "gps"

    init(from location: CLLocation) {
        self.latitude = location.coordinate.latitude
        self.longitude = location.coordinate.longitude
        self.altitude = location.altitude
        self.speed = max(location.speed, 0)
        self.bearing = max(location.course, 0)
        self.horizontalAccuracy = location.horizontalAccuracy
        self.verticalAccuracy = location.verticalAccuracy
        if #available(iOS 15.0, *) {
            self.speedAccuracy = location.speedAccuracy
        } else {
            self.speedAccuracy = -1
        }
        self.timestamp = location.timestamp.timeIntervalSince1970 * 1000
    }

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
