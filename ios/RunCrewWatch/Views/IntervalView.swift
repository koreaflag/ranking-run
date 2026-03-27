import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

/// Dedicated tab view for interval training.
/// Shows current phase (run/walk), phase countdown, set progress, and total remaining time.
/// Visible only when goalType == "interval".
struct IntervalView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    private var s: WatchRunState { viewModel.state }

    private var isRunPhase: Bool { s.intervalPhase == "run" }
    private var phaseColor: Color { isRunPhase ? appOrange : .green }

    private var setProgress: Double {
        guard s.intervalTotalSets > 0 else { return 0 }
        return Double(s.intervalCurrentSet) / Double(s.intervalTotalSets)
    }

    var body: some View {
        VStack(spacing: 6) {
            // Phase indicator
            HStack(spacing: 6) {
                Image(systemName: isRunPhase ? "figure.run" : "figure.walk")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(phaseColor)
                Text(isRunPhase ? "RUN" : "WALK")
                    .font(.system(size: 16, weight: .black, design: .rounded))
                    .foregroundColor(phaseColor)
            }
            .padding(.vertical, 2)

            // Phase countdown (hero)
            if s.intervalCompleted {
                Text("DONE")
                    .font(.system(size: 40, weight: .black, design: .rounded))
                    .foregroundColor(.green)
            } else {
                Text(formatCountdown(s.intervalPhaseRemaining))
                    .font(.system(size: 44, weight: .black, design: .monospaced))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            }

            // Phase progress bar
            if !s.intervalCompleted {
                let phaseDuration = isRunPhase ? s.intervalRunSeconds : s.intervalWalkSeconds
                let phaseProgress = phaseDuration > 0
                    ? 1.0 - (Double(s.intervalPhaseRemaining) / Double(phaseDuration))
                    : 0
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.1))
                            .frame(height: 5)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(phaseColor)
                            .frame(width: geo.size.width * min(1.0, phaseProgress), height: 5)
                    }
                }
                .frame(height: 5)
                .padding(.horizontal, 12)
            }

            // Set counter
            HStack(spacing: 4) {
                Text("SET")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.gray)
                Text("\(s.intervalCurrentSet)/\(s.intervalTotalSets)")
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
            }
            .padding(.top, 2)

            // Set progress dots
            if s.intervalTotalSets <= 10 {
                HStack(spacing: 4) {
                    ForEach(1...s.intervalTotalSets, id: \.self) { i in
                        Circle()
                            .fill(i <= s.intervalCurrentSet ? phaseColor : Color.gray.opacity(0.3))
                            .frame(width: 8, height: 8)
                    }
                }
            }

            // Distance
            HStack(spacing: 4) {
                Text(viewModel.formattedDistance())
                    .font(.system(size: 16, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
                Text("km")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.gray)
            }
            .padding(.top, 2)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }

    // MARK: - Formatters

    private func formatCountdown(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }
}
