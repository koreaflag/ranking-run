"""
GPS Filter Simulation Test
Verifies Kalman filter + RTS smoother improvements for urban running scenarios.
Simulates Itaewon-style GPS noise (multipath reflections from buildings).
"""

import math
import numpy as np
from dataclasses import dataclass


# --- Coordinate Converter (mirrors CoordinateConverter.swift) ---

class CoordinateConverter:
    def __init__(self, ref_lat: float, ref_lon: float):
        self.ref_lat = ref_lat
        self.ref_lon = ref_lon
        self.meters_per_deg_lat = 111320.0
        self.meters_per_deg_lon = 111320.0 * math.cos(ref_lat * math.pi / 180.0)

    def to_meters(self, lat: float, lon: float):
        x = (lon - self.ref_lon) * self.meters_per_deg_lon
        y = (lat - self.ref_lat) * self.meters_per_deg_lat
        return x, y

    def to_lat_lng(self, x: float, y: float):
        lat = self.ref_lat + y / self.meters_per_deg_lat
        lon = self.ref_lon + x / self.meters_per_deg_lon
        return lat, lon


# --- Kalman Filter (mirrors KalmanFilter.swift) ---

class KalmanFilter:
    def __init__(self):
        self.state = np.zeros(6)
        self.P = np.eye(6) * 100.0
        self.initialized = False
        self.converter = None
        self.last_timestamp = 0
        self.process_noise_pos = 0.5
        self.process_noise_vel = 3.0
        self.dynamic_process_noise = 1.0
        self.history = []

    def initialize(self, lat, lon, alt, timestamp):
        self.converter = CoordinateConverter(lat, lon)
        self.state = np.array([0.0, 0.0, alt, 0.0, 0.0, 0.0])
        self.P = np.eye(6) * 100.0
        self.last_timestamp = timestamp
        self.initialized = True
        # Clear history on init/reinit (prevents coordinate system mixing)
        self.history = []

    def update(self, lat, lon, alt, speed, bearing, h_acc, spd_acc, timestamp):
        if not self.initialized:
            self.initialize(lat, lon, alt, timestamp)
            # Passthrough entry: keeps history aligned with filteredLocations
            self.history.append({
                'predicted': self.state.copy(),
                'predicted_P': self.P.copy(),
                'filtered': self.state.copy(),
                'filtered_P': self.P.copy(),
                'F': np.eye(6),
                'timestamp': timestamp, 'speed': speed, 'bearing': bearing,
            })
            return lat, lon, alt, speed, bearing

        dt = (timestamp - self.last_timestamp) / 1000.0
        if dt <= 0 or dt >= 30:
            self.initialize(lat, lon, alt, timestamp)
            self.history.append({
                'predicted': self.state.copy(),
                'predicted_P': self.P.copy(),
                'filtered': self.state.copy(),
                'filtered_P': self.P.copy(),
                'F': np.eye(6),
                'timestamp': timestamp, 'speed': speed, 'bearing': bearing,
            })
            return lat, lon, alt, speed, bearing
        self.last_timestamp = timestamp

        # Predict
        F = np.eye(6)
        F[0, 3] = dt
        F[1, 4] = dt
        F[2, 5] = dt

        dt2 = dt * dt
        dt3 = dt2 * dt / 2.0
        dt4 = dt2 * dt2 / 4.0
        qp = self.process_noise_pos * self.dynamic_process_noise
        qv = self.process_noise_vel * self.dynamic_process_noise

        Q = np.diag([qp * dt4, qp * dt4, qp * dt4, qv * dt2, qv * dt2, qv * dt2])
        Q[0, 3] = Q[3, 0] = qp * dt3
        Q[1, 4] = Q[4, 1] = qp * dt3
        Q[2, 5] = Q[5, 2] = qp * dt3

        predicted = F @ self.state
        predicted_P = F @ self.P @ F.T + Q

        # Measurement
        pos = self.converter.to_meters(lat, lon)
        bearing_rad = bearing * math.pi / 180.0
        v_east = speed * math.sin(bearing_rad)
        v_north = speed * math.cos(bearing_rad)
        z = np.array([pos[0], pos[1], alt, v_east, v_north, 0.0])

        H = np.eye(6)

        # Urban canyon inflation (matches updated KalmanFilter.swift)
        inflated = h_acc * 2.5 if h_acc > 20 else h_acc
        pos_var = inflated * inflated
        spd_var = spd_acc * spd_acc if spd_acc > 0 else 4.0
        alt_var = 100.0

        R = np.diag([pos_var, pos_var, alt_var, spd_var, spd_var, spd_var])

        # Update
        y = z - H @ predicted
        S = H @ predicted_P @ H.T + R
        try:
            K = predicted_P @ H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            self.state = predicted
            self.P = predicted_P
            return self._to_lat_lng()

        self.state = predicted + K @ y
        self.P = (np.eye(6) - K @ H) @ predicted_P

        self.history.append({
            'predicted': predicted.copy(),
            'predicted_P': predicted_P.copy(),
            'filtered': self.state.copy(),
            'filtered_P': self.P.copy(),
            'F': F.copy(),
            'timestamp': timestamp, 'speed': speed, 'bearing': bearing,
        })

        return self._to_lat_lng()

    def _to_lat_lng(self):
        lat, lon = self.converter.to_lat_lng(self.state[0], self.state[1])
        speed = math.sqrt(self.state[3]**2 + self.state[4]**2)
        bearing = math.degrees(math.atan2(self.state[3], self.state[4]))
        bearing = (bearing + 360) % 360
        return lat, lon, self.state[2], speed, bearing

    def smooth_route(self):
        """RTS backward smoother (mirrors KalmanFilter.swift smoothRoute())"""
        if len(self.history) < 2:
            return []

        N = len(self.history)
        smoothed = [np.zeros(6)] * N
        smoothed_P = [np.eye(6)] * N

        smoothed[N - 1] = self.history[N - 1]['filtered'].copy()
        smoothed_P[N - 1] = self.history[N - 1]['filtered_P'].copy()

        for k in range(N - 2, -1, -1):
            filt_s = self.history[k]['filtered']
            filt_P = self.history[k]['filtered_P']
            pred_s = self.history[k + 1]['predicted']
            pred_P = self.history[k + 1]['predicted_P']
            Fk = self.history[k + 1]['F']

            try:
                G = filt_P @ Fk.T @ np.linalg.inv(pred_P)
            except np.linalg.LinAlgError:
                smoothed[k] = filt_s.copy()
                smoothed_P[k] = filt_P.copy()
                continue

            diff = smoothed[k + 1] - pred_s
            smoothed[k] = filt_s + G @ diff
            p_diff = smoothed_P[k + 1] - pred_P
            smoothed_P[k] = filt_P + G @ p_diff @ G.T

        results = []
        for i, s in enumerate(smoothed):
            lat, lon = self.converter.to_lat_lng(s[0], s[1])
            ts = self.history[i]['timestamp']
            spd = self.history[i]['speed']
            brg = self.history[i]['bearing']
            results.append((lat, lon, s[2], spd, ts, brg))
        return results


