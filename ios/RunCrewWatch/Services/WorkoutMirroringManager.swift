import Foundation
import HealthKit

/// Manages HKWorkoutSession with mirroring for instant phone↔watch phase sync.
/// On watchOS 10+, workout state changes (start/pause/resume/stop) propagate
/// through Apple's dedicated workout channel (~10-20ms) instead of WCSession (~100-300ms).
///
/// Falls back gracefully: on watchOS < 10, callers should use the legacy WCSession path.
@available(watchOS 10, *)
class WorkoutMirroringManager: NSObject, ObservableObject {
    static let shared = WorkoutMirroringManager()

    private let healthStore = HKHealthStore()
    private(set) var session: HKWorkoutSession?
    private(set) var builder: HKLiveWorkoutBuilder?

    /// Fires when HKWorkoutSession state changes. Parameters: (oldPhase, newPhase)
    var onPhaseChange: ((String, String) -> Void)?
    /// Fires when heart rate data is collected from the builder
    var onHeartRateUpdate: ((Double) -> Void)?

    /// When true, the next HKWorkoutSession delegate phase callback is suppressed.
    /// Set by WatchSessionService.ensureWorkoutSessionForRunning() to prevent
    /// the initial .notStarted→.running transition from showing the running screen
    /// before the actual "countdown" phase arrives via WCSession.
    var suppressInitialCallback = false

    var isSessionActive: Bool {
        guard let session = session else { return false }
        return session.state == .running || session.state == .paused || session.state == .prepared
    }

    private override init() {
        super.init()
    }

    // MARK: - Session Lifecycle

    /// Phase 1: Create session + startActivity() ONLY.
    /// This is the minimum needed to foreground the app.
    /// Called synchronously from WCSession callbacks via DispatchQueue.main.sync.
    /// Builder, mirroring, and data collection are deferred to startRunFullSetup().
    func startRunMinimal() {
        guard session == nil else {
            print("[WorkoutMirror] startRunMinimal SKIP: session already exists (state=\(session?.state.rawValue ?? -1))")
            return
        }

        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor

        do {
            let newSession = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            newSession.delegate = self
            session = newSession

            newSession.startActivity(with: Date())
            print("[WorkoutMirror] ✅ startRunMinimal: session created + startActivity() called")
        } catch {
            print("[WorkoutMirror] ❌ startRunMinimal FAILED: \(error)")
        }
    }

    /// Phase 2: Set up builder, data source, mirroring, and begin collection.
    /// Called from main queue after the session is already created and startActivity() has been called.
    func startRunFullSetup() {
        guard let session = session else {
            print("[WorkoutMirror] startRunFullSetup SKIP: no session")
            return
        }
        guard builder == nil else {
            print("[WorkoutMirror] startRunFullSetup SKIP: builder already exists")
            return
        }

        let config = session.workoutConfiguration
        builder = session.associatedWorkoutBuilder()
        builder?.delegate = self
        builder?.dataSource = HKLiveWorkoutDataSource(
            healthStore: healthStore,
            workoutConfiguration: config
        )

        // Mirror to iPhone → instant phase sync
        Task {
            do {
                try await session.startMirroringToCompanionDevice()
                print("[WorkoutMirror] ✅ Mirroring started successfully")
            } catch {
                print("[WorkoutMirror] ⚠️ startMirroring error: \(error)")
            }
        }

        builder?.beginCollection(withStart: session.startDate ?? Date()) { success, error in
            if let error = error {
                print("[WorkoutMirror] beginCollection error: \(error.localizedDescription)")
            }
        }

        print("[WorkoutMirror] ✅ Full setup complete (builder + mirroring)")
    }

    /// Adopt an existing HKWorkoutSession created by WatchSessionService on a background thread.
    /// The session already has startActivity() called — we just need to take ownership,
    /// set ourselves as delegate, and prepare for full setup (builder + mirroring).
    func adoptSession(_ existingSession: HKWorkoutSession) {
        guard session == nil else {
            print("[WorkoutMirror] adoptSession SKIP: already have session (state=\(session?.state.rawValue ?? -1))")
            return
        }
        existingSession.delegate = self
        session = existingSession
        print("[WorkoutMirror] ✅ adoptSession: took ownership of existing session (state=\(existingSession.state.rawValue))")
    }

