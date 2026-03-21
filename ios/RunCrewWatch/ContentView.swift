import SwiftUI
import HealthKit

struct ContentView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    @State private var selectedTab = 1
    @State private var hasRequestedHealthKit = false

    var body: some View {
        Group {
            switch viewModel.state.phase {
            case "running":
                TabView(selection: $selectedTab) {
                    ControlView().tag(0)
                    RunningView().tag(1)
                    if viewModel.state.programTargetDistance > 0 {
                        PaceTargetView().tag(2)
                    }
                    if viewModel.state.isCourseRun {
                        CourseNavigationView().tag(viewModel.state.programTargetDistance > 0 ? 3 : 2)
                    }
                }
                .tabViewStyle(.page)
                .onAppear {
                    if viewModel.state.isCourseRun {
                        selectedTab = viewModel.state.programTargetDistance > 0 ? 3 : 2
                    } else {
                        selectedTab = 1
                    }
                }
            case "paused":
                PausedView()
            case "completed":
                CompletedView()
            case "countdown":
                CountdownView()
            case "navigating":
                NavigateToStartView()
            default:
                IdleView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: viewModel.state.phase)
        .transition(.opacity)
        .onAppear {
            guard !hasRequestedHealthKit else { return }
            hasRequestedHealthKit = true
            requestHealthKitAuth()
        }
    }

    private func requestHealthKitAuth() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        let store = HKHealthStore()
        var toShare: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let d = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) { toShare.insert(d) }
        if let e = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) { toShare.insert(e) }
        if let h = HKQuantityType.quantityType(forIdentifier: .heartRate) { toShare.insert(h) }
        var toRead: Set<HKObjectType> = []
        if let h = HKQuantityType.quantityType(forIdentifier: .heartRate) { toRead.insert(h) }
        if let e = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) { toRead.insert(e) }
        store.requestAuthorization(toShare: toShare, read: toRead) { success, error in
            print("[ContentView] HealthKit auth: \(success), error: \(error?.localizedDescription ?? "none")")
        }
    }
}
