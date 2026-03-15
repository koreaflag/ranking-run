import Foundation
import WatchConnectivity

/// Manages standalone (watch-only) running — GPS/pedometer tracking,
/// auto-pause, distance/pace calculations, and run data saving.
class StandaloneRunManager {

    // MARK: - Dependencies

    private weak var timerManager: WatchTimerManager?
    private weak var settingsManager: WatchSettingsManager?

    /// Closure to read/write the shared WatchRunState.
    var getState: (() -> WatchRunState)?
    var updateState: ((@escaping (inout WatchRunState) -> Void) -> Void)?
    /// Closure to notify ViewModel of phase transitions.
    var onPhaseTransition: ((_ from: String, _ to: String) -> Void)?
    /// Closure to set isStandaloneMode on ViewModel.
    var setStandaloneMode: ((Bool) -> Void)?
    /// Closure to set phaseLockedUntil on ViewModel.
    var setPhaseLockedUntil: ((Date) -> Void)?
    /// Closure to sync pending runs.
    var onSyncPendingRuns: (() -> Void)?

    // MARK: - State

    private(set) var standaloneStartTime: Date?
    private(set) var standalonePausedDuration: TimeInterval = 0
    private(set) var standalonePauseStart: Date?
    private(set) var standaloneIsIndoor = false
    private(set) var isAutoPaused = false

    // Split tracking
    private var lastMilestoneKm: Int = 0
    private var splitStartTime: Date?
    private var splitStartDuration: TimeInterval = 0
    /// Accumulated split data: [(km, splitPaceSeconds)]
    private(set) var splits: [(Int, Int)] = []

    private static let autoPauseSpeedThreshold: Double = 0.3  // m/s (~18 min/km)

    // MARK: - Init

    init(timerManager: WatchTimerManager, settingsManager: WatchSettingsManager) {
        self.timerManager = timerManager
        self.settingsManager = settingsManager
    }

    // MARK: - Location & Pedometer Callbacks

    func setupLocationCallbacks() {
        let locationMgr = WatchLocationManager.shared

        locationMgr.onLocationUpdate = { [weak self] distance, speed, pace in
            guard let self = self else { return }
            self.updateState?({ state in
                state.distance = distance
                state.speed = speed
                state.currentPace = pace
            })

            // Feed distance to workout session for HealthKit recording
            if #available(watchOS 10, *) {
                WorkoutMirroringManager.shared.updateDistance(distance)
            }

            // Calculate avg pace
            if distance > 0, let start = self.standaloneStartTime {
                let elapsed = Date().timeIntervalSince(start) - self.standalonePausedDuration
                self.updateState?({ state in
                    state.avgPace = Int(elapsed / (distance / 1000.0))
                })
            }

            // Check km milestones
            self.checkMilestone(distance: distance)

            // Auto-pause: check speed
            self.checkAutoPause(speed: speed)
        }

