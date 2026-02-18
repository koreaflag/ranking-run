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
    var gpsStatus: String = "searching"
    var isMoving: Bool = false
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
}
