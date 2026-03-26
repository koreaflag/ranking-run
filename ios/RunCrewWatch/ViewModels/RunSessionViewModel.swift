import Foundation
import Combine
import WatchKit
import WatchConnectivity

class RunSessionViewModel: ObservableObject {
    @Published var state = WatchRunState()
    @Published var isPhoneReachable = false
    @Published var isStandaloneMode = false
    @Published var pendingSyncCount = 0

    /// Cooldown after idle transition: block all external state updates for 3 seconds
    /// to prevent stale WCSession/mirroring callbacks from restarting a phantom run.
    private(set) var idleCooldownUntil: Date = .distantPast
    var isInIdleCooldown: Bool { Date() < idleCooldownUntil }

    // Standalone run settings (forwarded from settingsManager)
    @Published var standaloneGoalType: String
    @Published var standaloneGoalDistance: Double
    @Published var standaloneGoalTime: Int
    @Published var standaloneGoalTargetTime: Int
    @Published var standaloneIntervalRunSec: Int
    @Published var standaloneIntervalWalkSec: Int
    @Published var standaloneIntervalSets: Int
    @Published var isIndoorRun: Bool
    @Published var isAutoPauseEnabled: Bool
    @Published var isVoiceGuidanceEnabled: Bool
    @Published var voiceFrequencyKm: Double
    @Published var isCountdownEnabled: Bool

    // Weekly activity
    @Published var weeklyGoalKm: Double
    @Published var weeklyDistanceKm: Double = 0
    @Published var weeklyRunCount: Int = 0

    let heartRateManager = HeartRateManager()

    // MARK: - Managers

    let settingsManager: WatchSettingsManager
    let timerManager: WatchTimerManager
    let standaloneManager: StandaloneRunManager
    let companionManager: CompanionRunManager

    // MARK: - Private State

    private var cancellables = Set<AnyCancellable>()
    private var lastPhase: String = "idle"
    private var phaseLockedUntil: Date = .distantPast

