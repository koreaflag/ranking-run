import AVFoundation
import Foundation
import React

/// React Native Bridge Module for GPS Tracking
@objc(GPSTrackerModule)
class GPSTrackerModule: RCTEventEmitter {
    private var locationEngine: LocationEngine?
    private var hasListeners = false
    /// Keep sending events while GPS tracking is active, even if JS bridge suspends.
    /// When the app goes to background, RN calls stopObserving() which would set hasListeners=false,
    /// causing ALL GPS events to be silently dropped. This flag prevents that.
    private var isTrackingActive = false
    /// Buffer events emitted while hasListeners is false (JS bridge suspended in background).
    /// Flushed when startObserving() is called again (app returns to foreground).
    private var pendingEvents: [(name: String, body: Any?)] = []
    private let eventLock = NSLock()
    private var notificationObservers: [NSObjectProtocol] = []

    override init() {
        super.init()
        WatchSessionManager.shared.activate()
        setupEngine()
        observeWatchStartCommand()
        // Send idle state to clear any stale applicationContext from previous sessions
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            if WatchSessionManager.shared.currentRunPhase == "idle" {
                WatchSessionManager.shared.sendRunStateUpdate(["phase": "idle"])
            }
        }
    }

    private func setupEngine() {
        let engine = LocationEngine()

        engine.onLocationUpdate = { [weak self] event in
            self?.sendEventIfListening("GPSTracker_onLocationUpdate", body: event)
        }

        engine.onGPSStatusChange = { [weak self] event in
            self?.sendEventIfListening("GPSTracker_onGPSStatusChange", body: event)
        }

        engine.onRunningStateChange = { [weak self] event in
            self?.sendEventIfListening("GPSTracker_onRunningStateChange", body: event)
        }

        engine.onWatchLocationUpdate = { event in
            WatchSessionManager.shared.sendLocationUpdate(event)
        }

        engine.onMilestoneReached = { [weak self] km, splitPace, totalTime in
            WatchSessionManager.shared.sendMilestone(km: km, splitPace: splitPace, totalTime: totalTime)
            // Emit to JS so splits are recorded in the running store
            self?.sendEventIfListening("GPSTracker_onMilestoneReached", body: [
                "km": km,
                "splitPaceSecondsPerKm": splitPace,
                "totalTimeSeconds": totalTime
            ])
        }

        engine.onHeadingUpdate = { [weak self] event in
            self?.sendEventIfListening("GPSTracker_onHeadingUpdate", body: event)
        }

        locationEngine = engine
    }

    /// Listen for Watch commands via NotificationCenter.
    /// Handles start/pause/resume/stop natively for instant response (bypasses JS bridge round-trip).
    deinit {
        for observer in notificationObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        notificationObservers.removeAll()
    }

    private func observeWatchStartCommand() {
        let startObserver = NotificationCenter.default.addObserver(
            forName: WatchSessionManager.watchStartRunNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            NSLog("[GPSTrackerModule] Watch start command received — starting tracking")
            self.hasListeners = true
            self.isTrackingActive = true
            self.locationEngine?.startTracking()
            WatchSessionManager.shared.sendRunStateUpdate([
                "phase": "running",
                "distanceMeters": 0,
                "durationSeconds": 0,
                "currentPace": 0,
                "avgPace": 0,
                "calories": 0
            ])
            // Notify RN so it can navigate to RunningScreen
            self.sendEvent(withName: "GPSTracker_onWatchStartRun", body: nil)
        }
        notificationObservers.append(startObserver)

        let pauseObserver = NotificationCenter.default.addObserver(
            forName: WatchSessionManager.watchPauseRunNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            NSLog("[GPSTrackerModule] Watch pause command received")
            self.locationEngine?.pauseTracking()
            WatchSessionManager.shared.sendRunStateUpdate(["phase": "paused"])
        }
        notificationObservers.append(pauseObserver)

        let resumeObserver = NotificationCenter.default.addObserver(
            forName: WatchSessionManager.watchResumeRunNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            NSLog("[GPSTrackerModule] Watch resume command received")
            self.locationEngine?.resumeTracking()
            WatchSessionManager.shared.sendRunStateUpdate(["phase": "running"])
        }
        notificationObservers.append(resumeObserver)

        let stopObserver = NotificationCenter.default.addObserver(
            forName: WatchSessionManager.watchStopRunNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            NSLog("[GPSTrackerModule] Watch stop command received")
            self.isTrackingActive = false
            self.locationEngine?.stopTracking()
            WatchSessionManager.shared.sendRunStateUpdate(["phase": "completed"])
        }
        notificationObservers.append(stopObserver)
    }

    // MARK: - RCTEventEmitter

    override func supportedEvents() -> [String]! {
        return [
            "GPSTracker_onLocationUpdate",
            "GPSTracker_onGPSStatusChange",
            "GPSTracker_onRunningStateChange",
            "GPSTracker_onHeadingUpdate",
            "GPSTracker_onWatchStartRun",
            "GPSTracker_onMilestoneReached"
        ]
    }

    override func startObserving() {
        hasListeners = true
        // Flush any events that were buffered while JS bridge was suspended
        flushPendingEvents()
    }

    override func stopObserving() {
        // Only clear hasListeners if NOT actively tracking.
        // During background GPS tracking, we must keep emitting events.
        if !isTrackingActive {
            hasListeners = false
        }
        // If tracking is active, hasListeners stays true so events continue flowing.
        // Events that fail to send (bridge suspended) will be buffered.
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    private func sendEventIfListening(_ name: String, body: Any?) {
        if hasListeners {
            sendEvent(withName: name, body: body)
        } else if isTrackingActive {
            // Tracking is active but JS bridge is suspended — buffer event
            // Only buffer the latest location update (don't let buffer grow unbounded)
            eventLock.lock()
            if name == "GPSTracker_onLocationUpdate" {
                // Replace previous buffered location with latest
                pendingEvents.removeAll { $0.name == "GPSTracker_onLocationUpdate" }
            }
            pendingEvents.append((name: name, body: body))
            // Cap buffer size
            if pendingEvents.count > 50 {
                pendingEvents.removeFirst(pendingEvents.count - 50)
            }
            eventLock.unlock()
        }
    }

    private func flushPendingEvents() {
        eventLock.lock()
        let events = pendingEvents
        pendingEvents.removeAll()
        eventLock.unlock()

        for event in events {
            sendEvent(withName: event.name, body: event.body)
        }
    }

    // MARK: - Exported Methods

    /// Pre-launch watch app when RunningScreen mounts (like Nike Run Club).
    /// The watch app foregrounds and shows "준비됨" (preparing) state,
    /// ready to receive the countdown instantly when user taps Start.
    @objc
    func preWarmWatchApp(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        WatchSessionManager.shared.launchWatchApp()
        resolve(nil)
    }

    /// Cancel watch pre-warm if user navigates back without starting a run.
    /// Sends "idle" to the watch so it returns to its idle screen.
    @objc
    func cancelWatchPreWarm(_ resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        WatchSessionManager.shared.sendRunStateUpdate(["phase": "idle"])
        resolve(nil)
    }

    /// Called from JS right when user taps START — sends "countdown" to Watch
    /// directly from native, bypassing the RN bridge round-trip for minimal latency.
    @objc
    func notifyCountdownStart(_ countdownSeconds: Int,
                               startedAt jsStartedAt: Double,
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Use JS timestamp (captured at the exact moment phone shows "3")
        // instead of native Date() — eliminates RN bridge latency from sync.
        let startedAt = jsStartedAt > 0 ? jsStartedAt : Date().timeIntervalSince1970 * 1000
        WatchSessionManager.shared.sendRunStateUpdate([
            "phase": "countdown",
            "countdownStartedAt": startedAt,
            "countdownTotal": countdownSeconds,
            "distanceMeters": 0,
            "durationSeconds": 0,
            "currentPace": 0,
            "avgPace": 0,
            "calories": 0
        ])
        resolve(nil)
    }

    /// Notify Watch of "running" phase when startTracking() was already called earlier
    /// (e.g. navigate-to-start flow where GPS is already active).
    @objc
    func notifyRunningPhase(_ resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        WatchSessionManager.shared.sendRunStateUpdate([
            "phase": "running",
            "distanceMeters": 0,
            "durationSeconds": 0,
            "currentPace": 0,
            "avgPace": 0,
            "calories": 0
        ])
        resolve(nil)
    }

    @objc
    func startTracking(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        hasListeners = true
        isTrackingActive = true
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.startTracking()
            // Watch app is already launched via launchWatchApp() during countdown phase.
            // WCSession delivery (also carries metrics)
            WatchSessionManager.shared.sendRunStateUpdate([
                "phase": "running",
                "distanceMeters": 0,
                "durationSeconds": 0,
                "currentPace": 0,
                "avgPace": 0,
                "calories": 0
            ])
            resolve(nil)
        }
    }

    @objc
    func stopTracking(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        isTrackingActive = false
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.stopTracking()
            WatchSessionManager.shared.stopMirroredWorkout()
            WatchSessionManager.shared.sendRunStateUpdate(["phase": "completed"])
            resolve(nil)
        }
    }

    @objc
    func pauseTracking(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.pauseTracking()
            WatchSessionManager.shared.pauseMirroredWorkout()
            WatchSessionManager.shared.sendRunStateUpdate(["phase": "paused"])
            resolve(nil)
        }
    }

    @objc
    func resumeTracking(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.resumeTracking()
            WatchSessionManager.shared.resumeMirroredWorkout()
            WatchSessionManager.shared.sendRunStateUpdate(["phase": "running"])
            resolve(nil)
        }
    }

    @objc
    func getRawGPSPoints(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let points = locationEngine?.getRawGPSPoints() ?? []
        resolve(points)
    }

    @objc
    func getFilteredRoute(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        let route = locationEngine?.getFilteredRoute() ?? []
        resolve(route)
    }

    @objc
    func getSmoothedRoute(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let engine = locationEngine else {
            resolve(["route": [], "distance": 0] as [String: Any])
            return
        }
        let result = engine.getSmoothedRoute()
        resolve(["route": result.route, "distance": result.distance] as [String: Any])
    }

    @objc
    func getCurrentStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        let status = locationEngine?.getCurrentStatus() ?? "disabled"
        resolve(status)
    }

    @objc
    func requestLocationPermission() {
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.requestPermission()
        }
    }

    @objc
    func startHeadingUpdates(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Force-enable listeners — NativeEventEmitter may not call startObserving()
        // in newer React Native versions, causing all events to be silently dropped.
        hasListeners = true
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.startHeadingOnly()
            resolve(nil)
        }
    }

    @objc
    func stopHeadingUpdates(_ resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            self?.locationEngine?.stopHeadingOnly()
            resolve(nil)
        }
    }

    @objc
    func isLowPowerModeEnabled(_ resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(ProcessInfo.processInfo.isLowPowerModeEnabled)
    }

    /// Configure AVAudioSession for TTS speech playback.
    /// Sets .playback category with .duckOthers so speech plays through the mute switch
    /// and ducks background music/podcasts during announcements.
    @objc
    func configureAudioForSpeech(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
            try session.setActive(true)
            resolve(nil)
        } catch {
            NSLog("[GPSTrackerModule] configureAudioForSpeech error: %@", error.localizedDescription)
            resolve(nil)  // Don't reject — speech should still attempt
        }
    }

    /// Restore audio session after speech. Unduck other audio and return to
    /// mixWithOthers so silent background audio can keep running.
    @objc
    func restoreAudioAfterSpeech(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            resolve(nil)
        } catch {
            resolve(nil)
        }
    }
}
