import Foundation
import CoreLocation

/// Detects stationary (stopped) state using GPS + motion data
class StationaryDetector {
    enum State: String {
        case moving
        case stationary
    }

    private(set) var state: State = .moving
    private(set) var stateDuration: TimeInterval = 0

    private var stateStartTime: Date = Date()
    private var recentSpeeds: [Double] = []
    private let speedWindowSize = 5

    // Thresholds
    private let stationarySpeedThreshold: Double = 0.3  // m/s
    private let movingSpeedThreshold: Double = 0.8       // m/s (hysteresis)
    private let stationaryAccelThreshold: Double = 0.15  // g-force
    private let minStationaryDuration: TimeInterval = 3.0 // seconds

    private var consecutiveStationaryCount = 0
    private var consecutiveMovingCount = 0
    private let requiredConsecutiveCount = 3

    /// Update with new GPS speed
    func updateWithSpeed(_ speed: Double) {
        recentSpeeds.append(speed)
        if recentSpeeds.count > speedWindowSize {
            recentSpeeds.removeFirst()
        }

        let avgSpeed = recentSpeeds.reduce(0, +) / Double(recentSpeeds.count)

        switch state {
        case .moving:
            if avgSpeed < stationarySpeedThreshold {
                consecutiveStationaryCount += 1
                consecutiveMovingCount = 0
                if consecutiveStationaryCount >= requiredConsecutiveCount {
                    transitionTo(.stationary)
                }
            } else {
                consecutiveStationaryCount = 0
            }
        case .stationary:
            if avgSpeed > movingSpeedThreshold {
                consecutiveMovingCount += 1
                consecutiveStationaryCount = 0
                if consecutiveMovingCount >= requiredConsecutiveCount {
                    transitionTo(.moving)
                }
            } else {
                consecutiveMovingCount = 0
            }
        }
    }

    /// Update with Core Motion acceleration magnitude (optional, improves accuracy)
    func updateWithAcceleration(_ magnitude: Double) {
        // Supplement GPS-based detection with motion data
        if state == .stationary && magnitude > stationaryAccelThreshold {
            consecutiveMovingCount += 1
            if consecutiveMovingCount >= requiredConsecutiveCount {
                transitionTo(.moving)
            }
        }
    }

    var isStationary: Bool { state == .stationary }
    var isMoving: Bool { state == .moving }

    private func transitionTo(_ newState: State) {
        guard newState != state else { return }
        state = newState
        stateStartTime = Date()
        consecutiveStationaryCount = 0
        consecutiveMovingCount = 0
    }

    func getStateDurationMs() -> Double {
        return Date().timeIntervalSince(stateStartTime) * 1000
    }

    func reset() {
        state = .moving
        stateStartTime = Date()
        recentSpeeds.removeAll()
        consecutiveStationaryCount = 0
        consecutiveMovingCount = 0
    }
}