# --- Outlier Detector (mirrors OutlierDetector.swift) ---

class OutlierDetector:
    def __init__(self):
        self.max_h_accuracy = 25.0  # Updated from 35 to 25
        self.max_speed = 15.0
        self.last_valid = None
        self.recent_speeds = []

    def validate(self, lat, lon, h_acc, timestamp):
        if h_acc < 0 or h_acc > self.max_h_accuracy:
            return False

        if self.last_valid:
            dist = haversine(self.last_valid[0], self.last_valid[1], lat, lon)
            dt = (timestamp - self.last_valid[2]) / 1000.0
            if dt <= 0:
                return False
            speed = dist / dt
            if speed > self.max_speed:
                return False

            self.recent_speeds.append(speed)
            if len(self.recent_speeds) > 10:
                self.recent_speeds.pop(0)

            if len(self.recent_speeds) >= 5:
                mean = sum(self.recent_speeds) / len(self.recent_speeds)
                var = sum((s - mean)**2 for s in self.recent_speeds) / len(self.recent_speeds)
                std = math.sqrt(var)
                if std > 0.1 and abs(speed - mean) > 3.0 * std:
                    return False

        self.last_valid = (lat, lon, timestamp)
        return True


# --- Spike Detector (mirrors LocationEngine.swift spike detection) ---

