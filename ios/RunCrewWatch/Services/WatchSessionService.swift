import CoreLocation
import Foundation
import HealthKit
import WatchConnectivity
import WatchKit

class WatchSessionService: NSObject, WCSessionDelegate {
    static let shared = WatchSessionService()

    var onStateUpdate: (([String: Any]) -> Void)?
    var onLocationUpdate: (([String: Any]) -> Void)?
    var onMilestone: (([String: Any]) -> Void)?
    var onReachabilityChange: ((Bool) -> Void)?
    var onWeeklyGoalUpdate: ((Double) -> Void)?
    var onResultDismissed: (() -> Void)?

    private let healthStore = HKHealthStore()
    private var isHealthKitAuthorized = false

    /// Queue of messages that failed to send. Retried on next successful connection.
    /// Capped to prevent unbounded growth while the watch is disconnected.
    private var pendingMessageQueue: [[String: Any]] = []
    private let maxPendingMessages = 20

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else {
            print("[WatchSessionSvc] WCSession NOT supported")
            return
        }
        WCSession.default.delegate = self
        WCSession.default.activate()
        print("[WatchSessionSvc] WCSession activate() called")

        preAuthorizeHealthKit()
        preAuthorizeLocation()
    }

    /// Request location permission eagerly on first launch so it's ready for standalone runs.
    private func preAuthorizeLocation() {
        let status = CLLocationManager().authorizationStatus
        if status == .notDetermined {
            WatchLocationManager.shared.requestPermission()
            print("[WatchSessionSvc] Location permission requested on launch")
        }
    }

    private func preAuthorizeHealthKit() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        var share: Set<HKSampleType> = [HKObjectType.workoutType()]
        // Request write permission for distance and energy so workouts record actual metrics
        if let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) {
            share.insert(distanceType)
        }
        if let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            share.insert(energyType)
        }
        if let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            share.insert(hrType)
        }
        var read: Set<HKObjectType> = []
        if let hr = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            read.insert(hr)
        }
        healthStore.requestAuthorization(toShare: share, read: read) { [weak self] success, error in
            self?.isHealthKitAuthorized = success
            print("[WatchSessionSvc] HealthKit auth: \(success) err=\(error?.localizedDescription ?? "none")")
        }
    }

    var isPhoneReachable: Bool {
        WCSession.default.isReachable
    }

    func sendCommand(_ command: WatchCommand) {
        let message: [String: Any] = [
            WatchMessageKeys.type: WatchMessageType.command.rawValue,
            WatchMessageKeys.command: command.rawValue,
            WatchMessageKeys.timestamp: Date().timeIntervalSince1970 * 1000
        ]

        guard WCSession.default.activationState == .activated else {
            print("[WatchSession] sendCommand SKIP: not activated — queueing")
            enqueuePendingMessage(message)
            return
        }

        // transferUserInfo: guaranteed delivery (queued, survives app not running)
        WCSession.default.transferUserInfo(message)

        // sendMessage: immediate delivery when phone is reachable.
        // Phone deduplicates by timestamp so double-processing won't occur.
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(message, replyHandler: nil) { [weak self] error in
                print("[WatchSession] sendCommand sendMessage failed: \(error.localizedDescription) — queued for retry")
                self?.enqueuePendingMessage(message)
            }
        }
    }

    func sendHeartRate(_ bpm: Double) {
        guard WCSession.default.isReachable else {
            // Heart rate is ephemeral — don't queue, just drop
            return
        }
        let message: [String: Any] = [
            WatchMessageKeys.type: WatchMessageType.heartRate.rawValue,
            WatchMessageKeys.bpm: bpm,
            WatchMessageKeys.timestamp: Date().timeIntervalSince1970 * 1000
        ]
        WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    /// Request current run state from phone. Uses reply handler for instant response.
    /// Only call when isReachable == true and phone is likely in foreground.
    func requestCurrentState(completion: @escaping ([String: Any]?) -> Void) {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isReachable else {
            completion(nil)
            return
        }

        let message: [String: Any] = [
            WatchMessageKeys.type: WatchMessageType.requestState.rawValue,
            WatchMessageKeys.timestamp: Date().timeIntervalSince1970 * 1000
        ]

        WCSession.default.sendMessage(message, replyHandler: { reply in
            DispatchQueue.main.async {
                completion(reply)
            }
        }, errorHandler: { error in
            print("[WatchSessionSvc] requestState FAIL: \(error.localizedDescription)")
            DispatchQueue.main.async {
                completion(nil)
            }
        })
    }

    // MARK: - Auto-Foreground via HKWorkoutSession
    //
    // When "running" or "countdown" phase arrives from the phone, create
    // HKWorkoutSession and call startActivity() DIRECTLY on the current thread.
    // Apple docs: "startActivity() transitions your app to the Active state"
    //             "You can call startActivity() from any thread."
    //
    // Triggered from all delivery paths: sendMessage, transferUserInfo,
    // applicationContext, and receivedApplicationContext (pending on launch).
    // "countdown" is included because it's the FIRST transferUserInfo delivery
    // opportunity — catching it earlier maximizes foreground success rate.

    /// Foreground-session created directly on WCSession background thread.
    /// WorkoutMirroringManager takes ownership later on the main thread.
    private var foregroundSession: HKWorkoutSession?

    /// Public read-only access for background task coordination.
    /// RunCrewWatchApp's .backgroundTask(.watchConnectivity) checks this
    /// to know when to stop waiting (session created = app will stay alive).
    var hasForegroundSession: Bool {
        foregroundSession != nil
    }

    /// Returns true if the given phase should trigger auto-foreground.
    private func shouldAutoForeground(phase: String?) -> Bool {
        phase == "running" || phase == "countdown"
    }

    /// Check if a message is recent enough to trigger auto-foreground.
    /// Prevents stale applicationContext/transferUserInfo from creating
    /// HKWorkoutSessions or showing CountdownView after app relaunch.
    private func isAutoForegroundFresh(_ message: [String: Any], phase: String) -> Bool {
        let ts = message[WatchMessageKeys.countdownStartedAt] as? Double
            ?? message[WatchMessageKeys.timestamp] as? Double
            ?? 0
        guard ts > 0 else { return false }  // No timestamp → can't verify → treat as stale
        let ageMs = Date().timeIntervalSince1970 * 1000 - ts

        switch phase {
        case "countdown":
            return ageMs >= -5000 && ageMs < 30_000   // 30 seconds
        case "running":
            return ageMs >= -5000 && ageMs < 15_000    // 15 seconds (was 5min — too stale)
        default:
            return true
        }
    }

    /// Called by WatchAppDelegate.handle(_ workoutConfiguration:) when the phone
    /// triggers startWatchApp(). Creates HKWorkoutSession + startActivity() so the
    /// system foregrounds the watch app silently (no UI change).
    ///
    /// The watch stays on IdleView until the phone sends "countdown".
    /// This way the watch countdown starts at the exact same moment as the phone's,
    /// with CountdownView's timestamp-based latency compensation.
    func ensureWorkoutSessionFromPhone() {
        ensureWorkoutSessionForRunning()
        // No synthetic phase dispatch — keep showing IdleView.
        // The real "countdown" phase arrives via WCSession when user taps Start.
    }

    /// Create HKWorkoutSession and call startActivity() directly on the current thread.
    /// Called from WCSession callbacks (background thread) and from handle(_ workoutConfiguration:).
    private func ensureWorkoutSessionForRunning() {
        // Already have a session
        if foregroundSession != nil { return }
        if #available(watchOS 10, *) {
            let mgr = WorkoutMirroringManager.shared
            if let existing = mgr.session {
                // If the existing session is stopped/ended (stale from previous run),
                // clean it up so we can create a new one
                if existing.state == .stopped || existing.state == .ended {
                    print("[WatchSessionSvc] Cleaning up stale mirroring session before creating new one")
                    mgr.cleanup()
                } else {
                    return
                }
            }
        }

        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            // Set delegate BEFORE startActivity() — Apple may require a delegate
            // for the foreground transition to succeed. WorkoutMirroringManager
            // will take full ownership later via adoptSession().
            // Suppress the initial .notStarted→.running callback so the watch
            // doesn't jump to RunningView before "countdown" arrives via WCSession.
            if #available(watchOS 10, *) {
                session.delegate = WorkoutMirroringManager.shared
                WorkoutMirroringManager.shared.suppressInitialCallback = true
            }
            foregroundSession = session
            session.startActivity(with: Date())
            print("[WatchSessionSvc] ✅ HKWorkoutSession created + startActivity()")

            // Haptic to confirm session started (user can feel it)
            DispatchQueue.main.async {
                WKInterfaceDevice.current().play(.start)
            }
        } catch {
            print("[WatchSessionSvc] ❌ HKWorkoutSession FAILED: \(error)")

            // Different haptic for failure
            DispatchQueue.main.async {
                WKInterfaceDevice.current().play(.failure)
            }
        }
    }

    /// Hand off the foreground session to WorkoutMirroringManager.
    /// Called from main thread when RunSessionViewModel processes the state update.
    func handoffForegroundSession() -> HKWorkoutSession? {
        let session = foregroundSession
        foregroundSession = nil
        return session
    }

    /// End and discard the foreground session without handing it off.
    /// Called when transitioning to idle (user cancelled pre-warm / didn't start a run).
    func cancelForegroundSession() {
        if let session = foregroundSession {
            session.end()
            foregroundSession = nil
            print("[WatchSessionSvc] Cancelled foreground session (user didn't start)")
        }
        if #available(watchOS 10, *) {
            WorkoutMirroringManager.shared.cleanup()
        }
    }

    // MARK: - WCSessionDelegate

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        print("[WatchSessionSvc] activation state=\(activationState.rawValue) reachable=\(session.isReachable) err=\(error?.localizedDescription ?? "none")")

        if activationState == .activated {
            // Check for pending applicationContext (delivered while app was not running)
            let ctx = session.receivedApplicationContext
            if !ctx.isEmpty {
                let phase = ctx["phase"] as? String
                print("[WatchSessionSvc] found pending appContext: phase=\(phase ?? "nil")")

                if let phase = phase, shouldAutoForeground(phase: phase) {
                    if isAutoForegroundFresh(ctx, phase: phase) {
                        ensureWorkoutSessionForRunning()
                    } else {
                        print("[WatchSessionSvc] STALE appContext phase=\(phase) — skipping auto-foreground")
                    }
                }

                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }

                    // Always apply weeklyGoalKm from pending context (not phase-dependent)
                    if let goalKm = ctx[WatchMessageKeys.weeklyGoalKm] as? Double, goalKm > 0 {
                        self.onWeeklyGoalUpdate?(goalKm)
                    }

                    // Don't dispatch stale phases from previous runs on app activation.
                    // "completed"/"paused" are always stale (from a previous run).
                    // "countdown"/"running" are stale if the timestamp is too old.
                    if let p = phase {
                        if p == "completed" || p == "paused" {
                            print("[WatchSessionSvc] STALE appContext phase=\(p) — skipping")
                            return
                        }
                        if (p == "countdown" || p == "running"),
                           !self.isAutoForegroundFresh(ctx, phase: p) {
                            print("[WatchSessionSvc] STALE appContext → dispatching idle")
                            return
                        }
                    }
                    self.onStateUpdate?(ctx)
                }
            }
            // No requestCurrentState here — phone pushes state via applicationContext/transferUserInfo.
            // Avoids sendMessage timeout when phone app is backgrounded.
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        routeMessage(message)
    }

    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        routeMessage(message)
        replyHandler([:])
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        print("[WatchSessionSvc] reachability changed: \(session.isReachable)")
        // Flush any queued messages when connectivity is restored
        if session.isReachable {
            flushPendingMessages()
        }
        DispatchQueue.main.async { [weak self] in
            self?.onReachabilityChange?(session.isReachable)
        }
        // No requestCurrentState here — phone pushes state changes.
        // sendMessage times out when phone app is backgrounded even if isReachable == true.
    }

    func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        print("[WatchSessionSvc] didReceiveAppContext: \(applicationContext)")
        let phase = applicationContext["phase"] as? String

        // Freshness check: applicationContext persists across app launches
        // and can contain very stale data. Only auto-foreground if fresh.
        if let phase = phase, shouldAutoForeground(phase: phase) {
            if isAutoForegroundFresh(applicationContext, phase: phase) {
                ensureWorkoutSessionForRunning()
            } else {
                print("[WatchSessionSvc] BLOCKED stale appContext phase=\(phase)")
                return  // Don't process stale applicationContext at all
            }
        }
        DispatchQueue.main.async { [weak self] in
            // Apply weeklyGoalKm from applicationContext
            if let goalKm = applicationContext[WatchMessageKeys.weeklyGoalKm] as? Double, goalKm > 0 {
                self?.onWeeklyGoalUpdate?(goalKm)
            }
            self?.onStateUpdate?(applicationContext)
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        print("[WatchSessionSvc] didReceiveUserInfo: \(userInfo)")
        // Fast-path: transferUserInfo can wake a terminated app.
        // Create HKWorkoutSession immediately before the app gets suspended again.
        // Validate freshness — stale transferUserInfo can persist across app launches.
        if let type = userInfo[WatchMessageKeys.type] as? String,
           type == WatchMessageType.stateUpdate.rawValue,
           let phase = userInfo["phase"] as? String,
           shouldAutoForeground(phase: phase) {
            if isAutoForegroundFresh(userInfo, phase: phase) {
                ensureWorkoutSessionForRunning()
            } else {
                print("[WatchSessionSvc] STALE transferUserInfo phase=\(phase) — skipping")
                return  // Don't route stale countdown/running to UI
            }
        }
        // Route through the same path as regular messages.
        routeMessage(userInfo)
    }

    // MARK: - Message Queue

    /// Enqueue a message for retry when connectivity is restored.
    private func enqueuePendingMessage(_ message: [String: Any]) {
        pendingMessageQueue.append(message)
        // Cap queue size — drop oldest messages if queue is full
        if pendingMessageQueue.count > maxPendingMessages {
            pendingMessageQueue.removeFirst(pendingMessageQueue.count - maxPendingMessages)
        }
    }

    /// Flush all pending messages via transferUserInfo (guaranteed delivery).
    private func flushPendingMessages() {
        guard !pendingMessageQueue.isEmpty,
              WCSession.default.activationState == .activated else { return }

        let messages = pendingMessageQueue
        pendingMessageQueue.removeAll()
        print("[WatchSessionSvc] Flushing \(messages.count) pending messages")

        for message in messages {
            WCSession.default.transferUserInfo(message)
        }
    }

    private func routeMessage(_ message: [String: Any]) {
        guard let typeStr = message[WatchMessageKeys.type] as? String else {
            print("[WatchSessionSvc] routeMessage: no type key in message")
            return
        }

        print("[WatchSessionSvc] routeMessage type=\(typeStr)")

        // Fast-path: create HKWorkoutSession BEFORE dispatching to main queue.
        // This prevents the system from suspending the app between the WCSession
        // callback and the main queue dispatch.
        if typeStr == WatchMessageType.stateUpdate.rawValue {
            let phase = message["phase"] as? String
            if shouldAutoForeground(phase: phase) {
                ensureWorkoutSessionForRunning()
            }
        }

        DispatchQueue.main.async { [weak self] in
            switch typeStr {
            case WatchMessageType.locationUpdate.rawValue:
                self?.onLocationUpdate?(message)
            case WatchMessageType.stateUpdate.rawValue:
                // Check for weeklyGoalKm in state updates (phone includes it)
                if let goalKm = message[WatchMessageKeys.weeklyGoalKm] as? Double, goalKm > 0 {
                    self?.onWeeklyGoalUpdate?(goalKm)
                }
                self?.onStateUpdate?(message)
            case WatchMessageType.milestone.rawValue:
                self?.onMilestone?(message)
            case "resultDismissed":
                self?.onResultDismissed?()
            default:
                break
            }
        }
    }
}
