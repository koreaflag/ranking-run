import Foundation
import WatchConnectivity

/// Singleton that owns WCSession and mediates Phone <-> Watch communication
final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    // Callbacks for RN bridge
    var onWatchCommand: (([String: Any]) -> Void)?
    var onHeartRateUpdate: (([String: Any]) -> Void)?
    var onWatchReachabilityChange: ((Bool) -> Void)?

    private var lastSendTime: TimeInterval = 0
    private let throttleInterval: TimeInterval = 1.0  // 1 second minimum between location updates
    private(set) var lastRunState: [String: Any]?  // Cache last state for re-send on reconnect
    private(set) var currentRunPhase: String = "idle"

    private override init() {
        super.init()
    }

    private var session: WCSession { WCSession.default }

    func activate() {
        guard WCSession.isSupported() else {
            NSLog("[WatchSessionMgr] WCSession NOT supported")
            return
        }
        session.delegate = self
        session.activate()
        NSLog("[WatchSessionMgr] WCSession activate() called")
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

    /// Send location update to Watch (throttled, fire-and-forget)
    func sendLocationUpdate(_ data: [String: Any]) {
        let now = Date().timeIntervalSince1970
        guard now - lastSendTime >= throttleInterval else { return }
        guard session.isReachable else { return }
        lastSendTime = now

        var message = data
        message["type"] = "locationUpdate"
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    /// Send state update to Watch.
    /// Phase transitions get aggressive retry + applicationContext.
    /// Continuous metric updates (same phase) get a single sendMessage.
    func sendRunStateUpdate(_ state: [String: Any]) {
        var message = state
        message["type"] = "stateUpdate"
        lastRunState = message

        let newPhase = state["phase"] as? String
        let isPhaseChange = newPhase != nil && newPhase != currentRunPhase

        if let phase = newPhase {
            currentRunPhase = phase
        }

        if isPhaseChange {
            // Critical phase transition: applicationContext + 3x retry
            NSLog("[WatchSessionMgr] PHASE CHANGE → %@ reachable=%d",
                  newPhase ?? "nil", session.isReachable ? 1 : 0)

            do {
                try session.updateApplicationContext(message)
            } catch {
                NSLog("[WatchSessionMgr] updateApplicationContext FAIL: %@", error.localizedDescription)
            }

            trySendMessage(message)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.trySendMessage(message)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
                self?.trySendMessage(message)
            }
        } else {
            // Continuous metrics: single send, no retry
            trySendMessage(message)
        }
    }

    private func trySendMessage(_ message: [String: Any]) {
        guard session.activationState == .activated else { return }
        session.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    /// Send km milestone to Watch
    func sendMilestone(km: Int, splitPace: Int, totalTime: Int) {
        guard session.isReachable else { return }
        session.sendMessage(
            [
                "type": "milestone",
                "kilometer": km,
                "splitPace": splitPace,
                "totalTime": totalTime
            ],
            replyHandler: nil,
            errorHandler: nil
        )
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        NSLog("[WatchSessionMgr] activation state=%d paired=%d installed=%d reachable=%d err=%@",
              activationState.rawValue, session.isPaired ? 1 : 0,
              session.isWatchAppInstalled ? 1 : 0, session.isReachable ? 1 : 0,
              error?.localizedDescription ?? "none")
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()  // Re-activate for Watch switching
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        NSLog("[WatchSessionMgr] reachability changed: %d", session.isReachable ? 1 : 0)
        onWatchReachabilityChange?(session.isReachable)

        // When Watch becomes reachable, re-send last run state immediately
        if session.isReachable, let state = lastRunState {
            session.sendMessage(state, replyHandler: nil, errorHandler: nil)
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let type = message["type"] as? String else { return }
        switch type {
        case "command":
            onWatchCommand?(message)
        case "heartRate":
            onHeartRateUpdate?(message)
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
            onWatchCommand?(message)
            replyHandler(["status": "ok"])
        case "heartRate":
            onHeartRateUpdate?(message)
            replyHandler(["status": "ok"])
        case "requestState":
            // Watch is asking for current run state
            NSLog("[WatchSessionMgr] Watch requested state → phase=%@", currentRunPhase)
            if let state = lastRunState {
                replyHandler(state)
            } else {
                replyHandler(["type": "stateUpdate", "phase": currentRunPhase])
            }
        default:
            replyHandler(["status": "unknown"])
        }
    }
}
