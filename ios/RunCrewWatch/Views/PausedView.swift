import SwiftUI

struct PausedView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 8) {
            // Paused indicator
            Text("일시정지")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.yellow)
                .padding(.top, 4)

            // Duration (still showing)
            Text(viewModel.formattedDuration())
                .font(.system(size: 28, weight: .bold, design: .monospaced))
                .foregroundColor(.white)

            // Distance
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(viewModel.formattedDistance())
                    .font(.system(size: 22, weight: .heavy, design: .monospaced))
                    .foregroundColor(.green)
                Text("km")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.gray)
            }

            Spacer()

            // Control buttons
            HStack(spacing: 20) {
                // Resume button
                Button(action: { viewModel.sendResumeCommand() }) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.black)
                        .frame(width: 52, height: 52)
                        .background(Color.green)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)

                // Stop button
                Button(action: { viewModel.sendStopCommand() }) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.white)
                        .frame(width: 52, height: 52)
                        .background(Color.red.opacity(0.8))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 8)
        }
    }
}
