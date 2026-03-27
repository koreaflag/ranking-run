import SwiftUI

private let appOrange = Color(red: 1.0, green: 0.478, blue: 0.2)

struct IdleView: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    @State private var selectedTab = 1

    var body: some View {
        TabView(selection: $selectedTab) {
            // Page 0 (left): Weekly activity
            ActivityPage()
                .environmentObject(viewModel)
                .tag(0)

            // Page 1 (center, default): START
            StartPage()
                .environmentObject(viewModel)
                .tag(1)

            // Page 2 (right): Run settings
            SettingsPage()
                .environmentObject(viewModel)
                .tag(2)
        }
        .tabViewStyle(.page)
        .onAppear {
            selectedTab = 1
            viewModel.updateReachabilityStatus()
            viewModel.syncPendingRuns()
            viewModel.loadWeeklyActivity()
        }
    }
}

// MARK: - Page 0: Weekly Activity

private struct ActivityPage: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        VStack(spacing: 10) {
            // Header
            HStack(spacing: 5) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 13))
                    .foregroundColor(appOrange)
                Text("이번 주")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
            }
            .padding(.horizontal, 4)

            // Progress ring
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.1), lineWidth: 8)

                Circle()
                    .trim(from: 0, to: min(1.0, viewModel.weeklyGoalKm > 0
                        ? viewModel.weeklyDistanceKm / viewModel.weeklyGoalKm
                        : 0))
                    .stroke(appOrange, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 2) {
                    Text(String(format: "%.1f", viewModel.weeklyDistanceKm))
                        .font(.system(size: 24, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                    Text("/ \(Int(viewModel.weeklyGoalKm))km")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.gray)
                }
            }
            .frame(width: 100, height: 100)

            // Run count
            HStack(spacing: 4) {
                Image(systemName: "figure.run")
                    .font(.system(size: 12))
                    .foregroundColor(appOrange)
                Text("\(viewModel.weeklyRunCount)회 러닝")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.gray)
            }

            // Weekly goal adjuster
            HStack(spacing: 8) {
                Text("주 목표")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.gray)

                Spacer()

                ValueStepper(
                    value: "\(Int(viewModel.weeklyGoalKm))",
                    unit: "km",
                    compact: true,
                    onDecrease: {
                        viewModel.setWeeklyGoal(max(5, viewModel.weeklyGoalKm - 5))
                    },
                    onIncrease: {
                        viewModel.setWeeklyGoal(min(200, viewModel.weeklyGoalKm + 5))
                    }
                )
            }
            .padding(.horizontal, 4)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }
}

// MARK: - Page 1: START

private struct StartPage: View {
    @EnvironmentObject var viewModel: RunSessionViewModel
    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            Button(action: {
                viewModel.startStandaloneCountdown()
            }) {
                Text("START")
                    .font(.system(size: 22, weight: .black))
                    .tracking(2)
                    .foregroundColor(.white)
            }
            .buttonStyle(.plain)
            .frame(width: 110, height: 110)
            .background(viewModel.state.phase == "idle" ? appOrange : appOrange.opacity(0.4))
            .clipShape(Circle())
            .shadow(color: appOrange.opacity(0.5), radius: 16, x: 0, y: 0)
            .disabled(viewModel.state.phase != "idle")
            .accessibilityLabel("러닝 시작")

            Spacer()

            VStack(spacing: 3) {
                if viewModel.pendingSyncCount > 0 {
                    Text("동기화 대기: \(viewModel.pendingSyncCount)건")
                        .font(.system(size: 10))
                        .foregroundColor(.yellow.opacity(0.8))
                }
                SettingsSummary()
                    .environmentObject(viewModel)
            }
            .padding(.bottom, 6)
        }
    }
}

private struct SettingsSummary: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 2) {
                Image(systemName: "target")
                    .font(.system(size: 8))
                    .foregroundColor(appOrange)
                Text(goalText)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.gray)
            }

            Text("·")
                .font(.system(size: 10))
                .foregroundColor(.gray.opacity(0.5))

            Text(viewModel.isIndoorRun ? "실내" : "실외")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.gray)

            if viewModel.isCountdownEnabled {
                Text("·")
                    .font(.system(size: 10))
                    .foregroundColor(.gray.opacity(0.5))

                Text("3초")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.gray)
            }
        }
    }

    private var goalText: String {
        switch viewModel.standaloneGoalType {
        case "distance":
            return String(format: "%.1fkm", viewModel.standaloneGoalDistance)
        case "time":
            return "\(viewModel.standaloneGoalTime)분"
        case "program":
            return String(format: "%.1fkm/%d분", viewModel.standaloneGoalDistance, viewModel.standaloneGoalTargetTime)
        case "interval":
            return "인터벌 \(viewModel.standaloneIntervalSets)세트"
        default:
            return "자유"
        }
    }
}

// MARK: - Page 2: Settings

private struct SettingsPage: View {
    @EnvironmentObject var viewModel: RunSessionViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                // --- Goal Section ---
                SectionHeader(icon: "target", title: "목표")

