import SwiftUI

struct RunningView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 0) {
            // Duration (hero)
            Text(viewModel.formattedDuration())
                .font(.system(size: 36, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
                .padding(.top, 4)

            // Distance
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(viewModel.formattedDistance())
                    .font(.system(size: 28, weight: .heavy, design: .monospaced))
                    .foregroundColor(.green)
                Text("km")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.gray)
            }
            .padding(.top, 2)

            // Pace + Heart Rate row
            HStack(spacing: 16) {
                // Pace
                VStack(spacing: 2) {
                    Text(viewModel.formattedPace())
                        .font(.system(size: 16, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                    Text("페이스")
                        .font(.system(size: 10))
                        .foregroundColor(.gray)
                }

                // Divider
                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 1, height: 24)

                // Heart Rate
                VStack(spacing: 2) {
                    HStack(spacing: 2) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.red)
                        Text(viewModel.formattedHeartRate())
                            .font(.system(size: 16, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white)
                    }
                    Text("BPM")
                        .font(.system(size: 10))
                        .foregroundColor(.gray)
                }
            }
            .padding(.top, 6)

            Spacer()

            // Control buttons
            HStack(spacing: 20) {
                // Pause button
                Button(action: { viewModel.sendPauseCommand() }) {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.white)
                        .frame(width: 52, height: 52)
                        .background(Color.gray.opacity(0.3))
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
