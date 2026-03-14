"""
GPS + IMU Sensor Fusion Simulation
Tests all 5 phases of accuracy improvement:
  Phase 1: IMU-Aided Kalman Predict (acceleration as control input)
  Phase 2: Dynamic R Matrix (speed consistency check)
  Phase 3: GPS-Gap Interpolation (10Hz IMU between 1Hz GPS)
  Phase 4: Pedometer Distance Constraint
  Phase 5: Heading Fusion (GPS + gyro + magnetometer)

Compares: Baseline (current) vs Full IMU Fusion
"""

import math
import numpy as np


# --- Helpers ---

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2)**2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2)**2)
    return 2 * R * math.asin(math.sqrt(a))


def calc_route_distance(points):
    total = 0
    for i in range(1, len(points)):
        total += haversine(points[i-1][0], points[i-1][1], points[i][0], points[i][1])
    return total


class CoordinateConverter:
    def __init__(self, ref_lat, ref_lon):
        self.ref_lat = ref_lat
        self.ref_lon = ref_lon
        self.m_per_deg_lat = 111320.0
        self.m_per_deg_lon = 111320.0 * math.cos(ref_lat * math.pi / 180.0)

    def to_meters(self, lat, lon):
        return ((lon - self.ref_lon) * self.m_per_deg_lon,
                (lat - self.ref_lat) * self.m_per_deg_lat)

    def to_lat_lng(self, x, y):
        return (self.ref_lat + y / self.m_per_deg_lat,
                self.ref_lon + x / self.m_per_deg_lon)


# === BASELINE KALMAN (current implementation) ===

class BaselineKalman:
    def __init__(self):
        self.state = np.zeros(6)
        self.P = np.eye(6) * 100.0
        self.initialized = False
        self.converter = None
        self.last_ts = 0
        self.qp, self.qv = 0.5, 3.0
        self.dyn_noise = 1.0
        self.history = []

    def initialize(self, lat, lon, alt, ts):
        self.converter = CoordinateConverter(lat, lon)
        self.state = np.array([0.0, 0.0, alt, 0.0, 0.0, 0.0])
        self.P = np.eye(6) * 100.0
        self.last_ts = ts
        self.initialized = True

    def update(self, lat, lon, alt, speed, bearing, h_acc, spd_acc, ts):
        if not self.initialized:
            self.initialize(lat, lon, alt, ts)
            return lat, lon, alt, speed, bearing
        dt = (ts - self.last_ts) / 1000.0
        if dt <= 0 or dt >= 30:
            self.initialize(lat, lon, alt, ts)
            return lat, lon, alt, speed, bearing
        self.last_ts = ts

        F = np.eye(6)
        F[0,3] = F[1,4] = F[2,5] = dt

        dt2 = dt*dt; dt3 = dt2*dt/2; dt4 = dt2*dt2/4
        qp = self.qp * self.dyn_noise; qv = self.qv * self.dyn_noise
        Q = np.zeros((6,6))
        for i in range(3):
            Q[i,i] = qp*dt4; Q[i,i+3] = Q[i+3,i] = qp*dt3; Q[i+3,i+3] = qv*dt2

        predicted = F @ self.state
        predicted_P = F @ self.P @ F.T + Q

        pos = self.converter.to_meters(lat, lon)
        br = math.radians(bearing)
        z = np.array([pos[0], pos[1], alt, speed*math.sin(br), speed*math.cos(br), 0.0])

        inflated = h_acc * 2.5 if h_acc > 20 else h_acc
        pv = inflated**2
        sv = spd_acc**2 if spd_acc > 0 else 4.0
        R = np.diag([pv, pv, 100.0, sv, sv, sv])

        y = z - predicted
        S = predicted_P + R
        K = predicted_P @ np.linalg.inv(S)

        self.state = predicted + K @ y
        self.P = (np.eye(6) - K) @ predicted_P

        self.history.append({
            'predicted': predicted.copy(), 'predicted_P': predicted_P.copy(),
            'filtered': self.state.copy(), 'filtered_P': self.P.copy(), 'F': F.copy()
        })
        return self._to_ll()

    def _to_ll(self):
        lat, lon = self.converter.to_lat_lng(self.state[0], self.state[1])
        spd = math.sqrt(self.state[3]**2 + self.state[4]**2)
        brg = (math.degrees(math.atan2(self.state[3], self.state[4])) + 360) % 360
        return lat, lon, self.state[2], spd, brg

    def smooth(self):
        if len(self.history) < 2: return []
        N = len(self.history)
        sm = [np.zeros(6)] * N
        sm[N-1] = self.history[N-1]['filtered'].copy()
        smP = [np.eye(6)] * N
        smP[N-1] = self.history[N-1]['filtered_P'].copy()
        for k in range(N-2, -1, -1):
            fS = self.history[k]['filtered']; fP = self.history[k]['filtered_P']
            pS = self.history[k+1]['predicted']; pP = self.history[k+1]['predicted_P']
            Fk = self.history[k+1]['F']
            try: G = fP @ Fk.T @ np.linalg.inv(pP)
            except: sm[k] = fS.copy(); smP[k] = fP.copy(); continue
            sm[k] = fS + G @ (sm[k+1] - pS)
            smP[k] = fP + G @ (smP[k+1] - pP) @ G.T
        return [(self.converter.to_lat_lng(s[0], s[1])[0],
                 self.converter.to_lat_lng(s[0], s[1])[1], s[2]) for s in sm]


