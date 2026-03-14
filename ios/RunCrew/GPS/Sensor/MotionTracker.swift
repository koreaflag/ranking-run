import Foundation
import CoreMotion

/// Tracks device motion using CMMotionManager (accelerometer + gyroscope)
class MotionTracker {
    private let motionManager = CMMotionManager()
    private let queue = OperationQueue()
    private let updateInterval: TimeInterval = 1.0 / 10.0 // 10 Hz

    private(set) var userAcceleration: CMAcceleration = CMAcceleration(x: 0, y: 0, z: 0)
    private(set) var attitude: CMAttitude?
    private(set) var rotationRate: CMRotationRate = CMRotationRate(x: 0, y: 0, z: 0)
    /// Thread-safe: written on motion queue, read on main thread.
    /// Using atomic load/store via lock to prevent data races.
    private var _accelerationMagnitude: Double = 0
    private var _accelerationVariance: Double = 1.0
    private let lock = NSLock()

    var accelerationMagnitude: Double {
        lock.lock()
        defer { lock.unlock() }
        return _accelerationMagnitude
    }

    var accelerationVariance: Double {
        lock.lock()
        defer { lock.unlock() }
        return _accelerationVariance
    }

    private var recentMagnitudes: [Double] = []
    private let varianceWindowSize = 50

    var isAvailable: Bool { motionManager.isDeviceMotionAvailable }

    init() {
        queue.name = "com.runcrew.motion"
        queue.maxConcurrentOperationCount = 1
    }

    func start() {
        guard motionManager.isDeviceMotionAvailable else { return }

        motionManager.deviceMotionUpdateInterval = updateInterval
        motionManager.startDeviceMotionUpdates(
            using: .xArbitraryCorrectedZVertical,
            to: queue
        ) { [weak self] motion, error in
            guard let self = self, let motion = motion, error == nil else { return }
            self.processMotion(motion)
        }
    }

    func stop() {
        motionManager.stopDeviceMotionUpdates()
        recentMagnitudes.removeAll()
    }

    private func processMotion(_ motion: CMDeviceMotion) {
        userAcceleration = motion.userAcceleration
        attitude = motion.attitude
        rotationRate = motion.rotationRate

        // Calculate acceleration magnitude (excluding gravity)
        let mag = sqrt(
            motion.userAcceleration.x * motion.userAcceleration.x +
            motion.userAcceleration.y * motion.userAcceleration.y +
            motion.userAcceleration.z * motion.userAcceleration.z
        )
        lock.lock()
        _accelerationMagnitude = mag
        lock.unlock()

        // Track variance for Kalman Filter process noise adjustment
        recentMagnitudes.append(mag)
        if recentMagnitudes.count > varianceWindowSize {
            recentMagnitudes.removeFirst()
        }
        updateVariance()
    }

    private func updateVariance() {
        guard recentMagnitudes.count >= 5 else {
            lock.lock()
            _accelerationVariance = 1.0
            lock.unlock()
            return
        }
        let mean = recentMagnitudes.reduce(0, +) / Double(recentMagnitudes.count)
        let variance = recentMagnitudes.reduce(0) {
            $0 + ($1 - mean) * ($1 - mean)
        } / Double(recentMagnitudes.count)
        lock.lock()
        _accelerationVariance = variance
        lock.unlock()
    }

    /// Get heading direction from device motion (radians)
    func getHeading() -> Double? {
        guard let attitude = attitude else { return nil }
        return attitude.yaw
    }
}