def is_spike(prev_lat, prev_lon, prev_ts, curr_lat, curr_lon, curr_ts):
    """Returns True if jump is physically impossible.
    Now uses 10 m/s threshold (raw GPS vs filtered has larger gap than
    kalman output vs filtered, so we need a more generous limit)."""
    dist = haversine(prev_lat, prev_lon, curr_lat, curr_lon)
    dt = (curr_ts - prev_ts) / 1000.0
    max_dist = max(10.0 * max(dt, 0.1), 5.0)
    return dist > max_dist


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2)**2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2)**2)
    return 2 * R * math.asin(math.sqrt(a))


# === TEST SCENARIOS ===


def generate_itaewon_route():
    """
    Simulate running along Itaewon road (~600m straight road)
    with urban canyon GPS noise (multipath reflections).

    Ground truth: straight line from Itaewon station to Hamilton Hotel
    GPS noise: ±15-40m lateral offset (typical urban canyon in Itaewon)
    """
    # Ground truth: walking from ~37.5345, 126.9945 heading northeast
    start_lat, start_lon = 37.5345, 126.9945
    speed_ms = 3.0  # ~10:00/km pace (jogging)
    bearing_deg = 45.0  # northeast
    duration_s = 200  # ~600m run
    interval_ms = 1000  # 1 GPS fix per second

    bearing_rad = math.radians(bearing_deg)
    v_north = speed_ms * math.cos(bearing_rad)
    v_east = speed_ms * math.sin(bearing_rad)

    # meters per degree
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(start_lat))

    np.random.seed(42)  # reproducible

    ground_truth = []
    gps_readings = []
    t0 = 1709800000000  # arbitrary start timestamp (ms)

    for i in range(duration_s):
        ts = t0 + i * interval_ms
        # Ground truth position
        gt_lat = start_lat + (v_north * i) / m_per_deg_lat
        gt_lon = start_lon + (v_east * i) / m_per_deg_lon
        gt_alt = 40.0
        ground_truth.append((gt_lat, gt_lon, gt_alt, ts))

        # Simulate GPS noise
        # Urban canyon: large lateral offsets (multipath)
        # Occasionally produces spikes (>40m error)
        if np.random.random() < 0.08:
            # Spike: huge multipath reflection (~50-100m off)
            noise_lat = np.random.normal(0, 50) / m_per_deg_lat
            noise_lon = np.random.normal(0, 50) / m_per_deg_lon
            h_acc = np.random.uniform(30, 50)
        elif np.random.random() < 0.3:
            # Poor accuracy: moderate multipath (~15-30m)
            noise_lat = np.random.normal(0, 20) / m_per_deg_lat
            noise_lon = np.random.normal(0, 20) / m_per_deg_lon
            h_acc = np.random.uniform(20, 35)
        else:
            # Normal GPS: 5-15m accuracy
            noise_lat = np.random.normal(0, 5) / m_per_deg_lat
            noise_lon = np.random.normal(0, 5) / m_per_deg_lon
            h_acc = np.random.uniform(5, 15)

        gps_lat = gt_lat + noise_lat
        gps_lon = gt_lon + noise_lon
        gps_alt = gt_alt + np.random.normal(0, 5)
        gps_speed = speed_ms + np.random.normal(0, 0.5)
        gps_bearing = bearing_deg + np.random.normal(0, 15)
        spd_acc = 0.5

        gps_readings.append({
            'lat': gps_lat, 'lon': gps_lon, 'alt': gps_alt,
            'speed': max(0, gps_speed), 'bearing': gps_bearing,
            'h_acc': h_acc, 'spd_acc': spd_acc, 'timestamp': ts,
        })

    return ground_truth, gps_readings


