import Foundation
import React

/// React Native Bridge Module for Apple Watch Connectivity
@objc(WatchBridgeModule)
class WatchBridgeModule: RCTEventEmitter {
    private var hasListeners = false

    override init() {
        super.init()
        setupCallbacks()
    }

    private func setupCallbacks() {
        WatchSessionManager.shared.onWatchCommand = { [weak self] command in
            self?.sendEventIfListening("Watch_onCommand", body: command)
        }
        WatchSessionManager.shared.onHeartRateUpdate = { [weak self] data in
            self?.sendEventIfListening("Watch_onHeartRate", body: data)
        }
        WatchSessionManager.shared.onWatchReachabilityChange = { [weak self] reachable in
            self?.sendEventIfListening("Watch_onReachabilityChange", body: ["isReachable": reachable])
        }
    }

    // MARK: - RCTEventEmitter

    override func supportedEvents() -> [String]! {
        return [
            "Watch_onCommand",
            "Watch_onHeartRate",
            "Watch_onReachabilityChange"
        ]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    private func sendEventIfListening(_ name: String, body: Any?) {
        guard hasListeners else { return }
        sendEvent(withName: name, body: body)
    }

    // MARK: - Exported Methods

    @objc
    func sendRunState(_ state: NSDictionary,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let dict = state as? [String: Any] {
            WatchSessionManager.shared.sendRunStateUpdate(dict)
        }
        resolve(nil)
    }

    @objc
    func getWatchStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve([
            "isPaired": WatchSessionManager.shared.isWatchPaired,
            "isReachable": WatchSessionManager.shared.isWatchReachable,
            "isAppInstalled": WatchSessionManager.shared.isWatchAppInstalled
        ])
    }
}
