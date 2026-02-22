import SwiftUI

@main
struct RunCrewWatchApp: App {
    @StateObject private var viewModel = RunSessionViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .onChange(of: scenePhase) { newPhase in
                    if newPhase == .active {
                        // App came to foreground — refresh connection status
                        viewModel.updateReachabilityStatus()
                    }
                }
        }
    }
}
