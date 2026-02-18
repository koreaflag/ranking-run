import SwiftUI

struct ContentView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        Group {
            switch viewModel.state.phase {
            case "running":
                if viewModel.state.isCourseRun {
                    TabView {
                        RunningView()
                        CourseNavigationView()
                    }
                    .tabViewStyle(.page)
                } else {
                    RunningView()
                }
            case "paused":
                if viewModel.state.isCourseRun {
                    TabView {
                        PausedView()
                        CourseNavigationView()
                    }
                    .tabViewStyle(.page)
                } else {
                    PausedView()
                }
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
