import Foundation
import CoreLocation

/// Geographic math utilities for distance, speed, and bearing calculations
struct GeoMath {
    static let earthRadius: Double = 6371000 // meters

    /// Haversine distance between two coordinates in meters
    static func distance(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let dLat = (lat2 - lat1).toRadians()
        let dLon = (lon2 - lon1).toRadians()
        let a = sin(dLat / 2) * sin(dLat / 2) +
                cos(lat1.toRadians()) * cos(lat2.toRadians()) *
                sin(dLon / 2) * sin(dLon / 2)
        let c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return earthRadius * c
    }

    /// Bearing from point 1 to point 2 in degrees (0-360)
    static func bearing(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
        let dLon = (lon2 - lon1).toRadians()
        let y = sin(dLon) * cos(lat2.toRadians())
        let x = cos(lat1.toRadians()) * sin(lat2.toRadians()) -
                sin(lat1.toRadians()) * cos(lat2.toRadians()) * cos(dLon)
        let bearing = atan2(y, x).toDegrees()
        return (bearing + 360).truncatingRemainder(dividingBy: 360)
    }

    /// Speed between two points in m/s
    static func speed(distance: Double, timeDelta: TimeInterval) -> Double {
        guard timeDelta > 0 else { return 0 }
        return distance / timeDelta
    }

    /// Pace in minutes per kilometer
    static func pace(speedMps: Double) -> Double {
        guard speedMps > 0 else { return 0 }
        return 1000.0 / speedMps / 60.0
    }
}

extension Double {
    func toRadians() -> Double { self * .pi / 180.0 }
    func toDegrees() -> Double { self * 180.0 / .pi }
}
