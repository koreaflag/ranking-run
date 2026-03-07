import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

/// Dedicated tab view for program running (pace target).
/// Shows time delta, required vs current pace, progress bar, and projected finish.
/// Visible only when programTargetDistance > 0 (running with a program goal).
struct PaceTargetView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    private var s: WatchRunState { viewModel.state }

    private var progressPercent: Double {
        guard s.programTargetDistance > 0 else { return 0 }
        return min(1.0, s.distance / s.programTargetDistance)
    }

    private var projectedFinish: Int {
        guard s.distance > 0, s.duration > 0 else { return 0 }
        return Int((s.programTargetDistance / s.distance) * Double(s.duration))
    }

    private var statusColor: Color {
        switch s.programStatus {
        case "ahead": return .green
        case "on_pace": return appOrange
        case "behind": return .yellow
        case "critical": return .red
        default: return .gray
        }
    }

    var body: some View {
        VStack(spacing: 6) {
            // Required pace
            HStack(spacing: 4) {
                Image(systemName: "target")
                    .font(.system(size: 10))
                    .foregroundColor(appOrange)
                Text("목표 \(formatPace(s.programRequiredPace)) /km")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
            }

            // Time delta (hero)
            VStack(spacing: 2) {
                Text(formatTimeDelta(s.programTimeDelta))
                    .font(.system(size: 36, weight: .black, design: .monospaced))
                    .foregroundColor(statusColor)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)

                Text(s.programTimeDelta >= 0 ? "목표보다 빠름" : "목표보다 느림")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(statusColor.opacity(0.8))
            }
            .padding(.vertical, 4)

            // Current pace
            Text("현재 \(formatPace(s.avgPace)) /km")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.gray)

            // Progress bar
            VStack(spacing: 3) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.1))
                            .frame(height: 6)

                        RoundedRectangle(cornerRadius: 3)
                            .fill(statusColor)
                            .frame(width: geo.size.width * progressPercent, height: 6)
                    }
                }
                .frame(height: 6)

                HStack {
                    Text(String(format: "%.1f", s.distance / 1000))
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)
                    Spacer()
                    Text(String(format: "%.1f km", s.programTargetDistance / 1000))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.gray)
                }
            }
            .padding(.horizontal, 4)

            // Projected finish vs target
            HStack(spacing: 8) {
                VStack(spacing: 1) {
                    Text("예상")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.gray)
                    Text(formatDuration(projectedFinish))
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                }

                Text("·")
                    .font(.system(size: 14))
                    .foregroundColor(.gray.opacity(0.5))

                VStack(spacing: 1) {
                    Text("목표")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.gray)
                    Text(formatDuration(Int(s.programTargetTime)))
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(appOrange)
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }

    // MARK: - Formatters

    private func formatPace(_ secondsPerKm: Int) -> String {
        guard secondsPerKm > 0 else { return "--'--\"" }
        let m = secondsPerKm / 60
        let s = secondsPerKm % 60
        return "\(m)'\(String(format: "%02d", s))\""
    }

    private func formatTimeDelta(_ delta: Double) -> String {
        let absDelta = Int(abs(delta))
        let sign = delta >= 0 ? "+" : "-"
        let minutes = absDelta / 60
        let seconds = absDelta % 60
        if minutes > 0 {
            return "\(sign)\(minutes):\(String(format: "%02d", seconds))"
        }
        return "\(sign)0:\(String(format: "%02d", seconds))"
    }

    private func formatDuration(_ totalSeconds: Int) -> String {
        guard totalSeconds > 0 else { return "--:--" }
        let m = totalSeconds / 60
        let s = totalSeconds % 60
        return "\(m):\(String(format: "%02d", s))"
    }
}
