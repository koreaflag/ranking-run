import SwiftUI

struct ContentView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    @State private var selectedTab = 1

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
        .animation(.easeInOut(duration: 0.1), value: viewModel.state.phase)
    }
}
