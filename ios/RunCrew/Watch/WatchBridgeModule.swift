import Foundation
import React

/// React Native Bridge Module for Apple Watch Connectivity
@objc(WatchBridgeModule)
class WatchBridgeModule: RCTEventEmitter {
    private var hasListeners = false

    /// Buffer standalone runs received while JS has no listeners (app backgrounded).
    /// Flushed when JS starts observing again.
    private var pendingStandaloneRuns: [[String: Any]] = []
    private let pendingLock = NSLock()

    override init() {
        super.init()
        // WCSession is already activated in AppDelegate.
        // Just set up callbacks to receive data.
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
        WatchSessionManager.shared.onWeeklyGoalFromWatch = { [weak self] data in
            self?.sendEventIfListening("Watch_onWeeklyGoalUpdate", body: data)
        }
        WatchSessionManager.shared.onStandaloneStatusUpdate = { [weak self] data in
            self?.sendEventIfListening("Watch_onStandaloneStatus", body: data)
        }
        WatchSessionManager.shared.onStandaloneRunReceived = { [weak self] data in
            guard let self = self else { return }
            NSLog("[WatchBridgeModule] Standalone run received, hasListeners=%d", self.hasListeners ? 1 : 0)

            if self.hasListeners {
                self.sendEvent(withName: "Watch_onStandaloneRun", body: data)
            } else {
                self.pendingLock.lock()
                self.pendingStandaloneRuns.append(data)
                self.pendingLock.unlock()
                NSLog("[WatchBridgeModule] Buffered standalone run (JS not listening), pending=%d", self.pendingStandaloneRuns.count)
            }
        }
    }

    // MARK: - RCTEventEmitter

    override func supportedEvents() -> [String]! {
        return [
            "Watch_onCommand",
            "Watch_onHeartRate",
            "Watch_onReachabilityChange",
            "Watch_onStandaloneRun",
            "Watch_onStandaloneStatus",
            "Watch_onWeeklyGoalUpdate"
        ]
    }

    override func startObserving() {
        hasListeners = true
        // Flush any standalone runs that arrived while JS wasn't listening
        flushPendingRuns()
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

    private func flushPendingRuns() {
        pendingLock.lock()
        let runs = pendingStandaloneRuns
        pendingStandaloneRuns.removeAll()
        pendingLock.unlock()

        guard !runs.isEmpty else { return }
        NSLog("[WatchBridgeModule] Flushing %d buffered standalone run(s)", runs.count)

        for run in runs {
            sendEvent(withName: "Watch_onStandaloneRun", body: run)
        }
    }

    // MARK: - Exported Methods

    @objc
    func sendRunState(_ state: NSDictionary,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let dict = state as? [String: Any] {
            // Non-authoritative: useWatchCompanion fires on every metric change and
            // can deliver stale phases through the async RN bridge. The manager will
            // block stale phase reversions that arrive shortly after an authoritative
            // phase change from GPSTrackerModule.
            WatchSessionManager.shared.sendRunStateUpdate(dict, authoritative: false)
        }
        resolve(nil)
    }

    @objc
    func sendWeeklyGoalToWatch(_ goalKm: Double,
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        WatchSessionManager.shared.sendWeeklyGoalToWatch(goalKm)
        resolve(nil)
    }

    @objc
    func sendResultDismissed(_ resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        WatchSessionManager.shared.sendResultDismissedToWatch()
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
