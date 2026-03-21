import ActivityKit
import WidgetKit
import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

// MARK: - Live Activity Widget

struct RunningLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunningActivityAttributes.self) { context in
            // Lock Screen / Notification Banner
            LockScreenRunView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // ── Expanded ──
                DynamicIslandExpandedRegion(.leading) {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(formatDistance(context.state.distanceMeters))
                            .font(.system(size: 28, weight: .heavy, design: .rounded).monospacedDigit())
                            .foregroundColor(appOrange)
                            .contentTransition(.numericText())
                        Text("km")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.gray)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.isPaused {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(formatDuration(context.state.durationSeconds))
                                .font(.system(size: 28, weight: .heavy, design: .rounded).monospacedDigit())
                                .foregroundColor(.yellow)
                            Text("PAUSED")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.yellow.opacity(0.7))
                        }
                    } else {
                        Text(context.state.timerStartDate, style: .timer)
                            .font(.system(size: 28, weight: .heavy, design: .rounded).monospacedDigit())
                            .foregroundColor(.white)
                            .multilineTextAlignment(.trailing)
                    }
                }

                DynamicIslandExpandedRegion(.center) {
                    // intentionally empty — clean look
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 0) {
                        ExpandedStatCell(
                            icon: "speedometer",
                            value: formatPace(context.state.currentPace),
                            label: "페이스",
                            accentColor: appOrange
                        )

                        capsuleDivider

                        ExpandedStatCell(
                            icon: "chart.line.uptrend.xyaxis",
                            value: formatPace(context.state.avgPace),
                            label: "평균",
                            accentColor: .cyan
                        )

                        capsuleDivider

                        ExpandedStatCell(
                            icon: "heart.fill",
                            value: context.state.heartRate > 0 ? "\(context.state.heartRate)" : "--",
                            label: "BPM",
                            accentColor: .red
                        )

                        capsuleDivider

                        ExpandedStatCell(
                            icon: "flame.fill",
                            value: "\(context.state.calories)",
                            label: "kcal",
                            accentColor: Color(red: 1.0, green: 0.35, blue: 0.35)
                        )
                    }
                    .padding(.top, 2)
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                // Compact — left pill
                HStack(spacing: 4) {
                    Image(systemName: "figure.run")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(appOrange)
                    Text(formatDistance(context.state.distanceMeters))
                        .font(.system(size: 14, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundColor(.white)
                        .contentTransition(.numericText())
                }
            } compactTrailing: {
                // Compact — right pill
                if context.state.isPaused {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.yellow)
                } else {
                    Text(context.state.timerStartDate, style: .timer)
                        .font(.system(size: 14, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundColor(appOrange)
                        .multilineTextAlignment(.center)
                        .frame(minWidth: 40)
                }
            } minimal: {
                // Minimal (when another app also has a live activity)
                ZStack {
                    Circle()
                        .strokeBorder(appOrange, lineWidth: 1.5)
                    Image(systemName: "figure.run")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(appOrange)
                }
            }
        }
    }

    private var capsuleDivider: some View {
        RoundedRectangle(cornerRadius: 0.5)
            .fill(Color.white.opacity(0.15))
            .frame(width: 1, height: 22)
    }
}

// MARK: - Expanded Stat Cell

private struct ExpandedStatCell: View {
    let icon: String
    let value: String
    let label: String
    var accentColor: Color = .white

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(accentColor)
                Text(value)
                    .font(.system(size: 15, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundColor(.white)
            }
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Lock Screen View

private struct LockScreenRunView: View {
    let context: ActivityViewContext<RunningActivityAttributes>

    var body: some View {
        VStack(spacing: 0) {
            // ── Top: Brand + status ──
            HStack(spacing: 5) {
                Image(systemName: "figure.run")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(appOrange)
                Text("RUNVS")
                    .font(.system(size: 10, weight: .heavy, design: .rounded))
                    .foregroundColor(.white.opacity(0.35))
                    .tracking(1.2)

                if context.state.isPaused {
                    Text("PAUSED")
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.black)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1.5)
                        .background(Capsule().fill(.yellow))
                }

                Spacer()

                if context.attributes.isCourseRun && !context.attributes.courseName.isEmpty {
                    HStack(spacing: 3) {
                        Image(systemName: "map.fill")
                            .font(.system(size: 8))
                            .foregroundColor(appOrange.opacity(0.6))
                        Text(context.attributes.courseName)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.white.opacity(0.3))
                            .lineLimit(1)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 6)

            // ── Center: Distance + Timer ──
            HStack(alignment: .firstTextBaseline) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(formatDistance(context.state.distanceMeters))
                        .font(.system(size: 38, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundColor(appOrange)
                        .contentTransition(.numericText())
                    Text("km")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white.opacity(0.35))
                }

                Spacer()

                if context.state.isPaused {
                    Text(formatDuration(context.state.durationSeconds))
                        .font(.system(size: 28, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundColor(.yellow)
                } else {
                    Text(context.state.timerStartDate, style: .timer)
                        .font(.system(size: 28, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundColor(.white)
                        .multilineTextAlignment(.trailing)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)

            // ── Divider ──
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(height: 1)
                .padding(.horizontal, 20)

            // ── Bottom: Stats row ──
            HStack(spacing: 0) {
                LockScreenStatCell(
                    icon: "speedometer",
                    value: formatPace(context.state.currentPace),
                    label: "페이스",
                    accentColor: appOrange
                )

                lockDivider

                LockScreenStatCell(
                    icon: "chart.line.uptrend.xyaxis",
                    value: formatPace(context.state.avgPace),
                    label: "평균",
                    accentColor: .cyan
                )

                lockDivider

                LockScreenStatCell(
                    icon: "heart.fill",
                    value: context.state.heartRate > 0 ? "\(context.state.heartRate)" : "--",
                    label: "BPM",
                    accentColor: .red
                )

                lockDivider

                LockScreenStatCell(
                    icon: "flame.fill",
                    value: "\(context.state.calories)",
                    label: "kcal",
                    accentColor: Color(red: 1.0, green: 0.35, blue: 0.35)
                )
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
        }
        .activityBackgroundTint(.black)
        .activitySystemActionForegroundColor(appOrange)
    }

    private var lockDivider: some View {
        RoundedRectangle(cornerRadius: 0.5)
            .fill(Color.white.opacity(0.1))
            .frame(width: 1, height: 24)
    }
}

// MARK: - Lock Screen Stat Cell

private struct LockScreenStatCell: View {
    let icon: String
    let value: String
    let label: String
    var accentColor: Color = .white

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(accentColor)
                Text(value)
                    .font(.system(size: 16, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundColor(.white)
            }
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(.white.opacity(0.35))
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Formatters

private func formatDistance(_ meters: Double) -> String {
    if meters < 1000 {
        return String(format: "%.0fm", meters)
    }
    return String(format: "%.2f", meters / 1000)
}

private func formatPace(_ secondsPerKm: Int) -> String {
    guard secondsPerKm > 0 && secondsPerKm < 3600 else { return "-'--\"" }
    let mins = secondsPerKm / 60
    let secs = secondsPerKm % 60
    return String(format: "%d'%02d\"", mins, secs)
}

private func formatDuration(_ seconds: Int) -> String {
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    let s = seconds % 60
    if h > 0 {
        return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%02d:%02d", m, s)
}