def generate_open_field_route():
    """
    Simulate running in open field (Han River park).
    Minimal GPS noise — verify filter doesn't over-correct.
    """
    start_lat, start_lon = 37.5267, 126.9340
    speed_ms = 4.0  # ~6:15/km pace
    bearing_deg = 90.0  # east along river
    duration_s = 150

    bearing_rad = math.radians(bearing_deg)
    v_north = speed_ms * math.cos(bearing_rad)
    v_east = speed_ms * math.sin(bearing_rad)

    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(start_lat))

    np.random.seed(123)

    ground_truth = []
    gps_readings = []
    t0 = 1709800000000

    for i in range(duration_s):
        ts = t0 + i * 1000
        gt_lat = start_lat + (v_north * i) / m_per_deg_lat
        gt_lon = start_lon + (v_east * i) / m_per_deg_lon
        gt_alt = 12.0
        ground_truth.append((gt_lat, gt_lon, gt_alt, ts))

        # Open field: clean GPS with small noise
        noise_lat = np.random.normal(0, 2) / m_per_deg_lat
        noise_lon = np.random.normal(0, 2) / m_per_deg_lon
        h_acc = np.random.uniform(3, 8)

        gps_readings.append({
            'lat': gt_lat + noise_lat,
            'lon': gt_lon + noise_lon,
            'alt': gt_alt + np.random.normal(0, 1),
            'speed': max(0, speed_ms + np.random.normal(0, 0.2)),
            'bearing': bearing_deg + np.random.normal(0, 5),
            'h_acc': h_acc, 'spd_acc': 0.3, 'timestamp': ts,
        })

    return ground_truth, gps_readings


def calc_route_distance(points):
    """Calculate total distance of a route (list of (lat, lon, ...) tuples)."""
    total = 0
    for i in range(1, len(points)):
        total += haversine(points[i-1][0], points[i-1][1], points[i][0], points[i][1])
    return total


def calc_errors(ground_truth, filtered):
    """Calculate per-point error (meters) between ground truth and filtered.
    Aligns by index (1:1 correspondence assumed)."""
    errors = []
    n = min(len(ground_truth), len(filtered))
    for i in range(n):
        err = haversine(ground_truth[i][0], ground_truth[i][1],
                        filtered[i][0], filtered[i][1])
        errors.append(err)
    return errors


def calc_errors_by_timestamp(ground_truth, filtered_with_ts):
    """Calculate per-point error by matching timestamps.
    ground_truth: [(lat, lon, alt, ts), ...]
    filtered_with_ts: [(lat, lon, alt, speed, ts), ...]
    """
    gt_by_ts = {gt[3]: (gt[0], gt[1]) for gt in ground_truth}
    errors = []
    for f in filtered_with_ts:
        ts = f[4]  # timestamp
        if ts in gt_by_ts:
            err = haversine(gt_by_ts[ts][0], gt_by_ts[ts][1], f[0], f[1])
            errors.append(err)
    return errors


def calc_smoothed_errors_by_timestamp(ground_truth, smoothed):
    """Match smoothed points to ground truth using self-contained timestamps.
    smoothed: [(lat, lon, alt, speed, timestamp, bearing), ...]"""
    gt_by_ts = {gt[3]: (gt[0], gt[1]) for gt in ground_truth}
    errors = []
    for s in smoothed:
        ts = s[4]  # timestamp is at index 4
        if ts in gt_by_ts:
            err = haversine(gt_by_ts[ts][0], gt_by_ts[ts][1], s[0], s[1])
            errors.append(err)
    return errors


def run_pipeline(gps_readings, ground_truth):
    """Run full GPS pipeline: Outlier → Spike → Kalman → RTS
    (Bug fix: spike detection now BEFORE kalman to prevent state corruption)"""
    detector = OutlierDetector()
    kf = KalmanFilter()

    filtered_points = []
    raw_accepted = []
    prev_filtered = None

    for r in gps_readings:
        # Layer 1: Outlier detection
        if not detector.validate(r['lat'], r['lon'], r['h_acc'], r['timestamp']):
            continue

        raw_accepted.append(r)

        # Layer 2: Spike detection BEFORE kalman (prevents state corruption)
        if prev_filtered:
            if is_spike(prev_filtered[0], prev_filtered[1], prev_filtered[4],
                        r['lat'], r['lon'], r['timestamp']):
                continue

        # Layer 3: Kalman filter (only reached if not a spike)
        result = kf.update(
            r['lat'], r['lon'], r['alt'],
            r['speed'], r['bearing'],
            r['h_acc'], r['spd_acc'], r['timestamp']
        )

        point = (result[0], result[1], result[2], result[3], r['timestamp'])
        filtered_points.append(point)
        prev_filtered = point

    # Layer 4: RTS backward smoother
    smoothed = kf.smooth_route()

    return filtered_points, smoothed, len(raw_accepted)


