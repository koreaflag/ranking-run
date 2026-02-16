import Foundation
import CoreLocation

// MARK: - LocationEngine
// Wraps CLLocationManager with proper thread safety and configuration
// for high-accuracy running GPS tracking.
//
// CRITICAL iOS requirements:
// - CLLocationManager MUST be created on the main thread
// - pausesLocationUpdatesAutomatically = false (prevents iOS from killing updates)
// - allowsBackgroundLocationUpdates = true (runs while app is backgrounded)
// - distanceFilter = kCLDistanceFilterNone (receive ALL updates, filter in app)
//
// LocationEngine handles:
// - Permission requests and status monitoring
// - Main-thread CLLocationManager lifecycle
// - Forwarding locations to the processing queue for SensorFusionManager
// - Battery optimization via BatteryOptimizer accuracy adjustments

protocol LocationEngineDelegate: AnyObject {
    func locationEngine(_ engine: LocationEngine, didReceiveLocation location: CLLocation)
    func locationEngine(_ engine: LocationEngine, didFailWithError error: GPSError)
    func locationEngine(_ engine: LocationEngine, didChangeAuthorization authorized: Bool)
}

final class LocationEngine: NSObject {

    weak var delegate: LocationEngineDelegate?

    // MARK: - Properties

    private var locationManager: CLLocationManager?
    private(set) var isRunning: Bool = false

    /// Processing queue for location data (avoids blocking the main thread)
    private let processingQueue = DispatchQueue(
        label: "com.runcrew.gps.processing",
        qos: .userInitiated
    )

    // MARK: - Initialization

    override init() {
        super.init()
        // CLLocationManager must be created on main thread
        setupLocationManager()
    }

    // MARK: - Setup

    private func setupLocationManager() {
        let setup = { [weak self] in
            guard let self = self else { return }
            let manager = CLLocationManager()
            manager.delegate = self

            // High-accuracy settings for running (from ios-gps.md)
            manager.desiredAccuracy = kCLLocationAccuracyBest
            manager.distanceFilter = kCLDistanceFilterNone
            manager.activityType = .fitness

            // Background location support
            manager.allowsBackgroundLocationUpdates = true
            manager.showsBackgroundLocationIndicator = true

            // CRITICAL: Do NOT let iOS pause updates automatically.
            // iOS may misidentify waiting at a traffic light as the user stopping,
            // which kills location updates entirely.
            manager.pausesLocationUpdatesAutomatically = false

            self.locationManager = manager
        }

        if Thread.isMainThread {
            setup()
        } else {
            DispatchQueue.main.sync(execute: setup)
        }
    }

    // MARK: - Permission

    func requestPermission() {
        DispatchQueue.main.async { [weak self] in
            self?.locationManager?.requestWhenInUseAuthorization()
        }
    }

    func checkPermission() -> Bool {
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = locationManager?.authorizationStatus ?? .notDetermined
        } else {
            status = CLLocationManager.authorizationStatus()
        }

        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            return true
        default:
            return false
        }
    }

    func isLocationServicesEnabled() -> Bool {
        return CLLocationManager.locationServicesEnabled()
    }

    // MARK: - Start / Stop

    func startUpdating() {
        guard !isRunning else { return }

        guard isLocationServicesEnabled() else {
            delegate?.locationEngine(self, didFailWithError: .gpsDisabled)
            return
        }

        guard checkPermission() else {
            requestPermission()
            // Will be called again after permission is granted
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.isRunning = true
            self.locationManager?.startUpdatingLocation()
        }
    }

    func stopUpdating() {
        guard isRunning else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.isRunning = false
            self.locationManager?.stopUpdatingLocation()
        }
    }

    // MARK: - Battery Optimization

    /// Updates the desired accuracy. Called by BatteryOptimizer.
    func updateAccuracy(_ accuracy: CLLocationAccuracy) {
        DispatchQueue.main.async { [weak self] in
            self?.locationManager?.desiredAccuracy = accuracy
        }
    }

    // MARK: - Cleanup

    func tearDown() {
        stopUpdating()
        DispatchQueue.main.async { [weak self] in
            self?.locationManager?.delegate = nil
            self?.locationManager = nil
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationEngine: CLLocationManagerDelegate {

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Process each location on the background queue to avoid blocking main thread
        processingQueue.async { [weak self] in
            guard let self = self else { return }
            for location in locations {
                self.delegate?.locationEngine(self, didReceiveLocation: location)
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let clError = error as? CLError else { return }

        switch clError.code {
        case .denied:
            delegate?.locationEngine(self, didFailWithError: .permissionDenied)
        case .locationUnknown:
            // Transient error, iOS will retry automatically
            break
        case .network:
            delegate?.locationEngine(self, didFailWithError: .serviceUnavailable)
        default:
            delegate?.locationEngine(self, didFailWithError: .serviceUnavailable)
        }
    }

    // iOS 14+ authorization change callback
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if #available(iOS 14.0, *) {
            let status = manager.authorizationStatus
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                delegate?.locationEngine(self, didChangeAuthorization: true)
                // If we were waiting for permission, start now
                if !isRunning {
                    startUpdating()
                }
            case .denied, .restricted:
                delegate?.locationEngine(self, didChangeAuthorization: false)
                delegate?.locationEngine(self, didFailWithError: .permissionDenied)
            case .notDetermined:
                break
            @unknown default:
                break
            }
        }
    }

    // Pre-iOS 14 authorization change callback
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        if #available(iOS 14.0, *) {
            // Handled by locationManagerDidChangeAuthorization
            return
        }

        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            delegate?.locationEngine(self, didChangeAuthorization: true)
            if !isRunning {
                startUpdating()
            }
        case .denied, .restricted:
            delegate?.locationEngine(self, didChangeAuthorization: false)
            delegate?.locationEngine(self, didFailWithError: .permissionDenied)
        case .notDetermined:
            break
        @unknown default:
            break
        }
    }
}
