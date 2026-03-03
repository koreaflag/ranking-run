import SwiftUI
import WatchKit

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct CountdownView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    @State private var displayNumber = 3
    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 1.0
    @State private var timer: Timer?
    @State private var lastShownNumber = -1
    @State private var showGo = false
    @State private var goPulse: CGFloat = 1.0
    @State private var goOpacity: Double = 1.0

    var body: some View {
        VStack(spacing: 12) {
            if showGo {
                // "GO!" — stays visible until phase changes to "running"
                Text("GO!")
                    .font(.system(size: 64, weight: .heavy, design: .rounded))
                    .foregroundColor(appOrange)
                    .scaleEffect(goPulse)
                    .opacity(goOpacity)
            } else if displayNumber > 0 {
                // Countdown numbers
                Text("\(displayNumber)")
                    .font(.system(size: 72, weight: .heavy, design: .rounded))
                    .foregroundColor(appOrange)
                    .scaleEffect(scale)
                    .opacity(opacity)
                    .accessibilityLabel("카운트다운 \(displayNumber)")
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
        updateDisplay()

        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            updateDisplay()
        }
    }

    private func updateDisplay() {
        let total = viewModel.state.countdownTotal > 0 ? viewModel.state.countdownTotal : 3
        let startedAt = viewModel.state.countdownStartedAt
        let newNumber = computeDisplayNumber(total: total, startedAt: startedAt)

        if newNumber != lastShownNumber {
            lastShownNumber = newNumber

            if newNumber > 0 {
                displayNumber = newNumber
                animateTick()
            } else if newNumber == 0 {
                showGoAnimation()
            }
        }

        if newNumber <= 0 {
            timer?.invalidate()
            timer = nil
        }
    }

    private func computeDisplayNumber(total: Int, startedAt: Double) -> Int {
        guard startedAt > 0 else {
            return total
        }
        let nowMs = Date().timeIntervalSince1970 * 1000
        let elapsedSec = (nowMs - startedAt) / 1000.0
        let remaining = Double(total) - elapsedSec
        if remaining <= 0 { return 0 }
        return Int(ceil(remaining))
    }

    private func showGoAnimation() {
        showGo = true
        WKInterfaceDevice.current().play(.start)

        // Animate GO! entrance
        goPulse = 0.3
        goOpacity = 0.0
        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
            goPulse = 1.0
            goOpacity = 1.0
        }

        // Subtle breathing pulse while waiting for running phase
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                goPulse = 1.08
            }
        }
    }

    private func animateTick() {
        WKInterfaceDevice.current().play(.click)

        scale = 1.5
        opacity = 0.3
        withAnimation(.easeOut(duration: 0.4)) {
            scale = 1.0
            opacity = 1.0
        }
    }
}
