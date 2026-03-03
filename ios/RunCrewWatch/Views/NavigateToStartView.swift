import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)
private let appGreen = Color(red: 0.063, green: 0.725, blue: 0.506)

struct NavigateToStartView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 8) {
            Spacer()

            if viewModel.state.navToStartReady {
                // Arrived at start
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(appGreen)

                Text("시작 지점 도착!")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.top, 4)

                Text("폰에서 시작하세요")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.gray)
            } else {
                // Navigation arrow
                Image(systemName: "location.north.fill")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundColor(appOrange)
                    .rotationEffect(.degrees(viewModel.state.navToStartBearing >= 0
                        ? viewModel.state.navToStartBearing
                        : 0))

                // Distance to start
                Text(viewModel.formattedNavToStartDistance())
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(.top, 4)

                Text("코스 시작점으로 이동")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.gray)
            }

            Spacer()
        }
        .padding(.vertical, 8)
    }
}
