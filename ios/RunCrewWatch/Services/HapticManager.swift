import AVFoundation
import Foundation
import WatchKit

class HapticManager {
    static let shared = HapticManager()
    private let synthesizer = AVSpeechSynthesizer()
    /// Whether voice announcements are enabled (synced with UserDefaults)
    var voiceEnabled: Bool {
        get {
            // Default to true if key hasn't been set
            if UserDefaults.standard.object(forKey: "isVoiceGuidanceEnabled") == nil { return true }
            return UserDefaults.standard.bool(forKey: "isVoiceGuidanceEnabled")
        }
        set {
            UserDefaults.standard.set(newValue, forKey: "isVoiceGuidanceEnabled")
        }
    }
    private init() {}

    func countdownTick() {
        WKInterfaceDevice.current().play(.click)
    }

    func runStarted() {
        WKInterfaceDevice.current().play(.start)
    }

    func milestone() {
        WKInterfaceDevice.current().play(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            WKInterfaceDevice.current().play(.success)
        }
    }

    func paused() {
        WKInterfaceDevice.current().play(.stop)
    }

    func resumed() {
        WKInterfaceDevice.current().play(.start)
    }

    func runCompleted() {
        WKInterfaceDevice.current().play(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            WKInterfaceDevice.current().play(.success)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                WKInterfaceDevice.current().play(.success)
            }
        }
    }

    func gpsLocked() {
        WKInterfaceDevice.current().play(.notification)
    }

    func offCourse() {
        WKInterfaceDevice.current().play(.notification)
    }

    func backOnCourse() {
        WKInterfaceDevice.current().play(.success)
    }

    func turnLeft() {
        WKInterfaceDevice.current().play(.directionUp)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            WKInterfaceDevice.current().play(.directionUp)
        }
    }

    func turnRight() {
        WKInterfaceDevice.current().play(.directionDown)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            WKInterfaceDevice.current().play(.directionDown)
        }
    }

    func uTurn() {
        WKInterfaceDevice.current().play(.retry)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            WKInterfaceDevice.current().play(.retry)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                WKInterfaceDevice.current().play(.retry)
            }
        }
    }

    func turnApproaching() {
        WKInterfaceDevice.current().play(.click)
    }

    func arrivedAtStart() {
        WKInterfaceDevice.current().play(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            WKInterfaceDevice.current().play(.success)
        }
    }

    func checkpointPassed() {
        WKInterfaceDevice.current().play(.success)
    }

    // MARK: - Pace Coaching Haptics

    func paceAhead() {
        WKInterfaceDevice.current().play(.success)
    }

    func paceOnTrack() {
        WKInterfaceDevice.current().play(.click)
    }

    func paceBehind() {
        WKInterfaceDevice.current().play(.notification)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            WKInterfaceDevice.current().play(.notification)
        }
    }

    func paceCritical() {
        WKInterfaceDevice.current().play(.notification)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            WKInterfaceDevice.current().play(.notification)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                WKInterfaceDevice.current().play(.notification)
            }
        }
    }

    func paceAlert(status: String, timeDelta: Double = 0) {
        switch status {
        case "ahead": paceAhead()
        case "on_pace": paceOnTrack()
        case "behind": paceBehind()
        case "critical": paceCritical()
        default: break
        }
        // Voice announcement
        speakPaceStatus(status, timeDelta: timeDelta)
    }

    // MARK: - TTS Voice

    private func speak(_ text: String) {
        guard voiceEnabled else { return }
        synthesizer.stopSpeaking(at: .immediate)

        // Configure audio session for speaker output.
        // Use .longFormAudio policy to bypass watchOS silent/manner mode —
        // the system treats this as intentional audio playback (like podcasts/music)
        // so it plays through the speaker regardless of the mute setting.
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playback,
                mode: .voicePrompt,
                policy: .longFormAudio,
                options: [.duckOthers]
            )
            try session.setActive(true)
        } catch {
            // Fallback: try without longFormAudio policy
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
                try session.setActive(true)
            } catch {}
        }

        let utterance = AVSpeechUtterance(string: text)
        // Detect locale from system language
        let lang = Locale.preferredLanguages.first ?? "ko-KR"
        if lang.hasPrefix("ko") {
            utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
        } else if lang.hasPrefix("ja") {
            utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        } else {
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        }
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.pitchMultiplier = 1.0
        synthesizer.speak(utterance)
    }

    private func speakPaceStatus(_ status: String, timeDelta: Double) {
        let absDelta = Int(abs(timeDelta))
        let lang = Locale.preferredLanguages.first ?? "ko"

        let message: String
        if lang.hasPrefix("ko") {
            switch status {
            case "ahead":
                message = "좋은 페이스. \(absDelta)초 여유"
            case "on_pace":
                message = "목표 페이스 유지 중"
            case "behind":
                message = "속도를 올리세요. \(absDelta)초 느림"
            case "critical":
                message = "목표 달성이 어렵습니다"
            default: return
            }
        } else if lang.hasPrefix("ja") {
            switch status {
            case "ahead":
                message = "いいペースです。\(absDelta)秒余裕"
            case "on_pace":
                message = "目標ペース維持中"
            case "behind":
                message = "スピードを上げて。\(absDelta)秒遅れ"
            case "critical":
                message = "目標達成が難しいです"
            default: return
            }
        } else {
            switch status {
            case "ahead":
                message = "Good pace. \(absDelta) seconds ahead"
            case "on_pace":
                message = "On target pace"
            case "behind":
                message = "Speed up. \(absDelta) seconds behind"
            case "critical":
                message = "Target pace at risk"
            default: return
            }
        }
        speak(message)
    }

    // MARK: - Cadence Metronome Haptic

    private var cadenceTimer: DispatchSourceTimer?

    func startCadenceHaptic(bpm: Int) {
        stopCadenceHaptic()
        guard bpm > 0 else { return }

        let interval = 60.0 / Double(bpm)
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now(), repeating: interval)
        timer.setEventHandler {
            WKInterfaceDevice.current().play(.click)
        }
        timer.resume()
        cadenceTimer = timer
    }

    func stopCadenceHaptic() {
        cadenceTimer?.cancel()
        cadenceTimer = nil
    }
}
