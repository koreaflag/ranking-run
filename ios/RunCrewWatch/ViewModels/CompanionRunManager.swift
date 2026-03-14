import Foundation
import WatchConnectivity

/// Manages companion mode (phone-paired) logic: receiving state updates,
/// processing phone messages, phase synchronization, and polling.
class CompanionRunManager {

    // MARK: - Dependencies

    private weak var timerManager: WatchTimerManager?

    /// Closure to read/write the shared WatchRunState.
    var getState: (() -> WatchRunState)?
    var updateState: ((@escaping (inout WatchRunState) -> Void) -> Void)?
    /// Closure to notify ViewModel of phase transitions.
    var onPhaseTransition: ((_ from: String, _ to: String) -> Void)?
    /// Check if currently in standalone mode.
    var isStandaloneMode: (() -> Bool)?
    /// Closure to exit standalone mode (when phone starts a new run).
    var exitStandaloneMode: (() -> Void)?
    /// Closure to update isPhoneReachable on ViewModel.
    var setPhoneReachable: ((Bool) -> Void)?
    /// Closure to get/set phaseLockedUntil.
    var getPhaseLockedUntil: (() -> Date)?
    var setPhaseLockedUntil: ((Date) -> Void)?

    // MARK: - Haptic State

    private var wasOffCourse: Bool = false
    private var lastHapticThreshold: Double = 0

    /// Session ID of the current run. Used to detect new runs and reset stale state.
    private var currentSessionId: String?

    // MARK: - Init

    init(timerManager: WatchTimerManager) {
        self.timerManager = timerManager
    }

    // MARK: - Message Handlers

    func handleLocationUpdate(_ message: [String: Any]) {
        guard isStandaloneMode?() == false else { return }

        updateState?({ state in
            // During countdown or when distance is 0 (new run), allow any distance value.
            // Otherwise only accept monotonically increasing values.
            let isNewRun = state.phase == "countdown" || state.distance == 0
            if let distance = message[WatchMessageKeys.distanceFromStart] as? Double,
               isNewRun || distance >= state.distance {
                state.distance = distance
            } else if let distance = message[WatchMessageKeys.distance] as? Double,
                      isNewRun || distance >= state.distance {
                state.distance = distance
            }

            // Feed distance to workout session for HealthKit recording
            if #available(watchOS 10, *) {
                WorkoutMirroringManager.shared.updateDistance(state.distance)
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
            if let v = message[WatchMessageKeys.isCourseRun] as? Bool { state.isCourseRun = v }
            if let v = message[WatchMessageKeys.navBearing] as? Double { state.navBearing = v }
            if let v = message[WatchMessageKeys.navRemainingDistance] as? Double { state.navRemainingDistance = v }
            if let v = message[WatchMessageKeys.navDeviation] as? Double { state.navDeviation = v }
            if let v = message[WatchMessageKeys.navDirection] as? String { state.navDirection = v }
            if let v = message[WatchMessageKeys.navProgress] as? Double { state.navProgress = v }
            if let v = message[WatchMessageKeys.navIsOffCourse] as? Bool { state.navIsOffCourse = v }
            if let v = message[WatchMessageKeys.navNextTurnDirection] as? String { state.navNextTurnDirection = v }
            if let v = message[WatchMessageKeys.navDistanceToNextTurn] as? Double { state.navDistanceToNextTurn = v }
        })
    }

