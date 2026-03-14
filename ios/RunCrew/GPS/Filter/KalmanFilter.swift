import Foundation

/// 6-dimensional Kalman Filter for GPS smoothing
/// State vector: [x, y, alt, vx, vy, vz] in meters
class KalmanFilter {
    private var state: [Double]       // 6D state vector
    private var covariance: [[Double]] // 6x6 covariance matrix P
    private var isInitialized = false
    private var converter: CoordinateConverter?
    private var lastTimestamp: TimeInterval = 0
    private var lastValidResult: (lat: Double, lon: Double, alt: Double, speed: Double, bearing: Double)?

    // Process noise base values (higher = more responsive to actual movement)
    private let processNoisePosition: Double = 0.5
    private let processNoiseVelocity: Double = 1.5
    private var dynamicProcessNoise: Double = 1.0

    // RTS Smoother: store intermediate states for backward pass
    // measTimestamp/measSpeed/measBearing carry original GPS metadata
    // so smoothRoute() output is self-contained (no need to align with filteredLocations)
    private var history: [(predicted: [Double], predictedP: [[Double]],
                           filtered: [Double], filteredP: [[Double]],
                           F: [[Double]],
                           measTimestamp: Double, measSpeed: Double, measBearing: Double)] = []

    init() {
        state = [0, 0, 0, 0, 0, 0]
        covariance = Self.identity(6, scale: 100.0)
    }

    /// Initialize filter with first valid GPS point
    func initialize(lat: Double, lon: Double, alt: Double, timestamp: TimeInterval) {
        converter = CoordinateConverter(referenceLat: lat, referenceLon: lon)
        state = [0, 0, alt, 0, 0, 0] // Reference point = origin
        covariance = Self.identity(6, scale: 100.0)
        lastTimestamp = timestamp
        isInitialized = true
        // Clear history on init/reinit to prevent mixing coordinate systems
        history.removeAll()
    }

    /// Update dynamic process noise based on Core Motion acceleration variance.
    ///
    /// Accelerometer variance is in g^2 (typically 0.001 standing .. 0.1+ running hard).
    /// We scale it into a useful range for the process noise matrix:
    ///   - Standing still (variance ~ 0.001): dynamicProcessNoise ~ 0.5  (trust GPS, low noise)
    ///   - Walking       (variance ~ 0.01):   dynamicProcessNoise ~ 1.5
    ///   - Running       (variance ~ 0.05):   dynamicProcessNoise ~ 4.0  (allow more movement)
    ///   - Sprinting     (variance ~ 0.15+):  dynamicProcessNoise ~ 8.0  (high responsiveness)
    func updateProcessNoise(accelerationVariance: Double) {
        // Scale from g^2 domain to process noise domain:
        // Multiply by 50 to map typical range [0.001, 0.15] -> [0.05, 7.5],
        // then add baseline of 0.3 and clamp to [0.3, 8.0].
        let scaled = accelerationVariance * 50.0 + 0.3
        dynamicProcessNoise = max(0.3, min(scaled, 8.0))
    }

    /// Predict + Update step with new GPS measurement
    func update(lat: Double, lon: Double, alt: Double,
                speed: Double, bearing: Double,
                horizontalAccuracy: Double, speedAccuracy: Double,
                timestamp: TimeInterval) -> (lat: Double, lon: Double, alt: Double,
                                              speed: Double, bearing: Double) {
        guard isInitialized, let converter = converter else {
            initialize(lat: lat, lon: lon, alt: alt, timestamp: timestamp)
            // Passthrough entry: keeps history aligned with filteredLocations
            history.append((predicted: state, predictedP: covariance,
                            filtered: state, filteredP: covariance,
                            F: Self.identity(6),
                            measTimestamp: timestamp, measSpeed: speed, measBearing: bearing))
            return (lat, lon, alt, speed, bearing)
        }

        let dt = (timestamp - lastTimestamp) / 1000.0 // ms to seconds
        guard dt > 0, dt < 30 else {
            // Reset if time gap too large
            initialize(lat: lat, lon: lon, alt: alt, timestamp: timestamp)
            history.append((predicted: state, predictedP: covariance,
                            filtered: state, filteredP: covariance,
                            F: Self.identity(6),
                            measTimestamp: timestamp, measSpeed: speed, measBearing: bearing))
            return (lat, lon, alt, speed, bearing)
        }
        lastTimestamp = timestamp

        // --- Predict ---
        let F = stateTransitionMatrix(dt: dt)
        let Q = processNoiseMatrix(dt: dt)

        let predictedState = matVecMul(F, state)
        let predictedP = matAdd(matMul(matMul(F, covariance), transpose(F)), Q)

        // --- Update ---
        let measurement = toMeasurement(lat: lat, lon: lon, alt: alt,
                                         speed: speed, bearing: bearing,
                                         converter: converter)
        let H = measurementMatrix()
        let R = measurementNoiseMatrix(horizontalAccuracy: horizontalAccuracy,
                                        speedAccuracy: speedAccuracy)

        let y = vecSub(measurement, matVecMul(H, predictedState)) // Innovation
        let S = matAdd(matMul(matMul(H, predictedP), transpose(H)), R) // Innovation covariance
        guard let SInv = invert(S) else {
            state = predictedState
            covariance = predictedP
            return convertStateToLatLng()
        }
        let K = matMul(matMul(predictedP, transpose(H)), SInv) // Kalman gain

        state = vecAdd(predictedState, matVecMul(K, y))
        let I = Self.identity(6)
        covariance = matMul(matSub(I, matMul(K, H)), predictedP)

        // Store for RTS backward pass (with original GPS metadata)
        history.append((predicted: predictedState, predictedP: predictedP,
                         filtered: state, filteredP: covariance, F: F,
                         measTimestamp: timestamp, measSpeed: speed, measBearing: bearing))

        return convertStateToLatLng()
    }