def test_scenario(name, ground_truth, gps_readings):
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")

    gt_distance = calc_route_distance(ground_truth)
    raw_distance = calc_route_distance(
        [(r['lat'], r['lon']) for r in gps_readings]
    )

    filtered, smoothed, accepted = run_pipeline(gps_readings, ground_truth)

    filtered_distance = calc_route_distance(filtered) if len(filtered) >= 2 else 0
    smoothed_distance = calc_route_distance(smoothed) if len(smoothed) >= 2 else 0

    # Error analysis (timestamp-aligned)
    raw_errors = calc_errors(ground_truth, [(r['lat'], r['lon']) for r in gps_readings])
    filtered_errors = calc_errors_by_timestamp(ground_truth, filtered)
    smoothed_errors = calc_smoothed_errors_by_timestamp(ground_truth, smoothed) if smoothed else []

    print(f"\n  Points: {len(gps_readings)} raw → {accepted} outlier-passed → {len(filtered)} filtered")
    print(f"  Ground truth distance: {gt_distance:.1f} m")
    print(f"  Raw GPS distance:      {raw_distance:.1f} m  (error: {abs(raw_distance - gt_distance)/gt_distance*100:.1f}%)")
    print(f"  Kalman filtered dist:  {filtered_distance:.1f} m  (error: {abs(filtered_distance - gt_distance)/gt_distance*100:.1f}%)")
    if smoothed_distance > 0:
        print(f"  RTS smoothed dist:     {smoothed_distance:.1f} m  (error: {abs(smoothed_distance - gt_distance)/gt_distance*100:.1f}%)")

    print(f"\n  Position error (meters):")
    print(f"  {'':20s} {'Mean':>8s} {'Median':>8s} {'P90':>8s} {'Max':>8s}")
    if raw_errors:
        print(f"  {'Raw GPS':20s} {np.mean(raw_errors):8.1f} {np.median(raw_errors):8.1f} {np.percentile(raw_errors, 90):8.1f} {max(raw_errors):8.1f}")
    if filtered_errors:
        print(f"  {'Kalman filtered':20s} {np.mean(filtered_errors):8.1f} {np.median(filtered_errors):8.1f} {np.percentile(filtered_errors, 90):8.1f} {max(filtered_errors):8.1f}")
    if smoothed_errors:
        print(f"  {'RTS smoothed':20s} {np.mean(smoothed_errors):8.1f} {np.median(smoothed_errors):8.1f} {np.percentile(smoothed_errors, 90):8.1f} {max(smoothed_errors):8.1f}")

    # Assertions
    outlier_reject_rate = 1 - accepted / len(gps_readings)

    results = {
        'gt_distance': gt_distance,
        'raw_distance': raw_distance,
        'filtered_distance': filtered_distance,
        'smoothed_distance': smoothed_distance,
        'raw_mean_error': np.mean(raw_errors) if raw_errors else 0,
        'filtered_mean_error': np.mean(filtered_errors) if filtered_errors else 0,
        'smoothed_mean_error': np.mean(smoothed_errors) if smoothed_errors else 0,
        'outlier_reject_rate': outlier_reject_rate,
    }
    return results


