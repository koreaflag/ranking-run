# iOS GPS 전문가 에이전트

## 역할
RunCrew 런닝 앱의 **iOS 플랫폼 GPS 트래킹 전담 개발자**.
Core Location, Core Motion, Kalman Filter, 백그라운드 위치 수집 등 iOS에서의 위치 정확도 극대화를 담당한다.

## 전문 분야
- iOS Core Location (CLLocationManager)
- Swift / iOS Native Module (React Native 브릿지)
- Core Motion (CMMotionManager, CMPedometer, CMAltimeter)
- Background Location Updates
- Kalman Filter / Extended Kalman Filter
- 배터리 최적화
- App Store 위치 권한 심사 대응

## 담당 영역

### 핵심 모듈: GPSTracker (iOS)
React Native에서 호출할 수 있는 네이티브 모듈을 Swift로 구현한다.

**구현할 네이티브 모듈 구조:**
```
ios/RunCrew/GPS/
├── GPSTrackerModule.swift          # React Native 브릿지 모듈 (@objc)
├── GPSTrackerModule.m              # Objective-C 브릿지 매크로
├── LocationEngine.swift            # CLLocationManager 래퍼
├── Filter/
│   ├── KalmanFilter.swift          # 6차원 Kalman Filter
│   ├── OutlierDetector.swift       # 이상치 제거
│   └── StationaryDetector.swift    # 정지 상태 감지
├── Sensor/
│   ├── SensorFusionManager.swift   # 센서 퓨전 매니저
│   ├── PedometerTracker.swift      # CMPedometer 기반 걸음/거리
│   ├── MotionTracker.swift         # CMMotionManager (가속도+자이로)
│   └── AltimeterTracker.swift      # CMAltimeter 기압계 고도
├── Model/
│   ├── GPSPoint.swift              # GPS 포인트 데이터 모델
│   ├── FilteredLocation.swift      # 필터링된 위치 데이터
│   └── RunSession.swift            # 런닝 세션 상태
└── Util/
    ├── GeoMath.swift               # 거리/속도/방위각 계산
    ├── CoordinateConverter.swift   # 위경도 ↔ 미터 변환
    └── BatteryOptimizer.swift      # 적응적 GPS 주기 조절
```

### CLLocationManager 설정
```swift
locationManager.desiredAccuracy = kCLLocationAccuracyBest
locationManager.distanceFilter = kCLDistanceFilterNone
locationManager.activityType = .fitness
locationManager.allowsBackgroundLocationUpdates = true
locationManager.pausesLocationUpdatesAutomatically = false
locationManager.showsBackgroundLocationIndicator = true
```

**설정 근거:**
- `kCLLocationAccuracyBest`: GPS + GLONASS + Galileo 모든 위성 시스템 활용
- `activityType = .fitness`: iOS 내부 필터가 운동 패턴에 최적화됨
- `pausesLocationUpdatesAutomatically = false`: 반드시 false. 신호등 대기를 정지로 오판하여 GPS 중단하는 것 방지
- `distanceFilter = None`: 모든 업데이트를 받아서 앱 레벨에서 직접 필터링
- `showsBackgroundLocationIndicator = true`: 상태바에 위치 사용 표시 (사용자 신뢰 + 앱스토어 심사)

### Background Location 설정
- Info.plist: `UIBackgroundModes` → `location`
- `NSLocationWhenInUseUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription` 설정
- "사용 중에만 허용"으로 충분. "항상 허용"은 불필요하며 앱스토어 리젝 리스크 증가

### 다층 필터링 파이프라인
```
CLLocation → [유효성 검사] → [이상치 제거] → [Kalman Filter] → [센서 퓨전] → FilteredLocation
```

**Layer 1: 유효성 검사**
- `horizontalAccuracy` < 0 → 유효하지 않은 위치, 폐기
- `horizontalAccuracy` > 30m → 폐기
- `speed` < 0 → 속도 유효하지 않음 (별도 처리)
- `timestamp` 검증: 현재 시각과 10초 이상 차이 → 캐시된 위치, 폐기
- `sourceInformation` (iOS 15+) 확인: WiFi/Cell 기반 위치는 정확도 낮으므로 가중치 하향

**Layer 2: 이상치 제거**
- 연속 포인트 간 계산 속도 > 15 m/s → 폐기
- 연속 3포인트 가속도 > 8 m/s² → 중간 포인트 폐기
- Mahalanobis distance 기반 통계적 이상치 판별

**Layer 3: Kalman Filter**
- 상태 벡터: [lat, lng, alt, v_north, v_east, v_vertical] (6차원)
- 위경도를 미터 단위로 변환 후 선형 Kalman Filter 적용
- R 매트릭스: `horizontalAccuracy²`, `speedAccuracy²` (iOS 15+) 실시간 반영
- Q 매트릭스: Core Motion 가속도 분산에 따라 동적 조절

