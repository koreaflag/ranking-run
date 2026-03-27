package com.runcrew.gps

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import kotlin.math.exp
import kotlin.math.sin

/**
 * Native metronome module for Android.
 *
 * Uses AudioTrack in MODE_STREAM with a dedicated audio thread that
 * continuously writes [click + silence] frames. This avoids the
 * stop/reload/play gaps of MODE_STATIC which caused intermittent
 * click dropouts.
 *
 * Matched with iOS MetronomeModule: 800Hz base + 1600Hz harmonic, 25ms click.
 */
class MetronomeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MetronomeModule"

    @Volatile private var audioThread: Thread? = null
    @Volatile private var isRunning = false
    @Volatile private var currentBPM = 0.0

    companion object {
        private const val TAG = "Metronome"
        private const val SAMPLE_RATE = 44100
        private const val CLICK_DURATION_SEC = 0.025 // 25ms — matched with iOS
        private const val BASE_FREQ = 800.0
        private const val HARMONIC_FREQ = 1600.0
        private const val HARMONIC_MIX = 0.3f
        private const val VOLUME = 0.55f
    }

    private fun generateClickSamples(): ShortArray {
        val frameCount = (SAMPLE_RATE * CLICK_DURATION_SEC).toInt()
        val samples = ShortArray(frameCount)
        val attackFrames = (SAMPLE_RATE * 0.001).toInt() // 1ms attack

        for (i in 0 until frameCount) {
            val t = i.toDouble() / SAMPLE_RATE
            val base = sin(2.0 * Math.PI * BASE_FREQ * t).toFloat()
            val harmonic = sin(2.0 * Math.PI * HARMONIC_FREQ * t).toFloat()
            var sample = base + HARMONIC_MIX * harmonic

            // Envelope: linear attack + exponential decay
            if (i < attackFrames) {
                sample *= i.toFloat() / attackFrames.coerceAtLeast(1).toFloat()
            }
            val decayProgress = i.toDouble() / frameCount
            sample *= exp(-5.0 * decayProgress).toFloat()
            sample *= VOLUME

            // Convert to 16-bit PCM
            samples[i] = (sample * Short.MAX_VALUE).toInt()
                .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
        return samples
    }

    @ReactMethod
    fun start(bpm: Double) {
        if (bpm <= 0) {
            stop()
            return
        }
        if (isRunning && currentBPM == bpm) return
        if (isRunning) stopInternal()

        currentBPM = bpm
        isRunning = true

        val clickSamples = generateClickSamples()

        // Total samples per beat period (click + silence)
        val beatPeriodSamples = (SAMPLE_RATE * 60.0 / bpm).toInt()
        val silenceSamples = beatPeriodSamples - clickSamples.size

        // Build one full beat: click followed by silence
        val beatBuffer = ShortArray(beatPeriodSamples)
        clickSamples.copyInto(beatBuffer, 0)
        // Rest is already zero (silence)

        val minBuf = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        val thread = Thread({
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)

            var track: AudioTrack? = null
            try {
                track = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(maxOf(beatBuffer.size * 2, minBuf))
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build()

                track.play()

                // Continuously stream beat buffers until stopped
                while (isRunning) {
                    val written = track.write(beatBuffer, 0, beatBuffer.size)
                    if (written < 0) {
                        Log.w(TAG, "AudioTrack write error: $written")
                        break
                    }
                }

                track.stop()
            } catch (e: Exception) {
                Log.e(TAG, "Audio thread error: ${e.message}")
            } finally {
                try { track?.release() } catch (_: Exception) {}
            }
        }, "metronome-audio")
        thread.priority = Thread.MAX_PRIORITY
        thread.start()
        audioThread = thread

        Log.i(TAG, "Started at ${bpm.toInt()} BPM (period: ${beatBuffer.size} samples)")
    }

    @ReactMethod
    fun stop() {
        stopInternal()
    }

    private fun stopInternal() {
        isRunning = false

        audioThread?.let { t ->
            try {
                t.join(500) // Wait up to 500ms for thread to finish
            } catch (_: InterruptedException) {}
        }
        audioThread = null

        currentBPM = 0.0
        Log.i(TAG, "Stopped")
    }

    @ReactMethod
    fun setBPM(bpm: Double) {
        if (bpm <= 0) {
            stop()
            return
        }
        if (isRunning) start(bpm)
    }

    @ReactMethod
    fun isPlaying(promise: Promise) {
        promise.resolve(isRunning)
    }

    /**
     * Play a short beep tone [count] times.
     * count=1: single beep (삐) for run start
     * count=2: double beep (삐삐) for walk start
     */
    @ReactMethod
    fun playBeep(count: Int) {
        Thread({
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
            playBeepSync(count)
        }, "beep-audio").start()
    }

    private fun playBeepSync(count: Int) {
        val beepDurationSec = 0.12   // 120ms per beep
        val gapDurationSec = 0.12    // 120ms gap between beeps
        val freq = 1000.0            // 1kHz — distinct from metronome 800Hz
        val volume = 0.7f

        val beepFrames = (SAMPLE_RATE * beepDurationSec).toInt()
        val gapFrames = (SAMPLE_RATE * gapDurationSec).toInt()
        val totalFrames = beepFrames * count + gapFrames * maxOf(count - 1, 0)
        val samples = ShortArray(totalFrames)

        val fadeInFrames = (SAMPLE_RATE * 0.002).toInt()   // 2ms fade in
        val fadeOutFrames = (SAMPLE_RATE * 0.005).toInt()  // 5ms fade out
        var writeIdx = 0

        for (b in 0 until count) {
            for (i in 0 until beepFrames) {
                val t = i.toDouble() / SAMPLE_RATE
                var sample = sin(2.0 * Math.PI * freq * t).toFloat()

                // Fade in / fade out
                if (i < fadeInFrames) {
                    sample *= i.toFloat() / fadeInFrames
                } else if (i >= beepFrames - fadeOutFrames) {
                    val remaining = beepFrames - i
                    sample *= remaining.toFloat() / fadeOutFrames
                }

                sample *= volume
                samples[writeIdx] = (sample * Short.MAX_VALUE).toInt()
                    .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
                writeIdx++
            }
            // Gap (silence) between beeps
            if (b < count - 1) {
                for (g in 0 until gapFrames) {
                    samples[writeIdx] = 0
                    writeIdx++
                }
            }
        }

        val minBuf = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        var track: AudioTrack? = null
        try {
            // USAGE_ALARM bypasses silent/vibrate mode — beep always plays
            track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(maxOf(samples.size * 2, minBuf))
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()

            track.write(samples, 0, samples.size)
            track.play()

            // Wait for playback to finish
            val playbackMs = (totalFrames.toDouble() / SAMPLE_RATE * 1000).toLong() + 50
            Thread.sleep(playbackMs)

            track.stop()
        } catch (e: Exception) {
            Log.e(TAG, "Beep playback error: ${e.message}")
        } finally {
            try { track?.release() } catch (_: Exception) {}
        }
    }
}
