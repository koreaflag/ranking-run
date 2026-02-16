# 공통 인터페이스 정의

3개 에이전트(UI, Android GPS, iOS GPS)가 협업하기 위한 공통 인터페이스.
Android/iOS GPS 에이전트는 이 인터페이스를 네이티브로 구현하고,
UI 에이전트는 이 인터페이스를 기준으로 JS 레이어에서 호출한다.

---

## 1. GPSTracker 모듈 인터페이스

### 메서드 (JS → Native)

```typescript
interface GPSTrackerModule {
  // 트래킹 제어
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
  pauseTracking(): Promise<void>;
  resumeTracking(): Promise<void>;

  // 데이터 조회
  getRawGPSPoints(): Promise<RawGPSPoint[]>;      // 원시 GPS 데이터 (서버 전송용)
  getFilteredRoute(): Promise<FilteredLocation[]>; // 필터링된 경로
  getCurrentStatus(): Promise<GPSStatus>;          // 현재 GPS 상태
}
```

### 이벤트 (Native → JS)

```typescript
// 필터링된 위치 업데이트 (1Hz)
interface LocationUpdateEvent {
  latitude: number;
  longitude: number;
  altitude: number;          // 기압계 기반 (GPS 고도 아님)
  speed: number;             // m/s
  bearing: number;           // 0-360도
  accuracy: number;          // 미터
  timestamp: number;         // Unix timestamp (ms)
  distanceFromStart: number; // 시작점부터 누적 거리 (미터)
  isMoving: boolean;         // 이동/정지 상태
}

// GPS 상태 변경
interface GPSStatusChangeEvent {
  status: 'searching' | 'locked' | 'lost' | 'disabled';
  accuracy: number | null;   // 현재 정확도 (미터), null이면 불명
  satelliteCount: number;    // 수신 위성 수 (Android만, iOS는 -1)
}

// 런닝 상태 변경
interface RunningStateChangeEvent {
  state: 'moving' | 'stationary';
  duration: number;          // 해당 상태 유지 시간 (ms)
}
```

---

## 2. 데이터 모델

### RawGPSPoint (원시 GPS - 서버 저장용)
```typescript
interface RawGPSPoint {
  latitude: number;
  longitude: number;
  altitude: number;           // GPS 원시 고도
  speed: number;              // GPS 도플러 속도 (m/s)
  bearing: number;
  horizontalAccuracy: number; // 미터
  verticalAccuracy: number;
  speedAccuracy: number;      // 미터/초 (-1이면 없음)
  timestamp: number;          // Unix timestamp (ms)
  provider: 'gps' | 'fused' | 'network'; // Android만, iOS는 'gps'
}
```

### FilteredLocation (필터링 후 - UI 표시용)
```typescript
interface FilteredLocation {
  latitude: number;
  longitude: number;
  altitude: number;           // 기압계 기반 보정 고도
  speed: number;              // Kalman Filter 추정 속도
  bearing: number;
  timestamp: number;
  distanceFromPrevious: number; // 이전 포인트와의 거리 (미터)
  cumulativeDistance: number;   // 누적 거리 (미터)
  isInterpolated: boolean;     // dead reckoning으로 추정된 포인트 여부
}
```

### GPSStatus
```typescript
type GPSStatus = 'searching' | 'locked' | 'lost' | 'disabled';
```

---

## 3. 이벤트 이름 규약

React Native 이벤트 이미터에서 사용하는 이벤트 이름:

| 이벤트 이름 | 데이터 타입 | 발생 빈도 |
|------------|-----------|----------|
| `GPSTracker_onLocationUpdate` | `LocationUpdateEvent` | 1Hz (런닝 중) |
| `GPSTracker_onGPSStatusChange` | `GPSStatusChangeEvent` | 상태 변경 시 |
| `GPSTracker_onRunningStateChange` | `RunningStateChangeEvent` | 이동↔정지 전환 시 |

---

## 4. 에러 코드

```typescript
enum GPSErrorCode {
  PERMISSION_DENIED = 'PERMISSION_DENIED',       // 위치 권한 거부
  GPS_DISABLED = 'GPS_DISABLED',                 // GPS 비활성화
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',   // 위치 서비스 불가
  COLD_START_TIMEOUT = 'COLD_START_TIMEOUT',     // GPS 신호 획득 타임아웃 (30초)
  BACKGROUND_RESTRICTED = 'BACKGROUND_RESTRICTED', // 백그라운드 위치 제한
}
```

---

## 5. 협업 규칙

### GPS 에이전트 → UI 에이전트
- 위의 인터페이스를 정확히 구현. 타입이 일치하지 않으면 빌드 시 에러.
- 네이티브 모듈 이름: `GPSTrackerModule` (Android/iOS 동일)
- 이벤트는 `NativeEventEmitter`를 통해 전달

### UI 에이전트 → GPS 에이전트
- `GPSTrackerModule`의 메서드만 호출. 네이티브 코드 직접 접근 금지.
- GPS 데이터 가공(페이스 계산, 구간 분석 등)은 JS 레이어에서 처리

### Android GPS ↔ iOS GPS
- 동일한 인터페이스를 각 플랫폼 네이티브로 구현
- Kalman Filter 파라미터는 동일하게 유지 (랭킹 공정성)
- 플랫폼 특화 로직은 허용하되, 출력 데이터 형식은 반드시 동일