    func getEstimatedSpeed() -> Double {
        return sqrt(state[3] * state[3] + state[4] * state[4])
    }

    /// RTS Backward Smoother: uses future data to correct past estimates.
    /// Returns smoothed positions with original GPS metadata (self-contained).
    func smoothRoute() -> [(lat: Double, lon: Double, alt: Double,
                             timestamp: Double, speed: Double, bearing: Double)] {
        guard history.count >= 2, let converter = converter else {
            return []
        }

        let N = history.count
        var smoothedStates = Array(repeating: [Double](repeating: 0, count: 6), count: N)
        var smoothedP = Array(repeating: Self.identity(6), count: N)

        // Initialize backward pass with last filtered state
        smoothedStates[N - 1] = history[N - 1].filtered
        smoothedP[N - 1] = history[N - 1].filteredP

        // Backward pass: k = N-2 down to 0
        for k in stride(from: N - 2, through: 0, by: -1) {
            let filtS = history[k].filtered
            let filtP = history[k].filteredP
            let predS = history[k + 1].predicted
            let predP = history[k + 1].predictedP
            let Fk = history[k + 1].F

            // G_k = P_filtered[k] * F[k+1]^T * inv(P_predicted[k+1])
            guard let predPInv = invert(predP) else {
                smoothedStates[k] = filtS
                smoothedP[k] = filtP
                continue
            }
            let G = matMul(matMul(filtP, transpose(Fk)), predPInv)

            // smoothed_state[k] = filtered[k] + G * (smoothed[k+1] - predicted[k+1])
            let diff = vecSub(smoothedStates[k + 1], predS)
            smoothedStates[k] = vecAdd(filtS, matVecMul(G, diff))

            // smoothed_P[k] = filtered_P[k] + G * (smoothed_P[k+1] - predicted_P[k+1]) * G^T
            let pDiff = matSub(smoothedP[k + 1], predP)
            smoothedP[k] = matAdd(filtP, matMul(matMul(G, pDiff), transpose(G)))
        }

        // Convert smoothed states to lat/lng with original metadata
        return smoothedStates.enumerated().map { (i, s) in
            let latLng = converter.toLatLng(x: s[0], y: s[1])
            return (latLng.lat, latLng.lon, s[2],
                    history[i].measTimestamp, history[i].measSpeed, history[i].measBearing)
        }
    }

    func clearHistory() {
        history.removeAll()
    }

    func reset() {
        isInitialized = false
        state = [0, 0, 0, 0, 0, 0]
        covariance = Self.identity(6, scale: 100.0)
        converter = nil
        lastValidResult = nil
        history.removeAll()
    }

    // MARK: - Private Helpers

    private func convertStateToLatLng() -> (lat: Double, lon: Double, alt: Double,
                                             speed: Double, bearing: Double) {
        guard let converter = converter else {
            // Return last valid result instead of (0,0) to prevent route corruption
            return lastValidResult ?? (0, 0, 0, 0, 0)
        }
        let latLng = converter.toLatLng(x: state[0], y: state[1])
        let speed = sqrt(state[3] * state[3] + state[4] * state[4])
        var bearing = atan2(state[3], state[4]).toDegrees() // vx=east, vy=north
        bearing = (bearing + 360).truncatingRemainder(dividingBy: 360)
        let result = (latLng.lat, latLng.lon, state[2], speed, bearing)
        lastValidResult = result
        return result
    }

    private func toMeasurement(lat: Double, lon: Double, alt: Double,
                                speed: Double, bearing: Double,
                                converter: CoordinateConverter) -> [Double] {
        let pos = converter.toMeters(lat: lat, lon: lon)
        let bearingRad = bearing * .pi / 180.0
        let vEast = speed * sin(bearingRad)
        let vNorth = speed * cos(bearingRad)
        return [pos.x, pos.y, alt, vEast, vNorth, 0]
    }

    private func stateTransitionMatrix(dt: Double) -> [[Double]] {
        return [
            [1, 0, 0, dt, 0,  0],
            [0, 1, 0, 0,  dt, 0],
            [0, 0, 1, 0,  0,  dt],
            [0, 0, 0, 1,  0,  0],
            [0, 0, 0, 0,  1,  0],
            [0, 0, 0, 0,  0,  1]
        ]
    }

