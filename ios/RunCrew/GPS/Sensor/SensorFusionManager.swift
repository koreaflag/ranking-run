import Foundation
import CoreLocation

/// Manages sensor fusion: combines GPS, pedometer, motion, and altimeter data
class SensorFusionManager {
    let motionTracker = MotionTracker()
    let pedometerTracker = PedometerTracker()
    let altimeterTracker = AltimeterTracker()

    private var baseGPSAltitude: Double?
    private var lastGPSTime: Date?
    private var lastGPSLocation: CLLocation?
    private let gpsLostThreshold: TimeInterval = 5.0 // seconds

    var isGPSLost: Bool {
        guard let lastTime = lastGPSTime else { return true }
        return Date().timeIntervalSince(lastTime) > gpsLostThreshold
    }

    func startAll() {
        motionTracker.start()
        altimeterTracker.start()
        pedometerTracker.start { [weak self] steps, distance, cadence in
            // Pedometer updates received - used for dead reckoning
            _ = self
        }
    }

    func stopAll() {
        motionTracker.stop()
        pedometerTracker.stop()
        altimeterTracker.stop()
    }

    /// Notify that a valid GPS location was received
    func onGPSUpdate(_ location: CLLocation) {
        lastGPSTime = Date()
        lastGPSLocation = location
        if baseGPSAltitude == nil {
            baseGPSAltitude = location.altitude
        }
    }

    /// Get corrected altitude using barometer
    func getCorrectedAltitude() -> Double {
        let base = baseGPSAltitude ?? 0
        return altimeterTracker.getCorrectedAltitude(baseGPSAltitude: base)
    }

    /// Get acceleration variance for Kalman Filter process noise
    func getAccelerationVariance() -> Double {
        return motionTracker.accelerationVariance
    }

    /// Get acceleration magnitude for stationary detection
    func getAccelerationMagnitude() -> Double {
        return motionTracker.accelerationMagnitude
    }

    /// Dead reckoning: estimate position when GPS is lost
    func estimatePosition(from lastKnownLat: Double,
                           lastKnownLon: Double,
                           lastKnownBearing: Double,
                           gpsLostSince: Date) -> (lat: Double, lon: Double, distance: Double)? {
        guard isGPSLost else { return nil }

        // Use pedometer distance + motion heading for dead reckoning
        let heading = motionTracker.getHeading() ?? (lastKnownBearing * .pi / 180.0)

        let now = Date()
        var estimatedDistance: Double = 0

        // Synchronous query isn't ideal, so use accumulated pedometer distance as approximation
        let timeSinceLost = now.timeIntervalSince(gpsLostSince)
        guard timeSinceLost > 0, timeSinceLost < 60 else { return nil } // Max 60s dead reckoning

        // Approximate distance from pedometer cadence
        if pedometerTracker.currentCadence > 0 {
            // Average stride ≈ 0.75m, adjusted by cadence
            let strideLength = 0.75
            estimatedDistance = pedometerTracker.currentCadence * timeSinceLost * strideLength
        }

        guard estimatedDistance > 0 else { return nil }

        // Calculate new position
        let dLat = estimatedDistance * cos(heading) / 111320.0
        let dLon = estimatedDistance * sin(heading) / (111320.0 * cos(lastKnownLat * .pi / 180.0))

        return (lastKnownLat + dLat, lastKnownLon + dLon, estimatedDistance)
    }
}
