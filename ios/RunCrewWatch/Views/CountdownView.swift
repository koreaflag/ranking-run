import SwiftUI

struct CountdownView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 16) {
            Text("준비")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.gray)

            Image(systemName: "figure.run")
                .font(.system(size: 48))
                .foregroundColor(.green)
                .opacity(viewModel.state.duration % 2 == 0 ? 1.0 : 0.6)
                .animation(.easeInOut(duration: 0.5), value: viewModel.state.duration)

            Text("곧 시작합니다")
                .font(.system(size: 14))
                .foregroundColor(.gray)
        }
    }
}