# === ENHANCED KALMAN (with all 5 phases) ===

class EnhancedKalman:
    """Kalman filter with IMU sensor fusion (all 5 phases)."""

    def __init__(self):
        self.state = np.zeros(6)
        self.P = np.eye(6) * 100.0
        self.initialized = False
        self.converter = None
        self.last_ts = 0
        self.qp, self.qv = 0.5, 3.0
        self.dyn_noise = 1.0
        self.history = []
        # Phase 1: IMU control input
        self.control_input = np.zeros(3)  # [a_east, a_north, a_up]
        # Phase 2: speed residuals
        self.speed_residuals = []
        # Phase 4: pedometer
        self.ped_speed = 0.0
        # Phase 5: heading
        self.fused_heading = 0.0
        self.heading_init = False

    def initialize(self, lat, lon, alt, ts):
        self.converter = CoordinateConverter(lat, lon)
        self.state = np.array([0.0, 0.0, alt, 0.0, 0.0, 0.0])
        self.P = np.eye(6) * 100.0
        self.last_ts = ts
        self.initialized = True

    def set_control_input(self, a_east, a_north, a_up):
        """Phase 1: Set world-frame acceleration."""
        mag = math.sqrt(a_east**2 + a_north**2 + a_up**2)
        if mag > 20.0:
            conf = 0.0
        elif self.dyn_noise > 5.0:
            conf = 0.3
        else:
            conf = 0.7
        self.control_input = np.array([a_east * conf, a_north * conf, a_up * conf])

    def set_pedometer_speed(self, speed):
        """Phase 4: Set pedometer-derived speed."""
        self.ped_speed = speed

    def update(self, lat, lon, alt, speed, bearing, h_acc, spd_acc, ts,
               gyro_yaw_rate=0.0, mag_heading=None):
        if not self.initialized:
            self.initialize(lat, lon, alt, ts)
            return lat, lon, alt, speed, bearing
        dt = (ts - self.last_ts) / 1000.0
        if dt <= 0 or dt >= 30:
            self.initialize(lat, lon, alt, ts)
            return lat, lon, alt, speed, bearing
        self.last_ts = ts

        # --- Phase 1: IMU-Aided Predict ---
        F = np.eye(6)
        F[0,3] = F[1,4] = F[2,5] = dt

        dt2 = dt*dt; dt3 = dt2*dt/2; dt4 = dt2*dt2/4
        qp = self.qp * self.dyn_noise; qv = self.qv * self.dyn_noise
        Q = np.zeros((6,6))
        for i in range(3):
            Q[i,i] = qp*dt4; Q[i,i+3] = Q[i+3,i] = qp*dt3; Q[i+3,i+3] = qv*dt2

        # Control input matrix B (6x3)
        dt2h = 0.5 * dt2
        B = np.array([
            [dt2h, 0, 0], [0, dt2h, 0], [0, 0, dt2h],
            [dt, 0, 0], [0, dt, 0], [0, 0, dt]
        ])
        predicted = F @ self.state + B @ self.control_input
        predicted_P = F @ self.P @ F.T + Q

        # --- Phase 2: Dynamic R Matrix ---
        pos = self.converter.to_meters(lat, lon)
        br = math.radians(bearing)
        z = np.array([pos[0], pos[1], alt, speed*math.sin(br), speed*math.cos(br), 0.0])

        inflated = h_acc * 2.5 if h_acc > 20 else h_acc
        pv = inflated**2
        sv = spd_acc**2 if spd_acc > 0 else 4.0

        # Speed consistency check
        kalman_spd = math.sqrt(self.state[3]**2 + self.state[4]**2)
        spd_resid = abs(speed - kalman_spd)
        self.speed_residuals.append(spd_resid)
        if len(self.speed_residuals) > 10:
            self.speed_residuals.pop(0)

        if spd_resid > 3.0 and kalman_spd > 0.5:
            pv *= 2.0  # Bad GPS fix — inflate

        if dt > 3.0:
            pv *= 1.5  # First fix after gap

        # Bearing noise at low speed
        bearing_factor = 4.0 if speed < 0.5 else 1.0

        R = np.diag([pv, pv, 100.0, sv * bearing_factor, sv * bearing_factor, sv])

        # Kalman update
        y = z - predicted
        S = predicted_P + R
        K = predicted_P @ np.linalg.inv(S)
        self.state = predicted + K @ y
        self.P = (np.eye(6) - K) @ predicted_P

        # --- Phase 4: Pedometer Constraint ---
        if self.ped_speed > 0.3:
            ks = math.sqrt(self.state[3]**2 + self.state[4]**2)
            disc = abs(self.ped_speed - ks)
            if disc > 0.5 and self.ped_speed < 8.0 and ks > 0.1:
                conf = 0.7 if h_acc > 15 else 0.3
                scale = 1.0 + (self.ped_speed / ks - 1.0) * conf * 0.3
                self.state[3] *= scale
                self.state[4] *= scale

        # --- Phase 5: Heading Fusion ---
        result_lat, result_lon = self.converter.to_lat_lng(self.state[0], self.state[1])
        result_spd = math.sqrt(self.state[3]**2 + self.state[4]**2)
        kalman_brg = (math.degrees(math.atan2(self.state[3], self.state[4])) + 360) % 360

        if not self.heading_init:
            self.fused_heading = kalman_brg
            self.heading_init = True
        else:
            # Gyro prediction
            gyro_pred = self.fused_heading - gyro_yaw_rate * dt * (180.0 / math.pi)
            gyro_pred = (gyro_pred + 360) % 360

            # Weights based on speed
            if result_spd > 2.0:
                gps_w, mag_w, gyro_w = 0.6, 0.1, 0.3
            elif result_spd > 0.5:
                gps_w, mag_w, gyro_w = 0.2, 0.3, 0.5
            else:
                gps_w, mag_w, gyro_w = 0.0, 0.3, 0.7

            mh = mag_heading if mag_heading is not None else kalman_brg
            sin_sum = (gps_w * math.sin(math.radians(kalman_brg)) +
                       mag_w * math.sin(math.radians(mh)) +
                       gyro_w * math.sin(math.radians(gyro_pred)))
            cos_sum = (gps_w * math.cos(math.radians(kalman_brg)) +
                       mag_w * math.cos(math.radians(mh)) +
                       gyro_w * math.cos(math.radians(gyro_pred)))
            self.fused_heading = (math.degrees(math.atan2(sin_sum, cos_sum)) + 360) % 360

        self.history.append({
            'predicted': predicted.copy(), 'predicted_P': predicted_P.copy(),
            'filtered': self.state.copy(), 'filtered_P': self.P.copy(), 'F': F.copy()
        })
        return result_lat, result_lon, self.state[2], result_spd, self.fused_heading

    def predict_only(self, dt, control_input=None):
        """Phase 3: Predict without measurement update (for interpolation)."""
        if not self.initialized: return None
        F = np.eye(6)
        F[0,3] = F[1,4] = F[2,5] = dt
        pred = F @ self.state
        if control_input is not None:
            dt2h = 0.5 * dt * dt
            B = np.array([
                [dt2h, 0, 0], [0, dt2h, 0], [0, 0, dt2h],
                [dt, 0, 0], [0, dt, 0], [0, 0, dt]
            ])
            pred += B @ (control_input * 0.5)
        lat, lon = self.converter.to_lat_lng(pred[0], pred[1])
        return lat, lon, pred[2]

    def smooth(self):
        if len(self.history) < 2: return []
        N = len(self.history)
        sm = [np.zeros(6)] * N
        sm[N-1] = self.history[N-1]['filtered'].copy()
        smP = [np.eye(6)] * N
        smP[N-1] = self.history[N-1]['filtered_P'].copy()
        for k in range(N-2, -1, -1):
            fS = self.history[k]['filtered']; fP = self.history[k]['filtered_P']
            pS = self.history[k+1]['predicted']; pP = self.history[k+1]['predicted_P']
            Fk = self.history[k+1]['F']
            try: G = fP @ Fk.T @ np.linalg.inv(pP)
            except: sm[k] = fS.copy(); smP[k] = fP.copy(); continue
            sm[k] = fS + G @ (sm[k+1] - pS)
            smP[k] = fP + G @ (smP[k+1] - pP) @ G.T
        return [(self.converter.to_lat_lng(s[0], s[1])[0],
                 self.converter.to_lat_lng(s[0], s[1])[1], s[2]) for s in sm]


