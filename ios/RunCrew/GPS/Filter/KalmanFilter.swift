import Foundation

// MARK: - KalmanFilter
// 6-dimensional linear Kalman Filter for GPS position smoothing.
//
// State vector: [lat_m, lng_m, alt, v_north, v_east, v_vertical]
// where lat_m and lng_m are in local meters (via CoordinateConverter).
//
// The filter operates in a local Cartesian frame to avoid nonlinearities
// from working directly in geographic coordinates. This makes a standard
// (non-extended) Kalman Filter sufficient for running-speed movement.
//
// Matrices are represented as flat [Double] arrays in row-major order
// for simplicity. No external linear algebra framework required.

final class KalmanFilter {

    // MARK: - Constants

    static let stateDim = 6

    // MARK: - State

    /// State estimate vector [lat_m, lng_m, alt, v_north, v_east, v_vertical]
    private(set) var state: [Double]

    /// Error covariance matrix (6x6, row-major)
    private(set) var P: [Double]

    /// Whether the filter has been initialized with a first measurement
    private(set) var isInitialized: Bool = false

    /// Timestamp of the last update (seconds since epoch)
    private var lastTimestamp: Double = 0

    /// Coordinate converter for the current session
    private let converter: CoordinateConverter

    // MARK: - Tuning

    /// Base process noise standard deviation for position (meters)
    private let basePositionNoise: Double = 1.0

    /// Base process noise standard deviation for velocity (m/s)
    private let baseVelocityNoise: Double = 2.0

    /// Base process noise standard deviation for altitude (meters)
    private let baseAltitudeNoise: Double = 0.5

    /// Current acceleration variance from Core Motion (used to scale Q dynamically)
    var accelerationVariance: Double = 1.0

    // MARK: - Initialization

    init(converter: CoordinateConverter) {
        self.converter = converter
        self.state = [Double](repeating: 0, count: KalmanFilter.stateDim)
        // Initialize P with large uncertainty
        self.P = KalmanFilter.identityMatrix(scale: 100.0)
    }

    // MARK: - Initialize with First Measurement

    /// Seeds the filter with the first valid GPS measurement.
    func initialize(
        lat: Double, lng: Double, alt: Double,
        speed: Double, bearing: Double,
        horizontalAccuracy: Double,
        timestamp: Double
    ) {
        let meters = converter.toMeters(lat: lat, lng: lng)

        let bearingRad = GeoMath.toRadians(bearing)
        let vNorth = speed * cos(bearingRad)
        let vEast = speed * sin(bearingRad)

        state = [meters.northing, meters.easting, alt, vNorth, vEast, 0.0]

        // Initial covariance based on reported accuracy
        let posVar = horizontalAccuracy * horizontalAccuracy
        let velVar = max(speed * 0.5, 2.0) // initial velocity uncertainty
        let velVarSq = velVar * velVar
        let altVar = 25.0 // GPS altitude ~5m std dev initially

        P = KalmanFilter.diagonalMatrix([posVar, posVar, altVar, velVarSq, velVarSq, 4.0])

        lastTimestamp = timestamp / 1000.0 // Convert ms to seconds
        isInitialized = true
    }

    // MARK: - Predict

