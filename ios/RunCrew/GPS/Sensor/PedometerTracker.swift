import Foundation
import CoreMotion

// MARK: - PedometerTracker
// Wraps CMPedometer to provide step count and Apple's calibrated distance.
//
// CMPedometer.distance is based on Apple's stride-length learning model
// and is often more accurate than GPS for short intervals. This makes it
// the primary data source for dead reckoning when GPS drops.
//
// Key behaviors:
// - Starts updates from a given Date
// - Accumulates total steps and distance for the session
// - Reports pedometer-based distance delta for sensor fusion

protocol PedometerTrackerDelegate: AnyObject {
    func pedometerTracker(
        _ tracker: PedometerTracker,
        didUpdateSteps steps: Int,
        distance: Double,         // Total pedometer distance since start (meters)
        distanceDelta: Double     // Distance since last update (meters)
    )
}

final class PedometerTracker {

    weak var delegate: PedometerTrackerDelegate?

    private let pedometer: CMPedometer
    private var isRunning: Bool = false

    // Accumulated state
    private(set) var totalSteps: Int = 0
    private(set) var totalDistance: Double = 0.0
    private var lastReportedDistance: Double = 0.0

    // MARK: - Initialization

    init() {
        pedometer = CMPedometer()
    }

    // MARK: - Availability Check

    static var isAvailable: Bool {
        return CMPedometer.isStepCountingAvailable() && CMPedometer.isDistanceAvailable()
    }

    // MARK: - Start / Stop

    func start(from startDate: Date) {
        guard PedometerTracker.isAvailable else { return }
        guard !isRunning else { return }

        isRunning = true
        lastReportedDistance = 0.0

        pedometer.startUpdates(from: startDate) { [weak self] data, error in
            guard let self = self, let data = data, error == nil else { return }

            let steps = data.numberOfSteps.intValue
            let distance = data.distance?.doubleValue ?? 0.0

            let delta = distance - self.lastReportedDistance
            self.lastReportedDistance = distance

            self.totalSteps = steps
            self.totalDistance = distance

            self.delegate?.pedometerTracker(
                self,
                didUpdateSteps: steps,
                distance: distance,
                distanceDelta: max(delta, 0)
            )
        }
    }

    func stop() {
        guard isRunning else { return }
        pedometer.stopUpdates()
        isRunning = false
    }

    // MARK: - Reset

    func reset() {
        stop()
        totalSteps = 0
        totalDistance = 0.0
        lastReportedDistance = 0.0
    }
}