# === SCENARIO GENERATORS ===

def generate_curved_urban_route():
    """
    Itaewon: curved road with sharp turns + urban multipath.
    More realistic than straight line — tests heading fusion + pedometer constraint.
    """
    np.random.seed(42)
    m_lat = 111320.0
    start_lat, start_lon = 37.5345, 126.9945
    m_lon = 111320.0 * math.cos(math.radians(start_lat))

    # Define waypoints for a curved route (Itaewon road bends)
    waypoints_m = [
        (0, 0), (50, 30), (120, 40), (180, 80),
        (220, 150), (240, 230), (280, 300), (350, 350),
        (430, 370), (500, 400), (560, 450), (600, 530)
    ]

    speed_ms = 3.0  # ~10:00/km jogging
    # Generate ground truth by interpolating along waypoints
    ground_truth = []
    gps_readings = []
    imu_data = []  # Simulated IMU at 10Hz
    pedometer_speeds = []
    t0 = 1709800000000

    # Compute total path length
    total_path = 0
    for i in range(1, len(waypoints_m)):
        dx = waypoints_m[i][0] - waypoints_m[i-1][0]
        dy = waypoints_m[i][1] - waypoints_m[i-1][1]
        total_path += math.sqrt(dx*dx + dy*dy)

    duration_s = int(total_path / speed_ms)
    step_dist = total_path / duration_s

    # Walk along path
    cum_dist = 0
    wp_idx = 0
    wp_cum = 0
    prev_bearing = 0

    for i in range(duration_s):
        ts = t0 + i * 1000
        target_dist = step_dist * i

        # Find position along waypoint path
        while wp_idx < len(waypoints_m) - 1:
            dx = waypoints_m[wp_idx+1][0] - waypoints_m[wp_idx][0]
            dy = waypoints_m[wp_idx+1][1] - waypoints_m[wp_idx][1]
            seg_len = math.sqrt(dx*dx + dy*dy)
            if wp_cum + seg_len > target_dist:
                break
            wp_cum += seg_len
            wp_idx += 1

        if wp_idx >= len(waypoints_m) - 1:
            wp_idx = len(waypoints_m) - 2

        dx = waypoints_m[wp_idx+1][0] - waypoints_m[wp_idx][0]
        dy = waypoints_m[wp_idx+1][1] - waypoints_m[wp_idx][1]
        seg_len = max(math.sqrt(dx*dx + dy*dy), 0.01)
        t_frac = (target_dist - wp_cum) / seg_len
        t_frac = max(0, min(1, t_frac))

        x = waypoints_m[wp_idx][0] + dx * t_frac
        y = waypoints_m[wp_idx][1] + dy * t_frac
        gt_lat = start_lat + y / m_lat
        gt_lon = start_lon + x / m_lon
        bearing = math.degrees(math.atan2(dx, dy))
        bearing = (bearing + 360) % 360

        ground_truth.append((gt_lat, gt_lon, 40.0, ts))

        # True acceleration (bearing change → centripetal)
        bearing_change = bearing - prev_bearing
        if bearing_change > 180: bearing_change -= 360
        if bearing_change < -180: bearing_change += 360
        turn_rate = math.radians(bearing_change)  # rad/s (dt=1s)
        a_east = speed_ms * math.sin(math.radians(bearing)) * 0.1  # small forward accel
        a_north = speed_ms * math.cos(math.radians(bearing)) * 0.1
        prev_bearing = bearing

        # GPS noise (urban)
        if np.random.random() < 0.08:
            noise_x = np.random.normal(0, 50) / m_lon
            noise_y = np.random.normal(0, 50) / m_lat
            h_acc = np.random.uniform(30, 50)
        elif np.random.random() < 0.3:
            noise_x = np.random.normal(0, 20) / m_lon
            noise_y = np.random.normal(0, 20) / m_lat
            h_acc = np.random.uniform(20, 35)
        else:
            noise_x = np.random.normal(0, 5) / m_lon
            noise_y = np.random.normal(0, 5) / m_lat
            h_acc = np.random.uniform(5, 15)

        gps_readings.append({
            'lat': gt_lat + noise_y, 'lon': gt_lon + noise_x,
            'alt': 40.0 + np.random.normal(0, 5),
            'speed': max(0, speed_ms + np.random.normal(0, 0.5)),
            'bearing': bearing + np.random.normal(0, 15),
            'h_acc': h_acc, 'spd_acc': 0.5, 'timestamp': ts,
        })

        # IMU data at 10Hz (10 samples per GPS fix)
        for j in range(10):
            imu_ts = ts + j * 100
            # True acceleration + sensor noise
            imu_a_east = a_east + np.random.normal(0, 0.3)
            imu_a_north = a_north + np.random.normal(0, 0.3)
            imu_a_up = np.random.normal(0, 0.2)
            gyro_yaw = turn_rate + np.random.normal(0, 0.05)
            imu_data.append({
                'ts': imu_ts, 'a_east': imu_a_east, 'a_north': imu_a_north,
                'a_up': imu_a_up, 'gyro_yaw': gyro_yaw
            })

        # Pedometer: Apple's calibrated distance (very accurate, ±5%)
        pedometer_speeds.append(speed_ms + np.random.normal(0, 0.15))

    return ground_truth, gps_readings, imu_data, pedometer_speeds


