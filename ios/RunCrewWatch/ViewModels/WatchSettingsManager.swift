import Foundation
import WatchConnectivity

/// Manages all standalone run settings persisted via UserDefaults.
/// The ViewModel exposes @Published wrappers that forward to this manager.
class WatchSettingsManager {

    // MARK: - Stored Settings

    var standaloneGoalType: String
    var standaloneGoalDistance: Double
    var standaloneGoalTime: Int           // minutes (for time goal type)
    var standaloneGoalTargetTime: Int     // minutes (for program goal type)
    var isIndoorRun: Bool
    var isAutoPauseEnabled: Bool
    var isVoiceGuidanceEnabled: Bool
    var voiceFrequencyKm: Double
    var isCountdownEnabled: Bool

    // Weekly activity
    var weeklyGoalKm: Double
    var weeklyDistanceKm: Double = 0
    var weeklyRunCount: Int = 0

    /// Called whenever a setting changes so ViewModel can sync @Published vars.
    var onSettingsChanged: (() -> Void)?

    // MARK: - Init

    init() {
        let defaults = UserDefaults.standard
        self.standaloneGoalType = defaults.string(forKey: "standaloneGoalType") ?? "free"
        let savedDist = defaults.double(forKey: "standaloneGoalDistance")
        self.standaloneGoalDistance = savedDist > 0 ? savedDist : 5.0
        let savedTime = defaults.integer(forKey: "standaloneGoalTime")
        self.standaloneGoalTime = savedTime > 0 ? savedTime : 30
        let savedTargetTime = defaults.integer(forKey: "standaloneGoalTargetTime")
        self.standaloneGoalTargetTime = savedTargetTime > 0 ? savedTargetTime : 20
        self.isIndoorRun = defaults.bool(forKey: "isIndoorRun")
        self.isAutoPauseEnabled = defaults.object(forKey: "isAutoPauseEnabled") == nil ? true : defaults.bool(forKey: "isAutoPauseEnabled")
        self.isVoiceGuidanceEnabled = defaults.object(forKey: "isVoiceGuidanceEnabled") == nil ? true : defaults.bool(forKey: "isVoiceGuidanceEnabled")
        let savedFreq = defaults.double(forKey: "voiceFrequencyKm")
        self.voiceFrequencyKm = savedFreq > 0 ? savedFreq : 1.0
        self.isCountdownEnabled = defaults.object(forKey: "isCountdownEnabled") == nil ? true : defaults.bool(forKey: "isCountdownEnabled")
        let savedWeeklyGoal = defaults.double(forKey: "weeklyGoalKm")
        self.weeklyGoalKm = savedWeeklyGoal > 0 ? savedWeeklyGoal : 20.0
    }

    // MARK: - Setters (persist to UserDefaults)

    func setGoalType(_ type: String) {
        standaloneGoalType = type
        UserDefaults.standard.set(type, forKey: "standaloneGoalType")
        onSettingsChanged?()
    }

    func setGoalDistance(_ km: Double) {
        standaloneGoalDistance = km
        UserDefaults.standard.set(km, forKey: "standaloneGoalDistance")
        onSettingsChanged?()
    }

    func setGoalTime(_ minutes: Int) {
        standaloneGoalTime = minutes
        UserDefaults.standard.set(minutes, forKey: "standaloneGoalTime")
        onSettingsChanged?()
    }

    func setGoalTargetTime(_ minutes: Int) {
        standaloneGoalTargetTime = minutes
        UserDefaults.standard.set(minutes, forKey: "standaloneGoalTargetTime")
        onSettingsChanged?()
    }

    func setIndoorRun(_ value: Bool) {
        isIndoorRun = value
        UserDefaults.standard.set(value, forKey: "isIndoorRun")
        onSettingsChanged?()
    }

    func setAutoPause(_ value: Bool) {
        isAutoPauseEnabled = value
        UserDefaults.standard.set(value, forKey: "isAutoPauseEnabled")
        onSettingsChanged?()
    }

    func setVoiceGuidance(_ value: Bool) {
        isVoiceGuidanceEnabled = value
        UserDefaults.standard.set(value, forKey: "isVoiceGuidanceEnabled")
        onSettingsChanged?()
    }

    func setVoiceFrequency(_ km: Double) {
        voiceFrequencyKm = km
        UserDefaults.standard.set(km, forKey: "voiceFrequencyKm")
        onSettingsChanged?()
    }

    func setCountdownEnabled(_ value: Bool) {
        isCountdownEnabled = value
        UserDefaults.standard.set(value, forKey: "isCountdownEnabled")
        onSettingsChanged?()
    }

    /// Flag to prevent sync loops: when the phone sends a goal update,
    /// we set this before calling setWeeklyGoal so it doesn't echo back.
    var isSyncingFromPhone = false

    func setWeeklyGoal(_ km: Double) {
        weeklyGoalKm = km
        UserDefaults.standard.set(km, forKey: "weeklyGoalKm")
        onSettingsChanged?()

        // Send to phone (unless this change originated from the phone)
        if !isSyncingFromPhone {
            sendWeeklyGoalToPhone(km)
        }
    }

    /// Send weekly goal change to the phone via WCSession.
    private func sendWeeklyGoalToPhone(_ km: Double) {
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        let message: [String: Any] = [
            WatchMessageKeys.type: WatchMessageType.weeklyGoalUpdate.rawValue,
            WatchMessageKeys.weeklyGoalKm: km,
            WatchMessageKeys.timestamp: Date().timeIntervalSince1970 * 1000
        ]

        // Use sendMessage for immediate delivery when reachable
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil, errorHandler: { error in
                print("[WatchSettingsMgr] sendWeeklyGoal sendMessage failed: \(error.localizedDescription)")
            })
        }

        // Also use transferUserInfo for guaranteed delivery
        session.transferUserInfo(message)
    }

    // MARK: - Weekly Activity

    /// Load this week's activity from UserDefaults.
    /// Resets automatically when a new week starts (Monday-based).
    func loadWeeklyActivity() {
        let defaults = UserDefaults.standard
        let savedWeekId = defaults.string(forKey: "weeklyActivityWeekId") ?? ""
        let currentWeekId = Self.currentWeekId()

        if savedWeekId != currentWeekId {
            defaults.set(currentWeekId, forKey: "weeklyActivityWeekId")
            defaults.set(0.0, forKey: "weeklyDistanceKm")
            defaults.set(0, forKey: "weeklyRunCount")
            weeklyDistanceKm = 0
            weeklyRunCount = 0
        } else {
            weeklyDistanceKm = defaults.double(forKey: "weeklyDistanceKm")
            weeklyRunCount = defaults.integer(forKey: "weeklyRunCount")
        }
        onSettingsChanged?()
    }

    /// Record a completed run in weekly stats.
    func recordWeeklyRun(distanceKm: Double) {
        loadWeeklyActivity() // ensure current week
        weeklyDistanceKm += distanceKm
        weeklyRunCount += 1
        let defaults = UserDefaults.standard
        defaults.set(weeklyDistanceKm, forKey: "weeklyDistanceKm")
        defaults.set(weeklyRunCount, forKey: "weeklyRunCount")
        onSettingsChanged?()
    }

    private static func currentWeekId() -> String {
        var cal = Calendar(identifier: .iso8601)
        cal.firstWeekday = 2 // Monday
        let comps = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: Date())
        return "\(comps.yearForWeekOfYear ?? 0)-W\(comps.weekOfYear ?? 0)"
    }
}
