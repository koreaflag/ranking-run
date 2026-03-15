import SwiftUI
import HealthKit
import WatchKit

/// Handles HKHealthStore.startWatchApp(with:) requests from the iPhone.
/// When the phone starts a run, it calls startWatchApp() which triggers
/// handle(_ workoutConfiguration:) here. Creating HKWorkoutSession + startActivity()
/// in response makes the system foreground the watch app (like Nike Run Club).
///
/// IMPORTANT: Do NOT implement handle(_ backgroundTasks:) here —
/// .backgroundTask(.watchConnectivity) in the SwiftUI App handles WCSession background wakes.
class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        print("[WatchAppDelegate] ✅ handle(_ workoutConfiguration:) called — type=\(workoutConfiguration.activityType.rawValue)")

        // Create HKWorkoutSession + startActivity() → system foregrounds the watch app.
        // This is the same logic as WatchSessionService.ensureWorkoutSessionForRunning()
        // but triggered by the system via startWatchApp() from the phone.
        WatchSessionService.shared.ensureWorkoutSessionFromPhone()

        // Haptic feedback
        WKInterfaceDevice.current().play(.start)
    }
}

@main
struct RunCrewWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) var appDelegate
    @StateObject private var viewModel = RunSessionViewModel()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Request HealthKit authorization immediately on app launch.
        // This triggers the system consent dialog so heart rate, workout,
        // and energy data permissions are granted before the first run.
        Self.requestHealthKitAuthorization()

        // Register to receive mirrored workout sessions from iPhone.
        if #available(watchOS 10, *) {
            HKHealthStore().workoutSessionMirroringStartHandler = { mirroredSession in
                DispatchQueue.main.async {
                    WorkoutMirroringManager.shared.handleMirroredSession(mirroredSession)
                }
            }
        }
    }

    /// Request all HealthKit permissions needed for running.
    /// Called once on app launch — system only shows the dialog if not yet determined.
    private static func requestHealthKitAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let store = HKHealthStore()

        var toShare: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let dist = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) {
            toShare.insert(dist)
        }
        if let energy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            toShare.insert(energy)
        }

        var toRead: Set<HKObjectType> = []
        if let hr = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            toRead.insert(hr)
        }
        if let energy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            toRead.insert(energy)
        }

        store.requestAuthorization(toShare: toShare, read: toRead) { success, error in
            print("[RunCrewWatchApp] HealthKit auth: \(success), error: \(error?.localizedDescription ?? "none")")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .onChange(of: scenePhase) { newPhase in
                    if newPhase == .active {
                        viewModel.updateReachabilityStatus()
                        // Immediately poll phone for fresh stats when wrist is raised.
                        // Prevents stale metrics from lingering on the display.
                        viewModel.pollPhoneState()
                    }
                }
        }
        .backgroundTask(.watchConnectivity) {
            // Keep app alive while WCSession processes incoming data.
            // WatchSessionService.ensureWorkoutSessionForRunning() creates
            // HKWorkoutSession on the WCSession callback thread.
            for _ in 0..<30 {
                if WatchSessionService.shared.hasForegroundSession {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    return
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
    }
}
