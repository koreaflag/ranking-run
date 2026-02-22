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

        guard WCSession.default.activationState == .activated else {
            print("[WatchSession] sendCommand SKIP: not activated")
            return
        }

        // Always queue transferUserInfo for guaranteed delivery.
        // Also try sendMessage for faster delivery (fire-and-forget, ignore errors).
        WCSession.default.transferUserInfo(message)
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
        }
    }

    func sendHeartRate(_ bpm: Double) {
        guard WCSession.default.isReachable else { return }
        let message: [String: Any] = [
            WatchMessageKeys.type: WatchMessageType.heartRate.rawValue,
            WatchMessageKeys.bpm: bpm,
            WatchMessageKeys.timestamp: Date().timeIntervalSince1970 * 1000
        ]
        WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    // requestCurrentState removed — phone pushes all state via
    // applicationContext, transferUserInfo, and sendMessage.
    // Pull-based polling caused persistent sendMessage timeouts
    // because isReachable == true doesn't guarantee phone will respond.

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
        DispatchQueue.main.async { [weak self] in
            self?.onStateUpdate?(applicationContext)
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        print("[WatchSessionSvc] didReceiveUserInfo: \(userInfo)")
        // transferUserInfo is used as backup delivery for phase changes
        // Route it like a regular message so phase transitions are handled
        routeMessage(userInfo)
        // Also trigger onStateUpdate directly for phase changes (guaranteed delivery path)
        if let type = userInfo["type"] as? String, type == WatchMessageType.stateUpdate.rawValue {
            DispatchQueue.main.async { [weak self] in
                self?.onStateUpdate?(userInfo)
            }
        }
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
