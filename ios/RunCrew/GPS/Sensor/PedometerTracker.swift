import Foundation
import CoreMotion

/// Tracks steps and distance using CMPedometer
class PedometerTracker {
    private let pedometer = CMPedometer()
    private(set) var totalSteps: Int = 0
    private(set) var totalDistance: Double = 0  // meters (Apple calibrated)
    private(set) var currentCadence: Double = 0 // steps/second
    private(set) var isActive = false

    private var startDate: Date?
    private var onUpdate: ((Int, Double, Double) -> Void)?

    var isAvailable: Bool { CMPedometer.isStepCountingAvailable() }
    var isDistanceAvailable: Bool { CMPedometer.isDistanceAvailable() }

    /// Start pedometer tracking
    func start(onUpdate: @escaping (Int, Double, Double) -> Void) {
        guard CMPedometer.isStepCountingAvailable() else { return }

        self.onUpdate = onUpdate
        startDate = Date()
        isActive = true
        totalSteps = 0
        totalDistance = 0

        pedometer.startUpdates(from: Date()) { [weak self] data, error in
            guard let self = self, let data = data, error == nil else { return }
            self.processPedometerData(data)
        }
    }

    func stop() {
        pedometer.stopUpdates()
        isActive = false
        onUpdate = nil
    }

    private func processPedometerData(_ data: CMPedometerData) {
        totalSteps = data.numberOfSteps.intValue

        if let distance = data.distance {
            totalDistance = distance.doubleValue
        }

        if let cadence = data.currentCadence {
            currentCadence = cadence.doubleValue
        }

        onUpdate?(totalSteps, totalDistance, currentCadence)
    }

    /// Get pedometer distance since last query for dead reckoning
    func queryDistance(from: Date, to: Date, completion: @escaping (Double?) -> Void) {
        guard CMPedometer.isDistanceAvailable() else {
            completion(nil)
            return
        }

        pedometer.queryPedometerData(from: from, to: to) { data, error in
            guard let data = data, error == nil else {
                completion(nil)
                return
            }
            completion(data.distance?.doubleValue)
        }
    }
}
