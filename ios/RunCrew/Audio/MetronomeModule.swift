import Foundation
import AVFoundation

/// Native metronome using AVAudioEngine for precise timing.
/// JS setInterval is too imprecise for musical-tempo clicks, so we use
/// a DispatchSourceTimer + AVAudioPlayerNode for sub-ms accuracy.
///
/// Audio session uses `.playback` category with `.mixWithOthers` option
/// so the metronome plays alongside music and TTS announcements.
@objc(MetronomeModule)
class MetronomeModule: NSObject {
    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var clickBuffer: AVAudioPCMBuffer?
    private var timer: DispatchSourceTimer?
    private var isRunning = false
    private var currentBPM: Double = 0

    private let timerQueue = DispatchQueue(label: "com.runcrew.metronome", qos: .userInteractive)

    // MARK: - Click Sound Generation

    /// Generate a short percussive click (woodblock-style) as an AVAudioPCMBuffer.
    /// Uses 800 Hz base + 1600 Hz harmonic with fast exponential decay for a crisp tick.
    private func generateClickBuffer(format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let sampleRate = format.sampleRate
        let duration = 0.025 // 25ms — short, percussive
        let frameCount = AVAudioFrameCount(sampleRate * duration)

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }
        buffer.frameLength = frameCount

        guard let channelData = buffer.floatChannelData?[0] else { return nil }

        let baseFreq: Double = 800.0
        let harmonicFreq: Double = 1600.0
        let harmonicMix: Float = 0.3
        let attackFrames = Int(sampleRate * 0.001) // 1ms attack

        for i in 0..<Int(frameCount) {
            let t = Double(i) / sampleRate
            let base = Float(sin(2.0 * .pi * baseFreq * t))
            let harmonic = Float(sin(2.0 * .pi * harmonicFreq * t))
            var sample = base + harmonicMix * harmonic

            // Envelope: instant attack + exponential decay
            if i < attackFrames {
                sample *= Float(i) / Float(max(attackFrames, 1))
            }
            // Exponential decay over entire duration
            let decayProgress = Double(i) / Double(frameCount)
            sample *= Float(exp(-5.0 * decayProgress))

            // Volume
            sample *= 0.55

            channelData[i] = sample
        }

        return buffer
    }

    // MARK: - Public API

    @objc func start(_ bpm: Double) {
        guard bpm > 0 else {
            stop()
            return
        }

        // If already running at same BPM, do nothing
        if isRunning && currentBPM == bpm { return }

        // If running at different BPM, stop first
        if isRunning { stopInternal() }

        currentBPM = bpm

        do {
            // Configure audio session
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, options: [.mixWithOthers, .duckOthers])
            try audioSession.setActive(true)

            // Setup engine
            let engine = AVAudioEngine()
            let player = AVAudioPlayerNode()
            engine.attach(player)

            let format = AVAudioFormat(standardFormatWithSampleRate: 44100.0, channels: 1)!
            engine.connect(player, to: engine.mainMixerNode, format: format)

            // Generate click buffer
            guard let buffer = generateClickBuffer(format: format) else {
                NSLog("[Metronome] Failed to generate click buffer")
                return
            }

            try engine.start()
            player.play()

            self.audioEngine = engine
            self.playerNode = player
            self.clickBuffer = buffer

            // Start timer
            let interval = 60.0 / bpm
            let timer = DispatchSource.makeTimerSource(queue: timerQueue)
            timer.schedule(deadline: .now(), repeating: interval, leeway: .milliseconds(1))
            timer.setEventHandler { [weak self] in
                guard let self = self, let player = self.playerNode, let buffer = self.clickBuffer else { return }
                player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
            }
            timer.resume()
            self.timer = timer

            isRunning = true
            NSLog("[Metronome] Started at %.0f BPM (interval: %.3fs)", bpm, interval)
        } catch {
            NSLog("[Metronome] Failed to start: %@", error.localizedDescription)
        }
    }

    @objc func stop() {
        stopInternal()
    }

    private func stopInternal() {
        timer?.cancel()
        timer = nil

        playerNode?.stop()
        audioEngine?.stop()

        playerNode = nil
        audioEngine = nil
        clickBuffer = nil

        isRunning = false
        currentBPM = 0
        NSLog("[Metronome] Stopped")
    }

    @objc func setBPM(_ bpm: Double) {
        guard bpm > 0 else {
            stop()
            return
        }
        if isRunning {
            // Restart with new BPM
            start(bpm)
        }
    }

    @objc func isPlaying(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(isRunning)
    }

    // MARK: - Interval Beep

    /// Play a short beep tone `count` times.
    /// count=1: single beep (삐) for run start
    /// count=2: double beep (삐삐) for walk start
    @objc func playBeep(_ count: Int) {
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            self?.playBeepSync(count: count)
        }
    }

    private func playBeepSync(count: Int) {
        let sampleRate: Double = 44100
        let beepDuration: Double = 0.12  // 120ms per beep
        let gapDuration: Double = 0.12   // 120ms gap between beeps
        let beepFrames = Int(sampleRate * beepDuration)
        let gapFrames = Int(sampleRate * gapDuration)
        let totalFrames = beepFrames * count + gapFrames * max(count - 1, 0)

        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(totalFrames)),
              let channelData = buffer.floatChannelData?[0] else { return }

        buffer.frameLength = AVAudioFrameCount(totalFrames)

        let freq: Double = 1000.0  // 1kHz — clear, distinct from metronome 800Hz
        var writeIdx = 0

        for b in 0..<count {
            // Write one beep
            for i in 0..<beepFrames {
                let t = Double(i) / sampleRate
                var sample = Float(sin(2.0 * .pi * freq * t))

                // Fade in (2ms) / fade out (5ms)
                let fadeInFrames = Int(sampleRate * 0.002)
                let fadeOutFrames = Int(sampleRate * 0.005)
                if i < fadeInFrames {
                    sample *= Float(i) / Float(fadeInFrames)
                } else if i >= beepFrames - fadeOutFrames {
                    let remaining = beepFrames - i
                    sample *= Float(remaining) / Float(fadeOutFrames)
                }

                sample *= 0.7  // volume
                channelData[writeIdx] = sample
                writeIdx += 1
            }
            // Write gap (silence) between beeps
            if b < count - 1 {
                for _ in 0..<gapFrames {
                    channelData[writeIdx] = 0
                    writeIdx += 1
                }
            }
        }

        // Play using a one-shot engine (does not interfere with metronome)
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, options: [.mixWithOthers])
            try audioSession.setActive(true)

            let engine = AVAudioEngine()
            let player = AVAudioPlayerNode()
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)

            try engine.start()
            player.play()
            player.scheduleBuffer(buffer, at: nil, options: []) {
                DispatchQueue.global().async {
                    player.stop()
                    engine.stop()
                }
            }

            // Keep engine alive until playback finishes
            let playbackDuration = Double(totalFrames) / sampleRate + 0.05
            Thread.sleep(forTimeInterval: playbackDuration)
        } catch {
            NSLog("[Metronome] Beep playback error: %@", error.localizedDescription)
        }
    }

    // Required for RN modules with main queue setup
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
