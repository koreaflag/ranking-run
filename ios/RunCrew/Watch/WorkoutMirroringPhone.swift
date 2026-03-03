import Foundation
import HealthKit

/// Phone-side HKWorkoutSession mirroring receiver.
/// Receives mirrored workout sessions from the Apple Watch for instant phase sync.
/// On iOS < 26, HKWorkoutSession cannot be CREATED on iPhone.
/// The WATCH creates the session and mirrors it to the phone via
/// startMirroringToCompanionDevice(). This manager receives the mirrored session
/// and can call pause()/resume()/end() on it for bidirectional control.
@available(iOS 17, *)
@objc class WorkoutMirroringPhone: NSObject {
    @objc static let shared = WorkoutMirroringPhone()

    private let healthStore = HKHealthStore()
    private(set) var session: HKWorkoutSession?

    /// Fires when HKWorkoutSession state changes. Parameters: (oldPhase, newPhase)
    var onPhaseChange: ((String, String) -> Void)?

    var isSessionActive: Bool {
        guard let session = session else { return false }
        return session.state == .running || session.state == .paused || session.state == .prepared
    }

    private override init() {
        super.init()
    }

    // MARK: - Setup

    /// Register the mirroring start handler to receive sessions from watch.
    /// Must be called early in app lifecycle (e.g., from WatchSessionManager.activate()).
    private var hasRequestedAuth = false

    func setup() {
        healthStore.workoutSessionMirroringStartHandler = { [weak self] mirroredSession in
            DispatchQueue.main.async {
                self?.handleMirroredSession(mirroredSession)
            }
        }
        // Do NOT request HealthKit authorization here — this is called during
        // GPSTrackerModule.init() (RN module registration) before the app's UI is ready.
        // On first install, requestAuthorization triggers a system alert that crashes
        // when no key window exists yet. Auth is deferred to ensureAuthorized().
        NSLog("[WorkoutMirrorPhone] setup complete — mirroring handler registered")
    }

    /// Request HealthKit authorization lazily (first time a workout feature is used).
    func ensureAuthorized() {
        guard !hasRequestedAuth else { return }
        hasRequestedAuth = true
        requestAuthorization { granted in
            NSLog("[WorkoutMirrorPhone] HealthKit auth: %@", granted ? "granted" : "denied")
        }
    }

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false)
            return
        }

        let typesToShare: Set<HKSampleType> = [HKObjectType.workoutType()]
        let typesToRead: Set<HKObjectType> = []

        healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead) { success, error in
            if let error = error {
                NSLog("[WorkoutMirrorPhone] Auth error: %@", error.localizedDescription)
            }
            DispatchQueue.main.async {
                completion(success)
            }
        }
    }

    // MARK: - Watch-Initiated Run (mirrored FROM watch)
    // On iOS < 26, HKWorkoutSession cannot be CREATED on iPhone.
    // The WATCH creates the session and mirrors it to the phone via
    // startMirroringToCompanionDevice(). This manager receives the mirrored session
    // and can call pause()/resume()/end() on it for bidirectional control.

    /// Handle a mirrored session arriving FROM the Apple Watch.
    /// Watch creates HKWorkoutSession + calls startMirroringToCompanionDevice() → phone receives here.
    private func handleMirroredSession(_ mirroredSession: HKWorkoutSession) {
        NSLog("[WorkoutMirrorPhone] Received mirrored session from watch, state=%d", mirroredSession.state.rawValue)

        if let existing = session, existing !== mirroredSession {
            existing.end()
        }

        session = mirroredSession
        mirroredSession.delegate = self
    }

    func pauseRun() {
        guard let session = session else { return }
        session.pause()
        NSLog("[WorkoutMirrorPhone] pause() called")
    }

    func resumeRun() {
        guard let session = session else { return }
        session.resume()
        NSLog("[WorkoutMirrorPhone] resume() called")
    }

    func stopRun() {
        guard let session = session else { return }
        session.end()
        NSLog("[WorkoutMirrorPhone] end() called")

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.cleanup()
        }
    }

    func cleanup() {
        session = nil
        NSLog("[WorkoutMirrorPhone] cleanup complete")
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

@available(iOS 17, *)
extension WorkoutMirroringPhone: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        let oldPhase = mapStateToPhase(fromState)
        let newPhase = mapStateToPhase(toState)
        NSLog("[WorkoutMirrorPhone] state: %d→%d phase: %@→%@",
              fromState.rawValue, toState.rawValue, oldPhase, newPhase)

        DispatchQueue.main.async { [weak self] in
            self?.onPhaseChange?(oldPhase, newPhase)
        }

        if toState == .stopped || toState == .ended {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.cleanup()
            }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        NSLog("[WorkoutMirrorPhone] session failed: %@", error.localizedDescription)
        DispatchQueue.main.async { [weak self] in
            self?.cleanup()
        }
    }
}