    /// Whether HKWorkoutSession mirroring is active (watchOS 10+, companion mode)
    private var isMirroringActive: Bool {
        if #available(watchOS 10, *) {
            return WorkoutMirroringManager.shared.isSessionActive
        }
        return false
    }

    // MARK: - Init

    init() {
        // Create managers
        let settings = WatchSettingsManager()
        let timers = WatchTimerManager()
        self.settingsManager = settings
        self.timerManager = timers
        self.standaloneManager = StandaloneRunManager(timerManager: timers, settingsManager: settings)
        self.companionManager = CompanionRunManager(timerManager: timers)

        // Initialize @Published settings from manager
        self.standaloneGoalType = settings.standaloneGoalType
        self.standaloneGoalDistance = settings.standaloneGoalDistance
        self.standaloneGoalTime = settings.standaloneGoalTime
        self.standaloneGoalTargetTime = settings.standaloneGoalTargetTime
        self.standaloneIntervalRunSec = settings.standaloneIntervalRunSec
        self.standaloneIntervalWalkSec = settings.standaloneIntervalWalkSec
        self.standaloneIntervalSets = settings.standaloneIntervalSets
        self.isIndoorRun = settings.isIndoorRun
        self.isAutoPauseEnabled = settings.isAutoPauseEnabled
        self.isVoiceGuidanceEnabled = settings.isVoiceGuidanceEnabled
        self.voiceFrequencyKm = settings.voiceFrequencyKm
        self.isCountdownEnabled = settings.isCountdownEnabled
        self.weeklyGoalKm = settings.weeklyGoalKm

        // Wire up callbacks
        wireSettingsManager()
        wireStandaloneManager()
        wireCompanionManager()
        wireTimerManager()

        setupWatchSession()
        setupHeartRateForwarding()
        setupMirroringCallbacks()
    }

    // MARK: - Manager Wiring

    private func wireSettingsManager() {
        settingsManager.onSettingsChanged = { [weak self] in
            let update = {
                guard let self = self else { return }
                self.standaloneGoalType = self.settingsManager.standaloneGoalType
                self.standaloneGoalDistance = self.settingsManager.standaloneGoalDistance
                self.standaloneGoalTime = self.settingsManager.standaloneGoalTime
                self.standaloneGoalTargetTime = self.settingsManager.standaloneGoalTargetTime
                self.standaloneIntervalRunSec = self.settingsManager.standaloneIntervalRunSec
                self.standaloneIntervalWalkSec = self.settingsManager.standaloneIntervalWalkSec
                self.standaloneIntervalSets = self.settingsManager.standaloneIntervalSets
                self.isIndoorRun = self.settingsManager.isIndoorRun
                self.isAutoPauseEnabled = self.settingsManager.isAutoPauseEnabled
                self.isVoiceGuidanceEnabled = self.settingsManager.isVoiceGuidanceEnabled
                self.voiceFrequencyKm = self.settingsManager.voiceFrequencyKm
                self.isCountdownEnabled = self.settingsManager.isCountdownEnabled
                self.weeklyGoalKm = self.settingsManager.weeklyGoalKm
                self.weeklyDistanceKm = self.settingsManager.weeklyDistanceKm
                self.weeklyRunCount = self.settingsManager.weeklyRunCount
            }
            if Thread.isMainThread {
                update()
            } else {
                DispatchQueue.main.async { update() }
            }
        }
    }

    private func wireStandaloneManager() {
        standaloneManager.getState = { [weak self] in
            self?.state ?? WatchRunState()
        }
        standaloneManager.updateState = { [weak self] updater in
            guard let self = self else { return }
            updater(&self.state)
        }
        standaloneManager.onPhaseTransition = { [weak self] from, to in
            self?.handlePhaseTransition(from: from, to: to)
        }
        standaloneManager.setStandaloneMode = { [weak self] value in
            self?.isStandaloneMode = value
        }
        standaloneManager.setPhaseLockedUntil = { [weak self] date in
            self?.phaseLockedUntil = date
        }
        standaloneManager.onSyncPendingRuns = { [weak self] in
            self?.syncPendingRuns()
        }
    }

    private func wireCompanionManager() {
        companionManager.getState = { [weak self] in
            self?.state ?? WatchRunState()
        }
        companionManager.updateState = { [weak self] updater in
            guard let self = self else { return }
            updater(&self.state)
        }
        companionManager.onPhaseTransition = { [weak self] from, to in
            self?.handlePhaseTransition(from: from, to: to)
        }
        companionManager.isStandaloneMode = { [weak self] in
            self?.isStandaloneMode ?? false
        }
        companionManager.exitStandaloneMode = { [weak self] in
            self?.isStandaloneMode = false
            self?.phaseLockedUntil = .distantPast
        }
        companionManager.setPhoneReachable = { [weak self] value in
            self?.isPhoneReachable = value
        }
        companionManager.getPhaseLockedUntil = { [weak self] in
            self?.phaseLockedUntil ?? .distantPast
        }
        companionManager.setPhaseLockedUntil = { [weak self] date in
            self?.phaseLockedUntil = date
        }
        companionManager.isInIdleCooldown = { [weak self] in
            self?.isInIdleCooldown ?? false
        }
    }

    private func wireTimerManager() {
        timerManager.onDurationTick = { [weak self] in
            guard let self = self, self.state.phase == "running", !self.state.isAutoPaused else { return }
            // startTime-based: compute duration purely from phone's startTime + elapsedBeforePause.
            // This eliminates jitter from anchor resets when WCSession messages arrive with delay.
            if self.state.runStartTime > 0 {
                let nowMs = Date().timeIntervalSince1970 * 1000
                let elapsedMs = nowMs - self.state.runStartTime
                let total = Int(elapsedMs / 1000) + Int(self.state.elapsedBeforePause)
                if total >= self.state.duration {
                    self.state.duration = total
                }
            } else {
                // Fallback: anchor-based (for backward compatibility if startTime not received)
                let elapsed = Int(Date().timeIntervalSince(self.timerManager.anchorTime))
                self.state.duration = self.timerManager.anchorDuration + elapsed
            }
        }

        timerManager.onReachabilityTick = { [weak self] in
            self?.isPhoneReachable = WCSession.default.isReachable
        }

        timerManager.onStatePoll = { [weak self] in
            self?.companionManager.pollPhoneState()
        }

        timerManager.onCountdownAutoTransition = { [weak self] in
            guard let self = self, self.state.phase == "countdown" else { return }
            print("[Watch] Auto-transitioning countdown → running")
            self.state.phase = "running"
            self.handlePhaseTransition(from: "countdown", to: "running")
        }
    }

    // MARK: - WatchSession Setup

    private func setupWatchSession() {
        let service = WatchSessionService.shared
        service.activate()

        service.onLocationUpdate = { [weak self] message in
            self?.companionManager.handleLocationUpdate(message)
        }

        service.onStateUpdate = { [weak self] message in
            self?.companionManager.handleStateUpdate(message)
        }

        service.onMilestone = { [weak self] message in
            self?.companionManager.handleMilestone(message)
        }

        service.onWeeklyGoalUpdate = { [weak self] goalKm in
            guard let self = self else { return }
            // Apply phone's weekly goal without echoing back
            if goalKm != self.settingsManager.weeklyGoalKm {
                self.settingsManager.isSyncingFromPhone = true
                self.settingsManager.setWeeklyGoal(goalKm)
                self.settingsManager.isSyncingFromPhone = false
                print("[RunSessionVM] Weekly goal synced from phone: \(goalKm)km")
            }
        }

        service.onResultDismissed = { [weak self] in
            guard let self = self else { return }
            // Phone dismissed the result screen — dismiss watch result too
            if self.state.phase == "completed" {
                print("[RunSessionVM] Phone dismissed result → resetting watch to idle")
                self.resetToIdle()
            }
        }

        service.onReachabilityChange = { [weak self] reachable in
            self?.isPhoneReachable = reachable
            if reachable {
                self?.syncPendingRuns()
                // Only start polling if in an active companion run — don't poll while idle
                // (prevents stale phone state from accidentally starting a phantom run)
                if let phase = self?.state.phase,
                   phase == "running" || phase == "paused" || phase == "countdown" || phase == "navigating",
                   self?.isStandaloneMode == false {
                    self?.startStatePollTimer()
                }
            } else {
                self?.timerManager.stopStatePollTimer()
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self = self else { return }
            self.isPhoneReachable = WCSession.default.isReachable
            // Only poll if not in idle cooldown and not standalone
            if WCSession.default.isReachable && !self.isInIdleCooldown && !self.isStandaloneMode {
                self.companionManager.pollPhoneState()
                // Only start polling if in an active run phase
                let phase = self.state.phase
                if phase == "running" || phase == "paused" || phase == "countdown" {
                    self.startStatePollTimer()
                }
            }
        }
    }

    private func setupHeartRateForwarding() {
        heartRateManager.onHeartRateUpdate = { [weak self] bpm in
            self?.state.heartRate = bpm
            if !(self?.isStandaloneMode ?? false) {
                WatchSessionService.shared.sendHeartRate(bpm)
            }
        }
        heartRateManager.onCaloriesUpdate = { [weak self] kcal in
            self?.state.calories = kcal
        }
    }

    private func setupMirroringCallbacks() {
        guard #available(watchOS 10, *) else { return }
        let mgr = WorkoutMirroringManager.shared

        mgr.onPhaseChange = { [weak self] oldPhase, newPhase in
            guard let self = self, !self.isStandaloneMode else { return }
            self.companionManager.handleMirroredPhaseChange(from: oldPhase, to: newPhase)
        }

        mgr.onHeartRateUpdate = { [weak self] bpm in
            self?.state.heartRate = bpm
            self?.heartRateManager.currentHeartRate = bpm
            WatchSessionService.shared.sendHeartRate(bpm)
        }

        mgr.onCaloriesUpdate = { [weak self] kcal in
            self?.state.calories = kcal
        }
    }

    // MARK: - Phase Transitions

    private func handlePhaseTransition(from oldPhase: String, to newPhase: String) {
        guard oldPhase != newPhase else { return }
        lastPhase = newPhase

        switch newPhase {
        case "countdown":
            timerManager.stopDurationTimer()
            stopHeartRateMonitoring()
            startStatePollTimer()
            // Reset ALL run state for the new run to prevent stale data from previous run
            state.distance = 0
            state.duration = 0
            state.currentPace = 0
            state.avgPace = 0
            state.calories = 0
            state.cadence = 0
            state.heartRate = 0
            state.speed = 0
            state.sessionId = nil
            state.isAutoPaused = false
            state.lastMilestoneKm = 0
            state.lastMilestoneSplitPace = 0
            // Reset course navigation state
            state.isCourseRun = false
            state.navBearing = -1
            state.navRemainingDistance = -1
            state.navDeviation = -1
            state.navDirection = ""
            state.navProgress = -1
            state.navIsOffCourse = false
            state.navNextTurnDirection = ""
            state.navDistanceToNextTurn = -1
            state.navToStartBearing = -1
            state.navToStartDistance = -1
            state.navToStartReady = false
            state.cpPassed = 0
            state.cpTotal = 0
            state.cpJustPassed = false
            isStandaloneMode = false
            timerManager.resetAnchors()
            state.goalType = ""
            state.goalValue = 0
            state.programTargetDistance = 0
            state.programTargetTime = 0
            state.programTimeDelta = 0
            state.programRequiredPace = 0
            state.programStatus = ""
            state.metronomeBPM = 0
            // Reset interval state
            state.intervalPhase = ""
            state.intervalCurrentSet = 0
            state.intervalTotalSets = 0
            state.intervalRunSeconds = 0
            state.intervalWalkSeconds = 0
            state.intervalPhaseRemaining = 0
            state.intervalCompleted = false
            // Reset all manager internal state (haptic tracking, session tracking, standalone splits)
            standaloneManager.resetForNewRun()
            companionManager.resetForNewRun()
            // Clean up previous run's mirroring session (e.g., completed → countdown
            // without going through idle — user starts new run while result screen is showing)
            if #available(watchOS 10, *) {
                let mgr = WorkoutMirroringManager.shared
                if mgr.session != nil {
                    mgr.cleanup()
                }
                mgr.resetAccumulatedDistance()
            }
            // Cancel any lingering foreground session from previous run
            if WatchSessionService.shared.hasForegroundSession {
                WatchSessionService.shared.cancelForegroundSession()
            }
            scheduleCountdownAutoTransition()

        case "running":
            timerManager.cancelCountdownAutoTransition()
            if !isStandaloneMode {
                timerManager.startReachabilityTimer()
                startStatePollTimer()
                startMirroringSessionIfNeeded()
            }
            if oldPhase == "paused" {
                // Re-anchor duration from the paused value so the timer
                // continues from where it left off, not from a stale server value.
                timerManager.anchorDuration = state.duration
                timerManager.anchorTime = Date()
                HapticManager.shared.resumed()
            } else {
                timerManager.resetAnchors()
                HapticManager.shared.runStarted()
            }
            if !isStandaloneMode {
                timerManager.restartDurationTimer()
            }
            startHeartRateMonitoring()

        case "paused":
            HapticManager.shared.paused()
            HapticManager.shared.stopCadenceHaptic()
            // Snapshot current duration into anchor BEFORE stopping the timer,
            // so that resume starts counting from the correct paused duration.
            timerManager.anchorDuration = state.duration
            timerManager.anchorTime = Date()
            timerManager.stopDurationTimer()
            if !isStandaloneMode { startStatePollTimer() }

        case "completed":
            timerManager.cancelCountdownAutoTransition()
            // Interval mode already announced "인터벌 완료" — skip "운동 종료" TTS
            if state.goalType == "interval" {
                HapticManager.shared.runCompleted(skipVoice: true)
            } else {
                HapticManager.shared.runCompleted()
            }
            HapticManager.shared.stopCadenceHaptic()
            timerManager.stopDurationTimer()
            stopHeartRateMonitoring()
            timerManager.stopStatePollTimer()
            if let fgSession = WatchSessionService.shared.handoffForegroundSession() {
                fgSession.end()
            }
            timerManager.resetAnchors()
            if !isStandaloneMode && state.distance > 0 {
                settingsManager.recordWeeklyRun(distanceKm: state.distance / 1000.0)
            }

        case "navigating":
            timerManager.stopDurationTimer()
            stopHeartRateMonitoring()
            startStatePollTimer()

        case "idle":
            timerManager.cancelCountdownAutoTransition()
            timerManager.stopDurationTimer()
            timerManager.stopAutoPauseTimer()
            stopHeartRateMonitoring()
            timerManager.stopStatePollTimer()
            WatchSessionService.shared.cancelForegroundSession()
            // Force-stop any running standalone tracking
            WatchLocationManager.shared.stopTracking()
            WatchPedometerManager.shared.stopTracking()
            // IMPORTANT: cleanup and reset ALL managers BEFORE state reset.
            // This blocks stale callbacks from the old session writing data
            // into the reset state. Order matters:
            // 1. Reset standalone (clears start time, splits, callbacks → rejects stale updates)
            // 2. Reset companion (clears session ID → rejects stale location updates)
            // 3. Cleanup mirroring (nils delegate → blocks stale phase callbacks)
            // 4. Reset state (fresh WatchRunState)
            standaloneManager.resetForNewRun()
            companionManager.resetForNewRun()
            if #available(watchOS 10, *) {
                let mgr = WorkoutMirroringManager.shared
                mgr.cleanup()
            }
            state = WatchRunState()
            isStandaloneMode = false
            // Block all external state updates for 3s to prevent phantom runs
            // from stale WCSession/mirroring callbacks arriving after reset
            idleCooldownUntil = Date().addingTimeInterval(3.0)
            timerManager.resetAnchors()
            timerManager.stopReachabilityTimer()

        default:
            break
        }
    }

    // MARK: - State Poll Timer (computed interval)

    private func startStatePollTimer() {
        guard !isStandaloneMode else { return }

        let isActiveRun = state.phase == "running" || state.phase == "paused"
        let isCountdown = state.phase == "countdown"
        let interval: TimeInterval
        if isCountdown {
            interval = 0.25
        } else if isActiveRun {
            interval = isMirroringActive ? 1.0 : 0.25
        } else {
            interval = 3.0
        }

        timerManager.startStatePollTimer(interval: interval)
    }

    // MARK: - Countdown Auto-Transition

    private func scheduleCountdownAutoTransition() {
        let startedAtMs = state.countdownStartedAt
        let totalSec = state.countdownTotal
        guard startedAtMs > 0, totalSec > 0 else {
            print("[RunSessionVM] scheduleCountdownAutoTransition SKIP: startedAt=\(startedAtMs) total=\(totalSec)")
            return
        }

        let countdownEndMs = startedAtMs + Double(totalSec * 1000)
        let nowMs = Date().timeIntervalSince1970 * 1000
        let delayMs = countdownEndMs - nowMs

        // If countdown already expired (stale data from previous run), don't schedule
        if delayMs < -2000 {
            print("[RunSessionVM] scheduleCountdownAutoTransition SKIP: countdown already expired (\(delayMs)ms ago)")
            return
        }

        let delay = max(delayMs / 1000.0, 0.05)
        timerManager.scheduleCountdownAutoTransition(delay: delay)
    }

    // MARK: - Heart Rate

    private func startHeartRateMonitoring() {
        heartRateManager.requestAuthorization { [weak self] _ in
            guard let self = self else { return }
            // Always attempt to start — requestAuthorization returns true for read types
            // regardless of actual permission. If denied, builder simply won't deliver data.
            self.attachHeartRateToBuilderOrStartSession(retryCount: 0)
        }
    }

    /// Try to attach HeartRateManager to WorkoutMirroringManager's builder.
    /// If the builder isn't ready yet (async session setup), retry a few times.
    /// Falls back to standalone HKWorkoutSession if no builder appears.
    private func attachHeartRateToBuilderOrStartSession(retryCount: Int) {
        if #available(watchOS 10, *),
           let builder = WorkoutMirroringManager.shared.builder {
            heartRateManager.attachToBuilder(builder)
            print("[RunSessionVM] HeartRate attached to mirroring builder")
        } else if retryCount < 5 {
            // Builder may not be ready yet (async session setup). Retry after a short delay.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                self?.attachHeartRateToBuilderOrStartSession(retryCount: retryCount + 1)
            }
        } else {
            // No builder available after retries — fall back to standalone session
            heartRateManager.startWorkoutSession()
            print("[RunSessionVM] HeartRate started standalone session (no mirroring builder)")
        }
    }

    private func stopHeartRateMonitoring() {
        heartRateManager.stopWorkoutSession()
    }

    private func startMirroringSessionIfNeeded() {
        guard #available(watchOS 10, *) else { return }
        let mgr = WorkoutMirroringManager.shared

        if let foregroundSession = WatchSessionService.shared.handoffForegroundSession() {
            print("[RunSessionVM] Handing off foreground session to WorkoutMirroringManager")
            mgr.adoptSession(foregroundSession)
            mgr.startRunFullSetup()
        } else if mgr.isSessionActive && mgr.builder == nil {
            mgr.startRunFullSetup()
        } else if !mgr.isSessionActive {
            mgr.startRun()
        }
    }

    // MARK: - Public API (pass-through to managers)

    // Standalone
    func startStandaloneCountdown() { standaloneManager.startCountdown() }
    func startStandaloneRun() { standaloneManager.startRun() }
    func pauseStandaloneRun() { standaloneManager.pauseRun() }
    func resumeStandaloneRun() { standaloneManager.resumeRun() }
    func stopStandaloneRun() { standaloneManager.stopRun() }

    // Companion commands
    func sendStartCommand() { companionManager.sendStartCommand() }

    func sendPauseCommand() {
        if isStandaloneMode { pauseStandaloneRun(); return }
        companionManager.sendPauseCommand()
    }

    func sendResumeCommand() {
        if isStandaloneMode { resumeStandaloneRun(); return }
        companionManager.sendResumeCommand()
    }

    func sendStopCommand() {
        if isStandaloneMode { stopStandaloneRun(); return }
        companionManager.sendStopCommand()
    }

    // Polling
    func pollPhoneState() { companionManager.pollPhoneState() }
    func requestImmediateStateSync() { companionManager.requestImmediateStateSync() }

    // Sync
    func syncPendingRuns() {
        pendingSyncCount = standaloneManager.syncPendingRuns()
    }

    // Reachability
    func updateReachabilityStatus() {
        isPhoneReachable = WCSession.default.isReachable
    }

    // Reset
    func resetToIdle() {
        let oldPhase = state.phase
        state.phase = "idle"
        handlePhaseTransition(from: oldPhase, to: "idle")
    }

    // Diagnostics
    func getSessionDiagnostics() -> CompanionRunManager.SessionDiagnostics {
        companionManager.getSessionDiagnostics()
    }

    // MARK: - Settings (pass-through)

    func setGoalType(_ type: String) { settingsManager.setGoalType(type) }
    func setGoalDistance(_ km: Double) { settingsManager.setGoalDistance(km) }
    func setGoalTime(_ minutes: Int) { settingsManager.setGoalTime(minutes) }
    func setGoalTargetTime(_ minutes: Int) { settingsManager.setGoalTargetTime(minutes) }
    func setIntervalRunSec(_ sec: Int) { settingsManager.setIntervalRunSec(sec) }
    func setIntervalWalkSec(_ sec: Int) { settingsManager.setIntervalWalkSec(sec) }
    func setIntervalSets(_ sets: Int) { settingsManager.setIntervalSets(sets) }
    func setIndoorRun(_ value: Bool) { settingsManager.setIndoorRun(value) }
    func setAutoPause(_ value: Bool) { settingsManager.setAutoPause(value) }
    func setVoiceGuidance(_ value: Bool) { settingsManager.setVoiceGuidance(value) }
    func setVoiceFrequency(_ km: Double) { settingsManager.setVoiceFrequency(km) }
    func setCountdownEnabled(_ value: Bool) { settingsManager.setCountdownEnabled(value) }
    func setWeeklyGoal(_ km: Double) { settingsManager.setWeeklyGoal(km) }
    func loadWeeklyActivity() { settingsManager.loadWeeklyActivity() }
    func recordWeeklyRun(distanceKm: Double) { settingsManager.recordWeeklyRun(distanceKm: distanceKm) }

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
        String(format: "%.2f", state.distance / 1000.0)
    }

    func formattedPace() -> String {
        guard state.currentPace > 0 && state.currentPace < 3600 else { return "--'--\"" }
        return String(format: "%d'%02d\"", state.currentPace / 60, state.currentPace % 60)
    }

    func formattedAvgPace() -> String {
        guard state.avgPace > 0 && state.avgPace < 3600 else { return "--'--\"" }
        return String(format: "%d'%02d\"", state.avgPace / 60, state.avgPace % 60)
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

    // Course Navigation Formatters
    func formattedRemainingDistance() -> String {
        guard state.navRemainingDistance >= 0 else { return "--" }
        return String(format: "%.1f", state.navRemainingDistance / 1000.0)
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

    func formattedNavToStartDistance() -> String {
        guard state.navToStartDistance >= 0 else { return "--" }
        if state.navToStartDistance >= 1000 {
            return String(format: "%.1fkm", state.navToStartDistance / 1000.0)
        }
        return String(format: "%.0fm", state.navToStartDistance)
    }

    // MARK: - Cleanup

    deinit {
        timerManager.invalidateAll()
        HapticManager.shared.stopCadenceHaptic()
    }
}
