import SwiftUI

// App key color — Signature Orange (#FF7A33)
private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct RunningView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 0) {
            // Duration — top (primary metric, large and bold)
            ZStack {
                Text(viewModel.formattedDuration())
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(viewModel.state.isAutoPaused ? appOrange : .white)
                    .accessibilityLabel("시간 \(viewModel.formattedDuration())")

                if viewModel.state.isAutoPaused {
                    HStack(spacing: 2) {
                        Spacer()
                        Image(systemName: "pause.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(appOrange.opacity(0.8))
                    }
                }
            }
            .padding(.top, 2)

            divider

            // Distance — center hero (largest element)
            if viewModel.state.goalType == "distance" && viewModel.state.goalValue > 0 {
                // Goal distance mode: show progress
                let goalKm = viewModel.state.goalValue / 1000.0
                let currentKm = viewModel.state.distance / 1000.0
                let progress = min(1.0, currentKm / goalKm)
                VStack(spacing: 1) {
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        Text(viewModel.formattedDistance())
                            .font(.system(size: 42, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundColor(.white)
                        Text("/\(String(format: "%.1f", goalKm))km")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.gray)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.gray.opacity(0.3))
                                .frame(height: 4)
                            Capsule()
                                .fill(progress >= 1.0 ? Color.green : appOrange)
                                .frame(width: geo.size.width * CGFloat(progress), height: 4)
                        }
                    }
                    .frame(height: 4)
                    .padding(.horizontal, 16)
                }
                .padding(.vertical, 2)
            } else if viewModel.state.goalType == "time" && viewModel.state.goalValue > 0 {
                // Goal time mode: show time progress
                let goalSec = Int(viewModel.state.goalValue)
                let progress = min(1.0, Double(viewModel.state.duration) / Double(goalSec))
                let goalMin = goalSec / 60
                VStack(spacing: 1) {
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        Text(viewModel.formattedDistance())
                            .font(.system(size: 42, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundColor(.white)
                        Text("km")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.gray)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.gray.opacity(0.3))
                                .frame(height: 4)
                            Capsule()
                                .fill(progress >= 1.0 ? Color.green : appOrange)
                                .frame(width: geo.size.width * CGFloat(progress), height: 4)
                        }
                    }
                    .frame(height: 4)
                    .padding(.horizontal, 16)
                    Text("목표 \(goalMin)분")
                        .font(.system(size: 9))
                        .foregroundColor(.gray)
                }
                .padding(.vertical, 2)
            } else {
                // No goal — standard display
                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text(viewModel.formattedDistance())
                        .font(.system(size: 46, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(.white)
                    Text("km")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.gray)
                }
                .padding(.vertical, 2)
            }


            divider

            // Row 1: Avg Pace | Calories
            HStack(spacing: 0) {
                MetricCell(
                    label: "평균페이스",
                    value: viewModel.formattedAvgPace(),
                    icon: nil
                )

                verticalDivider

                MetricCell(
                    label: "칼로리",
                    value: viewModel.formattedCalories(),
                    icon: nil
                )
            }
            .frame(height: 38)

            divider

            // Row 2: Heart Rate | Cadence
            HStack(spacing: 0) {
                MetricCell(
                    label: "심박수",
                    value: viewModel.formattedHeartRate(),
                    icon: "heart.fill",
                    iconColor: .red
                )

                verticalDivider

                MetricCell(
                    label: "케이던스",
                    value: viewModel.formattedCadence(),
                    icon: "arrow.triangle.2.circlepath",
                    iconColor: .cyan
                )
            }
            .frame(height: 38)
        }
    }

    // MARK: - Dividers

    private var divider: some View {
        Rectangle()
            .fill(Color.gray.opacity(0.2))
            .frame(height: 1)
            .padding(.horizontal, 8)
    }

    private var verticalDivider: some View {
        Rectangle()
            .fill(Color.gray.opacity(0.2))
            .frame(width: 1)
    }
}

// MARK: - Metric Cell

private struct MetricCell: View {
    let label: String
    let value: String
    var icon: String?
    var iconColor: Color = .white

    var body: some View {
        VStack(spacing: 1) {
            HStack(spacing: 3) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 10))
                        .foregroundColor(iconColor)
                }
                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Text(label)
                .font(.system(size: 9))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label) \(value)")
    }
}
