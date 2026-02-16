import Foundation

// MARK: - StationaryDetector
// Detects whether the user is stationary or moving using Core Motion
// userAcceleration data. Uses a sliding variance window over 3 seconds.
//
// When stationary:
// - GPS drift should not accumulate as distance
// - Battery optimizer can reduce GPS accuracy
// - UI shows "paused" indicator
//
// This class maintains a circular buffer of acceleration magnitudes
// and computes their variance to determine motion state.

protocol StationaryDetectorDelegate: AnyObject {
    func stationaryDetector(_ detector: StationaryDetector, didChangeState state: RunningState)
}

final class StationaryDetector {

    weak var delegate: StationaryDetectorDelegate?

    // MARK: - Configuration

    /// Variance threshold below which the user is considered stationary.
    /// Tuned empirically: typical stationary variance ~ 0.001-0.005,
    /// walking ~ 0.05-0.2, running ~ 0.5+
    private let stationaryThreshold: Double = 0.015

    /// Minimum consecutive samples in new state before transitioning.
    /// Prevents rapid flickering between states.
    private let minTransitionSamples: Int = 15  // At 10Hz = 1.5 seconds

    /// Window size for variance calculation (3 seconds at 10Hz)
    private let windowSize: Int = 30

    // MARK: - State

    private(set) var currentState: RunningState = .moving

    /// Circular buffer of acceleration magnitudes
    private var accelerationBuffer: [Double] = []
    private var bufferIndex: Int = 0
    private var bufferFull: Bool = false

    /// Counter for consecutive samples in a potential new state
    private var transitionCounter: Int = 0
    private var pendingState: RunningState = .moving

    // MARK: - Initialization

    init() {
        accelerationBuffer = [Double](repeating: 0, count: windowSize)
    }

    // MARK: - Feed Acceleration Data

    /// Feed a userAcceleration sample (magnitude of x,y,z combined).
    /// Call at ~10Hz from MotionTracker.
    func feedAcceleration(x: Double, y: Double, z: Double) {
        let magnitude = sqrt(x * x + y * y + z * z)

        // Add to circular buffer
        accelerationBuffer[bufferIndex] = magnitude
        bufferIndex = (bufferIndex + 1) % windowSize
        if bufferIndex == 0 {
            bufferFull = true
        }

        // Don't evaluate until we have a full window
        guard bufferFull else { return }

        let variance = computeVariance()
        let detectedState: RunningState = variance < stationaryThreshold ? .stationary : .moving

        if detectedState == currentState {
            // Reset transition counter if we're still in the current state
            transitionCounter = 0
            pendingState = currentState
        } else {
            if detectedState == pendingState {
                transitionCounter += 1
            } else {
                pendingState = detectedState
                transitionCounter = 1
            }

            if transitionCounter >= minTransitionSamples {
                let previousState = currentState
                currentState = detectedState
                transitionCounter = 0

                if previousState != currentState {
                    delegate?.stationaryDetector(self, didChangeState: currentState)
                }
            }
        }
    }

    // MARK: - Variance Calculation

    /// Returns the current acceleration variance from the buffer.
    /// Also exposed for the Kalman Filter Q matrix adjustment.
    func computeVariance() -> Double {
        let count = bufferFull ? windowSize : bufferIndex
        guard count > 1 else { return 0 }

        var sum = 0.0
        for i in 0..<count {
            sum += accelerationBuffer[i]
        }
        let mean = sum / Double(count)

        var sumSquaredDiff = 0.0
        for i in 0..<count {
            let diff = accelerationBuffer[i] - mean
            sumSquaredDiff += diff * diff
        }

        return sumSquaredDiff / Double(count - 1)
    }

    // MARK: - Reset

    func reset() {
        currentState = .moving
        accelerationBuffer = [Double](repeating: 0, count: windowSize)
        bufferIndex = 0
        bufferFull = false
        transitionCounter = 0
        pendingState = .moving
    }
}
