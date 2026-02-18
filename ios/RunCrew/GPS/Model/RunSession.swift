import Foundation

/// Running session state management
class RunSession {
    enum State: String {
        case idle
        case starting   // Cold start, waiting for GPS lock
        case running
        case paused
        case stopped
    }

    private(set) var state: State = .idle
    private(set) var startTime: Date?
    private(set) var rawPoints: [GPSPoint] = []
    private(set) var filteredLocations: [FilteredLocation] = []
    private(set) var totalDistance: Double = 0   // meters
    private(set) var elapsedTime: TimeInterval = 0
    private(set) var pausedTime: TimeInterval = 0

    private var lastResumeTime: Date?
    private var accumulatedTimeBeforePause: TimeInterval = 0

    func start() {
        state = .starting
        startTime = Date()
        lastResumeTime = Date()
        rawPoints.removeAll()
        filteredLocations.removeAll()
        totalDistance = 0
        elapsedTime = 0
        pausedTime = 0
        accumulatedTimeBeforePause = 0
    }

    func markLocked() {
        state = .running
    }

    func pause() {
        guard state == .running else { return }
        state = .paused
        if let resumeTime = lastResumeTime {
            accumulatedTimeBeforePause += Date().timeIntervalSince(resumeTime)
        }
        lastResumeTime = nil
    }

    func resume() {
        guard state == .paused else { return }
        state = .running
        lastResumeTime = Date()
    }

    func stop() {
        if state == .running, let resumeTime = lastResumeTime {
            accumulatedTimeBeforePause += Date().timeIntervalSince(resumeTime)
        }
        state = .stopped
        elapsedTime = accumulatedTimeBeforePause
    }

    func addRawPoint(_ point: GPSPoint) {
        rawPoints.append(point)
    }

    func addFilteredLocation(_ location: FilteredLocation) {
        filteredLocations.append(location)
        totalDistance = location.cumulativeDistance
    }

    func getCurrentElapsedTime() -> TimeInterval {
        switch state {
        case .running:
            let current = lastResumeTime.map { Date().timeIntervalSince($0) } ?? 0
            return accumulatedTimeBeforePause + current
        case .paused:
            return accumulatedTimeBeforePause
        default:
            return elapsedTime
        }
    }
}
