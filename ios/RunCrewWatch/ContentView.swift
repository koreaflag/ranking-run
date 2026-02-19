import SwiftUI

struct ContentView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        Group {
            switch viewModel.state.phase {
            case "running":
                TabView {
                    RunningView()
                    ControlView()
                    if viewModel.state.isCourseRun {
                        CourseNavigationView()
                    }
                }
                .tabViewStyle(.page)
            case "paused":
                PausedView()
            case "completed":
                CompletedView()
            case "countdown":
                CountdownView()
            default:
                IdleView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: viewModel.state.phase)
    }
}
