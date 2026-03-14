import Foundation
import CoreLocation

/// Standalone GPS tracking on Apple Watch using CoreLocation.
/// Used when the phone is not available (standalone mode).
class WatchLocationManager: NSObject, CLLocationManagerDelegate {
    static let shared = WatchLocationManager()

    private let locationManager = CLLocationManager()
    private var isTracking = false
    private var startTime: Date?
    private var lastLocation: CLLocation?

    // Accumulated metrics
    private(set) var totalDistance: Double = 0       // meters
    private(set) var locations: [CLLocation] = []
    private(set) var routePoints: [[String: Double]] = []  // [{lat, lng, alt, timestamp}]

    // Callbacks
    var onLocationUpdate: ((_ distance: Double, _ speed: Double, _ pace: Int) -> Void)?
    var onGPSStatusChange: ((_ status: String) -> Void)?
    var onRawLocation: ((_ location: CLLocation) -> Void)?

    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.activityType = .fitness
    }

    func requestPermission() {
        locationManager.requestWhenInUseAuthorization()
    }

    func startTracking() {
        guard !isTracking else { return }
        print("[WatchLocationMgr] Starting GPS tracking")

        totalDistance = 0
        locations = []
        routePoints = []
        lastLocation = nil
        startTime = Date()
        isTracking = true

        // Background location is handled by the active HKWorkoutSession
        // (workout-processing WKBackgroundMode). No need for allowsBackgroundLocationUpdates.
        locationManager.startUpdatingLocation()
        onGPSStatusChange?("searching")
    }

    func stopTracking() {
        guard isTracking else { return }
        print("[WatchLocationMgr] Stopping GPS tracking (points: \(locations.count), dist: \(String(format: "%.0f", totalDistance))m)")

        isTracking = false
        locationManager.stopUpdatingLocation()
        onLocationUpdate = nil  // Remove callback reference to prevent retain cycles
        onGPSStatusChange = nil
        onRawLocation = nil
    }

    func pauseTracking() {
        locationManager.stopUpdatingLocation()
    }

    func resumeTracking() {
        locationManager.startUpdatingLocation()
    }

    var elapsedSeconds: Int {
        guard let start = startTime else { return 0 }
        return Int(Date().timeIntervalSince(start))
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations newLocations: [CLLocation]) {
        guard isTracking else { return }

        for location in newLocations {
            // Filter: skip inaccurate fixes
            guard location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= 30 else {
                continue
            }

            // Distance accumulation
            var isValidPoint = true
            if let last = lastLocation {
                let delta = location.distance(from: last)
                let timeDiff = location.timestamp.timeIntervalSince(last.timestamp)
                // Guard against division by zero (duplicate timestamps)
                if timeDiff > 0 {
                    let speed = delta / timeDiff
                    // Filter: skip if speed > 15 m/s (impossible on foot)
                    if speed <= 15.0 && delta > 1.0 {
                        totalDistance += delta
                        lastLocation = location
                    } else if speed > 15.0 {
                        // Teleport/noise — skip this point entirely
                        isValidPoint = false
                    }
                    // If filtered out (teleport/noise), do NOT update lastLocation
                    // so the next delta is measured from the last valid position.
                } else {
                    lastLocation = location
                }
            } else {
                lastLocation = location
            }

            // Only store valid points in route to prevent noisy data in sync
            guard isValidPoint else { continue }
            locations.append(location)

            // Store route point for sync
            routePoints.append([
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude,
                "alt": location.altitude,
                "timestamp": location.timestamp.timeIntervalSince1970,
                "accuracy": location.horizontalAccuracy,
                "speed": max(0, location.speed),
            ])

            // Calculate pace (seconds per km)
            let speed = max(0, location.speed)
            var pace = 0
            if speed > 0.3 {
                pace = Int(1000.0 / speed)
            }

            onLocationUpdate?(totalDistance, speed, pace)
            onRawLocation?(location)
            onGPSStatusChange?(location.horizontalAccuracy <= 10 ? "locked" : "searching")
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[WatchLocationMgr] Location error: \(error.localizedDescription)")
        if let clError = error as? CLError, clError.code == .denied {
            onGPSStatusChange?("disabled")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            print("[WatchLocationMgr] Location authorized")
        case .denied, .restricted:
            onGPSStatusChange?("disabled")
        default:
            break
        }
    }

    /// Build a run summary dict for syncing to phone.
    /// - Parameter activeDuration: The paused-adjusted duration in seconds.
    ///   If provided, avgPace is calculated from this instead of wall-clock time.
    func buildRunSummary(activeDuration: Int? = nil) -> [String: Any] {
        let effectiveDuration: Double
        if let active = activeDuration {
            effectiveDuration = Double(active)
        } else if let start = startTime {
            effectiveDuration = Date().timeIntervalSince(start)
        } else {
            effectiveDuration = 0
        }

        let avgPace: Int
        if totalDistance > 0 && effectiveDuration > 0 {
            avgPace = Int(effectiveDuration / (totalDistance / 1000.0))
        } else {
            avgPace = 0
        }

        return [
            "type": "standaloneRunComplete",
            "distanceMeters": totalDistance,
            "durationSeconds": activeDuration ?? elapsedSeconds,
            "avgPace": avgPace,
            "routePoints": routePoints,
            "startedAt": (startTime ?? Date()).timeIntervalSince1970,
            "finishedAt": Date().timeIntervalSince1970,
            "pointCount": locations.count,
        ]
    }
}
