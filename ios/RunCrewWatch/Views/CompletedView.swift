import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct CompletedView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    private var isInterval: Bool {
        viewModel.state.goalType == "interval" && viewModel.state.intervalTotalSets > 0
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if isInterval {
                    intervalCompletedContent
                } else {
                    normalCompletedContent
                }

                Text("폰에서 상세 결과를\n확인하세요")
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)

                Button(action: {
                    viewModel.resetToIdle()
                }) {
                    Text("확인")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(appOrange)
                        .cornerRadius(24)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.top, 8)
            }
            .padding(.horizontal, 8)
        }
    }

    // MARK: - Normal completed

    private var normalCompletedContent: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 36))
                .foregroundColor(appOrange)
                .accessibilityHidden(true)

            Text("런닝 완료!")
                .font(.system(size: 18, weight: .bold))
                .accessibilityAddTraits(.isHeader)

            VStack(spacing: 8) {
                summaryRow(label: "거리", value: "\(viewModel.formattedDistance()) km")
                summaryRow(label: "시간", value: viewModel.formattedDuration())
                summaryRow(label: "평균 페이스", value: viewModel.formattedAvgPace())
                if viewModel.state.calories > 0 {
                    summaryRow(label: "칼로리", value: "\(viewModel.state.calories) kcal")
                }
            }
            .padding(.top, 4)
        }
    }

    // MARK: - Interval completed

    private var intervalCompletedContent: some View {
        let s = viewModel.state
        let runSec = s.intervalRunSeconds
        let walkSec = s.intervalWalkSeconds
        let sets = s.intervalTotalSets

        return VStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 36))
                .foregroundColor(appOrange)
                .accessibilityHidden(true)

            Text("인터벌 완료!")
                .font(.system(size: 18, weight: .bold))

            // Set summary
            HStack(spacing: 12) {
                VStack(spacing: 2) {
                    Text("\(sets)")
                        .font(.system(size: 22, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    Text("세트")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.gray)
                }

                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 1, height: 30)

                VStack(spacing: 2) {
                    Text(formatMinSec(runSec))
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(appOrange)
                    Text("달리기")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.gray)
                }

                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 1, height: 30)

                VStack(spacing: 2) {
                    Text(formatMinSec(walkSec))
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(.green)
                    Text("걷기")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.gray)
                }
            }
            .padding(.vertical, 4)

            // Stats
            VStack(spacing: 6) {
                summaryRow(label: "거리", value: "\(viewModel.formattedDistance()) km")
                summaryRow(label: "시간", value: viewModel.formattedDuration())
                summaryRow(label: "평균 페이스", value: viewModel.formattedAvgPace())
            }
        }
    }

    // MARK: - Helpers

    private func summaryRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 13))
                .foregroundColor(.gray)
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
        }
        .padding(.horizontal, 4)
    }

    private func formatMinSec(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        if s == 0 { return "\(m)분" }
        return "\(m):\(String(format: "%02d", s))"
    }
}