def generate_gps_gap_scenario():
    """
    Running along a road, then GPS drops out for 10 seconds (tunnel/overpass),
    then GPS returns. Tests Phase 3 interpolation.
    """
    np.random.seed(99)
    start_lat, start_lon = 37.5267, 126.9340
    m_lat = 111320.0
    m_lon = 111320.0 * math.cos(math.radians(start_lat))
    speed_ms = 4.0
    bearing_deg = 90.0  # east

    ground_truth = []
    gps_readings = []
    imu_data = []
    pedometer_speeds = []
    t0 = 1709800000000

    for i in range(120):  # 2 min run
        ts = t0 + i * 1000
        gt_lat = start_lat
        gt_lon = start_lon + (speed_ms * i) / m_lon
        ground_truth.append((gt_lat, gt_lon, 12.0, ts))

        # GPS gap: seconds 40-50 (10s tunnel)
        is_gap = 40 <= i < 50

        if not is_gap:
            noise_x = np.random.normal(0, 3) / m_lon
            noise_y = np.random.normal(0, 3) / m_lat
            gps_readings.append({
                'lat': gt_lat + noise_y, 'lon': gt_lon + noise_x,
                'alt': 12.0, 'speed': speed_ms + np.random.normal(0, 0.2),
                'bearing': bearing_deg + np.random.normal(0, 5),
                'h_acc': np.random.uniform(4, 8), 'spd_acc': 0.3, 'timestamp': ts,
            })

        # IMU always available (even during GPS gap)
        for j in range(10):
            imu_data.append({
                'ts': ts + j * 100,
                'a_east': np.random.normal(0, 0.2),
                'a_north': np.random.normal(0, 0.2),
                'a_up': np.random.normal(0, 0.1),
                'gyro_yaw': np.random.normal(0, 0.02)
            })

        pedometer_speeds.append(speed_ms + np.random.normal(0, 0.1))

    return ground_truth, gps_readings, imu_data, pedometer_speeds


