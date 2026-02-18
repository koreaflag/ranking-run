import Foundation
import HealthKit

class HeartRateManager: NSObject, ObservableObject {
    private var healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

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
        let typesToRead: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        ]

        healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead) { success, error in
            if let error = error {
                print("[HeartRateManager] Authorization error: \(error.localizedDescription)")
            }
            DispatchQueue.main.async {
                completion(success)
            }
        }
    }

    func startWorkoutSession() {
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
        session?.end()
        builder?.endCollection(withEnd: Date()) { [weak self] success, error in
            self?.builder?.finishWorkout { workout, error in
                DispatchQueue.main.async {
                    self?.isActive = false
                    self?.currentHeartRate = 0
                }
            }
        }
    }
}

// MARK: - HKWorkoutSessionDelegate

extension HeartRateManager: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        // State tracking handled by isActive
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        print("[HeartRateManager] Workout session failed: \(error)")
        DispatchQueue.main.async { [weak self] in
            self?.isActive = false
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

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
