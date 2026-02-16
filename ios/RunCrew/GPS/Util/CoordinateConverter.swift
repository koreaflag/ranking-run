import Foundation

// MARK: - CoordinateConverter
// Converts between geographic coordinates (lat/lng in degrees) and local
// Cartesian coordinates (meters). Uses a tangent-plane approximation that
// is accurate for small areas (running distances).
//
// The local frame is centered on a reference point set at session start.
// X axis points East, Y axis points North.

final class CoordinateConverter {

    // Reference origin in degrees
    private let refLat: Double
    private let refLng: Double

    // Pre-computed meters-per-degree at the reference latitude
    let metersPerDegreeLat: Double
    let metersPerDegreeLng: Double

    // MARK: - Initialization

    /// Initialize with a reference origin. All conversions are relative to this point.
    init(referenceLat: Double, referenceLng: Double) {
        self.refLat = referenceLat
        self.refLng = referenceLng

        // At the equator, 1 degree latitude ~ 110,574m.
        // The value varies slightly with latitude due to Earth's oblateness.
        // Using the WGS-84 ellipsoid approximation:
        let latRad = GeoMath.toRadians(referenceLat)
        self.metersPerDegreeLat = 111_132.92
            - 559.82 * cos(2 * latRad)
            + 1.175 * cos(4 * latRad)
            - 0.0023 * cos(6 * latRad)

        self.metersPerDegreeLng = 111_412.84 * cos(latRad)
            - 93.5 * cos(3 * latRad)
            + 0.118 * cos(5 * latRad)
    }

    // MARK: - Degrees to Meters

    /// Converts latitude/longitude to local meters (northing, easting).
    func toMeters(lat: Double, lng: Double) -> (northing: Double, easting: Double) {
        let northing = (lat - refLat) * metersPerDegreeLat
        let easting = (lng - refLng) * metersPerDegreeLng
        return (northing, easting)
    }

    // MARK: - Meters to Degrees

    /// Converts local meters (northing, easting) back to latitude/longitude.
    func toDegrees(northing: Double, easting: Double) -> (lat: Double, lng: Double) {
        let lat = refLat + northing / metersPerDegreeLat
        let lng = refLng + easting / metersPerDegreeLng
        return (lat, lng)
    }
}