    /// Predicts the state forward to the given timestamp.
    /// dt is computed from the difference with the last timestamp.
    func predict(timestamp: Double) {
        guard isInitialized else { return }

        let t = timestamp / 1000.0
        let dt = t - lastTimestamp
        guard dt > 0, dt < 30.0 else { return } // Ignore unreasonable gaps

        lastTimestamp = t

        // State transition: constant velocity model
        // x_new = x + v * dt
        state[0] += state[3] * dt // lat_m += v_north * dt
        state[1] += state[4] * dt // lng_m += v_east * dt
        state[2] += state[5] * dt // alt += v_vertical * dt

        // Build state transition matrix F (6x6)
        var F = KalmanFilter.identityMatrix(scale: 1.0)
        F[0 * 6 + 3] = dt // d(lat_m)/d(v_north)
        F[1 * 6 + 4] = dt // d(lng_m)/d(v_east)
        F[2 * 6 + 5] = dt // d(alt)/d(v_vertical)

        // Build process noise Q scaled by acceleration variance
        let accelScale = max(accelerationVariance, 0.1)
        let dt2 = dt * dt
        let dt3 = dt2 * dt / 2.0
        let dt4 = dt2 * dt2 / 4.0

        let posQ = basePositionNoise * basePositionNoise * accelScale
        let velQ = baseVelocityNoise * baseVelocityNoise * accelScale
        let altPosQ = baseAltitudeNoise * baseAltitudeNoise

        // Simplified Q matrix (diagonal + cross terms from constant-acceleration model)
        var Q = [Double](repeating: 0, count: 36)
        // Position variance: q * dt^4/4
        Q[0 * 6 + 0] = posQ * dt4
        Q[1 * 6 + 1] = posQ * dt4
        Q[2 * 6 + 2] = altPosQ * dt4
        // Position-velocity cross terms: q * dt^3/2
        Q[0 * 6 + 3] = posQ * dt3
        Q[3 * 6 + 0] = posQ * dt3
        Q[1 * 6 + 4] = posQ * dt3
        Q[4 * 6 + 1] = posQ * dt3
        Q[2 * 6 + 5] = altPosQ * dt3
        Q[5 * 6 + 2] = altPosQ * dt3
        // Velocity variance: q * dt^2
        Q[3 * 6 + 3] = velQ * dt2
        Q[4 * 6 + 4] = velQ * dt2
        Q[5 * 6 + 5] = altPosQ * dt2

        // P = F * P * F^T + Q
        let FP = KalmanFilter.multiply(F, P, n: 6)
        let Ft = KalmanFilter.transpose(F, n: 6)
        let FPFt = KalmanFilter.multiply(FP, Ft, n: 6)
        P = KalmanFilter.add(FPFt, Q, n: 6)
    }

    // MARK: - Update

    /// Updates the filter with a GPS measurement.
    /// Measurement vector: [lat_m, lng_m, alt, v_north, v_east, v_vertical]
    /// R diagonal: [hAcc^2, hAcc^2, vAcc^2, spdAcc^2, spdAcc^2, vAcc^2]
    func update(
        lat: Double, lng: Double, alt: Double,
        speed: Double, bearing: Double,
        horizontalAccuracy: Double,
        verticalAccuracy: Double,
        speedAccuracy: Double
    ) {
        guard isInitialized else { return }

        let meters = converter.toMeters(lat: lat, lng: lng)

        let bearingRad = GeoMath.toRadians(bearing)
        let vNorth = speed * cos(bearingRad)
        let vEast = speed * sin(bearingRad)

        // Measurement vector
        let z: [Double] = [meters.northing, meters.easting, alt, vNorth, vEast, 0.0]

        // Measurement noise R (diagonal)
        let hVar = horizontalAccuracy * horizontalAccuracy
        let vVar = verticalAccuracy * verticalAccuracy
        let spdVar: Double
        if speedAccuracy > 0 {
            spdVar = speedAccuracy * speedAccuracy
        } else {
            // Fallback: assume speed accuracy is proportional to horizontal accuracy
            spdVar = max(hVar * 0.25, 4.0)
        }
        let altVelVar = max(vVar, 9.0) // Vertical velocity is poorly observed

        let R = KalmanFilter.diagonalMatrix([hVar, hVar, vVar, spdVar, spdVar, altVelVar])

        // Observation model H = Identity (we observe all state components)
        let H = KalmanFilter.identityMatrix(scale: 1.0)

        // Innovation: y = z - H * x (since H = I, y = z - x)
        var y = [Double](repeating: 0, count: 6)
        for i in 0..<6 {
            y[i] = z[i] - state[i]
        }

        // Innovation covariance: S = H * P * H^T + R = P + R
        let S = KalmanFilter.add(P, R, n: 6)

        // Kalman gain: K = P * H^T * S^(-1) = P * S^(-1)
        guard let Sinv = KalmanFilter.invert(S, n: 6) else { return }
        let K = KalmanFilter.multiply(P, Sinv, n: 6)

        // Updated state: x = x + K * y
        for i in 0..<6 {
            var correction = 0.0
            for j in 0..<6 {
                correction += K[i * 6 + j] * y[j]
            }
            state[i] += correction
        }

        // Updated covariance: P = (I - K * H) * P = (I - K) * P
        let IminusK = KalmanFilter.subtract(KalmanFilter.identityMatrix(scale: 1.0), K, n: 6)
        P = KalmanFilter.multiply(IminusK, P, n: 6)

        // Symmetrize P to prevent numerical drift
        for i in 0..<6 {
            for j in (i + 1)..<6 {
                let avg = (P[i * 6 + j] + P[j * 6 + i]) / 2.0
                P[i * 6 + j] = avg
                P[j * 6 + i] = avg
            }
        }
    }

    // MARK: - Get Filtered Position

