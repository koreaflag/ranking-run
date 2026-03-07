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

    /// Dead reckoning: estimate position when GPS is lost.
    /// Prefers Apple-calibrated pedometer distance, falls back to cadence × stride.
    func estimatePosition(from lastKnownLat: Double,
                           lastKnownLon: Double,
                           lastKnownBearing: Double,
                           gpsLostSince: Date) -> (lat: Double, lon: Double, distance: Double)? {
        guard isGPSLost else { return nil }

        let heading = motionTracker.getHeading() ?? (lastKnownBearing * .pi / 180.0)

        let now = Date()
        let timeSinceLost = now.timeIntervalSince(gpsLostSince)
        guard timeSinceLost > 0, timeSinceLost < 90 else { return nil }

        var estimatedDistance: Double = 0

        // Priority 1: Apple-calibrated pedometer distance
        if pedometerTracker.isDistanceAvailable {
            let semaphore = DispatchSemaphore(value: 0)
            var pedDistance: Double?
            pedometerTracker.queryDistance(from: gpsLostSince, to: now) { dist in
                pedDistance = dist
                semaphore.signal()
            }
            if semaphore.wait(timeout: .now() + 0.1) == .success,
               let dist = pedDistance, dist > 0 {
                estimatedDistance = dist
            }
        }

        // Priority 2: cadence-based estimation (fallback)
        if estimatedDistance == 0 && pedometerTracker.currentCadence > 0 {
            estimatedDistance = pedometerTracker.currentCadence * timeSinceLost * 0.75
        }

        guard estimatedDistance > 0 else { return nil }

        let dLat = estimatedDistance * cos(heading) / 111320.0
        let dLon = estimatedDistance * sin(heading) / (111320.0 * cos(lastKnownLat * .pi / 180.0))

        return (lastKnownLat + dLat, lastKnownLon + dLon, estimatedDistance)
    }
}