    func handleStateUpdate(_ message: [String: Any]) {
        // In standalone mode, ignore phone updates UNLESS the phone starts a new run.
        if isStandaloneMode?() == true {
            if let phase = message[WatchMessageKeys.phase] as? String,
               phase == "running" || phase == "countdown" {
                print("[CompanionRunManager] Phone started new run — exiting standalone mode")
                exitStandaloneMode?()
            } else {
                return
            }
        }

        guard var currentState = getState?() else { return }
        let previousPhase = currentState.phase
        let incomingPhase = message[WatchMessageKeys.phase] as? String ?? "nil"
        let phaseLockedUntil = getPhaseLockedUntil?() ?? .distantPast
        print("[CompanionRunManager] handleStateUpdate: incoming=\(incomingPhase) current=\(previousPhase) locked=\(Date() < phaseLockedUntil)")

        // Block stale "completed"/"paused" from showing when app starts fresh.
        if previousPhase == "idle" || previousPhase == "" {
            if incomingPhase == "completed" || incomingPhase == "paused" {
                print("[CompanionRunManager] BLOCKED stale \(incomingPhase) — currently idle")
                return
            }
        }

        // Phase: respect phase lock
        if let phase = message[WatchMessageKeys.phase] as? String {
            let isNewRunSignal = phase == "countdown"
            let isCountdownToRunning = phase == "running" && currentState.phase == "countdown"
            if isNewRunSignal || isCountdownToRunning || Date() >= phaseLockedUntil {
                if phase != currentState.phase {
                    currentState.phase = phase
                    if !isCountdownToRunning {
                        setPhaseLockedUntil?(Date().addingTimeInterval(5.0))
                    }
                    print("[CompanionRunManager] phase SET → \(phase) (locked=\(!isCountdownToRunning))")
                }
            } else {
                print("[CompanionRunManager] phase BLOCKED \(phase) (locked until \(phaseLockedUntil.timeIntervalSinceNow)s)")
            }
        }

        // Detect new session: if sessionId changed, this is a new run.
        // Reset distance tracking so the new run's smaller values are accepted.
        let incomingSessionId = message[WatchMessageKeys.sessionId] as? String
        let isNewSession: Bool
        if let incomingId = incomingSessionId, !incomingId.isEmpty,
           incomingId != currentSessionId {
            currentSessionId = incomingId
            isNewSession = true
            print("[CompanionRunManager] New session detected: \(incomingId)")
        } else if currentState.phase == "countdown" {
            // Countdown always indicates a new run, even without sessionId
            isNewSession = true
        } else {
            isNewSession = false
        }

        // Distance: allow reset to lower values when a new session starts
        if let distance = message[WatchMessageKeys.distanceMeters] as? Double {
            if isNewSession || distance >= currentState.distance {
                currentState.distance = distance
                if #available(watchOS 10, *) {
                    WorkoutMirroringManager.shared.updateDistance(distance)
                }
            }
        }

        // Duration: server-anchored
        if let duration = message[WatchMessageKeys.durationSeconds] as? Int {
            if isStandaloneMode?() != true {
                timerManager?.updateAnchorDuration(duration)
                currentState.duration = duration
            }
        } else if let duration = message[WatchMessageKeys.durationSeconds] as? Double {
            if isStandaloneMode?() != true {
                timerManager?.updateAnchorDuration(Int(duration))
                currentState.duration = Int(duration)
            }
        }

        // Pace
        if let v = message[WatchMessageKeys.currentPace] as? Int { currentState.currentPace = v }
        else if let v = message[WatchMessageKeys.currentPace] as? Double { currentState.currentPace = Int(v) }
        if let v = message[WatchMessageKeys.avgPace] as? Int { currentState.avgPace = v }
        else if let v = message[WatchMessageKeys.avgPace] as? Double { currentState.avgPace = Int(v) }

        // GPS, calories, cadence
        if let v = message[WatchMessageKeys.gpsStatus] as? String { currentState.gpsStatus = v }
        if let v = message[WatchMessageKeys.calories] as? Int { currentState.calories = v }
        else if let v = message[WatchMessageKeys.calories] as? Double { currentState.calories = Int(v) }
        if let v = message[WatchMessageKeys.cadence] as? Int { currentState.cadence = v }
        else if let v = message[WatchMessageKeys.cadence] as? Double { currentState.cadence = Int(v) }
        if let v = message[WatchMessageKeys.sessionId] as? String { currentState.sessionId = v }

        // Countdown sync
        if let v = message[WatchMessageKeys.countdownStartedAt] as? Double { currentState.countdownStartedAt = v }
        if let v = message[WatchMessageKeys.countdownTotal] as? Int { currentState.countdownTotal = v }
        else if let v = message[WatchMessageKeys.countdownTotal] as? Double { currentState.countdownTotal = Int(v) }

        // Auto-pause
        if let isAutoPaused = message[WatchMessageKeys.isAutoPaused] as? Bool {
            let wasAutoPaused = currentState.isAutoPaused
            currentState.isAutoPaused = isAutoPaused
            if wasAutoPaused != isAutoPaused {
                timerManager?.anchorDuration = currentState.duration
                timerManager?.anchorTime = Date()
            }
        }

        // Run goal
        if let v = message[WatchMessageKeys.goalType] as? String { currentState.goalType = v }
        if let v = message[WatchMessageKeys.goalValue] as? Double { currentState.goalValue = v }
        else if let v = message[WatchMessageKeys.goalValue] as? Int { currentState.goalValue = Double(v) }