# === PIPELINE RUNNERS ===

class OutlierDetector:
    def __init__(self):
        self.max_acc = 25.0
        self.max_speed = 15.0
        self.last = None
        self.recent_speeds = []

    def validate(self, r):
        if r['h_acc'] > self.max_acc: return False
        if self.last:
            d = haversine(self.last[0], self.last[1], r['lat'], r['lon'])
            dt = (r['timestamp'] - self.last[2]) / 1000.0
            if dt <= 0: return False
            spd = d / dt
            if spd > self.max_speed: return False
            self.recent_speeds.append(spd)
            if len(self.recent_speeds) > 10: self.recent_speeds.pop(0)
            if len(self.recent_speeds) >= 5:
                m = np.mean(self.recent_speeds)
                s = np.std(self.recent_speeds)
                if s > 0.1 and abs(spd - m) > 3 * s: return False
        self.last = (r['lat'], r['lon'], r['timestamp'])
        return True


def is_spike(prev, curr_lat, curr_lon, curr_ts):
    d = haversine(prev[0], prev[1], curr_lat, curr_lon)
    dt = (curr_ts - prev[4]) / 1000.0
    return d > max(8.0 * max(dt, 0.1), 3.0)


def run_baseline(gps_readings, ground_truth):
    det = OutlierDetector()
    kf = BaselineKalman()
    filtered = []
    prev = None
    for r in gps_readings:
        if not det.validate(r): continue
        res = kf.update(r['lat'], r['lon'], r['alt'], r['speed'], r['bearing'],
                        r['h_acc'], r['spd_acc'], r['timestamp'])
        if prev and is_spike(prev, res[0], res[1], r['timestamp']): continue
        pt = (res[0], res[1], res[2], res[3], r['timestamp'])
        filtered.append(pt)
        prev = pt
    smoothed = kf.smooth()
    return filtered, smoothed


