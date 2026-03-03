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

    @Published var currentHeartRate: Double = 0
    @Published var isActive: Bool = false

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            print("[HeartRateManager] HealthKit not available on this device")
            completion(false)
            return
        }

        let typesToShare: Set<HKSampleType> = [HKObjectType.workoutType()]
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
            session?.end()
            builder?.endCollection(withEnd: Date()) { [weak self] success, error in
                self?.builder?.finishWorkout { workout, error in
                    DispatchQueue.main.async {
                        self?.isActive = false
                        self?.currentHeartRate = 0
                        self?.session = nil
                        self?.builder = nil
                    }
                }
            }
        } else {
            // External session — capture builder reference before clearing,
            // then end collection asynchronously without risk of nil access
            let externalBuilder = builder
            isActive = false
            currentHeartRate = 0
            session = nil
            builder = nil
            externalBuilder?.endCollection(withEnd: Date()) { _, _ in
                print("[HeartRateManager] External builder collection ended")
            }
            print("[HeartRateManager] Detached from external builder")
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
            guard let quantityType = type as? HKQuantityType,
                  quantityType == HKQuantityType.quantityType(forIdentifier: .heartRate)
            else { continue }

            let statistics = workoutBuilder.statistics(for: quantityType)
            guard let heartRateQuantity = statistics?.mostRecentQuantity() else { continue }

            let bpm = heartRateQuantity.doubleValue(
                for: HKUnit.count().unitDivided(by: .minute())
            )

            DispatchQueue.main.async { [weak self] in
                self?.currentHeartRate = bpm
                self?.onHeartRateUpdate?(bpm)
            }
        }
    }
}