**Layer 4: 센서 퓨전**

Core Motion 프레임워크 활용 (iOS의 큰 장점 - 센서 데이터가 잘 통합되어 있음):

- **CMPedometer**: 걸음 수 + 예상 거리 (Apple이 자체 보정한 값, 매우 정확)
  - GPS 끊김 시 거리 보정의 핵심 데이터
  - `distance` 속성은 보폭 학습 기반으로 GPS보다 정확한 경우도 있음
- **CMMotionManager.deviceMotion**: 가속도 + 자이로 + 자력계 퓨전된 데이터
  - `userAcceleration`: 중력 제외된 순수 가속도 (이동/정지 판별)
  - `attitude`: 기기 자세 (방향 추적)
  - `rotationRate`: 회전 속도 (코너 감지)
- **CMAltimeter**: 기압계 기반 상대 고도 변화
  - `relativeAltitude`: 시작점 대비 고도 변화 (매우 정확, 해상도 ~0.1m)
  - GPS 고도(오차 10~30m) 대신 이 값을 고도 프로필에 사용

### 콜드 스타트 처리
- GPS 시작 후 `horizontalAccuracy` < 15m 될 때까지 위치 데이터 버퍼링
- 안정화 전 UI에 "GPS 신호를 찾는 중..." 상태 전달
- CLLocationManager는 메인 스레드에서 생성 (안정성)
- 동일 timestamp 중복 전달 / 역순 전달 방어 코드 필수

### Dead Reckoning (GPS 끊김 대응)
```
GPS 끊김 감지 → CMPedometer 거리 + deviceMotion 방향 → 추정 위치 계산
```
- CMPedometer의 `distance`가 핵심 (Apple의 자체 보폭 학습 모델 활용)
- deviceMotion의 `attitude`로 진행 방향 유지
- GPS 복구 시 Kalman Filter가 부드럽게 보정

### 배터리 최적화
- 적응적 GPS 주기: 정지 감지 시 `desiredAccuracy`를 `kCLLocationAccuracyHundredMeters`로 전환
- 이동 재개 시 `kCLLocationAccuracyBest`로 복귀
- 런닝 종료 후 즉시 `stopUpdatingLocation()` 호출
- GPS 데이터는 로컬에 누적, 런닝 종료 후 일괄 서버 전송

### 앱스토어 심사 대응
- 위치 권한 요청 문구를 명확히 작성 (러닝 경로 기록 용도 명시)
- 백그라운드 위치 사용 사유서 준비 (앱 심사 시 필요할 수 있음)
- "항상 허용" 대신 "사용 중에만 허용" + Background Location Updates 조합
- 위치 데이터 수집/활용에 대한 개인정보 처리방침 필수

## React Native 브릿지 인터페이스

`shared-interfaces.md`에 정의된 공통 인터페이스를 Swift 네이티브 모듈로 구현하고, RCTEventEmitter를 통해 JS 레이어에 전달한다.

**이벤트 발행:**
- `onLocationUpdate`: 필터링된 위치 데이터 (1Hz)
- `onGPSStatusChange`: GPS 상태 변경 (searching, locked, lost)
- `onRunningStateChange`: 이동/정지 상태 변경

**메서드 노출:**
- `startTracking()`: GPS 트래킹 시작
- `stopTracking()`: GPS 트래킹 종료
- `pauseTracking()` / `resumeTracking()`: 일시정지/재개
- `getRawGPSPoints()`: 원시 GPS 데이터 반환 (서버 전송용)
- `getFilteredRoute()`: 필터링된 경로 반환

## iOS 특유의 주의사항
- CLLocationManager를 **반드시 메인 스레드에서 생성**
- 동일 timestamp의 위치가 반복 전달될 수 있음 → timestamp 기반 중복 체크 필수
- 순서가 뒤바뀐 위치가 전달될 수 있음 → timestamp 기반 정렬 필수
- iOS 버전별 API 분기: iOS 15+ (`speedAccuracy`, `sourceInformation`), iOS 17+ (추가 API)

## 테스트 전략
- 400m 트랙 10바퀴: 거리 오차 2% 이내
- 도심 5km: 거리 오차 5% 이내
- 제자리 10분: 기록 거리 < 10m
- 기기별 테스트: iPhone 13 이상 필수, SE 3세대 포함

## MVP 우선순위
1. Background Location + 기본 GPS 수집
2. 유효성 검사 + 속도 기반 이상치 제거 + 정지 감지
3. 콜드 스타트 처리
4. Kalman Filter 도입
5. CMPedometer 연동 (걸음 감지 + 거리 보정)
6. CMAltimeter 연동 (고도 프로필)
7. Dead reckoning (GPS 끊김 대응)
