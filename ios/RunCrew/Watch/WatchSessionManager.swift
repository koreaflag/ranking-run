import Foundation
import UIKit
import WatchConnectivity

/// Singleton that owns WCSession and mediates Phone <-> Watch communication
@objcMembers
final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    // Callbacks for RN bridge
    var onWatchCommand: (([String: Any]) -> Void)?
    var onHeartRateUpdate: (([String: Any]) -> Void)?
    var onWatchReachabilityChange: ((Bool) -> Void)?
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

    /// Posted when Watch sends a "start" command so GPSTrackerModule can begin tracking.
    static let watchStartRunNotification = Notification.Name("WatchStartRunRequested")

    private override init() {
        super.init()
    }

    private var session: WCSession { WCSession.default }

    /// Route Watch commands, with special handling for "start" (triggers native GPS tracking).
    private func handleWatchCommand(_ message: [String: Any]) {
        let cmd = message["command"] as? String ?? ""
        NSLog("[WatchSessionMgr] handleWatchCommand: %@", cmd)

        if cmd == "start" {
            // Immediately start tracking on the native side and notify RN
            NotificationCenter.default.post(name: Self.watchStartRunNotification, object: nil)
        }

        // Forward all commands (including start) to RN bridge
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
    /// Phase transitions get aggressive retry + applicationContext + transferUserInfo.
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
            // Critical phase transition: applicationContext + transferUserInfo + 3x retry
            NSLog("[WatchSessionMgr] PHASE CHANGE → %@ reachable=%d activated=%d paired=%d installed=%d",
                  newPhase ?? "nil", session.isReachable ? 1 : 0,
                  session.activationState.rawValue,
                  session.isPaired ? 1 : 0,
                  session.isWatchAppInstalled ? 1 : 0)

            do {
                try session.updateApplicationContext(message)
                NSLog("[WatchSessionMgr] updateApplicationContext OK")
            } catch {
                NSLog("[WatchSessionMgr] updateApplicationContext FAIL: %@", error.localizedDescription)
            }

            // transferUserInfo: queued, guaranteed delivery even if watch app is not running
            session.transferUserInfo(message)
            NSLog("[WatchSessionMgr] transferUserInfo queued for phase=%@", newPhase ?? "nil")

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
        guard session.activationState == .activated else {
            NSLog("[WatchSessionMgr] trySendMessage SKIP: not activated (state=%d)", session.activationState.rawValue)
            return
        }
        session.sendMessage(message, replyHandler: nil) { error in
            NSLog("[WatchSessionMgr] sendMessage FAIL: %@", error.localizedDescription)
        }
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
        // Delay alert so root view controller is ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            self.showDebugAlert("WCSession Activated",
                                "state=\(activationState.rawValue) paired=\(session.isPaired) reachable=\(session.isReachable)")
        }
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
        default:
            break
        }
    }

    // DEBUG: show native alert to verify data reaches phone
    private func showDebugAlert(_ title: String, _ message: String) {
        DispatchQueue.main.async {
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let root = scene.windows.first?.rootViewController {
                root.present(alert, animated: true)
            }
        }
    }

    // Handle transferUserInfo (guaranteed delivery, used for standalone run sync + command fallback)
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        let type = userInfo["type"] as? String ?? ""
        NSLog("[WatchSessionMgr] didReceiveUserInfo type=%@", type)
        showDebugAlert("didReceiveUserInfo", "type=\(type) keys=\(userInfo.keys.sorted().joined(separator: ","))")

        switch type {
        case "standaloneRunComplete":
            NSLog("[WatchSessionMgr] Received standalone run via transferUserInfo")
            deliverStandaloneRun(userInfo)
        case "command":
            handleWatchCommand(userInfo)
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
