import Foundation
import WatchKit

class HapticManager {
    static let shared = HapticManager()
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
}
