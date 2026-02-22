import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct CompletedView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 36))
                    .foregroundColor(appOrange)
                    .accessibilityHidden(true)

                Text("런닝 완료!")
                    .font(.system(size: 18, weight: .bold))
                    .accessibilityAddTraits(.isHeader)

                // Summary stats
                VStack(spacing: 8) {
                    summaryRow(label: "거리", value: "\(viewModel.formattedDistance()) km")
                    summaryRow(label: "시간", value: viewModel.formattedDuration())
                    summaryRow(label: "평균 페이스", value: viewModel.formattedAvgPace())
                    if viewModel.state.calories > 0 {
                        summaryRow(label: "칼로리", value: "\(viewModel.state.calories) kcal")
                    }
                }
                .padding(.top, 4)

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
}
