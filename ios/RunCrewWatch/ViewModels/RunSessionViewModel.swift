import Foundation
import Combine
import WatchKit
import WatchConnectivity

class RunSessionViewModel: ObservableObject {
    @Published var state = WatchRunState()
    @Published var isPhoneReachable = false
    @Published var isStandaloneMode = false
    @Published var pendingSyncCount = 0

    let heartRateManager = HeartRateManager()
    private var cancellables = Set<AnyCancellable>()
    private var durationTimer: Timer?
    private var stateSyncTimer: Timer?
    private var lastPhase: String = "idle"

    /// Server-anchored duration: stores the last server duration and when it was received.
    /// The local timer computes display as `anchorDuration + elapsed` instead of incrementing.
    /// This prevents cumulative drift — display is always based on server baseline.
    private var anchorDuration: Int = 0
    private var anchorTime: Date = .distantPast

    /// After sending a command (pause/resume/stop), lock phase for a short period
    /// so incoming stale poll responses don't revert the phase back.
    private var phaseLockedUntil: Date = .distantPast
    private var wasOffCourse: Bool = false
    private var lastHapticTurnIndex: Int = -1
    private var lastHapticThreshold: Double = 0

    /// Standalone mode start time for local duration tracking
    private var standaloneStartTime: Date?
    private var standalonePausedDuration: TimeInterval = 0
    private var standalonePauseStart: Date?

    init() {
        setupWatchSession()
        setupHeartRateForwarding()
        // Note: standalone location callbacks are set up lazily in startStandaloneRun()
        // to avoid initializing WatchLocationManager at app launch
        // No polling timer in idle — IdleView.onAppear triggers a single poll.
    }

