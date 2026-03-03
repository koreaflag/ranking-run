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
                // Expanded regions
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(formatDistance(context.state.distanceMeters))
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("km")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        if context.state.isPaused {
                            Text(formatDuration(context.state.durationSeconds))
                                .font(.system(size: 24, weight: .bold, design: .rounded).monospacedDigit())
                                .foregroundColor(.yellow)
                        } else {
                            Text(context.state.timerStartDate, style: .timer)
                                .font(.system(size: 24, weight: .bold, design: .rounded).monospacedDigit())
                                .foregroundColor(.white)
                                .multilineTextAlignment(.trailing)
                        }
                        Text("시간")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }

                DynamicIslandExpandedRegion(.center) {
                    if context.state.isPaused {
                        Text("일시정지")
                            .font(.caption.bold())
                            .foregroundColor(.yellow)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 16) {
                        StatItem(
                            label: "페이스",
                            value: formatPace(context.state.currentPace)
                        )
                        StatItem(
                            label: "평균",
                            value: formatPace(context.state.avgPace)
                        )
                        StatItem(
                            label: "칼로리",
                            value: "\(context.state.calories)"
                        )
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    Image(systemName: "figure.run")
                        .foregroundColor(appOrange)
                    Text(formatDistance(context.state.distanceMeters))
                        .font(.system(.caption, design: .rounded).bold().monospacedDigit())
                        .foregroundColor(.white)
                }
            } compactTrailing: {
                if context.state.isPaused {
                    Image(systemName: "pause.fill")
                        .foregroundColor(.yellow)
                        .font(.caption)
                } else {
                    Text(context.state.timerStartDate, style: .timer)
                        .font(.system(.caption, design: .rounded).bold().monospacedDigit())
                        .foregroundColor(appOrange)
                        .multilineTextAlignment(.center)
                        .frame(minWidth: 36)
                }
            } minimal: {
                Image(systemName: "figure.run")
                    .foregroundColor(appOrange)
            }
        }
    }
}

// MARK: - Lock Screen View

private struct LockScreenRunView: View {
    let context: ActivityViewContext<RunningActivityAttributes>

    var body: some View {
        VStack(spacing: 12) {
            // Header row
            HStack {
                Image(systemName: "figure.run")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(appOrange)
                Text("RUNVS")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.secondary)

                if context.state.isPaused {
                    Text("일시정지")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.yellow)
                        .cornerRadius(4)
                }

                Spacer()

                // Timer
                if context.state.isPaused {
                    Text(formatDuration(context.state.durationSeconds))
                        .font(.system(size: 28, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundColor(.yellow)
                } else {
                    Text(context.state.timerStartDate, style: .timer)
                        .font(.system(size: 28, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundColor(.white)
                        .multilineTextAlignment(.trailing)
                }
            }

            // Stats row
            HStack(spacing: 0) {
                // Distance
                VStack(spacing: 2) {
                    Text(formatDistance(context.state.distanceMeters))
                        .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundColor(.white)
                    Text("거리")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)

                Divider()
                    .frame(height: 28)
                    .background(Color.white.opacity(0.2))

                // Current pace
                VStack(spacing: 2) {
                    Text(formatPace(context.state.currentPace))
                        .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundColor(.white)
                    Text("페이스")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)

                Divider()
                    .frame(height: 28)
                    .background(Color.white.opacity(0.2))

                // Calories
                VStack(spacing: 2) {
                    Text("\(context.state.calories)")
                        .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundColor(.white)
                    Text("kcal")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
            }

            // Course name (if applicable)
            if context.attributes.isCourseRun && !context.attributes.courseName.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "map")
                        .font(.system(size: 10))
                        .foregroundColor(appOrange)
                    Text(context.attributes.courseName)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(16)
        .activityBackgroundTint(.black)
        .activitySystemActionForegroundColor(appOrange)
    }
}

// MARK: - Reusable Stat Item (Dynamic Island expanded)

private struct StatItem: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 14, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
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
