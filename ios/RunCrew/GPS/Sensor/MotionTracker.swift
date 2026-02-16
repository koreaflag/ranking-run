import Foundation
import CoreMotion

// MARK: - MotionTracker
// Wraps CMMotionManager.deviceMotion to provide:
// - userAcceleration: gravity-subtracted acceleration for movement detection
// - attitude: device orientation for heading/direction tracking
// - rotationRate: angular velocity for corner detection
//
// Updates at 10Hz (100ms interval) to balance accuracy and battery.
// Feeds acceleration data to StationaryDetector and provides
// acceleration variance to the Kalman Filter's Q matrix.

protocol MotionTrackerDelegate: AnyObject {
    func motionTracker(
        _ tracker: MotionTracker,
        didUpdateAcceleration x: Double, y: Double, z: Double,
        heading: Double         // Device heading in degrees (0-360), -1 if unavailable
    )
}

final class MotionTracker {

    weak var delegate: MotionTrackerDelegate?

    private let motionManager: CMMotionManager
    private let updateQueue: OperationQueue
    private var isRunning: Bool = false

    /// Update interval in seconds (10Hz)
    private let updateInterval: TimeInterval = 0.1

    // Accumulated acceleration variance (exposed for Kalman Filter)
    private var recentAccelerations: [Double] = []
    private let varianceWindowSize: Int = 30  // 3 seconds at 10Hz

    // MARK: - Initialization

    init() {
        motionManager = CMMotionManager()
        updateQueue = OperationQueue()
        updateQueue.name = "com.runcrew.motion"
        updateQueue.maxConcurrentOperationCount = 1
        updateQueue.qualityOfService = .userInitiated
    }

    // MARK: - Availability Check

    var isAvailable: Bool {
        return motionManager.isDeviceMotionAvailable
    }

    // MARK: - Start / Stop

    func start() {
        guard isAvailable, !isRunning else { return }

        isRunning = true
        motionManager.deviceMotionUpdateInterval = updateInterval

        // Use .xArbitraryCorrectedZVertical for a stable reference frame
        motionManager.startDeviceMotionUpdates(
            using: .xArbitraryCorrectedZVertical,
            to: updateQueue
        ) { [weak self] motion, error in
            guard let self = self, let motion = motion, error == nil else { return }

            let userAccel = motion.userAcceleration
            let magnitude = sqrt(
                userAccel.x * userAccel.x
                + userAccel.y * userAccel.y
                + userAccel.z * userAccel.z
            )

            // Track for variance calculation
            self.recentAccelerations.append(magnitude)
            if self.recentAccelerations.count > self.varianceWindowSize {
                self.recentAccelerations.removeFirst()
            }

            // Extract heading from attitude
            let heading = fmod(GeoMath.toDegrees(motion.attitude.yaw) + 360.0, 360.0)

            self.delegate?.motionTracker(
                self,
                didUpdateAcceleration: userAccel.x,
                y: userAccel.y,
                z: userAccel.z,
                heading: heading
            )
        }
    }

    func stop() {
        guard isRunning else { return }
        motionManager.stopDeviceMotionUpdates()
        isRunning = false
    }

    // MARK: - Acceleration Variance

    /// Returns the current acceleration variance for the Kalman Filter Q matrix.
    /// Higher variance = more dynamic movement = larger process noise.
    func getAccelerationVariance() -> Double {
        let count = recentAccelerations.count
        guard count > 1 else { return 1.0 }

        var sum = 0.0
        for val in recentAccelerations { sum += val }
        let mean = sum / Double(count)

        var sumSqDiff = 0.0
        for val in recentAccelerations {
            let diff = val - mean
            sumSqDiff += diff * diff
        }

        let variance = sumSqDiff / Double(count - 1)
        // Clamp to a reasonable range: minimum 0.01 (stationary), maximum 50.0 (sprinting)
        return max(0.01, min(variance, 50.0))
    }

    // MARK: - Reset

    func reset() {
        stop()
        recentAccelerations.removeAll()
    }
}
