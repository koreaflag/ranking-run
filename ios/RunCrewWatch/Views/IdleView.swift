import SwiftUI

struct IdleView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "figure.run")
                .font(.system(size: 40))
                .foregroundColor(.green)
                .accessibilityHidden(true)

            Text("RunCrew")
                .font(.system(size: 18, weight: .bold))

            Text("폰에서 런닝을\n시작하세요")
                .font(.system(size: 14))
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)

            // Phone connection indicator
            HStack(spacing: 4) {
                Circle()
                    .fill(viewModel.isPhoneReachable ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                    .accessibilityHidden(true)
                Text(viewModel.isPhoneReachable ? "폰 연결됨" : "폰 미연결")
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(viewModel.isPhoneReachable ? "아이폰 연결됨" : "아이폰 연결 안 됨")

        }
        .onAppear {
            viewModel.updateReachability()
            viewModel.pollState()
        }
        .onTapGesture {
            viewModel.pollState()
        }
    }
}
