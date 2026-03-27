import AVFoundation
import Foundation
import WatchKit

class HapticManager {
    static let shared = HapticManager()
    private let synthesizer = AVSpeechSynthesizer()
    private var audioPlayer: AVAudioPlayer?
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
    /// TTS and beep only play in standalone mode (not companion).
    var isStandaloneMode: Bool = false
    private init() {}

    /// Pre-configure audio session so beeps play instantly without setup delay.
    func prepareAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [.duckOthers])
            try session.setActive(true)
        } catch {
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [.duckOthers])
                try session.setActive(true)
            } catch {}
        }
    }

    func countdownTick() {
        WKInterfaceDevice.current().play(.click)
    }

    func runStarted() {
        WKInterfaceDevice.current().play(.start)
        speakRunLifecycle("start")
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

    func runCompleted(skipVoice: Bool = false) {
        WKInterfaceDevice.current().play(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            WKInterfaceDevice.current().play(.success)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                WKInterfaceDevice.current().play(.success)
                if !skipVoice {
                    self.speakRunLifecycle("complete")
                }
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

    private func speakRunLifecycle(_ event: String) {
        let lang = Locale.preferredLanguages.first ?? "ko"
        let message: String
        if lang.hasPrefix("ko") {
            message = event == "start" ? "운동 시작" : "운동 종료"
        } else if lang.hasPrefix("ja") {
            message = event == "start" ? "ワークアウト開始" : "ワークアウト終了"
        } else {
            message = event == "start" ? "Workout started" : "Workout complete"
        }
        speak(message)
    }

    // MARK: - TTS Voice

    private func speak(_ text: String) {
        guard voiceEnabled, isStandaloneMode else { return }
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

    // MARK: - Interval Training Haptics

    func intervalRunStart() {
        WKInterfaceDevice.current().play(.start)
        playBeep(frequency: 880, count: 1, interval: 0)
        speakIntervalPhase("run")
    }

    func intervalWalkStart() {
        WKInterfaceDevice.current().play(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            WKInterfaceDevice.current().play(.success)
        }
        playBeep(frequency: 660, count: 2, interval: 0.12)
        speakIntervalPhase("walk")
    }

    func intervalComplete() {
        WKInterfaceDevice.current().play(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            WKInterfaceDevice.current().play(.success)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                WKInterfaceDevice.current().play(.success)
            }
        }
        playBeep(frequency: 1046, count: 3, interval: 0.12)
        speakIntervalPhase("complete")
    }

    private func speakIntervalPhase(_ phase: String) {
        let lang = Locale.preferredLanguages.first ?? "ko"
        let message: String
        if lang.hasPrefix("ko") {
            switch phase {
            case "run": message = "달리기"
            case "walk": message = "걷기"
            case "complete": message = "인터벌 완료"
            default: return
            }
        } else if lang.hasPrefix("ja") {
            switch phase {
            case "run": message = "走りましょう"
            case "walk": message = "ウォーキング"
            case "complete": message = "インターバル完了"
            default: return
            }
        } else {
            switch phase {
            case "run": message = "Run"
            case "walk": message = "Walk"
            case "complete": message = "Interval complete"
            default: return
            }
        }
        speak(message)
    }

    // MARK: - Beep Tone Generator

    /// Play a short beep tone through the watch speaker.
    /// - Parameters:
    ///   - frequency: Tone frequency in Hz (e.g., 880 = A5)
    ///   - count: Number of beeps
    ///   - interval: Seconds between beeps
    private func playBeep(frequency: Double = 880, count: Int = 1, interval: TimeInterval = 0.15) {
        guard isStandaloneMode else { return }
        // Set up audio session for speaker playback
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [.duckOthers])
            try session.setActive(true)
        } catch {
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [.duckOthers])
                try session.setActive(true)
            } catch { return }
        }

        // Generate sine wave PCM data
        let sampleRate: Double = 44100
        let beepDuration: Double = 0.08
        let totalDuration = beepDuration * Double(count) + interval * Double(max(0, count - 1))
        let totalSamples = Int(sampleRate * totalDuration)

        var audioData = [Float](repeating: 0, count: totalSamples)
        let beepSamples = Int(sampleRate * beepDuration)

        for b in 0..<count {
            let startSample = Int(sampleRate * (beepDuration + interval) * Double(b))
            for i in 0..<beepSamples {
                let idx = startSample + i
                guard idx < totalSamples else { break }
                let t = Double(i) / sampleRate
                // Sine wave with fade-in/out to avoid click
                var amplitude = Float(sin(2.0 * .pi * frequency * t))
                let fadeLen = min(beepSamples / 8, 200)
                if i < fadeLen {
                    amplitude *= Float(i) / Float(fadeLen)
                } else if i > beepSamples - fadeLen {
                    amplitude *= Float(beepSamples - i) / Float(fadeLen)
                }
                audioData[idx] = amplitude * 0.6
            }
        }

        // Create WAV data in memory
        let wavData = createWAVData(samples: audioData, sampleRate: Int(sampleRate))
        do {
            let player = try AVAudioPlayer(data: wavData)
            player.volume = 0.8
            player.play()
            audioPlayer = player  // retain
        } catch {}
    }

    /// Create a minimal WAV file in memory from Float samples.
    private func createWAVData(samples: [Float], sampleRate: Int) -> Data {
        let numChannels: UInt16 = 1
        let bitsPerSample: UInt16 = 16
        let bytesPerSample = Int(bitsPerSample / 8)
        let dataSize = samples.count * bytesPerSample

        var data = Data()
        // RIFF header
        data.append(contentsOf: [UInt8]("RIFF".utf8))
        var chunkSize = UInt32(36 + dataSize)
        data.append(Data(bytes: &chunkSize, count: 4))
        data.append(contentsOf: [UInt8]("WAVE".utf8))
        // fmt subchunk
        data.append(contentsOf: [UInt8]("fmt ".utf8))
        var subchunk1Size: UInt32 = 16
        data.append(Data(bytes: &subchunk1Size, count: 4))
        var audioFormat: UInt16 = 1  // PCM
        data.append(Data(bytes: &audioFormat, count: 2))
        var channels = numChannels
        data.append(Data(bytes: &channels, count: 2))
        var rate = UInt32(sampleRate)
        data.append(Data(bytes: &rate, count: 4))
        var byteRate = UInt32(sampleRate * Int(numChannels) * bytesPerSample)
        data.append(Data(bytes: &byteRate, count: 4))
        var blockAlign = UInt16(Int(numChannels) * bytesPerSample)
        data.append(Data(bytes: &blockAlign, count: 2))
        var bits = bitsPerSample
        data.append(Data(bytes: &bits, count: 2))
        // data subchunk
        data.append(contentsOf: [UInt8]("data".utf8))
        var subchunk2Size = UInt32(dataSize)
        data.append(Data(bytes: &subchunk2Size, count: 4))
        // PCM samples
        for sample in samples {
            let clamped = max(-1.0, min(1.0, sample))
            var int16 = Int16(clamped * Float(Int16.max))
            data.append(Data(bytes: &int16, count: 2))
        }
        return data
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