                // Row 1: basic goal types
                HStack(spacing: 5) {
                    GoalTypeChip(label: "자유", type: "free", current: viewModel.standaloneGoalType) {
                        viewModel.setGoalType("free")
                    }
                    GoalTypeChip(label: "거리", type: "distance", current: viewModel.standaloneGoalType) {
                        viewModel.setGoalType("distance")
                    }
                    GoalTypeChip(label: "시간", type: "time", current: viewModel.standaloneGoalType) {
                        viewModel.setGoalType("time")
                    }
                }
                // Row 2: advanced goal types
                HStack(spacing: 5) {
                    GoalTypeChip(label: "목표", type: "program", current: viewModel.standaloneGoalType) {
                        viewModel.setGoalType("program")
                    }
                    GoalTypeChip(label: "인터벌", type: "interval", current: viewModel.standaloneGoalType) {
                        viewModel.setGoalType("interval")
                    }
                }

                if viewModel.standaloneGoalType == "distance" {
                    ValueStepper(
                        value: String(format: "%.1f", viewModel.standaloneGoalDistance),
                        unit: "km",
                        onDecrease: {
                            viewModel.setGoalDistance(max(0.5, viewModel.standaloneGoalDistance - 0.5))
                        },
                        onIncrease: {
                            viewModel.setGoalDistance(min(100.0, viewModel.standaloneGoalDistance + 0.5))
                        }
                    )
                } else if viewModel.standaloneGoalType == "time" {
                    ValueStepper(
                        value: "\(viewModel.standaloneGoalTime)",
                        unit: "분",
                        onDecrease: {
                            viewModel.setGoalTime(max(5, viewModel.standaloneGoalTime - 5))
                        },
                        onIncrease: {
                            viewModel.setGoalTime(min(300, viewModel.standaloneGoalTime + 5))
                        }
                    )
                } else if viewModel.standaloneGoalType == "program" {
                    VStack(spacing: 6) {
                        ValueStepper(
                            value: String(format: "%.1f", viewModel.standaloneGoalDistance),
                            unit: "km",
                            onDecrease: {
                                viewModel.setGoalDistance(max(0.5, viewModel.standaloneGoalDistance - 0.5))
                            },
                            onIncrease: {
                                viewModel.setGoalDistance(min(100.0, viewModel.standaloneGoalDistance + 0.5))
                            }
                        )
                        ValueStepper(
                            value: "\(viewModel.standaloneGoalTargetTime)",
                            unit: "분",
                            onDecrease: {
                                viewModel.setGoalTargetTime(max(5, viewModel.standaloneGoalTargetTime - 1))
                            },
                            onIncrease: {
                                viewModel.setGoalTargetTime(min(300, viewModel.standaloneGoalTargetTime + 1))
                            }
                        )
                        // Computed required pace (seconds per km)
                        if viewModel.standaloneGoalDistance > 0 && viewModel.standaloneGoalTargetTime > 0 {
                            let paceSeconds = Int(Double(viewModel.standaloneGoalTargetTime * 60) / viewModel.standaloneGoalDistance)
                            let paceMin = paceSeconds / 60
                            let paceSec = paceSeconds % 60
                            Text("필요 페이스: \(paceMin)'\(String(format: "%02d", paceSec))\" /km")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(appOrange)
                        }
                    }
                } else if viewModel.standaloneGoalType == "interval" {
                    VStack(spacing: 8) {
                        // Run duration
                        HStack(spacing: 6) {
                            Image(systemName: "figure.run")
                                .font(.system(size: 12))
                                .foregroundColor(appOrange)
                                .frame(width: 16)
                            Text("달리기")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.gray)
                            Spacer()
                        }
                        ValueStepper(
                            value: formatMinSec(viewModel.standaloneIntervalRunSec),
                            unit: "",
                            onDecrease: {
                                viewModel.setIntervalRunSec(max(30, viewModel.standaloneIntervalRunSec - 30))
                            },
                            onIncrease: {
                                viewModel.setIntervalRunSec(min(600, viewModel.standaloneIntervalRunSec + 30))
                            }
                        )

                        // Walk duration
                        HStack(spacing: 6) {
                            Image(systemName: "figure.walk")
                                .font(.system(size: 12))
                                .foregroundColor(.green)
                                .frame(width: 16)
                            Text("걷기")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.gray)
                            Spacer()
                        }
                        ValueStepper(
                            value: formatMinSec(viewModel.standaloneIntervalWalkSec),
                            unit: "",
                            onDecrease: {
                                viewModel.setIntervalWalkSec(max(15, viewModel.standaloneIntervalWalkSec - 15))
                            },
                            onIncrease: {
                                viewModel.setIntervalWalkSec(min(300, viewModel.standaloneIntervalWalkSec + 15))
                            }
                        )

