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
    // Window of 5 for entering stationary (smooths Kalman fluctuations).
    private let speedWindowSize = 5

    // Thresholds
    private let stationarySpeedThreshold: Double = 0.3  // m/s
    // Resume threshold lowered from 0.5 to 0.35 m/s. With a 5-sample window containing
    // stale zeros, the average must exceed this. At 0.5, a walker at 1.0 m/s needs 3+
    // samples above zero before avg > 0.5 — too slow. At 0.35 even 2 samples of 1.0 m/s
    // with 3 zeros gives avg = 0.4 > 0.35, enabling faster resume.
    private let movingSpeedThreshold: Double = 0.35      // m/s
    private let stationaryAccelThreshold: Double = 0.12  // g-force (lowered from 0.15 — walking generates ~0.08-0.15g)
    private let minStationaryDuration: TimeInterval = 3.0 // seconds

    private var consecutiveStationaryCount = 0
    private var consecutiveMovingCount = 0
    // Require 3 consecutive readings to enter stationary (was 1 — too easy to false-trigger
    // during brief slow-downs, Kalman filter lag, or GPS noise at constant pace).
    // Keep 1 for exiting stationary — responsiveness is critical for distance accumulation.
    private let requiredStationaryCount = 3
    private let requiredMovingCount = 1

    /// Grace period: don't transition to stationary until we have enough data
    private var totalUpdateCount = 0
    private let graceUpdates = 5  // Ignore first 5 speed readings

    /// Update with new GPS speed.
    /// When in stationary state, uses only the latest speed (not the window average)
    /// for the resume check — avoids stale zeros in the window blocking resume.
    func updateWithSpeed(_ speed: Double) {
        totalUpdateCount += 1
        recentSpeeds.append(speed)
        if recentSpeeds.count > speedWindowSize {
            recentSpeeds.removeFirst()
        }

        let avgSpeed = recentSpeeds.reduce(0, +) / Double(recentSpeeds.count)

        switch state {
        case .moving:
            // Grace period: don't transition to stationary too early
            // GPS speed may report -1/0 for the first few readings
            guard totalUpdateCount > graceUpdates else { return }
            if avgSpeed < stationarySpeedThreshold {
                consecutiveStationaryCount += 1
                consecutiveMovingCount = 0
                if consecutiveStationaryCount >= requiredStationaryCount {
                    transitionTo(.stationary)
                }
            } else {
                consecutiveStationaryCount = 0
            }
        case .stationary:
            // Use the latest instantaneous speed for resume check instead of the
            // window average. The window contains stale zeros from when the user was
            // stopped, which dilute the average and delay resume for several seconds.
            // A single GPS reading above the threshold is a strong signal of movement.
            let resumeSpeed = max(speed, avgSpeed)
            if resumeSpeed > movingSpeedThreshold {
                consecutiveMovingCount += 1
                // Don't reset consecutiveStationaryCount here — it's irrelevant
                // during stationary state and resetting it has no effect.
                if consecutiveMovingCount >= requiredMovingCount {
                    transitionTo(.moving)
                }
            }
            // NOTE: intentionally do NOT reset consecutiveMovingCount to 0 when
            // speed is below threshold. The accelerometer path also increments
            // consecutiveMovingCount, and resetting it here would undo that progress,
            // preventing accelerometer-based resume from ever triggering.
        }
    }

    /// Update with Core Motion acceleration magnitude (optional, improves accuracy).
    /// When isLowAccuracyMode is true (battery optimizer downgraded GPS), accelerometer
    /// becomes the primary resume signal — 1 reading is sufficient.
    func updateWithAcceleration(_ magnitude: Double, isLowAccuracyMode: Bool = false) {
        if state == .stationary && magnitude > stationaryAccelThreshold {
            consecutiveMovingCount += 1
            // Always use requiredMovingCount (1) — accelerometer is a reliable motion signal
            // and we want to exit stationary as fast as possible to avoid missing distance.
            if consecutiveMovingCount >= requiredMovingCount {
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
        // Clear speed window on transition so stale readings don't affect
        // the next state's threshold checks.
        recentSpeeds.removeAll()
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
        totalUpdateCount = 0
    }
}
