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

    // MARK: - Configuration Constants

    /// Number of recent speed samples to average for stationary/moving detection.
    /// Window of 5 smooths Kalman filter fluctuations while remaining responsive.
    private let speedWindowSize = 5

    /// Speed below which the user is considered stationary (m/s).
    /// 0.3 m/s ~ 1.1 km/h — below comfortable walking pace.
    private let stationarySpeedThreshold: Double = 0.3

    /// Speed above which a stationary user is considered moving again (m/s).
    /// Lowered from 0.5 to 0.35 m/s: with a 5-sample window containing stale zeros,
    /// the average must exceed this. At 0.5, a walker at 1.0 m/s needs 3+ samples
    /// above zero before avg > 0.5 — too slow. At 0.35, even 2 samples of 1.0 m/s
    /// with 3 zeros gives avg = 0.4 > 0.35, enabling faster resume detection.
    private let movingSpeedThreshold: Double = 0.35

    /// Accelerometer magnitude threshold to detect movement (g-force).
    /// Walking generates 0.15–0.3g sustained; phone shaking can spike higher but briefly.
    /// Set to 0.2g to ignore phone shaking while still catching genuine walking.
    private let stationaryAccelThreshold: Double = 0.2

    /// Minimum time the user must be stationary before state transitions (seconds).
    /// Prevents brief pauses (e.g., at crosswalks) from triggering stationary state.
    /// Unified at 2.0s across iOS/Android for consistent behavior.
    private let minStationaryDuration: TimeInterval = 2.0

    private var consecutiveStationaryCount = 0
    private var consecutiveMovingCount = 0

    /// Number of consecutive below-threshold readings required to enter stationary.
    /// Set to 3 (was 1) to avoid false triggers during brief slow-downs,
    /// Kalman filter lag, or GPS noise at constant pace.
    private let requiredStationaryCount = 3

    /// Number of consecutive above-threshold readings required to resume moving via GPS speed.
    /// Set to 2 to prevent indoor GPS drift from falsely triggering MOVING.
    /// Accelerometer path provides independent resume (3 consecutive readings).
    private let requiredMovingCount = 2

    /// Grace period: ignore the first N speed readings to avoid false stationary
    /// detection during cold start (GPS speed may report -1/0 initially).
    private var totalUpdateCount = 0
    private let graceUpdates = 5

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
    /// Requires 3 consecutive readings above threshold to resume — prevents phone shaking
    /// from falsely triggering resume while still catching genuine walking/running.
    private let requiredAccelMovingCount = 3

    func updateWithAcceleration(_ magnitude: Double, isLowAccuracyMode: Bool = false) {
        if state == .stationary && magnitude > stationaryAccelThreshold {
            consecutiveMovingCount += 1
            let threshold = isLowAccuracyMode ? requiredMovingCount : requiredAccelMovingCount
            if consecutiveMovingCount >= threshold {
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
        // Start stationary — user must actually move before distance accumulates.
        // Prevents indoor GPS drift from drawing phantom routes.
        state = .stationary
        stateStartTime = Date()
        recentSpeeds.removeAll()
        consecutiveStationaryCount = 0
        consecutiveMovingCount = 0
        totalUpdateCount = 0
    }
}