        locationMgr.onRawLocation = { location in
            // Feed GPS locations to HKWorkoutRouteBuilder for Apple Fitness map
            if #available(watchOS 10, *) {
                WorkoutMirroringManager.shared.insertRouteLocation(location)
            }
        }

        locationMgr.onGPSStatusChange = { [weak self] status in
            self?.updateState?({ state in
                state.gpsStatus = status
            })
        }
    }

    func setupPedometerCallbacks() {
        let pedometer = WatchPedometerManager.shared

        pedometer.onUpdate = { [weak self] distance, speed, pace, cadence in
            guard let self = self else { return }
            self.updateState?({ state in
                state.distance = distance
                state.speed = speed
                state.currentPace = pace
                state.cadence = cadence
            })

            // Feed distance to workout session for HealthKit recording
            if #available(watchOS 10, *) {
                WorkoutMirroringManager.shared.updateDistance(distance)
            }

            // Calculate avg pace
            if distance > 0, let start = self.standaloneStartTime {
                let elapsed = Date().timeIntervalSince(start) - self.standalonePausedDuration
                self.updateState?({ state in
                    state.avgPace = Int(elapsed / (distance / 1000.0))
                })
            }

            // Check km milestones
            self.checkMilestone(distance: distance)

            // Auto-pause for indoor: based on cadence
            let effectiveSpeed = cadence > 0 ? speed : 0
            self.checkAutoPause(speed: effectiveSpeed)
        }
    }

    // MARK: - Split / Milestone Tracking

    private func checkMilestone(distance: Double) {
        let currentKm = Int(distance / 1000.0)
        guard currentKm > lastMilestoneKm else { return }

        // Calculate split pace for this km
        let now = Date()
        let splitPace: Int
        if let splitStart = splitStartTime, let runStart = standaloneStartTime {
            let currentElapsed = now.timeIntervalSince(runStart) - standalonePausedDuration
            let splitElapsed = currentElapsed - splitStartDuration
            splitPace = max(0, Int(splitElapsed))  // seconds for 1km
        } else {
            splitPace = 0
        }

        lastMilestoneKm = currentKm
        splits.append((currentKm, splitPace))

        // Reset split tracking for next km
        if let runStart = standaloneStartTime {
            splitStartDuration = now.timeIntervalSince(runStart) - standalonePausedDuration
        }
        splitStartTime = now

        updateState?({ state in
            state.lastMilestoneKm = currentKm
            state.lastMilestoneSplitPace = splitPace
        })

        HapticManager.shared.milestone()
        print("[StandaloneRunManager] Milestone: \(currentKm)km, split=\(splitPace)s")
    }

    // MARK: - Auto-Pause

    private func checkAutoPause(speed: Double) {
        guard let settings = settingsManager else { return }
        guard let state = getState?() else { return }
        guard settings.isAutoPauseEnabled, state.phase == "running", !isAutoPaused else { return }

        if speed < Self.autoPauseSpeedThreshold {
            triggerAutoPause()
        }
    }

    private func triggerAutoPause() {
        guard !isAutoPaused else { return }
        isAutoPaused = true
        updateState?({ state in
            state.isAutoPaused = true
        })
        standalonePauseStart = Date()
        timerManager?.stopDurationTimer()
        HapticManager.shared.paused()
        print("[StandaloneRunManager] Auto-paused (speed below threshold)")

        timerManager?.onAutoPauseTick = { [weak self] in
            guard let self = self, self.isAutoPaused else { return }
            if let state = self.getState?(), state.speed >= Self.autoPauseSpeedThreshold {
                self.triggerAutoResume()
            }
        }
        timerManager?.startAutoPauseTimer()
    }

    private func triggerAutoResume() {
        guard isAutoPaused else { return }
        isAutoPaused = false
        updateState?({ state in
            state.isAutoPaused = false
        })
        if let pauseStart = standalonePauseStart {
            standalonePausedDuration += Date().timeIntervalSince(pauseStart)
        }
        standalonePauseStart = nil
        timerManager?.stopAutoPauseTimer()
        setupStandaloneDurationTimer()
        HapticManager.shared.resumed()
        print("[StandaloneRunManager] Auto-resumed (speed above threshold)")
    }

    // MARK: - Standalone Run Lifecycle

    /// Countdown before standalone run. Skips countdown if disabled.
    func startCountdown() {
        guard let state = getState?(), state.phase == "idle" else {
            let currentPhase = getState?().phase ?? "?"
            print("[StandaloneRunManager] startCountdown blocked — phase=\(currentPhase)")
            return
        }

        setStandaloneMode?(true)
        setPhaseLockedUntil?(Date().addingTimeInterval(5.0))

        guard settingsManager?.isCountdownEnabled == true else {
            startRun()
            return
        }

        let now = Date().timeIntervalSince1970 * 1000
        updateState?({ state in
            state.countdownStartedAt = now
            state.countdownTotal = 3
            state.phase = "countdown"
        })

        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            guard let self = self, self.getState?().phase == "countdown" else { return }
            self.startRun()
        }
    }

    /// Start a standalone run — indoor (pedometer) or outdoor (GPS).
    func startRun() {
        guard let settings = settingsManager else { return }
        standaloneIsIndoor = settings.isIndoorRun
        print("[StandaloneRunManager] START standalone — indoor=\(standaloneIsIndoor)")

        setStandaloneMode?(true)
        standaloneStartTime = Date()
        standalonePausedDuration = 0
        standalonePauseStart = nil
        isAutoPaused = false
        lastMilestoneKm = 0
        splitStartTime = Date()
        splitStartDuration = 0
        splits = []

        let goalType = settings.standaloneGoalType
        let goalDistance = settings.standaloneGoalDistance
        let goalTime = settings.standaloneGoalTime
        let goalTargetTime = settings.standaloneGoalTargetTime

        var oldPhase = "idle"
        updateState?({ state in
            oldPhase = state.phase
            state.phase = "running"
            state.distance = 0
            state.duration = 0
            state.currentPace = 0
            state.avgPace = 0
            state.cadence = 0
            state.isAutoPaused = false

            // Set goal
            if goalType == "program" {
                state.goalType = "program"
                state.goalValue = goalDistance * 1000
                state.programTargetDistance = goalDistance * 1000
                state.programTargetTime = Double(goalTargetTime * 60)
                let distKm = goalDistance
                state.programRequiredPace = distKm > 0 ? Int(Double(goalTargetTime * 60) / distKm) : 0
                state.programTimeDelta = 0
                state.programStatus = "on_pace"
            } else if goalType == "distance" {
                state.goalType = "distance"
                state.goalValue = goalDistance * 1000
            } else if goalType == "time" {
                state.goalType = "time"
                state.goalValue = Double(goalTime * 60)
            } else {
                state.goalType = ""
                state.goalValue = 0
            }
        })

        if standaloneIsIndoor {
            setupPedometerCallbacks()
            updateState?({ state in state.gpsStatus = "indoor" })
            WatchPedometerManager.shared.startTracking()
        } else {
            setupLocationCallbacks()
            updateState?({ state in state.gpsStatus = "searching" })
            WatchLocationManager.shared.requestPermission()
            WatchLocationManager.shared.startTracking()
        }

        onPhaseTransition?(oldPhase, "running")
        setupStandaloneDurationTimer()

        // Start HKWorkoutSession for HealthKit recording
        if #available(watchOS 10, *) {
            let mgr = WorkoutMirroringManager.shared
            if !mgr.isSessionActive {
                mgr.startRun()
            }
        }
    }

    /// Pause standalone run.
    func pauseRun() {
        if isAutoPaused { triggerAutoResume() }

        var oldPhase = "running"
        updateState?({ state in
            oldPhase = state.phase
            state.phase = "paused"
        })
        standalonePauseStart = Date()
        timerManager?.stopDurationTimer()

        if standaloneIsIndoor {
            WatchPedometerManager.shared.pauseTracking()
        } else {
            WatchLocationManager.shared.pauseTracking()
        }
        if #available(watchOS 10, *), WorkoutMirroringManager.shared.isSessionActive {
            WorkoutMirroringManager.shared.pauseRun()
        }
        onPhaseTransition?(oldPhase, "paused")
    }

    /// Resume standalone run.
    func resumeRun() {
        var oldPhase = "paused"
        updateState?({ state in
            oldPhase = state.phase
            state.phase = "running"
        })
        if let pauseStart = standalonePauseStart {
            standalonePausedDuration += Date().timeIntervalSince(pauseStart)
        }
        standalonePauseStart = nil

        if standaloneIsIndoor {
            WatchPedometerManager.shared.resumeTracking()
        } else {
            WatchLocationManager.shared.resumeTracking()
        }
        if #available(watchOS 10, *), WorkoutMirroringManager.shared.isSessionActive {
            WorkoutMirroringManager.shared.resumeRun()
        }
        onPhaseTransition?(oldPhase, "running")
        setupStandaloneDurationTimer()
    }

    /// Stop standalone run, save data, attempt sync.
    func stopRun() {
        var oldPhase = "running"
        var currentDistance: Double = 0
        updateState?({ state in
            oldPhase = state.phase
            state.phase = "completed"
            state.isAutoPaused = false
            currentDistance = state.distance
        })

        // Clean up auto-pause
        timerManager?.stopAutoPauseTimer()
        isAutoPaused = false

        // Build and save run data
        let activeDuration = getState?().duration
        var summary: [String: Any]
        if standaloneIsIndoor {
            WatchPedometerManager.shared.stopTracking()
            summary = WatchPedometerManager.shared.buildRunSummary(activeDuration: activeDuration)
        } else {
            WatchLocationManager.shared.stopTracking()
            summary = WatchLocationManager.shared.buildRunSummary(activeDuration: activeDuration)
        }

        // Include heart rate (collected by HeartRateManager during the run)
        if let state = getState?() {
            if state.heartRate > 0 {
                summary["heartRate"] = state.heartRate
            }
            if state.calories > 0 {
                summary["calories"] = state.calories
            }
            if state.cadence > 0 {
                summary["cadence"] = state.cadence
            }
            // Include split milestone data
            if state.lastMilestoneKm > 0 {
                summary["lastMilestoneKm"] = state.lastMilestoneKm
                summary["lastMilestoneSplitPace"] = state.lastMilestoneSplitPace
            }
        }

        // Attach split data
        if !splits.isEmpty {
            summary["splits"] = splits.map { ["km": $0.0, "splitPace": $0.1] }
        }

        // Attach goal data
        if let settings = settingsManager {
            summary["goalType"] = settings.standaloneGoalType
            if settings.standaloneGoalType == "distance" {
                summary["goalValue"] = settings.standaloneGoalDistance * 1000
            } else if settings.standaloneGoalType == "time" {
                summary["goalValue"] = settings.standaloneGoalTime * 60
            } else if settings.standaloneGoalType == "program" {
                summary["goalValue"] = settings.standaloneGoalDistance * 1000
                summary["programTargetDistance"] = settings.standaloneGoalDistance * 1000
                summary["programTargetTime"] = settings.standaloneGoalTargetTime * 60
                if let state = getState?() {
                    summary["programStatus"] = state.programStatus
                    summary["programTimeDelta"] = state.programTimeDelta
                    summary["metronomeBPM"] = state.metronomeBPM
                }
            }
        }

        onPhaseTransition?(oldPhase, "completed")

        // Stop workout session
        if #available(watchOS 10, *), WorkoutMirroringManager.shared.isSessionActive {
            WorkoutMirroringManager.shared.stopRun()
        }

        // Save locally
        WatchRunStorage.shared.saveRun(summary)

        // Record in weekly stats
        settingsManager?.recordWeeklyRun(distanceKm: currentDistance / 1000.0)

        // Attempt to sync to phone
        onSyncPendingRuns?()

        // Keep isStandaloneMode = true until user taps "확인" in CompletedView
        standaloneStartTime = nil
        standalonePausedDuration = 0
    }

    // MARK: - Standalone Duration Timer

    private func setupStandaloneDurationTimer() {
        guard let timerManager = timerManager else { return }

        timerManager.onStandaloneDurationTick = { [weak self] in
            guard let self = self else { return }
            guard let state = self.getState?(), state.phase == "running",
                  !self.isAutoPaused, !state.isAutoPaused,
                  let start = self.standaloneStartTime else { return }
            // Account for any ongoing pause period in the elapsed calculation
            var pausedTotal = self.standalonePausedDuration
            if let pauseStart = self.standalonePauseStart {
                pausedTotal += Date().timeIntervalSince(pauseStart)
            }
            let elapsed = Date().timeIntervalSince(start) - pausedTotal
            let duration = max(0, Int(elapsed))

            self.updateState?({ state in
                state.duration = duration
            })

            // Self-calculate pace target for standalone program running
            let currentState = self.getState?()
            if let s = currentState,
               s.programTargetDistance > 0 && s.programTargetTime > 0 && s.distance > 200 {
                let projectedFinish = (s.programTargetDistance / s.distance) * elapsed
                let timeDelta = s.programTargetTime - projectedFinish
                let oldStatus = s.programStatus

                let newStatus: String
                if timeDelta > 30 { newStatus = "ahead" }
                else if timeDelta >= -30 { newStatus = "on_pace" }
                else if timeDelta >= -60 { newStatus = "behind" }
                else { newStatus = "critical" }

                self.updateState?({ state in
                    state.programTimeDelta = timeDelta
                    if newStatus != oldStatus {
                        state.programStatus = newStatus
                    }
                })

                if newStatus != oldStatus {
                    HapticManager.shared.paceAlert(status: newStatus, timeDelta: timeDelta)
                }
            }
        }

        timerManager.restartStandaloneDurationTimer()
    }

    // MARK: - Sync

    /// Sync all pending standalone runs to the phone.
    func syncPendingRuns() -> Int {
        let pending = WatchRunStorage.shared.getPendingRuns()
        guard !pending.isEmpty else {
            return WatchRunStorage.shared.pendingCount
        }

        let session = WCSession.default
        print("[StandaloneRunManager] Syncing \(pending.count) pending run(s) — activated=\(session.activationState.rawValue) companion=\(session.isCompanionAppInstalled) reachable=\(session.isReachable)")

        guard session.activationState == .activated else {
            print("[StandaloneRunManager] SKIP sync: session not activated")
            return WatchRunStorage.shared.pendingCount
        }

        for run in pending {
            guard let filename = run["_filename"] as? String else { continue }
            var payload = run
            payload.removeValue(forKey: "_filename")
            payload["_syncFilename"] = filename

            session.transferUserInfo(payload)
            print("[StandaloneRunManager] Queued transferUserInfo for: \(filename) (type=\(payload["type"] ?? "nil"))")

            // Mark as synced (rename) instead of deleting immediately.
            // transferUserInfo is queued by the OS, but if the watch reboots before
            // the transfer completes, the data would be lost. Keep a .synced copy
            // that gets cleaned up on next successful sync cycle.
            WatchRunStorage.shared.markAsSynced(filename: filename)
        }

        // Clean up old .synced files only when transfer queue is empty
        // (confirms OS has delivered all pending transfers)
        if session.outstandingUserInfoTransfers.isEmpty {
            WatchRunStorage.shared.cleanupSyncedFiles()
        }

        return WatchRunStorage.shared.pendingCount
    }
}
