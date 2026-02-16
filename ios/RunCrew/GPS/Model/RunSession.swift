import Foundation

// MARK: - GPSStatus
// Matches shared-interfaces.md GPSStatus type.

enum GPSStatus: String {
    case searching = "searching"
    case locked = "locked"
    case lost = "lost"
    case disabled = "disabled"
}

// MARK: - GPSErrorCode
// Matches shared-interfaces.md GPSErrorCode enum.

enum GPSErrorCode: String {
    case permissionDenied = "PERMISSION_DENIED"
    case gpsDisabled = "GPS_DISABLED"
    case serviceUnavailable = "SERVICE_UNAVAILABLE"
    case coldStartTimeout = "COLD_START_TIMEOUT"
    case backgroundRestricted = "BACKGROUND_RESTRICTED"
}

// MARK: - TrackingState

enum TrackingState {
    case idle
    case tracking
    case paused
}

// MARK: - RunningState

enum RunningState: String {
    case moving = "moving"
    case stationary = "stationary"
}

// MARK: - GPSError

enum GPSError: Error {
    case permissionDenied
    case gpsDisabled
    case serviceUnavailable
    case coldStartTimeout
    case backgroundRestricted
    case notTracking
    case alreadyTracking

    var code: GPSErrorCode {
        switch self {
        case .permissionDenied: return .permissionDenied
        case .gpsDisabled: return .gpsDisabled
        case .serviceUnavailable: return .serviceUnavailable
        case .coldStartTimeout: return .coldStartTimeout
        case .backgroundRestricted: return .backgroundRestricted
        case .notTracking: return .serviceUnavailable
        case .alreadyTracking: return .serviceUnavailable
        }
    }

    var localizedDescription: String {
        switch self {
        case .permissionDenied: return "Location permission denied"
        case .gpsDisabled: return "GPS is disabled"
        case .serviceUnavailable: return "Location service unavailable"
        case .coldStartTimeout: return "GPS signal acquisition timed out"
        case .backgroundRestricted: return "Background location restricted"
        case .notTracking: return "Tracking is not active"
        case .alreadyTracking: return "Tracking is already active"
        }
    }
}

// MARK: - RunSession
// Holds all mutable state for a single running session.

final class RunSession {
    private let lock = NSLock()

    private(set) var trackingState: TrackingState = .idle
    private(set) var runningState: RunningState = .moving
    private(set) var gpsStatus: GPSStatus = .searching

    private(set) var rawPoints: [RawGPSPoint] = []
    private(set) var filteredLocations: [FilteredLocation] = []

    private(set) var startTime: Date?
    private(set) var cumulativeDistance: Double = 0.0
    private(set) var lastProcessedTimestamp: Double = 0.0

    // Stationary state tracking
    private(set) var runningStateStartTime: Date = Date()

    // Cold start tracking
    private(set) var isColdStartComplete: Bool = false

    // MARK: - Thread-Safe Accessors

    func withLock<T>(_ body: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return body()
    }

    // MARK: - State Mutations (must be called within withLock)

    func setTrackingState(_ state: TrackingState) {
        trackingState = state
    }

    func setRunningState(_ state: RunningState) {
        runningState = state
        runningStateStartTime = Date()
    }

    func setGPSStatus(_ status: GPSStatus) {
        gpsStatus = status
    }

    func setColdStartComplete() {
        isColdStartComplete = true
    }

    func setStartTime(_ date: Date) {
        startTime = date
    }

    func appendRawPoint(_ point: RawGPSPoint) {
        rawPoints.append(point)
    }

    func appendFilteredLocation(_ location: FilteredLocation) {
        filteredLocations.append(location)
        cumulativeDistance = location.cumulativeDistance
    }

    func setLastProcessedTimestamp(_ timestamp: Double) {
        lastProcessedTimestamp = timestamp
    }

    func reset() {
        trackingState = .idle
        runningState = .moving
        gpsStatus = .searching
        rawPoints.removeAll()
        filteredLocations.removeAll()
        startTime = nil
        cumulativeDistance = 0.0
        lastProcessedTimestamp = 0.0
        isColdStartComplete = false
        runningStateStartTime = Date()
    }
}
