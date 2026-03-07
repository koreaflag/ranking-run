import Foundation
import CoreMotion

/// Tracks relative altitude changes using CMAltimeter (barometer)
class AltimeterTracker {
    private let altimeter = CMAltimeter()
    private let queue = OperationQueue()

    private(set) var relativeAltitude: Double = 0   // meters from start
    private(set) var pressure: Double = 0            // kPa
    private(set) var isActive = false

    // Elevation gain/loss tracking
    private(set) var totalElevationGain: Double = 0
    private(set) var totalElevationLoss: Double = 0
    private var lastCommittedAltitude: Double? // baseline for threshold comparison
    private var lastRawAltitude: Double?        // tracks actual latest reading
    private let elevationChangeThreshold: Double = 1.0 // meters, ignore small fluctuations

    var isAvailable: Bool { CMAltimeter.isRelativeAltitudeAvailable() }

    init() {
        queue.name = "com.runcrew.altimeter"
        queue.maxConcurrentOperationCount = 1
    }

    func start() {
        guard CMAltimeter.isRelativeAltitudeAvailable() else { return }

        isActive = true
        relativeAltitude = 0
        totalElevationGain = 0
        totalElevationLoss = 0
        lastCommittedAltitude = nil
        lastRawAltitude = nil

        altimeter.startRelativeAltitudeUpdates(to: queue) { [weak self] data, error in
            guard let self = self, let data = data, error == nil else { return }
            self.processAltimeterData(data)
        }
    }

    func stop() {
        altimeter.stopRelativeAltitudeUpdates()
        isActive = false
    }

    private func processAltimeterData(_ data: CMAltitudeData) {
        let newAltitude = data.relativeAltitude.doubleValue
        pressure = data.pressure.doubleValue
        lastRawAltitude = newAltitude

        // Track elevation gain/loss using committed baseline.
        // When the change from baseline crosses threshold, commit the gain/loss
        // and move the baseline to the current reading.
        // When direction reverses (was ascending, now descending or vice versa),
        // update baseline to prevent stale reference from accumulating errors.
        if let last = lastCommittedAltitude {
            let change = newAltitude - last
            if abs(change) >= elevationChangeThreshold {
                if change > 0 {
                    totalElevationGain += change
                } else {
                    totalElevationLoss += abs(change)
                }
                lastCommittedAltitude = newAltitude
            }
        } else {
            lastCommittedAltitude = newAltitude
        }

        relativeAltitude = newAltitude
    }

    /// Get corrected altitude (base GPS altitude + barometer relative change)
    func getCorrectedAltitude(baseGPSAltitude: Double) -> Double {
        return baseGPSAltitude + relativeAltitude
    }
}