    private func processNoiseMatrix(dt: Double) -> [[Double]] {
        let dt2 = dt * dt
        let dt3 = dt2 * dt / 2.0
        let dt4 = dt2 * dt2 / 4.0
        let qp = processNoisePosition * dynamicProcessNoise
        let qv = processNoiseVelocity * dynamicProcessNoise
        return [
            [qp * dt4, 0,        0,        qp * dt3, 0,        0],
            [0,        qp * dt4, 0,        0,        qp * dt3, 0],
            [0,        0,        qp * dt4, 0,        0,        qp * dt3],
            [qp * dt3, 0,        0,        qv * dt2, 0,        0],
            [0,        qp * dt3, 0,        0,        qv * dt2, 0],
            [0,        0,        qp * dt3, 0,        0,        qv * dt2]
        ]
    }

    private func measurementMatrix() -> [[Double]] {
        return Self.identity(6)
    }

    private func measurementNoiseMatrix(horizontalAccuracy: Double,
                                         speedAccuracy: Double) -> [[Double]] {
        // Floor: GPS reports optimistic accuracy; actual scatter is always larger
        let clamped = max(horizontalAccuracy, 8.0)
        // Urban canyon inflation: when accuracy > 20m, multipath likely — trust GPS less
        let inflated = clamped > 20 ? clamped * 2.5 : clamped
        let posVar = inflated * inflated
        let spdVar: Double
        if speedAccuracy < -100 {
            // GPS speed unknown (CLLocation.speed == -1) — effectively ignore
            // speed measurement so filter infers velocity from position changes
            spdVar = 1e6
        } else if speedAccuracy > 0 {
            spdVar = speedAccuracy * speedAccuracy
        } else {
            spdVar = 4.0
        }
        let altVar: Double = 100.0 // GPS altitude is typically inaccurate
        return [
            [posVar, 0,      0,      0,      0,      0],
            [0,      posVar, 0,      0,      0,      0],
            [0,      0,      altVar, 0,      0,      0],
            [0,      0,      0,      spdVar, 0,      0],
            [0,      0,      0,      0,      spdVar, 0],
            [0,      0,      0,      0,      0,      spdVar]
        ]
    }

    // MARK: - Matrix Operations

    private static func identity(_ n: Int, scale: Double = 1.0) -> [[Double]] {
        var m = Array(repeating: Array(repeating: 0.0, count: n), count: n)
        for i in 0..<n { m[i][i] = scale }
        return m
    }

    private func matMul(_ a: [[Double]], _ b: [[Double]]) -> [[Double]] {
        let n = a.count, m = b[0].count, p = b.count
        var result = Array(repeating: Array(repeating: 0.0, count: m), count: n)
        for i in 0..<n {
            for j in 0..<m {
                for k in 0..<p { result[i][j] += a[i][k] * b[k][j] }
            }
        }
        return result
    }

    private func matVecMul(_ m: [[Double]], _ v: [Double]) -> [Double] {
        return m.map { row in zip(row, v).reduce(0.0) { $0 + $1.0 * $1.1 } }
    }

    private func matAdd(_ a: [[Double]], _ b: [[Double]]) -> [[Double]] {
        return zip(a, b).map { zip($0, $1).map { $0 + $1 } }
    }

    private func matSub(_ a: [[Double]], _ b: [[Double]]) -> [[Double]] {
        return zip(a, b).map { zip($0, $1).map { $0 - $1 } }
    }

    private func vecAdd(_ a: [Double], _ b: [Double]) -> [Double] {
        return zip(a, b).map(+)
    }

    private func vecSub(_ a: [Double], _ b: [Double]) -> [Double] {
        return zip(a, b).map(-)
    }

    private func transpose(_ m: [[Double]]) -> [[Double]] {
        guard !m.isEmpty else { return m }
        let rows = m.count, cols = m[0].count
        var result = Array(repeating: Array(repeating: 0.0, count: rows), count: cols)
        for i in 0..<rows {
            for j in 0..<cols { result[j][i] = m[i][j] }
        }
        return result
    }

    /// Simple 6x6 matrix inversion using Gauss-Jordan elimination
    private func invert(_ matrix: [[Double]]) -> [[Double]]? {
        let n = matrix.count
        var a = matrix
        var inv = Self.identity(n)

        for col in 0..<n {
            var maxRow = col
            for row in (col + 1)..<n {
                if abs(a[row][col]) > abs(a[maxRow][col]) { maxRow = row }
            }
            a.swapAt(col, maxRow)
            inv.swapAt(col, maxRow)

            let pivot = a[col][col]
            guard abs(pivot) > 1e-12 else { return nil }

            for j in 0..<n {
                a[col][j] /= pivot
                inv[col][j] /= pivot
            }
            for row in 0..<n where row != col {
                let factor = a[row][col]
                for j in 0..<n {
                    a[row][j] -= factor * a[col][j]
                    inv[row][j] -= factor * inv[col][j]
                }
            }
        }
        return inv
    }
}
