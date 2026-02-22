import Foundation

enum WatchMessageType: String {
    case locationUpdate
    case stateUpdate
    case milestone
    case command
    case heartRate
    case requestState
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
}
