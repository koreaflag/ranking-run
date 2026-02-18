import Foundation

/// Converts between lat/lng (degrees) and local meters for Kalman Filter
struct CoordinateConverter {
    /// Reference point for local coordinate system
    private let refLat: Double
    private let refLon: Double
    private let metersPerDegreeLat: Double
    private let metersPerDegreeLon: Double

    init(referenceLat: Double, referenceLon: Double) {
        self.refLat = referenceLat
        self.refLon = referenceLon
        // 1 degree latitude ≈ 111,320 meters (constant)
        self.metersPerDegreeLat = 111320.0
        // 1 degree longitude varies by latitude
        self.metersPerDegreeLon = 111320.0 * cos(referenceLat * .pi / 180.0)
    }

    /// Convert lat/lng to local meters (relative to reference point)
    func toMeters(lat: Double, lon: Double) -> (x: Double, y: Double) {
        let x = (lon - refLon) * metersPerDegreeLon
        let y = (lat - refLat) * metersPerDegreeLat
        return (x, y)
    }

    /// Convert local meters back to lat/lng
    func toLatLng(x: Double, y: Double) -> (lat: Double, lon: Double) {
        let lat = refLat + y / metersPerDegreeLat
        let lon = refLon + x / metersPerDegreeLon
        return (lat, lon)
    }

    /// Convert speed from m/s to degrees/s
    func speedToDegreesPerSec(vNorth: Double, vEast: Double) -> (dLat: Double, dLon: Double) {
        return (vNorth / metersPerDegreeLat, vEast / metersPerDegreeLon)
    }
}
