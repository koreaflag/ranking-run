import Foundation

/// 6-dimensional Kalman Filter for GPS smoothing
/// State vector: [x, y, alt, vx, vy, vz] in meters
class KalmanFilter {
    private var state: [Double]       // 6D state vector
    private var covariance: [[Double]] // 6x6 covariance matrix P
    private var isInitialized = false
    private var converter: CoordinateConverter?
    private var lastTimestamp: TimeInterval = 0

    // Process noise base values
    private let processNoisePosition: Double = 0.5
    private let processNoiseVelocity: Double = 2.0
    private var dynamicProcessNoise: Double = 1.0

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
    }

    /// Update dynamic process noise based on Core Motion acceleration variance
    func updateProcessNoise(accelerationVariance: Double) {
        dynamicProcessNoise = max(0.5, min(accelerationVariance, 10.0))
    }

    /// Predict + Update step with new GPS measurement
    func update(lat: Double, lon: Double, alt: Double,
                speed: Double, bearing: Double,
                horizontalAccuracy: Double, speedAccuracy: Double,
                timestamp: TimeInterval) -> (lat: Double, lon: Double, alt: Double,
                                              speed: Double, bearing: Double) {
        guard isInitialized, let converter = converter else {
            initialize(lat: lat, lon: lon, alt: alt, timestamp: timestamp)
            return (lat, lon, alt, speed, bearing)
        }

        let dt = (timestamp - lastTimestamp) / 1000.0 // ms to seconds
        guard dt > 0, dt < 30 else {
            // Reset if time gap too large
            initialize(lat: lat, lon: lon, alt: alt, timestamp: timestamp)
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

        return convertStateToLatLng()
    }

    func getEstimatedSpeed() -> Double {
        return sqrt(state[3] * state[3] + state[4] * state[4])
    }

    func reset() {
        isInitialized = false
        state = [0, 0, 0, 0, 0, 0]
        covariance = Self.identity(6, scale: 100.0)
        converter = nil
    }

    // MARK: - Private Helpers

    private func convertStateToLatLng() -> (lat: Double, lon: Double, alt: Double,
                                             speed: Double, bearing: Double) {
        guard let converter = converter else { return (0, 0, 0, 0, 0) }
        let latLng = converter.toLatLng(x: state[0], y: state[1])
        let speed = sqrt(state[3] * state[3] + state[4] * state[4])
        var bearing = atan2(state[3], state[4]).toDegrees() // vx=east, vy=north
        bearing = (bearing + 360).truncatingRemainder(dividingBy: 360)
        return (latLng.lat, latLng.lon, state[2], speed, bearing)
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
        let posVar = horizontalAccuracy * horizontalAccuracy
        let spdVar = speedAccuracy > 0 ? speedAccuracy * speedAccuracy : 4.0
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