                        // Sets
                        HStack(spacing: 6) {
                            Image(systemName: "repeat")
                                .font(.system(size: 12))
                                .foregroundColor(.gray)
                                .frame(width: 16)
                            Text("반복")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.gray)
                            Spacer()
                        }
                        ValueStepper(
                            value: "\(viewModel.standaloneIntervalSets)",
                            unit: "세트",
                            onDecrease: {
                                viewModel.setIntervalSets(max(1, viewModel.standaloneIntervalSets - 1))
                            },
                            onIncrease: {
                                viewModel.setIntervalSets(min(20, viewModel.standaloneIntervalSets + 1))
                            }
                        )

                        // Total time summary
                        let totalSec = (viewModel.standaloneIntervalRunSec + viewModel.standaloneIntervalWalkSec) * viewModel.standaloneIntervalSets
                        Text("총 \(formatMinSec(totalSec))")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(appOrange)
                    }
                }

                Divider().background(Color.white.opacity(0.1))

                // --- Run Settings Section ---
                SectionHeader(icon: "gearshape.fill", title: "러닝 설정")

                SettingToggleRow(
                    icon: "house.fill",
                    label: "실내 러닝",
                    isOn: viewModel.isIndoorRun
                ) {
                    viewModel.setIndoorRun(!viewModel.isIndoorRun)
                }

                SettingToggleRow(
                    icon: "pause.circle.fill",
                    label: "자동 일시정지",
                    isOn: viewModel.isAutoPauseEnabled
                ) {
                    viewModel.setAutoPause(!viewModel.isAutoPauseEnabled)
                }

                SettingToggleRow(
                    icon: "timer",
                    label: "카운트다운",
                    isOn: viewModel.isCountdownEnabled
                ) {
                    viewModel.setCountdownEnabled(!viewModel.isCountdownEnabled)
                }

                Divider().background(Color.white.opacity(0.1))

                // --- Voice Section ---
                SectionHeader(icon: "speaker.wave.2.fill", title: "음성 안내")

                SettingToggleRow(
                    icon: "mic.fill",
                    label: "음성 안내",
                    isOn: viewModel.isVoiceGuidanceEnabled
                ) {
                    viewModel.setVoiceGuidance(!viewModel.isVoiceGuidanceEnabled)
                }

                if viewModel.isVoiceGuidanceEnabled && viewModel.standaloneGoalType != "interval" {
                    HStack {
                        Text("빈도")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.gray)
                        Spacer()
                        ValueStepper(
                            value: frequencyText,
                            unit: "km",
                            compact: true,
                            onDecrease: {
                                viewModel.setVoiceFrequency(max(0.5, viewModel.voiceFrequencyKm - 0.5))
                            },
                            onIncrease: {
                                viewModel.setVoiceFrequency(min(10.0, viewModel.voiceFrequencyKm + 0.5))
                            }
                        )
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
    }

    private var frequencyText: String {
        if viewModel.voiceFrequencyKm == Double(Int(viewModel.voiceFrequencyKm)) {
            return "\(Int(viewModel.voiceFrequencyKm))"
        }
        return String(format: "%.1f", viewModel.voiceFrequencyKm)
    }
}

private func formatMinSec(_ totalSeconds: Int) -> String {
    let m = totalSeconds / 60
    let s = totalSeconds % 60
    if s == 0 { return "\(m)분" }
    return "\(m)분\(s)초"
}

// MARK: - Reusable Components

private struct SectionHeader: View {
    let icon: String
    let title: String

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(appOrange)
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.white)
            Spacer()
        }
    }
}

private struct GoalTypeChip: View {
    let label: String
    let type: String
    let current: String
    let action: () -> Void

    var isSelected: Bool { type == current }

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 14, weight: isSelected ? .bold : .medium))
                .foregroundColor(isSelected ? .white : .gray)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(isSelected ? appOrange.opacity(0.8) : Color.white.opacity(0.08))
                .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
}

private struct ValueStepper: View {
    let value: String
    let unit: String
    var compact: Bool = false
    let onDecrease: () -> Void
    let onIncrease: () -> Void

    var body: some View {
        HStack(spacing: compact ? 8 : 14) {
            Button(action: onDecrease) {
                Image(systemName: "minus.circle.fill")
                    .font(.system(size: compact ? 20 : 26))
                    .foregroundColor(.gray)
            }
            .buttonStyle(.plain)

            HStack(alignment: .lastTextBaseline, spacing: 1) {
                Text(value)
                    .font(.system(size: compact ? 18 : 26, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
                Text(unit)
                    .font(.system(size: compact ? 10 : 13, weight: .medium))
                    .foregroundColor(.gray)
            }

            Button(action: onIncrease) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: compact ? 20 : 26))
                    .foregroundColor(appOrange)
            }
            .buttonStyle(.plain)
        }
    }
}

private struct SettingToggleRow: View {
    let icon: String
    let label: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(isOn ? appOrange : .gray)
                    .frame(width: 18)

                Text(label)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white)

                Spacer()

                // Capsule toggle indicator
                ZStack(alignment: isOn ? .trailing : .leading) {
                    Capsule()
                        .fill(isOn ? appOrange : Color.white.opacity(0.15))
                        .frame(width: 36, height: 22)

                    Circle()
                        .fill(Color.white)
                        .frame(width: 18, height: 18)
                        .padding(.horizontal, 2)
                }
                .animation(.easeInOut(duration: 0.15), value: isOn)
            }
            .padding(.vertical, 5)
        }
        .buttonStyle(.plain)
    }
}
