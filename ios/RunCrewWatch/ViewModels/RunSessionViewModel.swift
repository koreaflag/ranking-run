import Foundation
import Combine
import WatchKit
import WatchConnectivity

class RunSessionViewModel: ObservableObject {
    @Published var state = WatchRunState()
    @Published var isPhoneReachable = false
    @Published var isStandaloneMode = false
    @Published var pendingSyncCount = 0

    // Standalone run settings (persisted via UserDefaults)
    @Published var standaloneGoalType: String
    @Published var standaloneGoalDistance: Double
    @Published var standaloneGoalTime: Int       // minutes (for time goal type)
    @Published var standaloneGoalTargetTime: Int  // minutes (for program goal type)
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
    private var statePollTimer: Timer?
    private var countdownAutoTransitionTimer: Timer?

    /// Standalone mode start time for local duration tracking
    private var standaloneStartTime: Date?
    private var standalonePausedDuration: TimeInterval = 0
    private var standalonePauseStart: Date?

    /// Whether HKWorkoutSession mirroring is active (watchOS 10+, companion mode)
    private var isMirroringActive: Bool {
        if #available(watchOS 10, *) {
            return WorkoutMirroringManager.shared.isSessionActive
        }
        return false
    }

    init() {
        let defaults = UserDefaults.standard
        self.standaloneGoalType = defaults.string(forKey: "standaloneGoalType") ?? "free"
        let savedDist = defaults.double(forKey: "standaloneGoalDistance")
        self.standaloneGoalDistance = savedDist > 0 ? savedDist : 5.0
        let savedTime = defaults.integer(forKey: "standaloneGoalTime")
        self.standaloneGoalTime = savedTime > 0 ? savedTime : 30
        let savedTargetTime = defaults.integer(forKey: "standaloneGoalTargetTime")
        self.standaloneGoalTargetTime = savedTargetTime > 0 ? savedTargetTime : 20
        self.isIndoorRun = defaults.bool(forKey: "isIndoorRun")
        self.isAutoPauseEnabled = defaults.object(forKey: "isAutoPauseEnabled") == nil ? true : defaults.bool(forKey: "isAutoPauseEnabled")
        self.isVoiceGuidanceEnabled = defaults.object(forKey: "isVoiceGuidanceEnabled") == nil ? true : defaults.bool(forKey: "isVoiceGuidanceEnabled")
        let savedFreq = defaults.double(forKey: "voiceFrequencyKm")
        self.voiceFrequencyKm = savedFreq > 0 ? savedFreq : 1.0
        self.isCountdownEnabled = defaults.object(forKey: "isCountdownEnabled") == nil ? true : defaults.bool(forKey: "isCountdownEnabled")
        let savedWeeklyGoal = defaults.double(forKey: "weeklyGoalKm")
        self.weeklyGoalKm = savedWeeklyGoal > 0 ? savedWeeklyGoal : 20.0

        setupWatchSession()
        setupHeartRateForwarding()
        setupMirroringCallbacks()
        // Note: standalone location callbacks are set up lazily in startStandaloneRun()
        // to avoid initializing WatchLocationManager at app launch
        // No polling timer in idle — IdleView.onAppear triggers a single poll.
    }

    /// Set up HKWorkoutSession mirroring callbacks (watchOS 10+ only).
    /// Phase changes arrive here ~10-20ms instead of WCSession's ~100-300ms.
    private func setupMirroringCallbacks() {
        guard #available(watchOS 10, *) else { return }
        let mgr = WorkoutMirroringManager.shared

        mgr.onPhaseChange = { [weak self] oldPhase, newPhase in
            guard let self = self else { return }
            guard !self.isStandaloneMode else { return }
            self.handleMirroredPhaseChange(from: oldPhase, to: newPhase)
        }

        mgr.onHeartRateUpdate = { [weak self] bpm in
            self?.state.heartRate = bpm
            self?.heartRateManager.currentHeartRate = bpm
            WatchSessionService.shared.sendHeartRate(bpm)
        }
    }

    /// Handle phase change from HKWorkoutSession mirroring.
    /// This is the fast path (~10-20ms) for phase sync.
    private func handleMirroredPhaseChange(from oldPhase: String, to newPhase: String) {
        guard newPhase != state.phase else { return }
        print("[RunSessionVM] MIRRORED phase: \(oldPhase)→\(newPhase)")

        let previousPhase = state.phase
        state.phase = newPhase
        // Lock to prevent stale WCSession messages from reverting the phase
        phaseLockedUntil = Date().addingTimeInterval(5.0)
        handlePhaseTransition(from: previousPhase, to: newPhase)
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
            if reachable {
                self?.syncPendingRuns()
                // Start polling phone for state (works around isWatchAppInstalled=false)
                self?.startStatePollTimer()
            } else {
                self?.stopStatePollTimer()
            }
        }

        // After WCSession activates, check for state and start polling
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.isPhoneReachable = WCSession.default.isReachable
            if WCSession.default.isReachable {
                self?.pollPhoneState()
                self?.startStatePollTimer()
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
    }

    /// Whether the current standalone run is indoor (pedometer) or outdoor (GPS).
    private var standaloneIsIndoor = false

    /// Auto-pause: timer that checks speed periodically.
    private var autoPauseTimer: Timer?
    private var isAutoPaused = false
    private static let autoPauseSpeedThreshold: Double = 0.3  // m/s (~18 min/km)

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

            // Auto-pause: check speed
            self.checkAutoPause(speed: speed)
        }

        locationMgr.onGPSStatusChange = { [weak self] status in
            guard let self = self, self.isStandaloneMode else { return }
            self.state.gpsStatus = status
        }
    }

    private func setupStandalonePedometerCallbacks() {
        let pedometer = WatchPedometerManager.shared

        pedometer.onUpdate = { [weak self] distance, speed, pace, cadence in
            guard let self = self, self.isStandaloneMode else { return }
            self.state.distance = distance
            self.state.speed = speed
            self.state.currentPace = pace
            self.state.cadence = cadence

            // Calculate avg pace
            if distance > 0, let start = self.standaloneStartTime {
                let elapsed = Date().timeIntervalSince(start) - self.standalonePausedDuration
                self.state.avgPace = Int(elapsed / (distance / 1000.0))
            }

            // Auto-pause for indoor: based on cadence
            let effectiveSpeed = cadence > 0 ? speed : 0
            self.checkAutoPause(speed: effectiveSpeed)
        }
    }

    // MARK: - Auto-Pause

    private func checkAutoPause(speed: Double) {
        guard isAutoPauseEnabled, state.phase == "running", !isAutoPaused else { return }

        if speed < Self.autoPauseSpeedThreshold {
            triggerAutoPause()
        }
    }

    private func triggerAutoPause() {
        guard !isAutoPaused else { return }
        isAutoPaused = true
        state.isAutoPaused = true
        standalonePauseStart = Date()
        HapticManager.shared.paused()
        print("[RunSessionVM] Auto-paused (speed below threshold)")

        // Start a timer to check if we should resume
        autoPauseTimer?.invalidate()
        autoPauseTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self, self.isAutoPaused else { return }
            if self.state.speed >= Self.autoPauseSpeedThreshold {
                self.triggerAutoResume()
            }
        }
    }

    private func triggerAutoResume() {
        guard isAutoPaused else { return }
        isAutoPaused = false
        state.isAutoPaused = false
        if let pauseStart = standalonePauseStart {
            standalonePausedDuration += Date().timeIntervalSince(pauseStart)
        }
        standalonePauseStart = nil
        autoPauseTimer?.invalidate()
        autoPauseTimer = nil
        HapticManager.shared.resumed()
        print("[RunSessionVM] Auto-resumed (speed above threshold)")
    }

    // MARK: - Standalone Mode

    /// Countdown before standalone run. Skips countdown if disabled.
    func startStandaloneCountdown() {
        guard isCountdownEnabled else {
            startStandaloneRun()
            return
        }
        let now = Date().timeIntervalSince1970 * 1000
        state.countdownStartedAt = now
        state.countdownTotal = 3
        state.phase = "countdown"

        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            guard let self = self, self.state.phase == "countdown" else { return }
            self.startStandaloneRun()
        }
    }

    /// Start a standalone run — indoor (pedometer) or outdoor (GPS).
    func startStandaloneRun() {
        standaloneIsIndoor = isIndoorRun
        print("[RunSessionVM] START standalone — indoor=\(standaloneIsIndoor) phase=\(state.phase)")

        isStandaloneMode = true
        standaloneStartTime = Date()
        standalonePausedDuration = 0
        standalonePauseStart = nil
        isAutoPaused = false

        let oldPhase = state.phase
        state.phase = "running"
        state.distance = 0
        state.duration = 0
        state.currentPace = 0
        state.avgPace = 0
        state.cadence = 0
        state.isAutoPaused = false

        // Set program running goal if applicable
        if standaloneGoalType == "program" {
            state.goalType = "program"
            state.goalValue = standaloneGoalDistance * 1000 // km → meters
            state.programTargetDistance = standaloneGoalDistance * 1000
            state.programTargetTime = Double(standaloneGoalTargetTime * 60) // minutes → seconds
            let distKm = standaloneGoalDistance
            state.programRequiredPace = distKm > 0 ? Int(Double(standaloneGoalTargetTime * 60) / distKm) : 0
            state.programTimeDelta = 0
            state.programStatus = "on_pace"
        } else if standaloneGoalType == "distance" {
            state.goalType = "distance"
            state.goalValue = standaloneGoalDistance * 1000
        } else if standaloneGoalType == "time" {
            state.goalType = "time"
            state.goalValue = Double(standaloneGoalTime * 60)
        } else {
            state.goalType = ""
            state.goalValue = 0
        }

        if standaloneIsIndoor {
            setupStandalonePedometerCallbacks()
            state.gpsStatus = "indoor"
            WatchPedometerManager.shared.startTracking()
        } else {
            setupStandaloneLocationCallbacks()
            state.gpsStatus = "searching"
            WatchLocationManager.shared.requestPermission()
            WatchLocationManager.shared.startTracking()
        }

        handlePhaseTransition(from: oldPhase, to: "running")
        restartStandaloneDurationTimer()
    }

    /// Pause standalone run.
    func pauseStandaloneRun() {
        // Cancel any auto-pause state first
        if isAutoPaused { triggerAutoResume() }

        let oldPhase = state.phase
        state.phase = "paused"
        standalonePauseStart = Date()

        if standaloneIsIndoor {
            WatchPedometerManager.shared.pauseTracking()
        } else {
            WatchLocationManager.shared.pauseTracking()
        }
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

        if standaloneIsIndoor {
            WatchPedometerManager.shared.resumeTracking()
        } else {
            WatchLocationManager.shared.resumeTracking()
        }
        handlePhaseTransition(from: oldPhase, to: "running")
        restartStandaloneDurationTimer()
    }

    /// Stop standalone run, save data, attempt sync.
    func stopStandaloneRun() {
        let oldPhase = state.phase
        state.phase = "completed"

        // Clean up auto-pause
        autoPauseTimer?.invalidate()
        autoPauseTimer = nil
        isAutoPaused = false

        // Build and save run data
        var summary: [String: Any]
        if standaloneIsIndoor {
            WatchPedometerManager.shared.stopTracking()
            summary = WatchPedometerManager.shared.buildRunSummary()
        } else {
            WatchLocationManager.shared.stopTracking()
            summary = WatchLocationManager.shared.buildRunSummary()
        }
        summary["durationSeconds"] = state.duration

        // Attach program goal data if this was a program run
        summary["goalType"] = standaloneGoalType
        if standaloneGoalType == "distance" {
            summary["goalValue"] = standaloneGoalDistance * 1000 // km → meters
        } else if standaloneGoalType == "time" {
            summary["goalValue"] = standaloneGoalTime * 60 // min → seconds
        } else if standaloneGoalType == "program" {
            summary["goalValue"] = standaloneGoalDistance * 1000
            summary["programTargetDistance"] = standaloneGoalDistance * 1000
            summary["programTargetTime"] = standaloneGoalTargetTime * 60 // min → seconds
            summary["programStatus"] = state.programStatus
            summary["programTimeDelta"] = state.programTimeDelta
            summary["metronomeBPM"] = state.metronomeBPM
        }

        handlePhaseTransition(from: oldPhase, to: "completed")

        // Save locally
        WatchRunStorage.shared.saveRun(summary)

        // Record in weekly stats
        recordWeeklyRun(distanceKm: state.distance / 1000.0)

        // Attempt to sync to phone immediately
        syncPendingRuns()

        // Keep isStandaloneMode = true until user taps "확인" in CompletedView
        standaloneStartTime = nil
        standalonePausedDuration = 0
    }

    private func restartStandaloneDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self, self.isStandaloneMode, self.state.phase == "running",
                  let start = self.standaloneStartTime else { return }
            let elapsed = Date().timeIntervalSince(start) - self.standalonePausedDuration
            self.state.duration = max(0, Int(elapsed))

            // Self-calculate pace target for standalone program running
            if self.state.programTargetDistance > 0 && self.state.programTargetTime > 0 && self.state.distance > 200 {
                let projectedFinish = (self.state.programTargetDistance / self.state.distance) * elapsed
                let timeDelta = self.state.programTargetTime - projectedFinish
                let oldStatus = self.state.programStatus
                self.state.programTimeDelta = timeDelta

                let newStatus: String
                if timeDelta > 30 { newStatus = "ahead" }
                else if timeDelta >= -30 { newStatus = "on_pace" }
                else if timeDelta >= -60 { newStatus = "behind" }
                else { newStatus = "critical" }

                if newStatus != oldStatus {
                    self.state.programStatus = newStatus
                    HapticManager.shared.paceAlert(status: newStatus, timeDelta: timeDelta)
                }
            }
        }
    }

    /// Sync all pending standalone runs to the phone.
    /// Uses transferUserInfo (queued, guaranteed delivery, handles large payloads)
    /// instead of sendMessage (which times out with large GPS data).
    func syncPendingRuns() {
        pendingSyncCount = WatchRunStorage.shared.pendingCount
        let pending = WatchRunStorage.shared.getPendingRuns()
        guard !pending.isEmpty else { return }

        let session = WCSession.default
        print("[RunSessionVM] Syncing \(pending.count) pending run(s) — activated=\(session.activationState.rawValue) companion=\(session.isCompanionAppInstalled) reachable=\(session.isReachable)")

        guard session.activationState == .activated else {
            print("[RunSessionVM] SKIP sync: session not activated")
            return
        }

        for run in pending {
            guard let filename = run["_filename"] as? String else { continue }
            var payload = run
            payload.removeValue(forKey: "_filename")
            payload["_syncFilename"] = filename  // phone will echo this back for cleanup

            // Use transferUserInfo only (guaranteed delivery, no duplicates).
            // Sending via both transferUserInfo + sendMessage caused the phone to
            // process the same run twice, leading to duplicate sessions and
            // conflicting state updates back to the watch.
            session.transferUserInfo(payload)
            print("[RunSessionVM] Queued transferUserInfo for: \(filename) (type=\(payload["type"] ?? "nil"))")
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

        if let distance = message[WatchMessageKeys.distanceFromStart] as? Double,
           distance >= state.distance {
            state.distance = distance
        } else if let distance = message[WatchMessageKeys.distance] as? Double,
                  distance >= state.distance {
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
        // In standalone mode, ignore phone updates UNLESS the phone starts a new run.
        // This lets the user start a companion run from the phone even if the watch
        // is still showing the standalone CompletedView.
        if isStandaloneMode {
            if let phase = message[WatchMessageKeys.phase] as? String,
               phase == "running" || phase == "countdown" {
                print("[RunSessionVM] Phone started new run — exiting standalone mode")
                isStandaloneMode = false
                phaseLockedUntil = .distantPast  // Clear any stale lock
            } else {
                return
            }
        }

        let previousPhase = state.phase
        let incomingPhase = message[WatchMessageKeys.phase] as? String ?? "nil"
        print("[RunSessionVM] handleStateUpdate: incoming=\(incomingPhase) current=\(previousPhase) locked=\(Date() < phaseLockedUntil)")

        // Block stale "completed"/"paused" from showing when app starts fresh.
        // These are leftovers from a previous run (via applicationContext/transferUserInfo).
        // You can't go from idle → completed without going through running first.
        if previousPhase == "idle" || previousPhase == "" {
            if incomingPhase == "completed" || incomingPhase == "paused" {
                print("[RunSessionVM] BLOCKED stale \(incomingPhase) — currently idle")
                return
            }
        }

        // Phase: respect phase lock to prevent stale poll responses from reverting
        // the phase. Lock is set both by optimistic watch commands AND when accepting
        // a phone-initiated phase change, to block out-of-order stale responses.
        if let phase = message[WatchMessageKeys.phase] as? String {
            // "countdown" always breaks through the lock — it means a new run is starting
            // and must never be blocked by a stale lock from the previous run's "completed".
            // "running" after "countdown" is the natural progression and must also break through —
            // the countdown lock (5s) outlasts the countdown itself (3s), which was blocking
            // the transition and causing a 2-3s black screen on the watch.
            let isNewRunSignal = phase == "countdown"
            let isCountdownToRunning = phase == "running" && state.phase == "countdown"
            if isNewRunSignal || isCountdownToRunning || Date() >= phaseLockedUntil {
                if phase != state.phase {
                    state.phase = phase
                    // Don't lock on countdown→running transition — allow immediate
                    // follow-up updates (e.g., first metrics) to come through.
                    if !isCountdownToRunning {
                        phaseLockedUntil = Date().addingTimeInterval(5.0)
                    }
                    print("[RunSessionVM] phase SET → \(phase) (locked=\(!isCountdownToRunning))")
                }
            } else {
                print("[RunSessionVM] phase BLOCKED \(phase) (locked until \(phaseLockedUntil.timeIntervalSinceNow)s)")
            }
        }

        if let distance = message[WatchMessageKeys.distanceMeters] as? Double,
           distance >= state.distance {
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
        // Countdown sync
        if let countdownStartedAt = message[WatchMessageKeys.countdownStartedAt] as? Double {
            state.countdownStartedAt = countdownStartedAt
        }
        if let countdownTotal = message[WatchMessageKeys.countdownTotal] as? Int {
            state.countdownTotal = countdownTotal
        } else if let countdownTotal = message[WatchMessageKeys.countdownTotal] as? Double {
            state.countdownTotal = Int(countdownTotal)
        }

        if let isAutoPaused = message[WatchMessageKeys.isAutoPaused] as? Bool {
            let wasAutoPaused = state.isAutoPaused
            state.isAutoPaused = isAutoPaused
            // Re-anchor timer on auto-pause transitions so the watch timer stays in sync
            if wasAutoPaused != isAutoPaused {
                anchorDuration = state.duration
                anchorTime = Date()
            }
        }

        // Run goal
        if let goalType = message[WatchMessageKeys.goalType] as? String {
            state.goalType = goalType
        }
        if let goalValue = message[WatchMessageKeys.goalValue] as? Double {
            state.goalValue = goalValue
        } else if let goalValue = message[WatchMessageKeys.goalValue] as? Int {
            state.goalValue = Double(goalValue)
        }

        // Program running (pace target) fields
        if let v = message[WatchMessageKeys.programTargetDistance] as? Double { state.programTargetDistance = v }
        else if let v = message[WatchMessageKeys.programTargetDistance] as? Int { state.programTargetDistance = Double(v) }
        if let v = message[WatchMessageKeys.programTargetTime] as? Double { state.programTargetTime = v }
        else if let v = message[WatchMessageKeys.programTargetTime] as? Int { state.programTargetTime = Double(v) }
        if let v = message[WatchMessageKeys.programTimeDelta] as? Double { state.programTimeDelta = v }
        if let v = message[WatchMessageKeys.programRequiredPace] as? Int { state.programRequiredPace = v }
        else if let v = message[WatchMessageKeys.programRequiredPace] as? Double { state.programRequiredPace = Int(v) }
        if let v = message[WatchMessageKeys.programStatus] as? String {
            // Haptic + voice on status change
            if !v.isEmpty && v != state.programStatus && state.phase == "running" {
                HapticManager.shared.paceAlert(status: v, timeDelta: state.programTimeDelta)
            }
            state.programStatus = v
        }
        if let v = message[WatchMessageKeys.metronomeBPM] as? Int {
            let oldBPM = state.metronomeBPM
            state.metronomeBPM = v
            // Start/stop cadence haptic based on BPM changes
            if v > 0 && oldBPM != v && state.phase == "running" {
                HapticManager.shared.startCadenceHaptic(bpm: v)
            } else if v == 0 && oldBPM > 0 {
                HapticManager.shared.stopCadenceHaptic()
            }
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

        // Navigate-to-start fields
        if let navToStartBearing = message[WatchMessageKeys.navToStartBearing] as? Double {
            state.navToStartBearing = navToStartBearing
        }
        if let navToStartDistance = message[WatchMessageKeys.navToStartDistance] as? Double {
            state.navToStartDistance = navToStartDistance
        }
        if let navToStartReady = message[WatchMessageKeys.navToStartReady] as? Bool {
            let wasReady = state.navToStartReady
            state.navToStartReady = navToStartReady
            if navToStartReady && !wasReady {
                HapticManager.shared.arrivedAtStart()
            }
        }

        // Checkpoint progress
        if let cpPassed = message[WatchMessageKeys.cpPassed] as? Int {
            state.cpPassed = cpPassed
        } else if let cpPassed = message[WatchMessageKeys.cpPassed] as? Double {
            state.cpPassed = Int(cpPassed)
        }
        if let cpTotal = message[WatchMessageKeys.cpTotal] as? Int {
            state.cpTotal = cpTotal
        } else if let cpTotal = message[WatchMessageKeys.cpTotal] as? Double {
            state.cpTotal = Int(cpTotal)
        }
        if let cpJustPassed = message[WatchMessageKeys.cpJustPassed] as? Bool {
            let wasPassed = state.cpJustPassed
            state.cpJustPassed = cpJustPassed
            if cpJustPassed && !wasPassed {
                HapticManager.shared.checkpointPassed()
            }
        }

        handlePhaseTransition(from: previousPhase, to: state.phase)

        // Off-course haptic
        if state.navIsOffCourse && !wasOffCourse {
            HapticManager.shared.offCourse()
        } else if !state.navIsOffCourse && wasOffCourse {
            HapticManager.shared.backOnCourse()
        }
        wasOffCourse = state.navIsOffCourse

        // Turn approach haptics (fire as distance decreases: 200m → 100m → 20m)
        if state.navDistanceToNextTurn >= 0 && state.isCourseRun {
            if state.navDistanceToNextTurn <= 20 && lastHapticThreshold != 20 {
                triggerTurnHaptic(direction: state.navNextTurnDirection)
                lastHapticThreshold = 20
            } else if state.navDistanceToNextTurn <= 100 && state.navDistanceToNextTurn > 20 && lastHapticThreshold != 100 && lastHapticThreshold != 20 {
                HapticManager.shared.turnApproaching()
                lastHapticThreshold = 100
            } else if state.navDistanceToNextTurn <= 200 && state.navDistanceToNextTurn > 100 && lastHapticThreshold != 200 && lastHapticThreshold != 100 && lastHapticThreshold != 20 {
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
        case "countdown":
            // New run starting — reset previous run metrics without touching countdown fields.
            // countdownStartedAt and countdownTotal are already set from the message
            // (handleStateUpdate lines 427-434 run BEFORE this).
            // Do NOT reset state entirely — that briefly sets countdownStartedAt=0
            // which causes CountdownView to show wrong numbers.
            stopDurationTimer()
            stopHeartRateMonitoring()
            // Keep polling during countdown so the watch catches the "running" phase
            // transition as soon as the phone sends it. Without this, the watch relied
            // solely on push messages which could be delayed by WCSession latency.
            startStatePollTimer()
            state.distance = 0
            state.duration = 0
            state.currentPace = 0
            state.avgPace = 0
            state.calories = 0
            state.cadence = 0
            state.heartRate = 0
            state.sessionId = nil
            state.isAutoPaused = false
            isStandaloneMode = false
            anchorDuration = 0
            anchorTime = .distantPast

            // Reset goal fields so previous standalone settings don't leak into phone-initiated runs
            state.goalType = ""
            state.goalValue = 0
            state.programTargetDistance = 0
            state.programTargetTime = 0
            state.programTimeDelta = 0
            state.programRequiredPace = 0
            state.programStatus = ""
            state.metronomeBPM = 0

            // Auto-transition: the watch knows exactly when the countdown ends
            // (phone sent countdownStartedAt + countdownTotal). Schedule an automatic
            // transition to "running" so the UI doesn't depend on WCSession latency.
            // If the real "running" arrives from the phone first, this timer is cancelled.
            scheduleCountdownAutoTransition()

        case "running":
            cancelCountdownAutoTransition()
            if !isStandaloneMode {
                startReachabilityTimer()
                startStatePollTimer()  // Fast polling during run
                // For phone-initiated runs: watch creates HKWorkoutSession and mirrors to phone
                // so phone can also pause/resume/stop via the mirrored session channel.
                startMirroringSessionIfNeeded()
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
            HapticManager.shared.stopCadenceHaptic()
            stopDurationTimer()
            if !isStandaloneMode { startStatePollTimer() }  // Keep polling while paused

        case "completed":
            cancelCountdownAutoTransition()
            HapticManager.shared.runCompleted()
            HapticManager.shared.stopCadenceHaptic()
            stopDurationTimer()
            stopHeartRateMonitoring()
            stopStatePollTimer()
            // End the HKWorkoutSession so watchOS removes the "timer running" indicator
            WatchSessionService.shared.cancelForegroundSession()
            anchorDuration = 0
            anchorTime = .distantPast

            // Record companion run distance in weekly stats
            if !isStandaloneMode && state.distance > 0 {
                recordWeeklyRun(distanceKm: state.distance / 1000.0)
            }

        case "navigating":
            // Navigate-to-start mode — minimal setup, just show the navigation view
            stopDurationTimer()
            stopHeartRateMonitoring()
            startStatePollTimer()  // Keep polling for navigation updates

        case "idle":
            cancelCountdownAutoTransition()
            stopDurationTimer()
            stopHeartRateMonitoring()
            stopStatePollTimer()
            // Cancel any pre-warm HKWorkoutSession that wasn't used
            WatchSessionService.shared.cancelForegroundSession()
            state = WatchRunState()
            isStandaloneMode = false
            anchorDuration = 0
            anchorTime = .distantPast
            stopReachabilityTimer()

        default:
            break
        }
    }

    // MARK: - Countdown Auto-Transition

    /// Schedule an automatic transition from "countdown" → "running" based on the
    /// phone-supplied countdownStartedAt + countdownTotal. This eliminates the
    /// WCSession latency gap — the watch doesn't need to wait for the phone's
    /// "running" message because it can compute exactly when the countdown ends.
    private func scheduleCountdownAutoTransition() {
        countdownAutoTransitionTimer?.invalidate()
        countdownAutoTransitionTimer = nil

        let startedAtMs = state.countdownStartedAt
        let totalSec = state.countdownTotal
        guard startedAtMs > 0, totalSec > 0 else { return }

        // countdownEndMs = when the countdown reaches 0
        // +500ms extra for the "GO!" animation display
        let countdownEndMs = startedAtMs + Double(totalSec * 1000) + 500
        let nowMs = Date().timeIntervalSince1970 * 1000
        let delayMs = countdownEndMs - nowMs

        // If already past the end time, transition immediately
        let delay = max(delayMs / 1000.0, 0.05)

        print("[Watch] Scheduling auto-transition in \(String(format: "%.1f", delay))s")

        countdownAutoTransitionTimer = Timer.scheduledTimer(
            withTimeInterval: delay,
            repeats: false
        ) { [weak self] _ in
            guard let self = self else { return }
            guard self.state.phase == "countdown" else {
                // Already transitioned (phone message arrived first) — nothing to do
                return
            }
            print("[Watch] Auto-transitioning countdown → running")
            self.state.phase = "running"
            self.handlePhaseTransition(from: "countdown", to: "running")
        }
    }

    private func cancelCountdownAutoTransition() {
        countdownAutoTransitionTimer?.invalidate()
        countdownAutoTransitionTimer = nil
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
            guard let self = self, self.state.phase == "running", !self.state.isAutoPaused else { return }
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

    // MARK: - State Polling (workaround for isWatchAppInstalled=false on phone)
    // Phone can't push to watch, so watch pulls state from phone periodically.

    private func startStatePollTimer() {
        guard !isStandaloneMode else { return }
        stopStatePollTimer()

        let isActiveRun = state.phase == "running" || state.phase == "paused"
        let isCountdown = state.phase == "countdown"
        let interval: TimeInterval
        if isCountdown {
            // During countdown, poll aggressively to catch the "running" transition ASAP.
            interval = 0.25
        } else if isActiveRun {
            // When mirroring is active, phase sync is instant via HKWorkoutSession.
            // Poll only for metrics (distance/pace/etc.) at a relaxed interval.
            // Without mirroring, poll aggressively for phase transitions too.
            interval = isMirroringActive ? 1.0 : 0.25
        } else {
            interval = 3.0
        }

        statePollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.pollPhoneState()
        }
    }

    private func stopStatePollTimer() {
        statePollTimer?.invalidate()
        statePollTimer = nil
    }

    func pollPhoneState() {
        guard !isStandaloneMode else { return }
        WatchSessionService.shared.requestCurrentState { [weak self] reply in
            guard let self = self, let reply = reply else { return }
            // Phone merges state + location data in the response
            self.handleStateUpdate(reply)
            self.handleLocationUpdate(reply)
        }
    }

    /// Aggressively poll phone state after countdown finishes to minimize
    /// the gap between countdown end and running view appearing.
    /// Polls every 200ms for up to 5 seconds.
    func requestImmediateStateSync() {
        guard !isStandaloneMode else { return }
        var attempts = 0
        let maxAttempts = 25  // 5 seconds at 200ms interval

        func poll() {
            guard attempts < maxAttempts, self.state.phase == "countdown" else { return }
            attempts += 1
            self.pollPhoneState()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                poll()
            }
        }

        // Start polling after a short delay (give phone time to transition)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            poll()
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

    // MARK: - Heart Rate

    private func startHeartRateMonitoring() {
        heartRateManager.requestAuthorization { [weak self] granted in
            guard granted, let self = self else { return }

            // If mirroring is active, attach to the mirroring manager's builder
            // instead of creating a separate HKWorkoutSession
            if #available(watchOS 10, *),
               let builder = WorkoutMirroringManager.shared.builder {
                self.heartRateManager.attachToBuilder(builder)
            } else {
                self.heartRateManager.startWorkoutSession()
            }
        }
    }

    private func stopHeartRateMonitoring() {
        heartRateManager.stopWorkoutSession()
    }

    /// Ensure HKWorkoutSession is fully set up (builder + mirroring).
    /// Called from handlePhaseTransition on the main queue.
    ///
    /// Flow:
    /// 1. WCSession callback fires on background thread
    /// 2. ensureWorkoutSessionForRunning() creates HKWorkoutSession + startActivity() immediately
    ///    → this foregrounds the app (Apple docs: "sets it as the frontmost app")
    /// 3. State update dispatches to main queue → handlePhaseTransition → here
    /// 4. We hand off the session to WorkoutMirroringManager for builder + mirroring setup
    private func startMirroringSessionIfNeeded() {
        guard #available(watchOS 10, *) else { return }
        let mgr = WorkoutMirroringManager.shared

        // Check if WatchSessionService created a foreground session on the fast-path
        if let foregroundSession = WatchSessionService.shared.handoffForegroundSession() {
            print("[RunSessionVM] Handing off foreground session to WorkoutMirroringManager")
            mgr.adoptSession(foregroundSession)
            mgr.startRunFullSetup()
        } else if mgr.isSessionActive && mgr.builder == nil {
            // Session exists (from previous fast-path or mirroring) but needs full setup
            mgr.startRunFullSetup()
        } else if !mgr.isSessionActive {
            // No session yet — create everything
            mgr.startRun()
        }
    }

    // MARK: - Commands to Phone (companion mode, with optimistic local update)

    func sendStartCommand() {
        let oldPhase = state.phase
        state.phase = "running"
        phaseLockedUntil = Date().addingTimeInterval(5.0)
        handlePhaseTransition(from: oldPhase, to: "running")

        // WCSession as backup delivery (carries metrics too)
        WatchSessionService.shared.sendCommand(.start)
    }

    func sendPauseCommand() {
        if isStandaloneMode {
            pauseStandaloneRun()
            return
        }
        let oldPhase = state.phase
        state.phase = "paused"
        phaseLockedUntil = Date().addingTimeInterval(5.0)
        handlePhaseTransition(from: oldPhase, to: "paused")

        if #available(watchOS 10, *), isMirroringActive {
            WorkoutMirroringManager.shared.pauseRun()
        }
        WatchSessionService.shared.sendCommand(.pause)
        pollAfterCommand()
    }

    func sendResumeCommand() {
        if isStandaloneMode {
            resumeStandaloneRun()
            return
        }
        let oldPhase = state.phase
        state.phase = "running"
        phaseLockedUntil = Date().addingTimeInterval(5.0)
        handlePhaseTransition(from: oldPhase, to: "running")

        if #available(watchOS 10, *), isMirroringActive {
            WorkoutMirroringManager.shared.resumeRun()
        }
        WatchSessionService.shared.sendCommand(.resume)
        pollAfterCommand()
    }

    func sendStopCommand() {
        if isStandaloneMode {
            stopStandaloneRun()
            return
        }
        let oldPhase = state.phase
        state.phase = "completed"
        phaseLockedUntil = Date().addingTimeInterval(5.0)
        handlePhaseTransition(from: oldPhase, to: "completed")

        if #available(watchOS 10, *), isMirroringActive {
            WorkoutMirroringManager.shared.stopRun()
        }
        WatchSessionService.shared.sendCommand(.stop)
        pollAfterCommand()
    }

    /// Poll phone immediately after sending a command to get confirmed state ASAP.
    private func pollAfterCommand() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.pollPhoneState()
        }
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

    // MARK: - Standalone Run Settings

    func setGoalType(_ type: String) {
        standaloneGoalType = type
        UserDefaults.standard.set(type, forKey: "standaloneGoalType")
    }

    func setGoalDistance(_ km: Double) {
        standaloneGoalDistance = km
        UserDefaults.standard.set(km, forKey: "standaloneGoalDistance")
    }

    func setGoalTime(_ minutes: Int) {
        standaloneGoalTime = minutes
        UserDefaults.standard.set(minutes, forKey: "standaloneGoalTime")
    }

    func setGoalTargetTime(_ minutes: Int) {
        standaloneGoalTargetTime = minutes
        UserDefaults.standard.set(minutes, forKey: "standaloneGoalTargetTime")
    }

    func setIndoorRun(_ value: Bool) {
        isIndoorRun = value
        UserDefaults.standard.set(value, forKey: "isIndoorRun")
    }

    func setAutoPause(_ value: Bool) {
        isAutoPauseEnabled = value
        UserDefaults.standard.set(value, forKey: "isAutoPauseEnabled")
    }

    func setVoiceGuidance(_ value: Bool) {
        isVoiceGuidanceEnabled = value
        UserDefaults.standard.set(value, forKey: "isVoiceGuidanceEnabled")
        // HapticManager reads directly from UserDefaults, so it's already synced
    }

    func setVoiceFrequency(_ km: Double) {
        voiceFrequencyKm = km
        UserDefaults.standard.set(km, forKey: "voiceFrequencyKm")
    }

    func setCountdownEnabled(_ value: Bool) {
        isCountdownEnabled = value
        UserDefaults.standard.set(value, forKey: "isCountdownEnabled")
    }

    func setWeeklyGoal(_ km: Double) {
        weeklyGoalKm = km
        UserDefaults.standard.set(km, forKey: "weeklyGoalKm")
    }

    /// Load this week's activity from UserDefaults.
    /// Resets automatically when a new week starts (Monday-based).
    func loadWeeklyActivity() {
        let defaults = UserDefaults.standard
        let savedWeekId = defaults.string(forKey: "weeklyActivityWeekId") ?? ""
        let currentWeekId = Self.currentWeekId()

        if savedWeekId != currentWeekId {
            // New week — reset stats
            defaults.set(currentWeekId, forKey: "weeklyActivityWeekId")
            defaults.set(0.0, forKey: "weeklyDistanceKm")
            defaults.set(0, forKey: "weeklyRunCount")
            weeklyDistanceKm = 0
            weeklyRunCount = 0
        } else {
            weeklyDistanceKm = defaults.double(forKey: "weeklyDistanceKm")
            weeklyRunCount = defaults.integer(forKey: "weeklyRunCount")
        }
    }

    /// Record a completed standalone run in weekly stats.
    func recordWeeklyRun(distanceKm: Double) {
        loadWeeklyActivity() // ensure current week
        weeklyDistanceKm += distanceKm
        weeklyRunCount += 1
        let defaults = UserDefaults.standard
        defaults.set(weeklyDistanceKm, forKey: "weeklyDistanceKm")
        defaults.set(weeklyRunCount, forKey: "weeklyRunCount")
    }

    private static func currentWeekId() -> String {
        var cal = Calendar(identifier: .iso8601)
        cal.firstWeekday = 2 // Monday
        let comps = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: Date())
        return "\(comps.yearForWeekOfYear ?? 0)-W\(comps.weekOfYear ?? 0)"
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

    func formattedNavToStartDistance() -> String {
        guard state.navToStartDistance >= 0 else { return "--" }
        if state.navToStartDistance >= 1000 {
            return String(format: "%.1fkm", state.navToStartDistance / 1000.0)
        }
        return String(format: "%.0fm", state.navToStartDistance)
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