def run_enhanced(gps_readings, imu_data, ped_speeds, ground_truth):
    det = OutlierDetector()
    kf = EnhancedKalman()
    filtered = []
    interpolated = []
    prev = None
    imu_idx = 0
    ped_idx = 0

    for r in gps_readings:
        if not det.validate(r): continue

        # Phase 1: Feed IMU acceleration
        # Find most recent IMU sample before this GPS timestamp
        while imu_idx < len(imu_data) - 1 and imu_data[imu_idx+1]['ts'] <= r['timestamp']:
            imu_idx += 1
        if imu_idx < len(imu_data):
            imu = imu_data[imu_idx]
            kf.set_control_input(imu['a_east'], imu['a_north'], imu['a_up'])
            gyro_yaw = imu['gyro_yaw']
        else:
            gyro_yaw = 0.0

        # Phase 4: Pedometer speed
        if ped_idx < len(ped_speeds):
            kf.set_pedometer_speed(ped_speeds[ped_idx])
            ped_idx += 1

        # Phase 5: Magnetometer heading (simulated as bearing + noise)
        mag_heading = r['bearing'] + np.random.normal(0, 8)

        res = kf.update(r['lat'], r['lon'], r['alt'], r['speed'], r['bearing'],
                        r['h_acc'], r['spd_acc'], r['timestamp'],
                        gyro_yaw_rate=gyro_yaw, mag_heading=mag_heading)
        if prev and is_spike(prev, res[0], res[1], r['timestamp']): continue
        pt = (res[0], res[1], res[2], res[3], r['timestamp'])
        filtered.append(pt)
        prev = pt

    # Phase 3: GPS-gap interpolation
    # Re-run and add interpolated points between GPS fixes
    kf2 = EnhancedKalman()
    det2 = OutlierDetector()
    all_points = []
    prev2 = None
    imu_idx = 0
    ped_idx = 0

    for r in gps_readings:
        if not det2.validate(r): continue

        while imu_idx < len(imu_data) - 1 and imu_data[imu_idx+1]['ts'] <= r['timestamp']:
            imu_idx += 1
        if imu_idx < len(imu_data):
            imu = imu_data[imu_idx]
            kf2.set_control_input(imu['a_east'], imu['a_north'], imu['a_up'])
            gyro_yaw = imu['gyro_yaw']
        else:
            gyro_yaw = 0.0

        if ped_idx < len(ped_speeds):
            kf2.set_pedometer_speed(ped_speeds[ped_idx])
            ped_idx += 1

        # Add interpolated points before this GPS fix
        if prev2:
            gap_ms = r['timestamp'] - prev2[4]
            if gap_ms > 500:  # > 0.5s gap
                n_interp = min(int(gap_ms / 100) - 1, 20)
                for j in range(1, n_interp + 1):
                    dt_s = (j * 100) / 1000.0
                    ci = np.array([imu['a_east'] * 0.5, imu['a_north'] * 0.5, 0]) if imu_idx < len(imu_data) else None
                    interp = kf2.predict_only(dt_s, ci)
                    if interp:
                        all_points.append((interp[0], interp[1], interp[2], 0, prev2[4] + j * 100))

        res = kf2.update(r['lat'], r['lon'], r['alt'], r['speed'], r['bearing'],
                         r['h_acc'], r['spd_acc'], r['timestamp'],
                         gyro_yaw_rate=gyro_yaw, mag_heading=r['bearing'])
        if prev2 and is_spike(prev2, res[0], res[1], r['timestamp']): continue
        pt = (res[0], res[1], res[2], res[3], r['timestamp'])
        all_points.append(pt)
        prev2 = pt

    smoothed = kf.smooth()
    return filtered, smoothed, all_points


