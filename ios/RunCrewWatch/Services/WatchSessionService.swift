import Foundation
import WatchConnectivity

class WatchSessionService: NSObject, WCSessionDelegate {
    static let shared = WatchSessionService()

    var onStateUpdate: (([String: Any]) -> Void)?
    var onLocationUpdate: (([String: Any]) -> Void)?
    var onMilestone: (([String: Any]) -> Void)?
    var onReachabilityChange: ((Bool) -> Void)?

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
        WCSession.default.sendMessage(message, replyHandler: nil) { error in
            print("[WatchSession] Failed to send command: \(error.localizedDescription)")
        }
    }

    func sendHeartRate(_ bpm: Double) {
        let message: [String: Any] = [
            WatchMessageKeys.type: WatchMessageType.heartRate.rawValue,
            WatchMessageKeys.bpm: bpm,
            WatchMessageKeys.timestamp: Date().timeIntervalSince1970 * 1000
        ]
        WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    /// Ask Phone for current run state (bypasses applicationContext requirement)
    /// Always attempts to send — isReachable is flaky in dev builds
    func requestCurrentState(completion: (([String: Any]) -> Void)? = nil) {
        guard WCSession.default.activationState == .activated else {
            completion?(["error": "not_activated"])
            return
        }
        let message: [String: Any] = [
            WatchMessageKeys.type: WatchMessageType.requestState.rawValue,
            WatchMessageKeys.timestamp: Date().timeIntervalSince1970 * 1000
        ]
        WCSession.default.sendMessage(message, replyHandler: { [weak self] reply in
            DispatchQueue.main.async {
                self?.onStateUpdate?(reply)
                completion?(reply)
            }
        }, errorHandler: { error in
            DispatchQueue.main.async {
                completion?(["error": error.localizedDescription])
            }
        })
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
                print("[WatchSessionSvc] found pending appContext: \(ctx)")
                DispatchQueue.main.async { [weak self] in
                    self?.onStateUpdate?(ctx)
                }
            }

            // Always request current state after activation (don't gate on isReachable)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.requestCurrentState()
            }
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
        DispatchQueue.main.async { [weak self] in
            self?.onReachabilityChange?(session.isReachable)
        }
        // When phone becomes reachable, request current state
        if session.isReachable {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                self?.requestCurrentState()
            }
        }
    }

    func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        print("[WatchSessionSvc] didReceiveAppContext: \(applicationContext)")
        DispatchQueue.main.async { [weak self] in
            self?.onStateUpdate?(applicationContext)
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        print("[WatchSessionSvc] didReceiveUserInfo: \(userInfo)")
        routeMessage(userInfo)
    }

    private func routeMessage(_ message: [String: Any]) {
        guard let typeStr = message[WatchMessageKeys.type] as? String else {
            print("[WatchSessionSvc] routeMessage: no type key in message")
            return
        }

        print("[WatchSessionSvc] routeMessage type=\(typeStr)")

        DispatchQueue.main.async { [weak self] in
            switch typeStr {
            case WatchMessageType.locationUpdate.rawValue:
                self?.onLocationUpdate?(message)
            case WatchMessageType.stateUpdate.rawValue:
                self?.onStateUpdate?(message)
            case WatchMessageType.milestone.rawValue:
                self?.onMilestone?(message)
            default:
                break
            }
        }
    }
}