    /// Returns the current filtered position in geographic coordinates.
    func getFilteredPosition() -> (lat: Double, lng: Double, alt: Double,
                                    speed: Double, bearing: Double) {
        let coords = converter.toDegrees(northing: state[0], easting: state[1])
        let alt = state[2]
        let vNorth = state[3]
        let vEast = state[4]
        let speed = sqrt(vNorth * vNorth + vEast * vEast)
        let bearing = fmod(GeoMath.toDegrees(atan2(vEast, vNorth)) + 360.0, 360.0)

        return (coords.lat, coords.lng, alt, speed, bearing)
    }

    /// Returns the estimated position uncertainty (1-sigma) in meters.
    func getPositionUncertainty() -> Double {
        let latVar = P[0 * 6 + 0]
        let lngVar = P[1 * 6 + 1]
        return sqrt(latVar + lngVar)
    }

    // MARK: - Reset

    func reset() {
        state = [Double](repeating: 0, count: KalmanFilter.stateDim)
        P = KalmanFilter.identityMatrix(scale: 100.0)
        isInitialized = false
        lastTimestamp = 0
        accelerationVariance = 1.0
    }

    // MARK: - Matrix Operations (6x6 row-major)

    private static func identityMatrix(scale: Double) -> [Double] {
        var m = [Double](repeating: 0, count: 36)
        for i in 0..<6 { m[i * 6 + i] = scale }
        return m
    }

    private static func diagonalMatrix(_ diag: [Double]) -> [Double] {
        var m = [Double](repeating: 0, count: 36)
        for i in 0..<min(diag.count, 6) { m[i * 6 + i] = diag[i] }
        return m
    }

    private static func multiply(_ A: [Double], _ B: [Double], n: Int) -> [Double] {
        var C = [Double](repeating: 0, count: n * n)
        for i in 0..<n {
            for j in 0..<n {
                var sum = 0.0
                for k in 0..<n {
                    sum += A[i * n + k] * B[k * n + j]
                }
                C[i * n + j] = sum
            }
        }
        return C
    }

    private static func transpose(_ A: [Double], n: Int) -> [Double] {
        var T = [Double](repeating: 0, count: n * n)
        for i in 0..<n {
            for j in 0..<n {
                T[j * n + i] = A[i * n + j]
            }
        }
        return T
    }

    private static func add(_ A: [Double], _ B: [Double], n: Int) -> [Double] {
        var C = [Double](repeating: 0, count: n * n)
        for i in 0..<(n * n) { C[i] = A[i] + B[i] }
        return C
    }

    private static func subtract(_ A: [Double], _ B: [Double], n: Int) -> [Double] {
        var C = [Double](repeating: 0, count: n * n)
        for i in 0..<(n * n) { C[i] = A[i] - B[i] }
        return C
    }

    /// Inverts a 6x6 matrix using Gauss-Jordan elimination.
    /// Returns nil if the matrix is singular.
    private static func invert(_ M: [Double], n: Int) -> [Double]? {
        // Augmented matrix [M | I]
        var aug = [Double](repeating: 0, count: n * 2 * n)
        for i in 0..<n {
            for j in 0..<n {
                aug[i * 2 * n + j] = M[i * n + j]
            }
            aug[i * 2 * n + n + i] = 1.0
        }

        // Forward elimination with partial pivoting
        for col in 0..<n {
            // Find pivot
            var maxVal = abs(aug[col * 2 * n + col])
            var maxRow = col
            for row in (col + 1)..<n {
                let val = abs(aug[row * 2 * n + col])
                if val > maxVal {
                    maxVal = val
                    maxRow = row
                }
            }

            if maxVal < 1e-12 { return nil } // Singular

            // Swap rows
            if maxRow != col {
                for j in 0..<(2 * n) {
                    let temp = aug[col * 2 * n + j]
                    aug[col * 2 * n + j] = aug[maxRow * 2 * n + j]
                    aug[maxRow * 2 * n + j] = temp
                }
            }

            // Scale pivot row
            let pivotVal = aug[col * 2 * n + col]
            for j in 0..<(2 * n) {
                aug[col * 2 * n + j] /= pivotVal
            }

            // Eliminate column
            for row in 0..<n {
                if row == col { continue }
                let factor = aug[row * 2 * n + col]
                for j in 0..<(2 * n) {
                    aug[row * 2 * n + j] -= factor * aug[col * 2 * n + j]
                }
            }
        }

        // Extract inverse
        var inv = [Double](repeating: 0, count: n * n)
        for i in 0..<n {
            for j in 0..<n {
                inv[i * n + j] = aug[i * 2 * n + n + j]
            }
        }
        return inv
    }
}
