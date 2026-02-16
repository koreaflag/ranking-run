import Foundation

// MARK: - GeoMath
// Pure functions for geodesic calculations.
// Uses the Haversine formula for distance and standard formulas for bearing.
// No external dependencies - this is a domain utility.

enum GeoMath {

    // Earth's mean radius in meters (WGS-84)
    static let earthRadius: Double = 6_371_000.0

    // MARK: - Haversine Distance

    /// Calculates the great-circle distance between two geographic coordinates.
    /// Returns distance in meters.
    static func haversineDistance(
        lat1: Double, lng1: Double,
        lat2: Double, lng2: Double
    ) -> Double {
        let dLat = toRadians(lat2 - lat1)
        let dLng = toRadians(lng2 - lng1)

        let lat1Rad = toRadians(lat1)
        let lat2Rad = toRadians(lat2)

        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1Rad) * cos(lat2Rad) * sin(dLng / 2) * sin(dLng / 2)

        let c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return earthRadius * c
    }

    // MARK: - Bearing

    /// Calculates the initial bearing (forward azimuth) from point 1 to point 2.
    /// Returns bearing in degrees (0-360).
    static func bearing(
        lat1: Double, lng1: Double,
        lat2: Double, lng2: Double
    ) -> Double {
        let lat1Rad = toRadians(lat1)
        let lat2Rad = toRadians(lat2)
        let dLng = toRadians(lng2 - lng1)

        let y = sin(dLng) * cos(lat2Rad)
        let x = cos(lat1Rad) * sin(lat2Rad)
            - sin(lat1Rad) * cos(lat2Rad) * cos(dLng)

        let bearingRad = atan2(y, x)
        return fmod(toDegrees(bearingRad) + 360.0, 360.0)
    }

    // MARK: - Speed Calculation

    /// Calculates speed between two points given their timestamps.
    /// Returns speed in m/s.
    /// Returns nil if time difference is zero or negative.
    static func speed(
        lat1: Double, lng1: Double, timestamp1: Double,
        lat2: Double, lng2: Double, timestamp2: Double
    ) -> Double? {
        let dt = (timestamp2 - timestamp1) / 1000.0 // ms to seconds
        guard dt > 0 else { return nil }

        let distance = haversineDistance(lat1: lat1, lng1: lng1, lat2: lat2, lng2: lng2)
        return distance / dt
    }

    // MARK: - 3-Point Acceleration

    /// Calculates acceleration from three consecutive points.
    /// Returns acceleration magnitude in m/s^2.
    /// Returns nil if any time interval is zero or negative.
    static func threePointAcceleration(
        lat1: Double, lng1: Double, t1: Double,
        lat2: Double, lng2: Double, t2: Double,
        lat3: Double, lng3: Double, t3: Double
    ) -> Double? {
        guard let speed1 = speed(lat1: lat1, lng1: lng1, timestamp1: t1,
                                 lat2: lat2, lng2: lng2, timestamp2: t2),
              let speed2 = speed(lat1: lat2, lng1: lng2, timestamp1: t2,
                                 lat2: lat3, lng2: lng3, timestamp2: t3) else {
            return nil
        }

        let dt = (t3 - t1) / 1000.0 / 2.0 // Average time interval in seconds
        guard dt > 0 else { return nil }

        return abs(speed2 - speed1) / dt
    }

    // MARK: - Destination Point

    /// Given a start point, bearing, and distance, calculates the destination point.
    /// Used for dead reckoning.
    static func destinationPoint(
        lat: Double, lng: Double,
        bearing: Double, distance: Double
    ) -> (latitude: Double, longitude: Double) {
        let latRad = toRadians(lat)
        let lngRad = toRadians(lng)
        let bearingRad = toRadians(bearing)
        let angularDistance = distance / earthRadius

        let destLat = asin(
            sin(latRad) * cos(angularDistance)
            + cos(latRad) * sin(angularDistance) * cos(bearingRad)
        )

        let destLng = lngRad + atan2(
            sin(bearingRad) * sin(angularDistance) * cos(latRad),
            cos(angularDistance) - sin(latRad) * sin(destLat)
        )

        return (toDegrees(destLat), toDegrees(destLng))
    }

    // MARK: - Angle Conversions

    static func toRadians(_ degrees: Double) -> Double {
        return degrees * .pi / 180.0
    }

    static func toDegrees(_ radians: Double) -> Double {
        return radians * 180.0 / .pi
    }
}