if __name__ == '__main__':
    print("GPS Filter Simulation Test")
    print("Testing Kalman Filter + RTS Smoother improvements")

    # Test 1: Urban canyon (Itaewon)
    gt1, gps1 = generate_itaewon_route()
    r1 = test_scenario("Scenario 1: Itaewon Urban Canyon (heavy multipath)", gt1, gps1)

    # Test 2: Open field (Han River)
    gt2, gps2 = generate_open_field_route()
    r2 = test_scenario("Scenario 2: Han River Open Field (clean GPS)", gt2, gps2)

    # Validation
    print(f"\n{'='*60}")
    print(f"  VALIDATION RESULTS")
    print(f"{'='*60}")

    all_pass = True

    # Urban: filtered should be significantly better than raw
    if r1['filtered_mean_error'] < r1['raw_mean_error']:
        print(f"  [PASS] Urban: Kalman filter reduces mean error ({r1['raw_mean_error']:.1f}m → {r1['filtered_mean_error']:.1f}m)")
    else:
        print(f"  [FAIL] Urban: Kalman filter did not reduce error")
        all_pass = False

    # Urban: RTS should improve route distance accuracy (its primary purpose)
    rts_dist_err = abs(r1['smoothed_distance'] - r1['gt_distance']) / r1['gt_distance'] * 100
    kalman_dist_err = abs(r1['filtered_distance'] - r1['gt_distance']) / r1['gt_distance'] * 100
    if rts_dist_err < kalman_dist_err:
        print(f"  [PASS] Urban: RTS improves distance accuracy ({kalman_dist_err:.1f}% → {rts_dist_err:.1f}%)")
    else:
        print(f"  [FAIL] Urban: RTS did not improve distance accuracy")
        all_pass = False

    # Urban: distance error should be < 15% after filtering
    filtered_dist_err = abs(r1['filtered_distance'] - r1['gt_distance']) / r1['gt_distance'] * 100
    if filtered_dist_err < 15:
        print(f"  [PASS] Urban: Filtered distance error < 15% ({filtered_dist_err:.1f}%)")
    else:
        print(f"  [FAIL] Urban: Filtered distance error too high ({filtered_dist_err:.1f}%)")
        all_pass = False

    # Urban: smoothed distance should be better than filtered
    smoothed_dist_err = abs(r1['smoothed_distance'] - r1['gt_distance']) / r1['gt_distance'] * 100
    if smoothed_dist_err < filtered_dist_err:
        print(f"  [PASS] Urban: RTS smoothed distance more accurate ({filtered_dist_err:.1f}% → {smoothed_dist_err:.1f}%)")
    else:
        print(f"  [WARN] Urban: RTS distance not better ({smoothed_dist_err:.1f}% vs {filtered_dist_err:.1f}%)")

    # Urban: outlier detector should reject some points
    if r1['outlier_reject_rate'] > 0.05:
        print(f"  [PASS] Urban: Outlier detector rejects noisy points ({r1['outlier_reject_rate']*100:.0f}%)")
    else:
        print(f"  [WARN] Urban: Outlier detector may be too permissive ({r1['outlier_reject_rate']*100:.0f}%)")

    # Open field: filter should not make things worse
    if r2['filtered_mean_error'] < r2['raw_mean_error'] * 1.5:
        print(f"  [PASS] Open field: Filter doesn't over-correct ({r2['raw_mean_error']:.1f}m → {r2['filtered_mean_error']:.1f}m)")
    else:
        print(f"  [FAIL] Open field: Filter is over-correcting!")
        all_pass = False

    # Open field: distance accuracy should be < 5%
    open_dist_err = abs(r2['filtered_distance'] - r2['gt_distance']) / r2['gt_distance'] * 100
    if open_dist_err < 5:
        print(f"  [PASS] Open field: Distance error < 5% ({open_dist_err:.1f}%)")
    else:
        print(f"  [WARN] Open field: Distance error higher than expected ({open_dist_err:.1f}%)")

    # Raw GPS distance inflation check (the original problem)
    raw_dist_inflation = (r1['raw_distance'] - r1['gt_distance']) / r1['gt_distance'] * 100
    print(f"\n  --- Original Problem ---")
    print(f"  Raw GPS distance inflation in urban: {raw_dist_inflation:.0f}% (this was causing the zigzag)")
    print(f"  After Kalman: {abs(r1['filtered_distance'] - r1['gt_distance']) / r1['gt_distance'] * 100:.1f}%")
    if r1['smoothed_distance'] > 0:
        print(f"  After RTS:    {abs(r1['smoothed_distance'] - r1['gt_distance']) / r1['gt_distance'] * 100:.1f}%")

    print(f"\n  {'ALL TESTS PASSED' if all_pass else 'SOME TESTS FAILED'}")
    print()
