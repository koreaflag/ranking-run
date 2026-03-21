import Foundation
import HealthKit
import UIKit
import WatchConnectivity

/// Singleton that owns WCSession and mediates Phone <-> Watch communication
@objc(WatchSessionManager)
@objcMembers
final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    // Callbacks for RN bridge
    var onWatchCommand: (([String: Any]) -> Void)?
    var onHeartRateUpdate: (([String: Any]) -> Void)?
    var onWatchReachabilityChange: ((Bool) -> Void)?
    var onWeeklyGoalFromWatch: (([String: Any]) -> Void)?
    var onStandaloneStatusUpdate: (([String: Any]) -> Void)?
    var onStandaloneRunReceived: (([String: Any]) -> Void)? {
        didSet {
            // Flush any standalone runs that arrived before the callback was set
            guard onStandaloneRunReceived != nil else { return }
            let buffered = pendingStandaloneRuns
            pendingStandaloneRuns.removeAll()
            for run in buffered {
                NSLog("[WatchSessionMgr] Flushing buffered standalone run to callback")
                onStandaloneRunReceived?(run)
            }
        }
    }

    /// Buffer standalone runs received before WatchBridgeModule sets its callback
    private var pendingStandaloneRuns: [[String: Any]] = []

    private var lastSendTime: TimeInterval = 0
    private let throttleInterval: TimeInterval = 1.0  // 1 second minimum between location updates
    private(set) var lastRunState: [String: Any]?  // Cache last state for re-send on reconnect
    private(set) var currentRunPhase: String = "idle"

    /// Dedup watch commands: same command+timestamp delivered via both sendMessage and transferUserInfo
    private var lastCommandTimestamp: Double = 0

    /// Timestamp of last authoritative phase change (from GPSTrackerModule).
    /// Non-authoritative calls (from useWatchCompanion via WatchBridgeModule) cannot
    /// revert the phase within 3 seconds of an authoritative change.
    private var lastAuthoritativePhaseChange: Date = .distantPast

    /// Posted when Watch sends commands so GPSTrackerModule can handle them natively.
    /// This bypasses the JS bridge round-trip for faster response.
    static let watchStartRunNotification = Notification.Name("WatchStartRunRequested")
    static let watchPauseRunNotification = Notification.Name("WatchPauseRunRequested")
    static let watchResumeRunNotification = Notification.Name("WatchResumeRunRequested")
    static let watchStopRunNotification = Notification.Name("WatchStopRunRequested")

    private override init() {
        super.init()
    }

    private var session: WCSession { WCSession.default }

    /// Route Watch commands, with special handling for "start" (triggers native GPS tracking).
    /// Deduplicates by timestamp so commands delivered via both sendMessage and transferUserInfo
    /// are only processed once.
    private func handleWatchCommand(_ message: [String: Any]) {
        let cmd = message["command"] as? String ?? ""
        let ts = message["timestamp"] as? Double ?? 0

        // Dedup: same command can arrive via sendMessage + transferUserInfo
        if ts > 0 && ts == lastCommandTimestamp {
            NSLog("[WatchSessionMgr] DEDUP command %@ ts=%.0f", cmd, ts)
            return
        }
        lastCommandTimestamp = ts

        NSLog("[WatchSessionMgr] handleWatchCommand: %@", cmd)

        // Handle commands natively for instant response (bypasses JS bridge round-trip)
        switch cmd {
        case "start":
            NotificationCenter.default.post(name: Self.watchStartRunNotification, object: nil)
        case "pause":
            NotificationCenter.default.post(name: Self.watchPauseRunNotification, object: nil)
        case "resume":
            NotificationCenter.default.post(name: Self.watchResumeRunNotification, object: nil)
        case "stop":
            NotificationCenter.default.post(name: Self.watchStopRunNotification, object: nil)
        default:
            break
        }

        // Forward all commands to RN bridge (for UI state sync)
        onWatchCommand?(message)
    }

    func activate() {
        guard WCSession.isSupported() else {
            NSLog("[WatchSessionMgr] WCSession NOT supported")
            return
        }
        session.delegate = self
        session.activate()
        NSLog("[WatchSessionMgr] WCSession activate() called")

        // Set up HKWorkoutSession mirroring for instant phase sync (iOS 17+)
        setupWorkoutMirroring()
    }

    private func setupWorkoutMirroring() {
        if #available(iOS 17, *) {
            let mgr = WorkoutMirroringPhone.shared
            mgr.setup()

            // When watch-initiated mirrored session delivers phase changes,
            // route them through the same NotificationCenter path that
            // GPSTrackerModule already handles natively.
            mgr.onPhaseChange = { [weak self] oldPhase, newPhase in
                guard let self = self else { return }
                NSLog("[WatchSessionMgr] MIRRORED phase: %@→%@", oldPhase, newPhase)

                self.currentRunPhase = newPhase
                self.lastAuthoritativePhaseChange = Date()

                switch newPhase {
                case "running" where oldPhase == "idle" || oldPhase == "completed":
                    // Do NOT post watchStartRunNotification from mirroring.
                    // Mirroring fires for both companion and standalone watch runs.
                    // Standalone runs should NOT trigger the phone's running screen —
                    // they only send standaloneStatus updates and standaloneRunComplete.
                    // Companion start is handled via WCSession "start" command instead.
                    NSLog("[WatchSessionMgr] MIRRORED start ignored — standalone or already handled via WCSession")
                case "paused":
                    NotificationCenter.default.post(name: Self.watchPauseRunNotification, object: nil)
                case "running" where oldPhase == "paused":
                    NotificationCenter.default.post(name: Self.watchResumeRunNotification, object: nil)
                case "completed":
                    NotificationCenter.default.post(name: Self.watchStopRunNotification, object: nil)
                default:
                    break
                }
            }
        }
    }

    // MARK: - Launch Watch App (auto-foreground)
    // Uses HKHealthStore.startWatchApp(with:completion:) to launch AND foreground
    // the watch app when a run starts on the phone. The watch app implements
    // handle(_ workoutConfiguration:) to create HKWorkoutSession → auto-foreground.

    private let healthStore = HKHealthStore()

    /// Launch and foreground the watch app by requesting a workout session.
    /// The system launches the watch app and calls handle(_ workoutConfiguration:).
    /// The watch app creates HKWorkoutSession + startActivity() → system foregrounds it.
    func launchWatchApp() {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        // Lazily request HealthKit authorization on first run (not during module init).
        if #available(iOS 17, *) {
            WorkoutMirroringPhone.shared.ensureAuthorized()
        }

        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor

        healthStore.startWatchApp(with: config) { success, error in
            if success {
                NSLog("[WatchSessionMgr] ✅ startWatchApp succeeded — watch should foreground")
            } else {
                NSLog("[WatchSessionMgr] ⚠️ startWatchApp failed: %@", error?.localizedDescription ?? "unknown")
            }
        }
    }

    // MARK: - HKWorkoutSession Mirroring (iOS 17+)
    // Watch creates HKWorkoutSession and mirrors to phone for instant phase sync.
    // Phone receives mirrored session and can pause/resume/stop it.

    func pauseMirroredWorkout() {
        if #available(iOS 17, *) {
            WorkoutMirroringPhone.shared.pauseRun()
        }
    }

    func resumeMirroredWorkout() {
        if #available(iOS 17, *) {
            WorkoutMirroringPhone.shared.resumeRun()
        }
    }

    func stopMirroredWorkout() {
        if #available(iOS 17, *) {
            WorkoutMirroringPhone.shared.stopRun()
        }
    }

    var isWatchReachable: Bool {
        WCSession.isSupported() ? session.isReachable : false
    }
    var isWatchPaired: Bool {
        WCSession.isSupported() ? session.isPaired : false
    }
    var isWatchAppInstalled: Bool {
        WCSession.isSupported() ? session.isWatchAppInstalled : false
    }

    // MARK: - Send to Watch

    /// Cache latest location data so it can be included in requestState replies
    private(set) var lastLocationData: [String: Any]?

    /// Send location update to Watch (throttled, fire-and-forget)
    func sendLocationUpdate(_ data: [String: Any]) {
        let now = Date().timeIntervalSince1970
        guard now - lastSendTime >= throttleInterval else { return }
        guard session.activationState == .activated, session.isPaired, session.isReachable else { return }
        lastSendTime = now

        var message = data
        message["type"] = "locationUpdate"
        lastLocationData = message  // Cache for requestState responses

        // Best-effort push — watch also polls via requestCurrentState
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    /// Send state update to Watch.
    /// Phase transitions get aggressive retry + applicationContext + transferUserInfo.
    /// Continuous metric updates (same phase) get a single sendMessage.
    ///
    /// - Parameter authoritative: `true` for GPSTrackerModule calls (start/pause/resume/stop),
    ///   `false` for useWatchCompanion calls via WatchBridgeModule. Non-authoritative calls
    ///   cannot revert the phase within 3 seconds of an authoritative change.
    /// Keys that carry program goal context — preserved across phase changes
    /// so authoritative updates from GPSTrackerModule (which lack these fields)
    /// still deliver goal data to the watch.
    private static let carryForwardKeys: Set<String> = [
        "goalType", "goalValue",
        "programTargetDistance", "programTargetTime", "programTimeDelta",
        "programRequiredPace", "programStatus", "metronomeBPM",
        "countdownStartedAt", "countdownTotal"
    ]

    func sendRunStateUpdate(_ state: [String: Any], authoritative: Bool = true) {
        var message = state
        message["type"] = "stateUpdate"
        // Timestamp for watch-side freshness validation (prevents stale applicationContext/transferUserInfo)
        if message["timestamp"] == nil {
            message["timestamp"] = Date().timeIntervalSince1970 * 1000
        }

        // Clear cached state on new run start to prevent stale goal data from previous session
        let newPhaseForReset = message["phase"] as? String
        if newPhaseForReset == "countdown" || (newPhaseForReset == "running" && currentRunPhase == "idle") {
            lastRunState = nil
        }

        // Carry forward program goal fields from lastRunState if not present in this update.
        // GPSTrackerModule sends authoritative phase changes without goal context;
        // useWatchCompanion sends full state including goals but non-authoritatively.
        // Merging ensures transferUserInfo always carries goal data.
        if let last = lastRunState {
            for key in Self.carryForwardKeys {
                if message[key] == nil, let cached = last[key] {
                    message[key] = cached
                }
            }
        }

        let newPhase = message["phase"] as? String
        var isPhaseChange = newPhase != nil && newPhase != currentRunPhase

        if isPhaseChange && !authoritative {
            // Non-authoritative call trying to change phase.
            // Only block during an active run (running/paused) to prevent stale
            // useWatchCompanion calls from reverting pause/resume/stop.
            let isActiveRun = currentRunPhase == "running" || currentRunPhase == "paused"
            if isActiveRun {
                let elapsed = Date().timeIntervalSince(lastAuthoritativePhaseChange)
                if elapsed < 3.0 {
                    NSLog("[WatchSessionMgr] BLOCKED stale phase %@ → kept %@ (%.1fs since auth change)",
                          newPhase ?? "", currentRunPhase, elapsed)
                    message["phase"] = currentRunPhase
                    isPhaseChange = false
                }
            }
        }

        if isPhaseChange, let phase = newPhase {
            currentRunPhase = phase
            if authoritative {
                lastAuthoritativePhaseChange = Date()
            }

            // Launch watch app as soon as countdown starts (not when running starts).
            if phase == "countdown" {
                launchWatchApp()
            }
        }

        lastRunState = message

        // ── Phase delivery routing ──
        // Check if HKWorkoutSession mirroring is active on the phone side.
        // When mirroring handles phase (running/paused/completed), WCSession should
        // NOT also send phase — that causes 4x duplicate phase deliveries on the watch.
        // Countdown always goes via WCSession since HKWorkoutSession has no countdown concept.
        // Use session != nil (not isSessionActive) because after session.end()
        // the session still exists but state is .stopped — mirroring is still
        // delivering the phase change to the watch. Cleanup happens after 1s delay.
        let mirroringHandlesPhase: Bool
        if #available(iOS 17, *) {
            mirroringHandlesPhase = isPhaseChange
                && WorkoutMirroringPhone.shared.session != nil
                && newPhase != "countdown"
                && newPhase != "idle"
        } else {
            mirroringHandlesPhase = false
        }

        if mirroringHandlesPhase {
            // Phase is handled by HK mirroring (~10-20ms, more reliable).
            // Send data-only update via sendMessage so watch still gets metrics.
            var dataOnly = message
            dataOnly.removeValue(forKey: "phase")
            trySendMessage(dataOnly)
            NSLog("[WatchSessionMgr] phase %@ → MIRRORING (WCSession sends data-only)",
                  newPhase ?? "nil")
        } else if isPhaseChange {
            // No mirroring OR countdown: use WCSession triple-redundancy for reliability
            NSLog("[WatchSessionMgr] PHASE CHANGE → %@ via WCSession (mirroring=%@)",
                  newPhase ?? "nil",
                  { if #available(iOS 17, *) { return WorkoutMirroringPhone.shared.isSessionActive ? "inactive-for-phase" : "unavailable" } else { return "n/a" } }())

            // 1. transferUserInfo: queued, guaranteed delivery even if watch app is not running
            session.transferUserInfo(message)

            // 2. applicationContext: best-effort (may fail in dev builds)
            do {
                try session.updateApplicationContext(message)
            } catch {
                // Expected in dev builds where isWatchAppInstalled=false
            }

            // 3. sendMessage: single real-time delivery attempt
            trySendMessage(message)
        } else {
            // Continuous metrics (same phase): single send, no retry
            trySendMessage(message)
        }
    }

    private func trySendMessage(_ message: [String: Any]) {
        guard session.activationState == .activated, session.isPaired, session.isReachable else { return }
        session.sendMessage(message, replyHandler: nil) { _ in
            // Silently ignore — watch polls phone for state, so push failures are OK
        }
    }

    /// Send weekly goal to Watch via applicationContext (persists until next update).
    func sendWeeklyGoalToWatch(_ goalKm: Double) {
        guard session.activationState == .activated, session.isPaired else { return }

        NSLog("[WatchSessionMgr] Sending weeklyGoalKm=%.1f to watch", goalKm)

        // sendMessage for immediate delivery
        if session.isReachable {
            let message: [String: Any] = [
                "type": "stateUpdate",
                "weeklyGoalKm": goalKm,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]
            session.sendMessage(message, replyHandler: nil, errorHandler: nil)
        }

        // Also merge into applicationContext so watch gets it on next launch
        var ctx: [String: Any] = [
            "type": "stateUpdate",
            "weeklyGoalKm": goalKm,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        // Merge with existing lastRunState if available
        if let last = lastRunState {
            for (key, value) in last where ctx[key] == nil {
                ctx[key] = value
            }
        }
        do {
            try session.updateApplicationContext(ctx)
        } catch {
            NSLog("[WatchSessionMgr] updateApplicationContext failed: %@", error.localizedDescription)
        }
    }

    /// Send km milestone to Watch
    func sendMilestone(km: Int, splitPace: Int, totalTime: Int) {
        guard session.activationState == .activated, session.isPaired else { return }
        let message: [String: Any] = [
            "type": "milestone",
            "kilometer": km,
            "splitPace": splitPace,
            "totalTime": totalTime
        ]
        // Use transferUserInfo for guaranteed delivery of milestones
        session.transferUserInfo(message)
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        NSLog("[WatchSessionMgr] activation state=%d paired=%d installed=%d reachable=%d err=%@",
              activationState.rawValue, session.isPaired ? 1 : 0,
              session.isWatchAppInstalled ? 1 : 0, session.isReachable ? 1 : 0,
              error?.localizedDescription ?? "none")
        // Log only – no user-facing alert
        NSLog("[WatchSessionMgr] activation complete: state=%d paired=%d reachable=%d",
              activationState.rawValue, session.isPaired ? 1 : 0, session.isReachable ? 1 : 0)
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()  // Re-activate for Watch switching
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        NSLog("[WatchSessionMgr] reachability changed: %d paired=%d installed=%d",
              session.isReachable ? 1 : 0, session.isPaired ? 1 : 0,
              session.isWatchAppInstalled ? 1 : 0)
        onWatchReachabilityChange?(session.isReachable)

        // When Watch becomes reachable, re-send last run state immediately
        if session.isReachable, let state = lastRunState {
            session.sendMessage(state, replyHandler: nil, errorHandler: nil)
        }
    }

    /// Deliver standalone run data to callback, or buffer if callback not yet set.
    private func deliverStandaloneRun(_ data: [String: Any]) {
        if let callback = onStandaloneRunReceived {
            callback(data)
        } else {
            NSLog("[WatchSessionMgr] Buffering standalone run (callback not set yet)")
            pendingStandaloneRuns.append(data)
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let type = message["type"] as? String else { return }
        switch type {
        case "command":
            handleWatchCommand(message)
        case "heartRate":
            onHeartRateUpdate?(message)
        case "standaloneRunComplete":
            NSLog("[WatchSessionMgr] Received standalone run data from watch")
            deliverStandaloneRun(message)
        case "standaloneStatus":
            onStandaloneStatusUpdate?(message)
        case "weeklyGoalUpdate":
            NSLog("[WatchSessionMgr] Received weekly goal update from watch")
            onWeeklyGoalFromWatch?(message)
        default:
            break
        }
    }

    // Handle transferUserInfo (guaranteed delivery, used for standalone run sync + command fallback)
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        let type = userInfo["type"] as? String ?? ""
        NSLog("[WatchSessionMgr] didReceiveUserInfo type=%@", type)

        switch type {
        case "standaloneRunComplete":
            NSLog("[WatchSessionMgr] Received standalone run via transferUserInfo")
            deliverStandaloneRun(userInfo)
        case "command":
            handleWatchCommand(userInfo)
        case "weeklyGoalUpdate":
            NSLog("[WatchSessionMgr] Received weekly goal via transferUserInfo")
            onWeeklyGoalFromWatch?(userInfo)
        default:
            break
        }
    }

    // Also handle messages with replyHandler
    func session(_ session: WCSession,
                 didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        guard let type = message["type"] as? String else {
            replyHandler(["status": "error", "message": "Unknown message type"])
            return
        }
        switch type {
        case "command":
            handleWatchCommand(message)
            replyHandler(["status": "ok"])
        case "heartRate":
            onHeartRateUpdate?(message)
            replyHandler(["status": "ok"])
        case "standaloneRunComplete":
            NSLog("[WatchSessionMgr] Received standalone run data from watch (with reply)")
            deliverStandaloneRun(message)
            replyHandler(["status": "ok"])
        case "standaloneStatus":
            onStandaloneStatusUpdate?(message)
            replyHandler(["status": "ok"])
        case "weeklyGoalUpdate":
            NSLog("[WatchSessionMgr] Received weekly goal from watch (with reply)")
            onWeeklyGoalFromWatch?(message)
            replyHandler(["status": "ok"])
        case "requestState":
            // Watch is polling for current run state + location
            var reply: [String: Any] = lastRunState ?? ["type": "stateUpdate", "phase": currentRunPhase]
            // Merge latest location data so watch gets distance/pace/speed in one round-trip
            if let loc = lastLocationData {
                for (key, value) in loc where key != "type" {
                    reply[key] = value
                }
            }
            replyHandler(reply)
        default:
            replyHandler(["status": "unknown"])
        }
    }
}
