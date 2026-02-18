import SwiftUI

struct CourseNavigationView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 8) {
            // Title
            Text("코스 안내")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.gray)
                .padding(.top, 4)

            // Direction arrow
            Image(systemName: detailedDirectionIcon())
                .font(.system(size: 44, weight: .bold))
                .foregroundColor(.green)
                .padding(.top, 4)

            // Turn instruction text (distance countdown or simple direction)
            if viewModel.state.navDistanceToNextTurn >= 0 && !viewModel.state.navNextTurnDirection.isEmpty {
                Text("\(viewModel.formattedDistanceToNextTurn()) 앞")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.gray)
                Text(viewModel.localizedDetailedDirection())
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
            } else {
                Text(viewModel.localizedDirection())
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
            }

            Spacer()

            // Remaining distance
            VStack(spacing: 2) {
                Text("남은 거리")
                    .font(.system(size: 10))
                    .foregroundColor(.gray)
                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text(viewModel.formattedRemainingDistance())
                        .font(.system(size: 20, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                    Text("km")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.gray)
                }
            }

            // Progress bar
            VStack(spacing: 4) {
                ProgressView(value: max(0, min(100, viewModel.state.navProgress)), total: 100)
                    .tint(.green)
                Text(String(format: "%.0f%%", max(0, viewModel.state.navProgress)))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.gray)
            }
            .padding(.horizontal, 8)

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
                .padding(.vertical, 4)
                .padding(.horizontal, 8)
                .background(Color.yellow.opacity(0.15))
                .cornerRadius(8)
            }

            Spacer().frame(height: 8)
        }
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

    private func arrowRotation() -> Angle {
        // Only rotate the generic arrow.up based on bearing
        if viewModel.state.navDirection != "straight" && viewModel.state.navDirection != "" {
            return .zero  // Named icons already show direction
        }
        // For straight, optionally rotate based on bearing — but on Watch, just show arrow.up
        return .zero
    }
}
