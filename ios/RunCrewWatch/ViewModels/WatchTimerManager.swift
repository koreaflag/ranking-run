import Foundation
import WatchConnectivity

/// Manages all timers used by the watch run session:
/// duration timer, state sync timer, state poll timer, auto-pause timer,
/// and countdown auto-transition timer.
class WatchTimerManager {

    // MARK: - Callbacks

    /// Called every second to update duration display (companion mode).
    var onDurationTick: (() -> Void)?
    /// Called every second to update standalone duration.
    var onStandaloneDurationTick: (() -> Void)?
    /// Called when reachability should be refreshed.
    var onReachabilityTick: (() -> Void)?
    /// Called to poll phone state.
    var onStatePoll: (() -> Void)?
    /// Called when auto-pause timer fires.
    var onAutoPauseTick: (() -> Void)?
    /// Called when countdown auto-transition fires.
    var onCountdownAutoTransition: (() -> Void)?

    // MARK: - Timer State

    /// Server-anchored duration: stores the last server duration and when it was received.
    var anchorDuration: Int = 0
    var anchorTime: Date = .distantPast

    // MARK: - Private Timers

    private var durationTimer: Timer?
    private var stateSyncTimer: Timer?      // reachability timer
    private var statePollTimer: Timer?
    private(set) var autoPauseTimer: Timer?
    private var countdownAutoTransitionTimer: Timer?

    // MARK: - Duration Timer (Server-Anchored, companion mode)

    func updateAnchorDuration(_ serverDuration: Int) {
        guard serverDuration >= anchorDuration else { return }
        anchorDuration = serverDuration
        anchorTime = Date()
    }

    func restartDurationTimer() {
        durationTimer?.invalidate()
        anchorTime = Date()
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.onDurationTick?()
        }
    }

    func restartStandaloneDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.onStandaloneDurationTick?()
        }
    }

    func stopDurationTimer() {
        durationTimer?.invalidate()
        durationTimer = nil
    }

    // MARK: - Reachability Sync Timer

    func startReachabilityTimer() {
        stopReachabilityTimer()
        stateSyncTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.onReachabilityTick?()
        }
    }

    func stopReachabilityTimer() {
        stateSyncTimer?.invalidate()
        stateSyncTimer = nil
    }

    // MARK: - State Poll Timer

    func startStatePollTimer(interval: TimeInterval) {
        stopStatePollTimer()
        statePollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.onStatePoll?()
        }
    }

    func stopStatePollTimer() {
        statePollTimer?.invalidate()
        statePollTimer = nil
    }

    // MARK: - Auto-Pause Timer

    func startAutoPauseTimer() {
        autoPauseTimer?.invalidate()
        autoPauseTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.onAutoPauseTick?()
        }
    }

    func stopAutoPauseTimer() {
        autoPauseTimer?.invalidate()
        autoPauseTimer = nil
    }

    // MARK: - Countdown Auto-Transition

    func scheduleCountdownAutoTransition(delay: TimeInterval) {
        cancelCountdownAutoTransition()
        let safeDelay = max(delay, 0.05)
        print("[Watch] Scheduling auto-transition in \(String(format: "%.1f", safeDelay))s")
        countdownAutoTransitionTimer = Timer.scheduledTimer(
            withTimeInterval: safeDelay,
            repeats: false
        ) { [weak self] _ in
            self?.onCountdownAutoTransition?()
        }
    }

    func cancelCountdownAutoTransition() {
        countdownAutoTransitionTimer?.invalidate()
        countdownAutoTransitionTimer = nil
    }

    // MARK: - Reset

    func resetAnchors() {
        anchorDuration = 0
        anchorTime = .distantPast
    }

    func invalidateAll() {
        durationTimer?.invalidate()
        stateSyncTimer?.invalidate()
        statePollTimer?.invalidate()
        autoPauseTimer?.invalidate()
        countdownAutoTransitionTimer?.invalidate()
        durationTimer = nil
        stateSyncTimer = nil
        statePollTimer = nil
        autoPauseTimer = nil
        countdownAutoTransitionTimer = nil
    }
}
