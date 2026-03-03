import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct CourseNavigationView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 6) {
            // Checkpoint progress badge
            if viewModel.state.cpTotal > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "flag.fill")
                        .font(.system(size: 10))
                        .foregroundColor(appOrange)
                    Text("CP \(viewModel.state.cpPassed)/\(viewModel.state.cpTotal)")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.white.opacity(0.1))
                .cornerRadius(8)
            }

            // Direction arrow
            Image(systemName: detailedDirectionIcon())
                .font(.system(size: 40, weight: .bold))
                .foregroundColor(appOrange)
                .padding(.top, 2)

            // Turn instruction text (distance countdown or simple direction)
            if viewModel.state.navDistanceToNextTurn >= 0 && !viewModel.state.navNextTurnDirection.isEmpty {
                VStack(spacing: 2) {
                    Text(viewModel.localizedDetailedDirection())
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    Text("\(viewModel.formattedDistanceToNextTurn()) 앞")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.gray)
                }
            } else {
                Text(viewModel.localizedDirection())
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
            }

            Spacer()

            // Off-course warning
            if viewModel.state.navIsOffCourse {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.yellow)
                    Text(String(format: "코스 이탈 %.0fm", viewModel.state.navDeviation))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.yellow)
                }
                .padding(.vertical, 3)
                .padding(.horizontal, 8)
                .background(Color.yellow.opacity(0.15))
                .cornerRadius(8)
            }

            // Remaining distance + progress
            VStack(spacing: 4) {
                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text(viewModel.formattedRemainingDistance())
                        .font(.system(size: 18, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                    Text("km 남음")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.gray)
                }
                ProgressView(value: max(0, min(100, viewModel.state.navProgress)), total: 100)
                    .tint(appOrange)
                    .padding(.horizontal, 16)
            }
            .padding(.bottom, 4)
        }
        .padding(.vertical, 6)
    }

    private func detailedDirectionIcon() -> String {
        let dir = viewModel.state.navNextTurnDirection
        guard !dir.isEmpty else { return directionIcon() }
        switch dir {
        case "slight-left", "left", "sharp-left":
            return "arrow.turn.up.left"
        case "slight-right", "right", "sharp-right":
            return "arrow.turn.up.right"
        case "u-turn":
            return "arrow.uturn.down"
        case "straight":
            return "arrow.up"
        default:
            return directionIcon()
        }
    }

    private func directionIcon() -> String {
        switch viewModel.state.navDirection {
        case "left": return "arrow.turn.up.left"
        case "right": return "arrow.turn.up.right"
        case "u-turn": return "arrow.uturn.down"
        default: return "arrow.up"
        }
    }
}
