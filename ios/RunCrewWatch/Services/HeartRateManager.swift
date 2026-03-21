import Foundation
import HealthKit

class HeartRateManager: NSObject, ObservableObject {
    private var healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    /// When true, this manager created its own session (legacy/standalone mode).
    /// When false, an external session was provided (mirroring mode).
    private var ownsSession = false

    var onHeartRateUpdate: ((Double) -> Void)?
    var onCaloriesUpdate: ((Int) -> Void)?

    @Published var currentHeartRate: Double = 0
    @Published var isActive: Bool = false

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[HeartRateManager] HealthKit not available on this device")
            completion(false)
            return
        }

        var typesToShare: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) {
            typesToShare.insert(distanceType)
        }
        if let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            typesToShare.insert(energyType)
        }
        if let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            typesToShare.insert(heartRateType)
        }
        var typesToRead: Set<HKObjectType> = []
        if let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            typesToRead.insert(heartRateType)
        }
        if let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            typesToRead.insert(energyType)
        }

        healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead) { success, error in
            if let error = error {
                print("[HeartRateManager] Authorization error: \(error.localizedDescription)")
            }
            DispatchQueue.main.async {
                completion(success)
            }
        }
    }

    /// Attach to an external builder (from WorkoutMirroringManager).
    /// HeartRateManager only collects heart rate data, does NOT own the session.
    func attachToBuilder(_ externalBuilder: HKLiveWorkoutBuilder) {
        // Don't create our own session — the mirroring manager owns it
        builder = externalBuilder
        builder?.delegate = self
        ownsSession = false
        isActive = true
        print("[HeartRateManager] Attached to external builder (mirroring mode)")
    }

    /// Create and start a standalone workout session (legacy/standalone mode).
    /// Only used when WorkoutMirroringManager is not available (watchOS < 10)
    /// or in standalone mode.
    func startWorkoutSession() {
        // If already attached to an external builder, skip session creation
        guard builder == nil else {
            print("[HeartRateManager] Already has builder — skipping session creation")
            return
        }

        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor

        do {
            session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            builder = session?.associatedWorkoutBuilder()

            session?.delegate = self
            builder?.delegate = self
            builder?.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: config
            )

            ownsSession = true

            let startDate = Date()
            session?.startActivity(with: startDate)
            builder?.beginCollection(withStart: startDate) { [weak self] success, error in
                DispatchQueue.main.async {
                    self?.isActive = success
                }
            }
        } catch {
            print("[HeartRateManager] Failed to start workout session: \(error)")
        }
    }

    func stopWorkoutSession() {
        if ownsSession {
            let endDate = Date()
            // End collection BEFORE ending the session (Apple docs requirement).
            // Capture references to avoid accessing self after cleanup.
            let capturedSession = session
            let capturedBuilder = builder
            capturedBuilder?.endCollection(withEnd: endDate) { [weak self] success, error in
                if let error = error {
                    print("[HeartRateManager] endCollection error: \(error.localizedDescription)")
                }
                capturedBuilder?.finishWorkout { workout, error in
                    if let error = error {
                        print("[HeartRateManager] finishWorkout error: \(error.localizedDescription)")
                    }
                    DispatchQueue.main.async {
                        capturedSession?.end()
                        self?.isActive = false
                        self?.currentHeartRate = 0
                        self?.session = nil
                        self?.builder = nil
                    }
                }
            }
        } else {
            // External session — WorkoutMirroringManager owns the builder lifecycle.
            // Do NOT call endCollection here — it would conflict with
            // WorkoutMirroringManager.stopRun() which calls endCollection + finishWorkout.
            // Just detach our references and let the owner handle cleanup.
            isActive = false
            currentHeartRate = 0
            session = nil
            builder = nil
            print("[HeartRateManager] Detached from external builder (owner handles lifecycle)")
        }
    }
}

// MARK: - HKWorkoutSessionDelegate (only active in legacy/standalone mode)

extension HeartRateManager: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        // State tracking handled by isActive — mirroring manager handles phase changes
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        print("[HeartRateManager] Workout session failed: \(error)")
        DispatchQueue.main.async { [weak self] in
            self?.isActive = false
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate (heart rate collection)

extension HeartRateManager: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // Not needed for heart rate
    }

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType else { continue }

            if quantityType == HKQuantityType.quantityType(forIdentifier: .heartRate) {
                let statistics = workoutBuilder.statistics(for: quantityType)
                guard let heartRateQuantity = statistics?.mostRecentQuantity() else { continue }

                let bpm = heartRateQuantity.doubleValue(
                    for: HKUnit.count().unitDivided(by: .minute())
                )

                DispatchQueue.main.async { [weak self] in
                    self?.currentHeartRate = bpm
                    self?.onHeartRateUpdate?(bpm)
                }
            } else if quantityType == HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
                let statistics = workoutBuilder.statistics(for: quantityType)
                guard let energySum = statistics?.sumQuantity() else { continue }

                let kcal = energySum.doubleValue(for: .kilocalorie())

                DispatchQueue.main.async { [weak self] in
                    self?.onCaloriesUpdate?(Int(kcal))
                }
            }
        }
    }
}
