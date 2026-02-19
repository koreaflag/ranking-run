import SwiftUI
import WatchKit

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct ControlView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    @State private var isWaterLocked = false

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            // Pause button — large circular
            Button(action: {
                viewModel.sendPauseCommand()
            }) {
                Image(systemName: "pause.fill")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.black)
                    .frame(width: 72, height: 72)
                    .background(appOrange)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("일시정지")

            // Water lock button — smaller
            Button(action: {
                isWaterLocked = true
                WKInterfaceDevice.current().enableWaterLock()
            }) {
                HStack(spacing: 6) {
                    Image(systemName: isWaterLocked ? "lock.fill" : "drop.fill")
                        .font(.system(size: 14))
                    Text("수중잠금")
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundColor(.cyan)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.cyan.opacity(0.15))
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("수중잠금")

            Spacer()
        }
    }
}
