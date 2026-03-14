import Foundation
import CoreMotion

/// Indoor running tracker using CMPedometer.
/// Provides estimated distance, pace, and cadence without GPS.
class WatchPedometerManager {
    static let shared = WatchPedometerManager()

    private let pedometer = CMPedometer()
    private var isTracking = false
    private var startTime: Date?

    // Accumulated metrics
    private(set) var totalDistance: Double = 0   // meters (Apple's ML-estimated)
    private(set) var totalSteps: Int = 0
    private(set) var currentCadence: Int = 0     // steps/min

    // Callbacks (same signature as WatchLocationManager for easy swapping)
    var onUpdate: ((_ distance: Double, _ speed: Double, _ pace: Int, _ cadence: Int) -> Void)?

    private init() {}

    static var isAvailable: Bool {
        CMPedometer.isDistanceAvailable() && CMPedometer.isStepCountingAvailable()
    }

    func startTracking() {
        guard !isTracking else { return }
        guard WatchPedometerManager.isAvailable else {
            print("[WatchPedometer] Pedometer not available on this device")
            return
        }

        print("[WatchPedometer] Starting indoor tracking")
        totalDistance = 0
        totalSteps = 0
        currentCadence = 0
        startTime = Date()
        isTracking = true

        pedometer.startUpdates(from: Date()) { [weak self] data, error in
            guard let self = self, self.isTracking, let data = data else {
                if let error = error {
                    print("[WatchPedometer] Error: \(error.localizedDescription)")
                }
                return
            }

            DispatchQueue.main.async {
                self.handlePedometerData(data)
            }
        }
    }

    func stopTracking() {
        guard isTracking else { return }
        print("[WatchPedometer] Stopping (steps: \(totalSteps), dist: \(String(format: "%.0f", totalDistance))m)")
        isTracking = false
        pedometer.stopUpdates()
        onUpdate = nil  // Remove callback reference to prevent retain cycles
    }

    func pauseTracking() {
        pedometer.stopUpdates()
    }

    func resumeTracking() {
        guard isTracking, let start = startTime else { return }
        // Resume from original start — CMPedometer accumulates from the from-date
        pedometer.startUpdates(from: start) { [weak self] data, error in
            guard let self = self, self.isTracking, let data = data else { return }
            DispatchQueue.main.async {
                self.handlePedometerData(data)
            }
        }
    }

    private func handlePedometerData(_ data: CMPedometerData) {
        // Apple provides ML-estimated distance on Apple Watch
        if let dist = data.distance?.doubleValue {
            totalDistance = dist
        }
        totalSteps = data.numberOfSteps.intValue

        // Current cadence (steps per minute)
        if let cadence = data.currentCadence?.doubleValue {
            currentCadence = Int(cadence * 60) // CMPedometer gives steps/sec
        }

        // Estimated speed and pace from distance/time
        let elapsed = data.endDate.timeIntervalSince(data.startDate)
        var speed: Double = 0
        var pace: Int = 0
        if elapsed > 0 && totalDistance > 0 {
            speed = totalDistance / elapsed  // m/s
            pace = Int(elapsed / (totalDistance / 1000.0))  // sec/km
        }

        onUpdate?(totalDistance, speed, pace, currentCadence)
    }

    /// Build a run summary for syncing (no route points for indoor).
    /// - Parameter activeDuration: The paused-adjusted duration in seconds.
    ///   If provided, avgPace is calculated from this instead of wall-clock time.
    func buildRunSummary(activeDuration: Int? = nil) -> [String: Any] {
        let elapsed: TimeInterval
        if let active = activeDuration {
            elapsed = Double(active)
        } else if let start = startTime {
            elapsed = Date().timeIntervalSince(start)
        } else {
            elapsed = 0
        }

        let avgPace: Int
        if totalDistance > 0 && elapsed > 0 {
            avgPace = Int(elapsed / (totalDistance / 1000.0))
        } else {
            avgPace = 0
        }

        return [
            "type": "standaloneRunComplete",
            "isIndoor": true,
            "distanceMeters": totalDistance,
            "durationSeconds": activeDuration ?? Int(elapsed),
            "avgPace": avgPace,
            "totalSteps": totalSteps,
            "cadence": currentCadence,
            "routePoints": [] as [[String: Double]],  // no GPS route
            "startedAt": (startTime ?? Date()).timeIntervalSince1970,
            "finishedAt": Date().timeIntervalSince1970,
            "pointCount": 0,
        ]
    }
}
