import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

/// Shown when the phone pre-launches the watch app (like Nike Run Club).
/// The watch is foregrounded and waiting for the user to tap Start on the phone.
struct PreparingView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            // Pulsing icon
            Image(systemName: "figure.run")
                .font(.system(size: 40))
                .foregroundColor(appOrange)
                .scaleEffect(pulse ? 1.15 : 1.0)
                .opacity(pulse ? 1.0 : 0.6)
                .animation(
                    .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                    value: pulse
                )

            Text("준비됨")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)

            Text("폰에서 시작하세요")
                .font(.system(size: 12))
                .foregroundColor(.gray)

            Spacer()
        }
        .onAppear {
            pulse = true
            viewModel.updateReachabilityStatus()
        }
    }
}
