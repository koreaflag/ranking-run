import Foundation

enum WatchMessageType: String {
    case locationUpdate
    case stateUpdate
    case milestone
    case command
    case heartRate
    case requestState
    case weeklyGoalUpdate
}

enum WatchCommand: String {
    case start
    case pause
    case resume
    case stop
}

struct WatchMessageKeys {
    static let type = "type"
    static let distance = "distance"
    static let distanceMeters = "distanceMeters"
    static let duration = "duration"
    static let durationSeconds = "durationSeconds"
    static let currentPace = "currentPace"
    static let avgPace = "avgPace"
    static let speed = "speed"
    static let gpsStatus = "gpsStatus"
    static let isMoving = "isMoving"
    static let phase = "phase"
    static let sessionId = "sessionId"
    static let calories = "calories"
    static let command = "command"
    static let bpm = "bpm"
    static let timestamp = "timestamp"
    static let kilometer = "kilometer"
    static let splitPace = "splitPace"
    static let totalTime = "totalTime"
    static let distanceFromStart = "distanceFromStart"
    static let cadence = "cadence"

    // Course navigation
    static let isCourseRun = "isCourseRun"
    static let navBearing = "navBearing"
    static let navRemainingDistance = "navRemainingDistance"
    static let navDeviation = "navDeviation"
    static let navDirection = "navDirection"
    static let navProgress = "navProgress"
    static let navIsOffCourse = "navIsOffCourse"
    static let navNextTurnDirection = "navNextTurnDirection"
    static let navDistanceToNextTurn = "navDistanceToNextTurn"
    static let isAutoPaused = "isAutoPaused"

    // Navigate to start
    static let navToStartBearing = "navToStartBearing"
    static let navToStartDistance = "navToStartDistance"
    static let navToStartReady = "navToStartReady"

    // Checkpoint progress
    static let cpPassed = "cpPassed"
    static let cpTotal = "cpTotal"
    static let cpJustPassed = "cpJustPassed"

    // Run goal (from phone)
    static let goalType = "goalType"    // "distance"/"time"/"pace"/"program"/""
    static let goalValue = "goalValue"  // meters for distance, seconds for time, sec/km for pace

    // Program running (pace target)
    static let programTargetDistance = "programTargetDistance"
    static let programTargetTime = "programTargetTime"
    static let programTimeDelta = "programTimeDelta"
    static let programRequiredPace = "programRequiredPace"
    static let programStatus = "programStatus"
    static let metronomeBPM = "metronomeBPM"

    // Countdown sync
    static let countdownStartedAt = "countdownStartedAt"
    static let countdownTotal = "countdownTotal"

    // Weekly goal sync
    static let weeklyGoalKm = "weeklyGoalKm"
}
