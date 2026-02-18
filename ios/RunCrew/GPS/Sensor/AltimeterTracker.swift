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
    private var lastAltitude: Double?
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
        lastAltitude = nil

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

        // Track elevation gain/loss
        if let last = lastAltitude {
            let change = newAltitude - last
            if abs(change) >= elevationChangeThreshold {
                if change > 0 {
                    totalElevationGain += change
                } else {
                    totalElevationLoss += abs(change)
                }
                lastAltitude = newAltitude
            }
        } else {
            lastAltitude = newAltitude
        }

        relativeAltitude = newAltitude
    }

    /// Get corrected altitude (base GPS altitude + barometer relative change)
    func getCorrectedAltitude(baseGPSAltitude: Double) -> Double {
        return baseGPSAltitude + relativeAltitude
    }
}