        // Program running fields
        if let v = message[WatchMessageKeys.programTargetDistance] as? Double { currentState.programTargetDistance = v }
        else if let v = message[WatchMessageKeys.programTargetDistance] as? Int { currentState.programTargetDistance = Double(v) }
        if let v = message[WatchMessageKeys.programTargetTime] as? Double { currentState.programTargetTime = v }
        else if let v = message[WatchMessageKeys.programTargetTime] as? Int { currentState.programTargetTime = Double(v) }
        if let v = message[WatchMessageKeys.programTimeDelta] as? Double { currentState.programTimeDelta = v }
        if let v = message[WatchMessageKeys.programRequiredPace] as? Int { currentState.programRequiredPace = v }
        else if let v = message[WatchMessageKeys.programRequiredPace] as? Double { currentState.programRequiredPace = Int(v) }
        if let v = message[WatchMessageKeys.programStatus] as? String {
            if !v.isEmpty && v != currentState.programStatus && currentState.phase == "running" {
                HapticManager.shared.paceAlert(status: v, timeDelta: currentState.programTimeDelta)
            }
            currentState.programStatus = v
        }
        if let v = message[WatchMessageKeys.metronomeBPM] as? Int {
            let oldBPM = currentState.metronomeBPM
            currentState.metronomeBPM = v
            if v > 0 && oldBPM != v && currentState.phase == "running" {
                HapticManager.shared.startCadenceHaptic(bpm: v)
            } else if v == 0 && oldBPM > 0 {
                HapticManager.shared.stopCadenceHaptic()
            }
        }

        // Course navigation fields
        if let v = message[WatchMessageKeys.isCourseRun] as? Bool { currentState.isCourseRun = v }
        if let v = message[WatchMessageKeys.navBearing] as? Double { currentState.navBearing = v }
        if let v = message[WatchMessageKeys.navRemainingDistance] as? Double { currentState.navRemainingDistance = v }
        if let v = message[WatchMessageKeys.navDeviation] as? Double { currentState.navDeviation = v }
        if let v = message[WatchMessageKeys.navDirection] as? String { currentState.navDirection = v }
        if let v = message[WatchMessageKeys.navProgress] as? Double { currentState.navProgress = v }
        if let v = message[WatchMessageKeys.navIsOffCourse] as? Bool { currentState.navIsOffCourse = v }
        if let v = message[WatchMessageKeys.navNextTurnDirection] as? String { currentState.navNextTurnDirection = v }
        if let v = message[WatchMessageKeys.navDistanceToNextTurn] as? Double { currentState.navDistanceToNextTurn = v }

        // Navigate-to-start fields
        if let v = message[WatchMessageKeys.navToStartBearing] as? Double { currentState.navToStartBearing = v }
        if let v = message[WatchMessageKeys.navToStartDistance] as? Double { currentState.navToStartDistance = v }
        if let v = message[WatchMessageKeys.navToStartReady] as? Bool {
            let wasReady = currentState.navToStartReady
            currentState.navToStartReady = v
            if v && !wasReady {
                HapticManager.shared.arrivedAtStart()
            }
        }

        // Checkpoint progress
        if let v = message[WatchMessageKeys.cpPassed] as? Int { currentState.cpPassed = v }
        else if let v = message[WatchMessageKeys.cpPassed] as? Double { currentState.cpPassed = Int(v) }
        if let v = message[WatchMessageKeys.cpTotal] as? Int { currentState.cpTotal = v }
        else if let v = message[WatchMessageKeys.cpTotal] as? Double { currentState.cpTotal = Int(v) }
        if let v = message[WatchMessageKeys.cpJustPassed] as? Bool {
            let wasPassed = currentState.cpJustPassed
            currentState.cpJustPassed = v
            if v && !wasPassed {
                HapticManager.shared.checkpointPassed()
            }
        }

        // Apply all state changes at once
        updateState?({ state in
            state = currentState
        })

        onPhaseTransition?(previousPhase, currentState.phase)

        // Off-course haptic
        if currentState.navIsOffCourse && !wasOffCourse {
            HapticManager.shared.offCourse()
        } else if !currentState.navIsOffCourse && wasOffCourse {
            HapticManager.shared.backOnCourse()
        }
        wasOffCourse = currentState.navIsOffCourse

