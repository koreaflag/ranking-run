import Foundation
import Combine
import WatchKit
import WatchConnectivity

class RunSessionViewModel: ObservableObject {
    @Published var state = WatchRunState()
    @Published var isPhoneReachable = false
    @Published var debugPollCount = 0
    @Published var debugLastResult = "init"
    @Published var debugActivation = "?"

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

    init() {
        setupWatchSession()
        setupHeartRateForwarding()
        startStateSyncTimer(interval: 2.0)
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
        }

        // After WCSession activates, check for state
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.isPhoneReachable = WCSession.default.isReachable
        }
    }

    private func setupHeartRateForwarding() {
        heartRateManager.onHeartRateUpdate = { [weak self] bpm in
            self?.state.heartRate = bpm
            WatchSessionService.shared.sendHeartRate(bpm)
        }

        heartRateManager.$currentHeartRate
            .receive(on: DispatchQueue.main)
            .sink { [weak self] bpm in
                self?.state.heartRate = bpm
            }
            .store(in: &cancellables)
    }

    // MARK: - Message Handlers

    private func handleLocationUpdate(_ message: [String: Any]) {
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
        let previousPhase = state.phase

        // Phase: respect phase lock from optimistic command updates
        if let phase = message[WatchMessageKeys.phase] as? String {
            if Date() >= phaseLockedUntil {
                state.phase = phase
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
            let turnIdx = state.navNextTurnDirection.isEmpty ? -1 : (state.navProgress > 0 ? Int(state.navProgress) : 0)
            // Use a simple approach: track based on distance thresholds
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

            // Reset threshold when distance increases (passed the turn, approaching next)
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
            startStateSyncTimer(interval: 3.0)  // backup polling
            if oldPhase == "paused" {
                HapticManager.shared.resumed()
            } else {
                // New run — reset anchor so timer starts fresh
                anchorDuration = 0
                anchorTime = .distantPast
                HapticManager.shared.runStarted()
            }
            restartDurationTimer()
            startHeartRateMonitoring()

        case "paused":
            startStateSyncTimer(interval: 3.0)  // backup polling
            HapticManager.shared.paused()
            stopDurationTimer()

        case "completed":
            HapticManager.shared.runCompleted()
            stopDurationTimer()
            stopHeartRateMonitoring()
            anchorDuration = 0
            anchorTime = .distantPast
            startStateSyncTimer(interval: 2.0)

        case "idle":
            stopDurationTimer()
            stopHeartRateMonitoring()
            state = WatchRunState()
            anchorDuration = 0
            anchorTime = .distantPast
            startStateSyncTimer(interval: 2.0)

        default:
            break
        }
    }

    // MARK: - Duration Timer (Server-Anchored)
    // Timer doesn't increment — it recomputes duration from server anchor.
    // display = anchorDuration + secondsSince(anchorTime)
    // Server updates reset the anchor, so drift is impossible.

    private func updateAnchorDuration(_ serverDuration: Int) {
        // Only accept if >= current anchor (reject stale poll responses)
        guard serverDuration >= anchorDuration else { return }
        anchorDuration = serverDuration
        anchorTime = Date()
        state.duration = serverDuration
    }

    private func restartDurationTimer() {
        durationTimer?.invalidate()
        // Set initial anchor if not yet set
        if anchorTime == .distantPast {
            anchorTime = Date()
            anchorDuration = state.duration
        }
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

    // MARK: - State Sync (polls Phone for current state)
    // Always runs to recover from missed state transitions.
    // Needed because updateApplicationContext/transferUserInfo don't work
    // when isWatchAppInstalled=false (dev builds via xcrun devicectl)

    private func startStateSyncTimer(interval: TimeInterval = 3.0) {
        stopStateSyncTimer()
        stateSyncTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.debugPollCount += 1
            self.isPhoneReachable = WCSession.default.isReachable
            self.debugActivation = "\(WCSession.default.activationState.rawValue)"

            WatchSessionService.shared.requestCurrentState { [weak self] reply in
                if let err = reply["error"] as? String {
                    self?.debugLastResult = "err:\(err.prefix(20))"
                } else {
                    let phase = reply["phase"] as? String ?? "nil"
                    self?.debugLastResult = "ok:\(phase)"
                }
            }
        }
    }

    /// Called from ContentView as backup polling
    func pollState() {
        debugPollCount += 1
        isPhoneReachable = WCSession.default.isReachable
        debugActivation = "\(WCSession.default.activationState.rawValue)"
        WatchSessionService.shared.requestCurrentState { [weak self] reply in
            if let err = reply["error"] as? String {
                self?.debugLastResult = "err:\(err.prefix(20))"
            } else {
                let phase = reply["phase"] as? String ?? "nil"
                self?.debugLastResult = "ok:\(phase)"
            }
        }
    }

    private func stopStateSyncTimer() {
        stateSyncTimer?.invalidate()
        stateSyncTimer = nil
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

    // MARK: - Commands to Phone (with optimistic local update)

    func sendPauseCommand() {
        let oldPhase = state.phase
        state.phase = "paused"
        phaseLockedUntil = Date().addingTimeInterval(3.0)
        handlePhaseTransition(from: oldPhase, to: "paused")
        WatchSessionService.shared.sendCommand(.pause)
    }

    func sendResumeCommand() {
        let oldPhase = state.phase
        state.phase = "running"
        phaseLockedUntil = Date().addingTimeInterval(3.0)
        handlePhaseTransition(from: oldPhase, to: "running")
        WatchSessionService.shared.sendCommand(.resume)
    }

    func sendStopCommand() {
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

    func updateReachability() {
        isPhoneReachable = WatchSessionService.shared.isPhoneReachable
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