def calc_errors_by_ts(ground_truth, filtered):
    gt_map = {g[3]: (g[0], g[1]) for g in ground_truth}
    errors = []
    for f in filtered:
        ts = f[4]
        if ts in gt_map:
            errors.append(haversine(gt_map[ts][0], gt_map[ts][1], f[0], f[1]))
    return errors


def calc_smoothed_errors(ground_truth, smoothed, filtered):
    gt_map = {g[3]: (g[0], g[1]) for g in ground_truth}
    errors = []
    n = min(len(smoothed), len(filtered))
    for i in range(n):
        ts = filtered[i][4]
        if ts in gt_map:
            errors.append(haversine(gt_map[ts][0], gt_map[ts][1], smoothed[i][0], smoothed[i][1]))
    return errors


# === MAIN ===

if __name__ == '__main__':
    print("=" * 70)
    print("  GPS + IMU SENSOR FUSION SIMULATION")
    print("  Baseline (current) vs Enhanced (5 phases)")
    print("=" * 70)

    # --- Scenario 1: Curved Urban Route ---
    print(f"\n{'='*70}")
    print("  Scenario 1: Itaewon Curved Urban Route (heavy multipath + turns)")
    print(f"{'='*70}")

    gt1, gps1, imu1, ped1 = generate_curved_urban_route()
    gt_dist1 = calc_route_distance(gt1)

    base_f1, base_s1 = run_baseline(gps1, gt1)
    enh_f1, enh_s1, enh_all1 = run_enhanced(gps1, imu1, ped1, gt1)

    raw_dist1 = calc_route_distance([(r['lat'], r['lon']) for r in gps1])
    base_f_dist1 = calc_route_distance(base_f1)
    base_s_dist1 = calc_route_distance(base_s1) if base_s1 else 0
    enh_f_dist1 = calc_route_distance(enh_f1)
    enh_s_dist1 = calc_route_distance(enh_s1) if enh_s1 else 0

    raw_err1 = [haversine(gt1[i][0], gt1[i][1], gps1[i]['lat'], gps1[i]['lon']) for i in range(len(gt1))]
    base_err1 = calc_errors_by_ts(gt1, base_f1)
    enh_err1 = calc_errors_by_ts(gt1, enh_f1)
    base_s_err1 = calc_smoothed_errors(gt1, base_s1, base_f1) if base_s1 else []
    enh_s_err1 = calc_smoothed_errors(gt1, enh_s1, enh_f1) if enh_s1 else []

    print(f"\n  Ground truth distance: {gt_dist1:.1f} m")
    print(f"  Raw GPS distance:      {raw_dist1:.1f} m  ({abs(raw_dist1-gt_dist1)/gt_dist1*100:.1f}% error)")
    print()
    print(f"  {'':24s} {'Distance':>10s} {'Dist Err':>10s} {'Pos Mean':>10s} {'Pos P90':>10s} {'Pos Max':>10s}")
    print(f"  {'-'*24} {'-'*10} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")
    print(f"  {'Raw GPS':24s} {raw_dist1:10.1f} {abs(raw_dist1-gt_dist1)/gt_dist1*100:9.1f}% {np.mean(raw_err1):9.1f}m {np.percentile(raw_err1,90):9.1f}m {max(raw_err1):9.1f}m")
    print(f"  {'Baseline Kalman':24s} {base_f_dist1:10.1f} {abs(base_f_dist1-gt_dist1)/gt_dist1*100:9.1f}% {np.mean(base_err1):9.1f}m {np.percentile(base_err1,90):9.1f}m {max(base_err1):9.1f}m")
    if base_s_err1:
        print(f"  {'Baseline + RTS':24s} {base_s_dist1:10.1f} {abs(base_s_dist1-gt_dist1)/gt_dist1*100:9.1f}% {np.mean(base_s_err1):9.1f}m {np.percentile(base_s_err1,90):9.1f}m {max(base_s_err1):9.1f}m")
    print(f"  {'Enhanced Kalman':24s} {enh_f_dist1:10.1f} {abs(enh_f_dist1-gt_dist1)/gt_dist1*100:9.1f}% {np.mean(enh_err1):9.1f}m {np.percentile(enh_err1,90):9.1f}m {max(enh_err1):9.1f}m")
    if enh_s_err1:
        print(f"  {'Enhanced + RTS':24s} {enh_s_dist1:10.1f} {abs(enh_s_dist1-gt_dist1)/gt_dist1*100:9.1f}% {np.mean(enh_s_err1):9.1f}m {np.percentile(enh_s_err1,90):9.1f}m {max(enh_s_err1):9.1f}m")

    # --- Scenario 2: GPS Gap (Tunnel) ---
    print(f"\n{'='*70}")
    print("  Scenario 2: Han River with 10s GPS Gap (tunnel/overpass)")
    print(f"{'='*70}")

    gt2, gps2, imu2, ped2 = generate_gps_gap_scenario()
    gt_dist2 = calc_route_distance(gt2)

    base_f2, base_s2 = run_baseline(gps2, gt2)
    enh_f2, enh_s2, enh_all2 = run_enhanced(gps2, imu2, ped2, gt2)

    base_f_dist2 = calc_route_distance(base_f2)
    enh_f_dist2 = calc_route_distance(enh_f2)
    enh_all_dist2 = calc_route_distance(enh_all2)

    base_err2 = calc_errors_by_ts(gt2, base_f2)
    enh_err2 = calc_errors_by_ts(gt2, enh_f2)

    # Gap-specific error: check points around the gap (35-55s)
    gap_gt = {g[3]: (g[0], g[1]) for g in gt2}
    t0_2 = gt2[0][3]
    base_gap_pts = [(f[0], f[1], f[4]) for f in base_f2 if t0_2+35000 <= f[4] <= t0_2+55000]
    enh_gap_pts = [(f[0], f[1], f[4]) for f in enh_all2 if t0_2+35000 <= f[4] <= t0_2+55000]

    base_gap_count = len(base_gap_pts)
    enh_gap_count = len(enh_gap_pts)

    print(f"\n  Ground truth distance: {gt_dist2:.1f} m (120s @ 4m/s)")
    print(f"  GPS gap: 10 seconds (40-50s mark)")
    print()
    print(f"  {'':24s} {'Distance':>10s} {'Dist Err':>10s} {'Pos Mean':>10s} {'Gap Pts':>10s}")
    print(f"  {'-'*24} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")
    print(f"  {'Baseline Kalman':24s} {base_f_dist2:10.1f} {abs(base_f_dist2-gt_dist2)/gt_dist2*100:9.1f}% {np.mean(base_err2):9.1f}m {base_gap_count:10d}")
    print(f"  {'Enhanced Kalman':24s} {enh_f_dist2:10.1f} {abs(enh_f_dist2-gt_dist2)/gt_dist2*100:9.1f}% {np.mean(enh_err2):9.1f}m {'-':>10s}")
    print(f"  {'Enhanced + Interpolation':24s} {enh_all_dist2:10.1f} {abs(enh_all_dist2-gt_dist2)/gt_dist2*100:9.1f}% {'':>10s} {enh_gap_count:10d}")

    # --- Summary ---
    print(f"\n{'='*70}")
    print("  IMPROVEMENT SUMMARY")
    print(f"{'='*70}")

    print(f"\n  Curved Urban (Itaewon):")
    b_de = abs(base_f_dist1 - gt_dist1) / gt_dist1 * 100
    e_de = abs(enh_f_dist1 - gt_dist1) / gt_dist1 * 100
    bs_de = abs(base_s_dist1 - gt_dist1) / gt_dist1 * 100 if base_s1 else b_de
    es_de = abs(enh_s_dist1 - gt_dist1) / gt_dist1 * 100 if enh_s1 else e_de
    print(f"    Distance error:  Baseline {b_de:.1f}% → Enhanced {e_de:.1f}%  (RTS: {bs_de:.1f}% → {es_de:.1f}%)")
    bm = np.mean(base_err1); em = np.mean(enh_err1)
    print(f"    Position error:  Baseline {bm:.1f}m → Enhanced {em:.1f}m  ({(1-em/bm)*100:.0f}% improvement)")
    if base_s_err1 and enh_s_err1:
        bsm = np.mean(base_s_err1); esm = np.mean(enh_s_err1)
        print(f"    RTS position:    Baseline {bsm:.1f}m → Enhanced {esm:.1f}m  ({(1-esm/bsm)*100:.0f}% improvement)")

    print(f"\n  GPS Gap (Tunnel):")
    print(f"    Points during gap: Baseline {base_gap_count} → Enhanced {enh_gap_count} (interpolated)")
    bg_de = abs(base_f_dist2 - gt_dist2) / gt_dist2 * 100
    eg_de = abs(enh_all_dist2 - gt_dist2) / gt_dist2 * 100
    print(f"    Distance error:  Baseline {bg_de:.1f}% → Enhanced {eg_de:.1f}%")

    print()