        // Turn approach haptics
        if currentState.navDistanceToNextTurn >= 0 && currentState.isCourseRun {
            if currentState.navDistanceToNextTurn <= 20 && lastHapticThreshold != 20 {
                triggerTurnHaptic(direction: currentState.navNextTurnDirection)
                lastHapticThreshold = 20
            } else if currentState.navDistanceToNextTurn <= 100 && currentState.navDistanceToNextTurn > 20 && lastHapticThreshold != 100 && lastHapticThreshold != 20 {
                HapticManager.shared.turnApproaching()
                lastHapticThreshold = 100
            } else if currentState.navDistanceToNextTurn <= 200 && currentState.navDistanceToNextTurn > 100 && lastHapticThreshold != 200 && lastHapticThreshold != 100 && lastHapticThreshold != 20 {
                HapticManager.shared.turnApproaching()
                lastHapticThreshold = 200
            }

            if currentState.navDistanceToNextTurn > 200 {
                lastHapticThreshold = 0
            }
        }
    }

    func handleMilestone(_ message: [String: Any]) {
        updateState?({ state in
            if let km = message[WatchMessageKeys.kilometer] as? Int {
                state.lastMilestoneKm = km
            }
            if let splitPace = message[WatchMessageKeys.splitPace] as? Int {
                state.lastMilestoneSplitPace = splitPace
            }
        })
        HapticManager.shared.milestone()
    }

    /// Handle phase change from HKWorkoutSession mirroring.
    func handleMirroredPhaseChange(from oldPhase: String, to newPhase: String) {
        guard let state = getState?(), newPhase != state.phase else { return }
        print("[CompanionRunManager] MIRRORED phase: \(oldPhase)→\(newPhase)")

        let previousPhase = state.phase
        updateState?({ state in
            state.phase = newPhase
        })
        setPhaseLockedUntil?(Date().addingTimeInterval(5.0))
        onPhaseTransition?(previousPhase, newPhase)
    }

    // MARK: - Reset

    /// Reset internal state for a new run. Called when a new session starts
    /// to prevent stale data from the previous run bleeding through.
    func resetForNewRun() {
        wasOffCourse = false
        lastHapticThreshold = 0
        currentSessionId = nil
        print("[CompanionRunManager] resetForNewRun: internal state cleared")
    }

    // MARK: - Polling

    func pollPhoneState() {
        guard isStandaloneMode?() != true else { return }
        WatchSessionService.shared.requestCurrentState { [weak self] reply in
            guard let self = self, let reply = reply else { return }
            self.handleStateUpdate(reply)
            self.handleLocationUpdate(reply)
        }
    }

    /// Aggressively poll phone state after countdown finishes.
    func requestImmediateStateSync() {
        guard isStandaloneMode?() != true else { return }
        var attempts = 0
        let maxAttempts = 25

        func poll() {
            guard attempts < maxAttempts, self.getState?().phase == "countdown" else { return }
            attempts += 1
            self.pollPhoneState()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                poll()
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            poll()
        }
    }

    // MARK: - Commands to Phone

    func sendStartCommand() {
        var oldPhase = "idle"
        updateState?({ state in
            oldPhase = state.phase
            state.phase = "running"
        })
        setPhaseLockedUntil?(Date().addingTimeInterval(5.0))
        onPhaseTransition?(oldPhase, "running")
        WatchSessionService.shared.sendCommand(.start)
    }

    func sendPauseCommand() {
        var oldPhase = "running"
        updateState?({ state in
            oldPhase = state.phase
            state.phase = "paused"
        })
        setPhaseLockedUntil?(Date().addingTimeInterval(5.0))
        onPhaseTransition?(oldPhase, "paused")

        if #available(watchOS 10, *) {
            if WorkoutMirroringManager.shared.isSessionActive {
                WorkoutMirroringManager.shared.pauseRun()
            }
        }
        WatchSessionService.shared.sendCommand(.pause)
        pollAfterCommand()
    }

    func sendResumeCommand() {
        var oldPhase = "paused"
        updateState?({ state in
            oldPhase = state.phase
            state.phase = "running"
        })
        setPhaseLockedUntil?(Date().addingTimeInterval(5.0))
        onPhaseTransition?(oldPhase, "running")

        if #available(watchOS 10, *) {
            if WorkoutMirroringManager.shared.isSessionActive {
                WorkoutMirroringManager.shared.resumeRun()
            }
        }
        WatchSessionService.shared.sendCommand(.resume)
        pollAfterCommand()
    }

    func sendStopCommand() {
        var oldPhase = "running"
        updateState?({ state in
            oldPhase = state.phase
            state.phase = "completed"
        })
        setPhaseLockedUntil?(Date().addingTimeInterval(5.0))
        onPhaseTransition?(oldPhase, "completed")

        if #available(watchOS 10, *) {
            if WorkoutMirroringManager.shared.isSessionActive {
                WorkoutMirroringManager.shared.stopRun()
            }
        }
        WatchSessionService.shared.sendCommand(.stop)
        pollAfterCommand()
    }

    private func pollAfterCommand() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.pollPhoneState()
        }
    }

    // MARK: - Helpers

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

    // MARK: - Diagnostics

    struct SessionDiagnostics {
        var isSupported: Bool
        var isActivated: Bool
        var isReachable: Bool
        var isCompanionAppInstalled: Bool
        var activationStateRaw: Int
    }

    func getSessionDiagnostics() -> SessionDiagnostics {
        let supported = WCSession.isSupported()
        let session = WCSession.default
        return SessionDiagnostics(
            isSupported: supported,
            isActivated: supported && session.activationState == .activated,
            isReachable: supported && session.isReachable,
            isCompanionAppInstalled: supported && session.isCompanionAppInstalled,
            activationStateRaw: supported ? session.activationState.rawValue : -1
        )
    }
}