    private func setupWatchSession() {
        let service = WatchSessionService.shared
        service.activate()

        service.onLocationUpdate = { [weak self] message in
            self?.handleLocationUpdate(message)
        }

        service.onStateUpdate = { [weak self] message in
            self?.handleStateUpdate(message)
        }

        service.onMilestone = { [weak self] message in
            self?.handleMilestone(message)
        }

        service.onReachabilityChange = { [weak self] reachable in
            self?.isPhoneReachable = reachable
            // When phone becomes reachable, try syncing pending runs
            if reachable {
                self?.syncPendingRuns()
            }
        }

        // After WCSession activates, check for state
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.isPhoneReachable = WCSession.default.isReachable
        }
    }

    private func setupHeartRateForwarding() {
        heartRateManager.onHeartRateUpdate = { [weak self] bpm in
            self?.state.heartRate = bpm
            if !(self?.isStandaloneMode ?? false) {
                WatchSessionService.shared.sendHeartRate(bpm)
            }
        }
    }

    private func setupStandaloneLocationCallbacks() {
        let locationMgr = WatchLocationManager.shared

        locationMgr.onLocationUpdate = { [weak self] distance, speed, pace in
            guard let self = self, self.isStandaloneMode else { return }
            self.state.distance = distance
            self.state.speed = speed
            self.state.currentPace = pace

            // Calculate avg pace
            if distance > 0, let start = self.standaloneStartTime {
                let elapsed = Date().timeIntervalSince(start) - self.standalonePausedDuration
                self.state.avgPace = Int(elapsed / (distance / 1000.0))
            }
        }

        locationMgr.onGPSStatusChange = { [weak self] status in
            guard let self = self, self.isStandaloneMode else { return }
            self.state.gpsStatus = status
        }
    }

    // MARK: - Standalone Mode

    /// Start a standalone run using the watch's own GPS.
    func startStandaloneRun() {
        print("[RunSessionVM] START standalone — phase=\(state.phase)")

        setupStandaloneLocationCallbacks()
        isStandaloneMode = true
        standaloneStartTime = Date()
        standalonePausedDuration = 0
        standalonePauseStart = nil

        let oldPhase = state.phase
        state.phase = "running"
        state.distance = 0
        state.duration = 0
        state.currentPace = 0
        state.avgPace = 0
        state.gpsStatus = "searching"

        WatchLocationManager.shared.requestPermission()
        WatchLocationManager.shared.startTracking()
        handlePhaseTransition(from: oldPhase, to: "running")
        restartStandaloneDurationTimer()
    }

    /// Pause standalone run.
    func pauseStandaloneRun() {
        let oldPhase = state.phase
        state.phase = "paused"
        standalonePauseStart = Date()
        WatchLocationManager.shared.pauseTracking()
        handlePhaseTransition(from: oldPhase, to: "paused")
    }

    /// Resume standalone run.
    func resumeStandaloneRun() {
        let oldPhase = state.phase
        state.phase = "running"
        if let pauseStart = standalonePauseStart {
            standalonePausedDuration += Date().timeIntervalSince(pauseStart)
        }
        standalonePauseStart = nil
        WatchLocationManager.shared.resumeTracking()
        handlePhaseTransition(from: oldPhase, to: "running")
        restartStandaloneDurationTimer()
    }

    /// Stop standalone run, save data, attempt sync.
    func stopStandaloneRun() {
        let oldPhase = state.phase
        state.phase = "completed"

        WatchLocationManager.shared.stopTracking()
        handlePhaseTransition(from: oldPhase, to: "completed")

        // Build and save run data
        var summary = WatchLocationManager.shared.buildRunSummary()
        summary["durationSeconds"] = state.duration

        // Save locally
        WatchRunStorage.shared.saveRun(summary)

        // Attempt to sync to phone immediately
        syncPendingRuns()

        // Reset standalone state after a delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) { [weak self] in
            self?.isStandaloneMode = false
            self?.standaloneStartTime = nil
            self?.standalonePausedDuration = 0
        }
    }

    private func restartStandaloneDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self, self.isStandaloneMode, self.state.phase == "running",
                  let start = self.standaloneStartTime else { return }
            let elapsed = Date().timeIntervalSince(start) - self.standalonePausedDuration
            self.state.duration = max(0, Int(elapsed))
        }
    }

    /// Sync all pending standalone runs to the phone.
    /// Uses transferUserInfo (queued, guaranteed delivery, handles large payloads)
    /// instead of sendMessage (which times out with large GPS data).
    func syncPendingRuns() {
        pendingSyncCount = WatchRunStorage.shared.pendingCount
        let pending = WatchRunStorage.shared.getPendingRuns()
        guard !pending.isEmpty else { return }

        print("[RunSessionVM] Syncing \(pending.count) pending run(s) to phone via transferUserInfo")

        for run in pending {
            guard let filename = run["_filename"] as? String else { continue }
            var payload = run
            payload.removeValue(forKey: "_filename")
            payload["_syncFilename"] = filename  // phone will echo this back for cleanup

            WCSession.default.transferUserInfo(payload)
            print("[RunSessionVM] Queued transferUserInfo for: \(filename)")
        }

        // Remove locally after queueing — transferUserInfo guarantees delivery
        for run in pending {
            if let filename = run["_filename"] as? String {
                WatchRunStorage.shared.removeRun(filename: filename)
            }
        }

        DispatchQueue.main.async { [weak self] in
            self?.pendingSyncCount = WatchRunStorage.shared.pendingCount
        }
    }

    // MARK: - Message Handlers

    private func handleLocationUpdate(_ message: [String: Any]) {
        // Skip phone location updates when in standalone mode
        guard !isStandaloneMode else { return }

        if let distance = message[WatchMessageKeys.distanceFromStart] as? Double {
            state.distance = distance
        } else if let distance = message[WatchMessageKeys.distance] as? Double {
            state.distance = distance
        }
        if let speed = message[WatchMessageKeys.speed] as? Double {
            state.speed = speed
            if speed > 0.3 {
                state.currentPace = Int(1000.0 / speed)
            }
        }
        if let gpsStatus = message[WatchMessageKeys.gpsStatus] as? String {
            state.gpsStatus = gpsStatus
        }
        if let isMoving = message[WatchMessageKeys.isMoving] as? Bool {
            state.isMoving = isMoving
        }
        if let cadence = message[WatchMessageKeys.cadence] as? Int {
            state.cadence = cadence
        } else if let cadence = message[WatchMessageKeys.cadence] as? Double {
            state.cadence = Int(cadence)
        }

        // Course navigation fields
        if let isCourseRun = message[WatchMessageKeys.isCourseRun] as? Bool {
            state.isCourseRun = isCourseRun
        }
        if let navBearing = message[WatchMessageKeys.navBearing] as? Double {
            state.navBearing = navBearing
        }
        if let navRemainingDistance = message[WatchMessageKeys.navRemainingDistance] as? Double {
            state.navRemainingDistance = navRemainingDistance
        }
        if let navDeviation = message[WatchMessageKeys.navDeviation] as? Double {
            state.navDeviation = navDeviation
        }
        if let navDirection = message[WatchMessageKeys.navDirection] as? String {
            state.navDirection = navDirection
        }
        if let navProgress = message[WatchMessageKeys.navProgress] as? Double {
            state.navProgress = navProgress
        }
        if let navIsOffCourse = message[WatchMessageKeys.navIsOffCourse] as? Bool {
            state.navIsOffCourse = navIsOffCourse
        }
        if let navNextTurnDirection = message[WatchMessageKeys.navNextTurnDirection] as? String {
            state.navNextTurnDirection = navNextTurnDirection
        }
        if let navDistanceToNextTurn = message[WatchMessageKeys.navDistanceToNextTurn] as? Double {
            state.navDistanceToNextTurn = navDistanceToNextTurn
        }
    }

    private func handleStateUpdate(_ message: [String: Any]) {
        // Skip phone state updates when in standalone mode
        guard !isStandaloneMode else { return }

        let previousPhase = state.phase
        let incomingPhase = message[WatchMessageKeys.phase] as? String ?? "nil"
        print("[RunSessionVM] handleStateUpdate: incoming=\(incomingPhase) current=\(previousPhase) locked=\(Date() < phaseLockedUntil)")

        // Phase: respect phase lock from optimistic command updates
        if let phase = message[WatchMessageKeys.phase] as? String {
            if Date() >= phaseLockedUntil {
                state.phase = phase
                print("[RunSessionVM] phase SET → \(phase)")
            } else if phase == state.phase {
                // Server confirmed our optimistic update — unlock early
                phaseLockedUntil = .distantPast
            }
            // Otherwise: locked, ignore stale phase from server
        }

        if let distance = message[WatchMessageKeys.distanceMeters] as? Double {
            state.distance = distance
        }

        // Duration: server-anchored approach.
        // Accept server value if it's >= our anchor (reject stale polls).
        // Update anchor point so local timer computes from this baseline.
        if let duration = message[WatchMessageKeys.durationSeconds] as? Int {
            updateAnchorDuration(duration)
        } else if let duration = message[WatchMessageKeys.durationSeconds] as? Double {
            updateAnchorDuration(Int(duration))
        }

        if let currentPace = message[WatchMessageKeys.currentPace] as? Int {
            state.currentPace = currentPace
        } else if let currentPace = message[WatchMessageKeys.currentPace] as? Double {
            state.currentPace = Int(currentPace)
        }
        if let avgPace = message[WatchMessageKeys.avgPace] as? Int {
            state.avgPace = avgPace
        } else if let avgPace = message[WatchMessageKeys.avgPace] as? Double {
            state.avgPace = Int(avgPace)
        }
        if let gpsStatus = message[WatchMessageKeys.gpsStatus] as? String {
            state.gpsStatus = gpsStatus
        }
        if let calories = message[WatchMessageKeys.calories] as? Int {
            state.calories = calories
        } else if let calories = message[WatchMessageKeys.calories] as? Double {
            state.calories = Int(calories)
        }
        if let cadence = message[WatchMessageKeys.cadence] as? Int {
            state.cadence = cadence
        } else if let cadence = message[WatchMessageKeys.cadence] as? Double {
            state.cadence = Int(cadence)
        }
        if let sessionId = message[WatchMessageKeys.sessionId] as? String {
            state.sessionId = sessionId
        }

        // Course navigation fields
        if let isCourseRun = message[WatchMessageKeys.isCourseRun] as? Bool {
            state.isCourseRun = isCourseRun
        }
        if let navBearing = message[WatchMessageKeys.navBearing] as? Double {
            state.navBearing = navBearing
        }
        if let navRemainingDistance = message[WatchMessageKeys.navRemainingDistance] as? Double {
            state.navRemainingDistance = navRemainingDistance
        }
        if let navDeviation = message[WatchMessageKeys.navDeviation] as? Double {
            state.navDeviation = navDeviation
        }
        if let navDirection = message[WatchMessageKeys.navDirection] as? String {
            state.navDirection = navDirection
        }
        if let navProgress = message[WatchMessageKeys.navProgress] as? Double {
            state.navProgress = navProgress
        }
        if let navIsOffCourse = message[WatchMessageKeys.navIsOffCourse] as? Bool {
            state.navIsOffCourse = navIsOffCourse
        }
        if let navNextTurnDirection = message[WatchMessageKeys.navNextTurnDirection] as? String {
            state.navNextTurnDirection = navNextTurnDirection
        }
        if let navDistanceToNextTurn = message[WatchMessageKeys.navDistanceToNextTurn] as? Double {
            state.navDistanceToNextTurn = navDistanceToNextTurn
        }

        handlePhaseTransition(from: previousPhase, to: state.phase)

        // Off-course haptic
        if state.navIsOffCourse && !wasOffCourse {
            HapticManager.shared.offCourse()
        } else if !state.navIsOffCourse && wasOffCourse {
            HapticManager.shared.backOnCourse()
        }
        wasOffCourse = state.navIsOffCourse

        // Turn approach haptics
        if state.navDistanceToNextTurn >= 0 && state.isCourseRun {
            if state.navDistanceToNextTurn <= 20 && lastHapticThreshold < 20 {
                triggerTurnHaptic(direction: state.navNextTurnDirection)
                lastHapticThreshold = 20
            } else if state.navDistanceToNextTurn <= 100 && state.navDistanceToNextTurn > 20 && lastHapticThreshold < 100 {
                HapticManager.shared.turnApproaching()
                lastHapticThreshold = 100
            } else if state.navDistanceToNextTurn <= 200 && state.navDistanceToNextTurn > 100 && lastHapticThreshold < 200 {
                HapticManager.shared.turnApproaching()
                lastHapticThreshold = 200
            }

            if state.navDistanceToNextTurn > 200 {
                lastHapticThreshold = 0
            }
        }
    }

    private func handleMilestone(_ message: [String: Any]) {
        if let km = message[WatchMessageKeys.kilometer] as? Int {
            state.lastMilestoneKm = km
        }
        if let splitPace = message[WatchMessageKeys.splitPace] as? Int {
            state.lastMilestoneSplitPace = splitPace
        }
        HapticManager.shared.milestone()
    }

    private func handlePhaseTransition(from oldPhase: String, to newPhase: String) {
        guard oldPhase != newPhase else { return }
        lastPhase = newPhase

        switch newPhase {
        case "running":
            if !isStandaloneMode {
                startReachabilityTimer()
            }
            if oldPhase == "paused" {
                HapticManager.shared.resumed()
            } else {
                anchorDuration = 0
                anchorTime = .distantPast
                HapticManager.shared.runStarted()
            }
            if !isStandaloneMode {
                restartDurationTimer()
            }
            startHeartRateMonitoring()

        case "paused":
            HapticManager.shared.paused()
            stopDurationTimer()

        case "completed":
            HapticManager.shared.runCompleted()
            stopDurationTimer()
            stopHeartRateMonitoring()
            anchorDuration = 0
            anchorTime = .distantPast

        case "idle":
            stopDurationTimer()
            stopHeartRateMonitoring()
            state = WatchRunState()
            isStandaloneMode = false
            anchorDuration = 0
            anchorTime = .distantPast
            stopReachabilityTimer()

        default:
            break
        }
    }

    // MARK: - Duration Timer (Server-Anchored, companion mode only)

    private func updateAnchorDuration(_ serverDuration: Int) {
        guard !isStandaloneMode else { return }
        guard serverDuration >= anchorDuration else { return }
        anchorDuration = serverDuration
        anchorTime = Date()
        state.duration = serverDuration
    }

    private func restartDurationTimer() {
        durationTimer?.invalidate()
        // Always re-anchor to current duration on restart.
        // This prevents pause time from being counted — without this,
        // resuming after a 4s pause would jump duration by 4s.
        anchorTime = Date()
        anchorDuration = state.duration
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self, self.state.phase == "running" else { return }
            let elapsed = Int(Date().timeIntervalSince(self.anchorTime))
            self.state.duration = self.anchorDuration + elapsed
        }
    }

    private func stopDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
    }

    // MARK: - Reachability Sync
    // No polling timer — phone pushes all state via applicationContext/transferUserInfo/sendMessage.
    // The watch only updates isPhoneReachable periodically to show connection status.

    private func startReachabilityTimer() {
        stopReachabilityTimer()
        stateSyncTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.isPhoneReachable = WCSession.default.isReachable
        }
    }

    private func stopReachabilityTimer() {
        stateSyncTimer?.invalidate()
        stateSyncTimer = nil
    }

    func updateReachabilityStatus() {
        isPhoneReachable = WCSession.default.isReachable
    }

    // MARK: - Heart Rate

    private func startHeartRateMonitoring() {
        heartRateManager.requestAuthorization { [weak self] granted in
            guard granted else { return }
            self?.heartRateManager.startWorkoutSession()
        }
    }

    private func stopHeartRateMonitoring() {
        heartRateManager.stopWorkoutSession()
    }

    // MARK: - Commands to Phone (companion mode, with optimistic local update)

    func sendStartCommand() {
        let oldPhase = state.phase
        state.phase = "running"
        phaseLockedUntil = Date().addingTimeInterval(5.0)
        handlePhaseTransition(from: oldPhase, to: "running")
        WatchSessionService.shared.sendCommand(.start)
    }

    func sendPauseCommand() {
        if isStandaloneMode {
            pauseStandaloneRun()
            return
        }
        let oldPhase = state.phase
        state.phase = "paused"
        phaseLockedUntil = Date().addingTimeInterval(3.0)
        handlePhaseTransition(from: oldPhase, to: "paused")
        WatchSessionService.shared.sendCommand(.pause)
    }

    func sendResumeCommand() {
        if isStandaloneMode {
            resumeStandaloneRun()
            return
        }
        let oldPhase = state.phase
        state.phase = "running"
        phaseLockedUntil = Date().addingTimeInterval(3.0)
        handlePhaseTransition(from: oldPhase, to: "running")
        WatchSessionService.shared.sendCommand(.resume)
    }

    func sendStopCommand() {
        if isStandaloneMode {
            stopStandaloneRun()
            return
        }
        let oldPhase = state.phase
        state.phase = "completed"
        phaseLockedUntil = Date().addingTimeInterval(3.0)
        handlePhaseTransition(from: oldPhase, to: "completed")
        WatchSessionService.shared.sendCommand(.stop)
    }

    // MARK: - Formatters

    func formattedDuration() -> String {
        let hours = state.duration / 3600
        let minutes = (state.duration % 3600) / 60
        let seconds = state.duration % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }

    func formattedDistance() -> String {
        let km = state.distance / 1000.0
        return String(format: "%.2f", km)
    }

    func formattedPace() -> String {
        guard state.currentPace > 0 && state.currentPace < 3600 else { return "--'--\"" }
        let minutes = state.currentPace / 60
        let seconds = state.currentPace % 60
        return String(format: "%d'%02d\"", minutes, seconds)
    }

    func formattedAvgPace() -> String {
        guard state.avgPace > 0 && state.avgPace < 3600 else { return "--'--\"" }
        let minutes = state.avgPace / 60
        let seconds = state.avgPace % 60
        return String(format: "%d'%02d\"", minutes, seconds)
    }

    func formattedHeartRate() -> String {
        guard state.heartRate > 0 else { return "--" }
        return String(format: "%.0f", state.heartRate)
    }

    func formattedCadence() -> String {
        guard state.cadence > 0 else { return "--" }
        return "\(state.cadence)"
    }

    func formattedCalories() -> String {
        guard state.calories > 0 else { return "--" }
        return "\(state.calories)"
    }

    // updateReachability removed — use updateReachabilityStatus() instead

    /// Reset to idle state (used by CompletedView "확인" button)
    func resetToIdle() {
        let oldPhase = state.phase
        handlePhaseTransition(from: oldPhase, to: "idle")
    }

    // MARK: - Course Navigation Formatters

    func formattedRemainingDistance() -> String {
        guard state.navRemainingDistance >= 0 else { return "--" }
        let km = state.navRemainingDistance / 1000.0
        return String(format: "%.1f", km)
    }

    func localizedDirection() -> String {
        switch state.navDirection {
        case "straight": return "직진"
        case "left": return "좌회전"
        case "right": return "우회전"
        case "u-turn": return "유턴"
        default: return ""
        }
    }

    func localizedDetailedDirection() -> String {
        switch state.navNextTurnDirection {
        case "slight-left": return "약간 좌회전"
        case "left": return "좌회전"
        case "sharp-left": return "크게 좌회전"
        case "slight-right": return "약간 우회전"
        case "right": return "우회전"
        case "sharp-right": return "크게 우회전"
        case "u-turn": return "유턴"
        case "straight": return "직진"
        default: return localizedDirection()
        }
    }

    func formattedDistanceToNextTurn() -> String {
        guard state.navDistanceToNextTurn >= 0 else { return "" }
        if state.navDistanceToNextTurn >= 1000 {
            return String(format: "%.1fkm", state.navDistanceToNextTurn / 1000.0)
        }
        return String(format: "%.0fm", state.navDistanceToNextTurn)
    }

    private func triggerTurnHaptic(direction: String) {
        switch direction {
        case "slight-left", "left", "sharp-left":
            HapticManager.shared.turnLeft()
        case "slight-right", "right", "sharp-right":
            HapticManager.shared.turnRight()
        case "u-turn":
            HapticManager.shared.uTurn()
        default:
            HapticManager.shared.turnApproaching()
        }
    }
}
