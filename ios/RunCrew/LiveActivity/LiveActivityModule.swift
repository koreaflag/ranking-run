import Foundation
import ActivityKit

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {

    private var activityId: String?

    // MARK: - Start

    @objc
    func startActivity(_ data: NSDictionary,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.2, *) else {
            reject("UNAVAILABLE", "Live Activities require iOS 16.2+", nil)
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            reject("DISABLED", "Live Activities are disabled by the user", nil)
            return
        }

        let courseName = data["courseName"] as? String ?? ""
        let isCourseRun = data["isCourseRun"] as? Bool ?? false
        let durationSeconds = data["durationSeconds"] as? Int ?? 0

        let attributes = RunningActivityAttributes(
            courseName: courseName,
            isCourseRun: isCourseRun
        )
        let initialState = RunningActivityAttributes.ContentState(
            distanceMeters: 0,
            durationSeconds: durationSeconds,
            currentPace: 0,
            avgPace: 0,
            calories: 0,
            heartRate: 0,
            isPaused: false,
            timerStartDate: Date().addingTimeInterval(-Double(durationSeconds))
        )

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: initialState, staleDate: nil),
                pushType: nil
            )
            activityId = activity.id
            print("[LiveActivity] Started: \(activity.id)")
            resolve(activity.id)
        } catch {
            print("[LiveActivity] Start failed: \(error)")
            reject("START_FAILED", error.localizedDescription, error)
        }
    }

    // MARK: - Update

    @objc
    func updateActivity(_ data: NSDictionary,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }

        let distanceMeters = data["distanceMeters"] as? Double ?? 0
        let durationSeconds = data["durationSeconds"] as? Int ?? 0
        let currentPace = data["currentPace"] as? Int ?? 0
        let avgPace = data["avgPace"] as? Int ?? 0
        let calories = data["calories"] as? Int ?? 0
        let heartRate = data["heartRate"] as? Int ?? 0
        let isPaused = data["isPaused"] as? Bool ?? false

        let state = RunningActivityAttributes.ContentState(
            distanceMeters: distanceMeters,
            durationSeconds: durationSeconds,
            currentPace: currentPace,
            avgPace: avgPace,
            calories: calories,
            heartRate: heartRate,
            isPaused: isPaused,
            timerStartDate: Date().addingTimeInterval(-Double(durationSeconds))
        )

        Task {
            guard let activity = Activity<RunningActivityAttributes>.activities.first(where: { $0.id == activityId }) else {
                guard let fallback = Activity<RunningActivityAttributes>.activities.first else {
                    resolve(false)
                    return
                }
                self.activityId = fallback.id
                await fallback.update(.init(state: state, staleDate: nil))
                resolve(true)
                return
            }
            await activity.update(.init(state: state, staleDate: nil))
            resolve(true)
        }
    }

    // MARK: - End

    @objc
    func endActivity(_ data: NSDictionary,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }

        let distanceMeters = data["distanceMeters"] as? Double ?? 0
        let durationSeconds = data["durationSeconds"] as? Int ?? 0
        let currentPace = data["currentPace"] as? Int ?? 0
        let avgPace = data["avgPace"] as? Int ?? 0
        let calories = data["calories"] as? Int ?? 0
        let heartRate = data["heartRate"] as? Int ?? 0

        let finalState = RunningActivityAttributes.ContentState(
            distanceMeters: distanceMeters,
            durationSeconds: durationSeconds,
            currentPace: currentPace,
            avgPace: avgPace,
            calories: calories,
            heartRate: heartRate,
            isPaused: false,
            timerStartDate: Date().addingTimeInterval(-Double(durationSeconds))
        )

        Task {
            for activity in Activity<RunningActivityAttributes>.activities {
                await activity.end(
                    .init(state: finalState, staleDate: nil),
                    dismissalPolicy: .after(.now + 30)
                )
            }
            activityId = nil
            print("[LiveActivity] Ended")
            resolve(true)
        }
    }

    // MARK: - Check availability

    @objc
    func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.2, *) {
            resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
        } else {
            resolve(false)
        }
    }

    // MARK: - RN bridge metadata

    @objc
    static func requiresMainQueueSetup() -> Bool { false }
}
