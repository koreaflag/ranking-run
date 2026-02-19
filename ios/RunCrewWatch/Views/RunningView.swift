import SwiftUI

// App key color — Signature Orange (#FF7A33)
private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct RunningView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 0) {
            // Duration — top
            Text(viewModel.formattedDuration())
                .font(.system(size: 20, weight: .semibold, design: .monospaced))
                .foregroundColor(.gray)
                .padding(.top, 2)
                .accessibilityLabel("시간 \(viewModel.formattedDuration())")

            divider

            // Distance — center hero (largest element)
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(viewModel.formattedDistance())
                    .font(.system(size: 40, weight: .heavy, design: .monospaced))
                    .foregroundColor(appOrange)
                Text("km")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.gray)
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("거리 \(viewModel.formattedDistance()) 킬로미터")

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
            .frame(height: 36)

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
            .frame(height: 36)
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
                        .font(.system(size: 9))
                        .foregroundColor(iconColor)
                }
                Text(value)
                    .font(.system(size: 16, weight: .semibold, design: .monospaced))
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
