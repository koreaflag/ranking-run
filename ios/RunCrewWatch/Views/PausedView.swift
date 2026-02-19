import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct PausedView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 6) {
            // Paused indicator
            Text("일시정지")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.yellow)
                .padding(.top, 4)

            // Duration
            Text(viewModel.formattedDuration())
                .font(.system(size: 22, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
                .accessibilityLabel("시간 \(viewModel.formattedDuration())")

            // Distance
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(viewModel.formattedDistance())
                    .font(.system(size: 18, weight: .heavy, design: .monospaced))
                    .foregroundColor(appOrange)
                Text("km")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.gray)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("거리 \(viewModel.formattedDistance()) 킬로미터")

            Spacer()

            // Control buttons
            HStack(spacing: 20) {
                // Resume button — large green circle
                Button(action: { viewModel.sendResumeCommand() }) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 22))
                        .foregroundColor(.black)
                        .frame(width: 56, height: 56)
                        .background(appOrange)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("다시 시작")

                // Stop button — long press 3 seconds
                LongPressStopButton()
            }
            .padding(.bottom, 8)
        }
    }
}

// MARK: - Long Press Stop Button (3-second hold to stop)

struct LongPressStopButton: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    @State private var isPressed = false
    @State private var progress: CGFloat = 0
    @State private var timer: Timer?

    var body: some View {
        ZStack {
            // Background ring (gray)
            Circle()
                .stroke(Color.gray.opacity(0.3), lineWidth: 4)
                .frame(width: 56, height: 56)

            // Progress ring (red, fills as held)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Color.red, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 56, height: 56)
                .rotationEffect(.degrees(-90))

            // Stop icon
            Image(systemName: "stop.fill")
                .font(.system(size: 18))
                .foregroundColor(isPressed ? .red : .white)
        }
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !isPressed { startLongPress() }
                }
                .onEnded { _ in
                    cancelLongPress()
                }
        )
        .accessibilityLabel("런닝 종료")
        .accessibilityHint("3초 동안 길게 누르면 종료됩니다")
    }

    private func startLongPress() {
        isPressed = true
        progress = 0
        HapticManager.shared.countdownTick()

        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { t in
            progress += 0.05 / 3.0  // fills over 3 seconds
            if progress >= 1.0 {
                t.invalidate()
                timer = nil
                isPressed = false
                HapticManager.shared.runCompleted()
                viewModel.sendStopCommand()
            }
        }
    }

    private func cancelLongPress() {
        isPressed = false
        progress = 0
        timer?.invalidate()
        timer = nil
    }
}
