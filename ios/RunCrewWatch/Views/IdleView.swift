import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct IdleView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 12) {
            Spacer()

            Image(systemName: "figure.run")
                .font(.system(size: 36))
                .foregroundColor(appOrange)
                .accessibilityHidden(true)

            Text("RUNVS")
                .font(.system(size: 16, weight: .bold))

            // Start button — always standalone (watch GPS)
            Button(action: {
                viewModel.startStandaloneRun()
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12))
                    Text("시작")
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundColor(.black)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(appOrange)
                .cornerRadius(24)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)

            // Phone connection indicator (shows sync availability)
            HStack(spacing: 4) {
                Circle()
                    .fill(viewModel.isPhoneReachable ? Color.green : Color.gray)
                    .frame(width: 6, height: 6)
                    .accessibilityHidden(true)
                Text(viewModel.isPhoneReachable ? "폰 연결됨" : "폰 미연결")
                    .font(.system(size: 10))
                    .foregroundColor(.gray)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(viewModel.isPhoneReachable ? "아이폰 연결됨" : "아이폰 미연결")

            // Pending sync indicator
            if viewModel.pendingSyncCount > 0 {
                Text("동기화 대기: \(viewModel.pendingSyncCount)건")
                    .font(.system(size: 9))
                    .foregroundColor(.yellow.opacity(0.8))
            }

            Spacer()
        }
        .onAppear {
            viewModel.updateReachabilityStatus()
            viewModel.syncPendingRuns()
        }
    }
}
