import Foundation

struct WatchRunState {
    var phase: String = "idle"        // idle/countdown/running/paused/completed
    var sessionId: String?
    var distance: Double = 0          // meters
    var duration: Int = 0             // seconds
    var currentPace: Int = 0          // sec/km
    var avgPace: Int = 0              // sec/km
    var speed: Double = 0             // m/s
    var heartRate: Double = 0         // BPM
    var calories: Int = 0
    var cadence: Int = 0              // steps per minute
    var gpsStatus: String = "searching"
    var isMoving: Bool = false
    var isAutoPaused: Bool = false
    var lastMilestoneKm: Int = 0
    var lastMilestoneSplitPace: Int = 0

    // Course navigation
    var isCourseRun: Bool = false
    var navBearing: Double = -1           // direction to next point (0-360, -1=none)
    var navRemainingDistance: Double = -1  // remaining distance in meters (-1=none)
    var navDeviation: Double = -1         // deviation from course in meters (-1=none)
    var navDirection: String = ""         // "straight"/"left"/"right"/"u-turn"
    var navProgress: Double = -1          // progress percent (0-100, -1=none)
    var navIsOffCourse: Bool = false
    var navNextTurnDirection: String = ""      // "slight-left"/"left"/"sharp-left"/etc. 8-way
    var navDistanceToNextTurn: Double = -1     // meters to next turn, -1 = none

    // Navigate to start
    var navToStartBearing: Double = -1    // bearing to start point (0-360, -1=none)
    var navToStartDistance: Double = -1   // meters to start point (-1=none)
    var navToStartReady: Bool = false     // arrived at start point?

    // Checkpoint progress
    var cpPassed: Int = 0                 // checkpoints passed
    var cpTotal: Int = 0                  // total checkpoints
    var cpJustPassed: Bool = false        // just passed a checkpoint (for haptic)

    // Run goal (from phone)
    var goalType: String = ""             // "distance"/"time"/"pace"/"program"/""
    var goalValue: Double = 0             // meters for distance, seconds for time, sec/km for pace

    // Program running (pace target)
    var programTargetDistance: Double = 0  // meters
    var programTargetTime: Double = 0     // seconds
    var programTimeDelta: Double = 0      // seconds (+ = ahead, - = behind)
    var programRequiredPace: Int = 0      // seconds/km
    var programStatus: String = ""        // "ahead"/"on_pace"/"behind"/"critical"
    var metronomeBPM: Int = 0             // 0 = off

    // Timer sync (startTime-based, from phone)
    var runStartTime: Double = 0          // ms since epoch — when current segment started
    var elapsedBeforePause: Double = 0    // seconds accumulated before current segment

    // Countdown sync (from phone)
    var countdownStartedAt: Double = 0    // ms since epoch (JS Date.now())
    var countdownTotal: Int = 3           // total countdown seconds
}
