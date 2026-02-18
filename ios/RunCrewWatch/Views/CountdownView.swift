import SwiftUI
import WatchKit

struct CountdownView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    @State private var countdown = 3
    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 1.0
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 12) {
            if countdown > 0 {
                Text("\(countdown)")
                    .font(.system(size: 72, weight: .heavy, design: .rounded))
                    .foregroundColor(.green)
                    .scaleEffect(scale)
                    .opacity(opacity)
                    .accessibilityLabel("카운트다운 \(countdown)")
            } else {
                Text("GO!")
                    .font(.system(size: 52, weight: .heavy, design: .rounded))
                    .foregroundColor(.green)
                    .scaleEffect(scale)
                    .opacity(opacity)
                    .accessibilityLabel("출발")
            }
        }
        .onAppear {
            startCountdown()
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
    }

    private func startCountdown() {
        countdown = 3
        animateTick()

        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            countdown -= 1
            if countdown < 0 {
                timer?.invalidate()
                timer = nil
                return
            }
            animateTick()
        }
    }

    private func animateTick() {
        // Haptic feedback on each tick
        WKInterfaceDevice.current().play(countdown > 0 ? .click : .start)

        // Reset and animate
        scale = 1.5
        opacity = 0.3
        withAnimation(.easeOut(duration: 0.4)) {
            scale = 1.0
            opacity = 1.0
        }
    }
}
