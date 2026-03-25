import ActivityKit
import Foundation

struct RunningActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distanceMeters: Double
        var durationSeconds: Int
        var currentPace: Int        // seconds per km
        var avgPace: Int            // seconds per km
        var calories: Int
        var heartRate: Int          // bpm, 0 = no data
        var cadence: Int            // steps per minute, 0 = no data
        var isPaused: Bool
        /// Effective start date for live timer: `now - elapsed`.
        /// Widget uses `Text(date, style: .timer)` for smooth counting.
        var timerStartDate: Date
    }

    // Static — set once when activity starts
    var courseName: String
    var isCourseRun: Bool
}
