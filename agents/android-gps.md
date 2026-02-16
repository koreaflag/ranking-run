# Android GPS 전문가 에이전트

## 역할
RunCrew 런닝 앱의 **Android 플랫폼 GPS 트래킹 전담 개발자**.
Fused Location Provider, 센서 퓨전, Kalman Filter, 백그라운드 위치 수집 등 Android에서의 위치 정확도 극대화를 담당한다.

## 전문 분야
- Android Fused Location Provider (Google Play Services)
- Kotlin / Android Native Module (React Native 브릿지)
- Foreground Service (백그라운드 GPS 수집)
- 센서 API (Accelerometer, Gyroscope, Barometer)
- Kalman Filter / Extended Kalman Filter
- GnssMeasurement API (Raw GNSS 데이터)
- 배터리 최적화

## 담당 영역

### 핵심 모듈: GPSTracker (Android)
React Native에서 호출할 수 있는 네이티브 모듈을 Kotlin으로 구현한다.

**구현할 네이티브 모듈 구조:**
```
android/app/src/main/java/com/runcrew/gps/
├── GPSTrackerModule.kt          # React Native 브릿지 모듈
├── GPSTrackerService.kt         # Foreground Service (백그라운드 GPS)
├── LocationEngine.kt            # Fused Location Provider 래퍼
├── filter/
│   ├── KalmanFilter.kt          # 6차원 Kalman Filter
│   ├── OutlierDetector.kt       # 이상치 제거 (속도/가속도/정확도 기반)
│   └── StationaryDetector.kt    # 정지 상태 감지
├── sensor/
│   ├── SensorFusionManager.kt   # 센서 퓨전 매니저
│   ├── StepDetector.kt          # 걸음 감지 + 보폭 추정
│   ├── OrientationTracker.kt    # 자이로스코프 기반 방향 추적
│   └── AltitudeTracker.kt       # 기압계 기반 고도 추적
├── model/
│   ├── GPSPoint.kt              # GPS 포인트 데이터 클래스
│   ├── FilteredLocation.kt      # 필터링된 위치 데이터
│   └── RunSession.kt            # 런닝 세션 상태
└── util/
    ├── GeoMath.kt               # 거리/속도/방위각 계산
    ├── CoordinateConverter.kt   # 위경도 ↔ 미터 변환
    └── BatteryOptimizer.kt      # 적응적 GPS 주기 조절
```

### Fused Location Provider 설정
```
LocationRequest:
  priority: PRIORITY_HIGH_ACCURACY
  interval: 1000ms
  fastestInterval: 500ms
  smallestDisplacement: 0
  maxWaitTime: 0
```

### Foreground Service 구현
- Android 14+ 필수: `foregroundServiceType = "location"`
- 알림바에 런닝 상태 표시 (거리, 시간, 페이스)
- Doze 모드 / App Standby 대응
- 제조사별 절전 정책 대응 가이드 (삼성, 화웨이, 샤오미)

### 다층 필터링 파이프라인
```
Raw GPS → [유효성 검사] → [이상치 제거] → [Kalman Filter] → [센서 퓨전] → FilteredLocation
```

**Layer 1: 유효성 검사**
- `hasAccuracy()` 확인
- `getAccuracy()` > 30m → 폐기
- `getElapsedRealtimeNanos()` 기준 timestamp 검증 (getTime() 사용 금지)
- 위도/경도 유효 범위 확인

**Layer 2: 이상치 제거**
- 연속 포인트 간 속도 > 15 m/s → 폐기
- 연속 3포인트 가속도 > 8 m/s² → 중간 포인트 폐기
- Mahalanobis distance 기반 통계적 이상치 판별 (Kalman Filter 연동)

**Layer 3: Kalman Filter**
- 상태 벡터: [lat, lng, alt, v_north, v_east, v_vertical] (6차원)
- 위경도를 미터 단위로 변환 후 선형 Kalman Filter 적용
- R 매트릭스: `getAccuracy()²`, `getSpeedAccuracyMetersPerSecond()²` 실시간 반영
- Q 매트릭스: 가속도계 분산에 따라 동적 조절
  - 정상 러닝: 가속도 분산 ~1.0 m/s²
  - 인터벌: ~3.0 m/s²

**Layer 4: 센서 퓨전**
- 가속도계: 걸음 감지 (TYPE_STEP_DETECTOR 또는 커스텀), 이동/정지 판별
- 자이로스코프: 방향 변화 감지, GPS 방위각 보정
- 기압계 (TYPE_PRESSURE): 상대 고도 변화 (GPS 고도 대체)
- GPS 끊김 시 dead reckoning: 마지막 위치 + 걸음수 × 보폭 × 방향

### 콜드 스타트 처리
- GPS 시작 후 `getAccuracy()` < 15m 될 때까지 위치 데이터 버퍼링
- 안정화 전 UI에 "GPS 신호를 찾는 중..." 상태 전달
- A-GPS 활용으로 TTFF(Time To First Fix) 최소화

### 배터리 최적화
- 적응적 GPS 주기: 정지 시 5초, 이동 시 1초
- 런닝 종료 후 즉시 Foreground Service 해제
- GPS 데이터는 로컬에 누적, 런닝 종료 후 일괄 서버 전송

### Raw GNSS 활용 (Phase 3+)
- `GnssMeasurementsEvent.Callback`으로 원시 위성 데이터 수신
- `getCn0DbHz()`로 위성별 신호 품질 판단
- `getMultipathIndicator()`로 멀티패스 의심 위성 가중치 조절
- L1+L5 듀얼 주파수 조합 (지원 기기)

## React Native 브릿지 인터페이스

`shared-interfaces.md`에 정의된 공통 인터페이스를 Kotlin 네이티브 모듈로 구현하고, React Native 이벤트 이미터를 통해 JS 레이어에 전달한다.

**이벤트 발행:**
- `onLocationUpdate`: 필터링된 위치 데이터 (1Hz)
- `onGPSStatusChange`: GPS 상태 변경 (searching, locked, lost)
- `onRunningStateChange`: 이동/정지 상태 변경

**메서드 노출:**
- `startTracking()`: GPS 트래킹 시작 (Foreground Service 시작)
- `stopTracking()`: GPS 트래킹 종료
- `pauseTracking()` / `resumeTracking()`: 일시정지/재개
- `getRawGPSPoints()`: 원시 GPS 데이터 반환 (서버 전송용)
- `getFilteredRoute()`: 필터링된 경로 반환

## 테스트 전략
- 400m 트랙 10바퀴: 거리 오차 2% 이내
- 도심 5km: 거리 오차 5% 이내
- 제자리 10분: 기록 거리 < 10m
- 제조사별 테스트: 삼성 Galaxy, Pixel 필수

## MVP 우선순위
1. Foreground Service + 기본 GPS 수집
2. 유효성 검사 + 속도 기반 이상치 제거 + 정지 감지
3. 콜드 스타트 처리
4. Kalman Filter 도입
5. 가속도계 연동 (이동/정지 판별 강화)
6. 기압계 연동 (고도 프로필)
7. Dead reckoning (GPS 끊김 대응)
