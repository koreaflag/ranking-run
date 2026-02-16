import Foundation
import CoreMotion

// MARK: - AltimeterTracker
// Wraps CMAltimeter to provide barometric altitude changes.
//
// CMAltimeter.relativeAltitude gives the altitude change from the start
// point with ~0.1m resolution. This is MUCH more accurate than GPS altitude
// (which has 10-30m error). The filtered altitude profile should use this
// value instead of GPS altitude.
//
// Note: CMAltimeter only provides RELATIVE altitude, not absolute.
// The initial absolute altitude comes from the first GPS reading.

protocol AltimeterTrackerDelegate: AnyObject {
    func altimeterTracker(
        _ tracker: AltimeterTracker,
        didUpdateRelativeAltitude relativeAltitude: Double, // meters from start
        pressure: Double                                     // kilopascals
    )
}

final class AltimeterTracker {

    weak var delegate: AltimeterTrackerDelegate?

    private let altimeter: CMAltimeter
    private var isRunning: Bool = false

    /// The most recent relative altitude reading (meters from session start)
    private(set) var currentRelativeAltitude: Double = 0.0

    /// The most recent pressure reading (kPa)
    private(set) var currentPressure: Double = 0.0

    /// Base GPS altitude set from the first valid GPS reading
    private(set) var baseGPSAltitude: Double?

    // MARK: - Initialization

    init() {
        altimeter = CMAltimeter()
    }

    // MARK: - Availability Check

    static var isAvailable: Bool {
        return CMAltimeter.isRelativeAltitudeAvailable()
    }

    // MARK: - Start / Stop

    func start() {
        guard AltimeterTracker.isAvailable, !isRunning else { return }

        isRunning = true

        altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, error in
            guard let self = self, let data = data, error == nil else { return }

            self.currentRelativeAltitude = data.relativeAltitude.doubleValue
            self.currentPressure = data.pressure.doubleValue

            self.delegate?.altimeterTracker(
                self,
                didUpdateRelativeAltitude: data.relativeAltitude.doubleValue,
                pressure: data.pressure.doubleValue
            )
        }
    }

    func stop() {
        guard isRunning else { return }
        altimeter.stopRelativeAltitudeUpdates()
        isRunning = false
    }

    // MARK: - GPS Altitude Baseline

    /// Sets the base GPS altitude from the first valid GPS reading.
    /// All subsequent altitudes are computed as: baseGPSAltitude + relativeAltitude.
    func setBaseAltitude(_ gpsAltitude: Double) {
        if baseGPSAltitude == nil {
            baseGPSAltitude = gpsAltitude
        }
    }

    /// Returns the current best-estimate altitude.
    /// Uses barometer-corrected altitude if available, falls back to GPS altitude.
    func getCorrectedAltitude(gpsAltitude: Double) -> Double {
        if let base = baseGPSAltitude {
            return base + currentRelativeAltitude
        }
        return gpsAltitude
    }

    // MARK: - Reset

    func reset() {
        stop()
        currentRelativeAltitude = 0.0
        currentPressure = 0.0
        baseGPSAltitude = nil
    }
}