    /// Convenience: create session + full setup in one call.
    /// Used when not called from a WCSession fast-path (e.g., watch-initiated runs).
    func startRun() {
        startRunMinimal()
        startRunFullSetup()
    }

    /// Handle a mirrored session arriving FROM the iPhone.
    /// Called when phone creates a workout and mirrors it to watch.
    /// The OS auto-foregrounds the watch app when the mirrored session arrives.
    func handleMirroredSession(_ mirroredSession: HKWorkoutSession) {
        print("[WorkoutMirror] Received mirrored session from phone, state=\(mirroredSession.state.rawValue)")

        // Clean up WatchSessionService's foreground session (created by fast-path
        // before the mirrored session arrived). End it to avoid two active sessions.
        if let foreground = WatchSessionService.shared.handoffForegroundSession() {
            foreground.end()
            print("[WorkoutMirror] Ended WatchSessionService foreground session (replaced by mirrored)")
        }

        // Clean up any existing session in this manager
        if let existing = session, existing !== mirroredSession {
            existing.end()
        }

        session = mirroredSession
        mirroredSession.delegate = self

        // Set up builder for heart rate collection
        builder = mirroredSession.associatedWorkoutBuilder()
        builder?.delegate = self
        let config = mirroredSession.workoutConfiguration
        builder?.dataSource = HKLiveWorkoutDataSource(
            healthStore: healthStore,
            workoutConfiguration: config
        )

        // Start collecting heart rate data
        builder?.beginCollection(withStart: mirroredSession.startDate ?? Date()) { success, error in
            if let error = error {
                print("[WorkoutMirror] mirrored beginCollection error: \(error.localizedDescription)")
            }
        }
    }

    func pauseRun() {
        guard let session = session else { return }
        session.pause()
        print("[WorkoutMirror] pause() called")
    }

    func resumeRun() {
        guard let session = session else { return }
        session.resume()
        print("[WorkoutMirror] resume() called")
    }

    func stopRun() {
        guard let session = session else { return }
        session.end()
        print("[WorkoutMirror] end() called")

        builder?.endCollection(withEnd: Date()) { [weak self] success, error in
            self?.builder?.finishWorkout { workout, error in
                DispatchQueue.main.async {
                    self?.cleanup()
                }
            }
        }
    }

    /// Reset session state without ending (for when session already ended via mirroring)
    func cleanup() {
        if let session = session {
            Task {
                try? await session.stopMirroringToCompanionDevice()
            }
        }
        session = nil
        builder = nil
        print("[WorkoutMirror] cleanup complete")
    }

    // MARK: - State Mapping

    private func mapStateToPhase(_ state: HKWorkoutSessionState) -> String {
        switch state {
        case .notStarted, .prepared:
            return "idle"
        case .running:
            return "running"
        case .paused:
            return "paused"
        case .stopped, .ended:
            return "completed"
        @unknown default:
            return "idle"
        }
    }
}

// MARK: - HKWorkoutSessionDelegate

@available(watchOS 10, *)
extension WorkoutMirroringManager: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        let oldPhase = mapStateToPhase(fromState)
        let newPhase = mapStateToPhase(toState)
        print("[WorkoutMirror] state: \(fromState.rawValue)→\(toState.rawValue) phase: \(oldPhase)→\(newPhase)")

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.suppressInitialCallback {
                self.suppressInitialCallback = false
                print("[WorkoutMirror] suppressed initial phase callback: \(oldPhase)→\(newPhase)")
                return
            }
            self.onPhaseChange?(oldPhase, newPhase)
        }

        // Auto-cleanup when session ends
        if toState == .stopped || toState == .ended {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.cleanup()
            }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        print("[WorkoutMirror] session failed: \(error)")
        DispatchQueue.main.async { [weak self] in
            self?.cleanup()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate (Heart Rate)

@available(watchOS 10, *)
extension WorkoutMirroringManager: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // Not needed
    }

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType,
                  quantityType == HKQuantityType.quantityType(forIdentifier: .heartRate)
            else { continue }

            let statistics = workoutBuilder.statistics(for: quantityType)
            guard let heartRateQuantity = statistics?.mostRecentQuantity() else { continue }

            let bpm = heartRateQuantity.doubleValue(
                for: HKUnit.count().unitDivided(by: .minute())
            )

            DispatchQueue.main.async { [weak self] in
                self?.onHeartRateUpdate?(bpm)
            }
        }
    }
}
