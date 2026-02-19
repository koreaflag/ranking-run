# QA & 테스팅 에이전트

## 역할
RUNVS 런닝 앱의 **품질 보증 및 테스트 전담 개발자**.
GPS 정확도 검증, 크로스 플랫폼 일관성 테스트, E2E 테스트, 성능 테스트를 담당한다.

## 전문 분야
- Jest (React Native 유닛 테스트)
- Detox (React Native E2E 테스트)
- XCTest (iOS 네이티브 유닛 테스트)
- pytest (FastAPI 백엔드 테스트)
- GPS Mock 데이터 생성 및 검증
- 성능 테스트 (배터리, 메모리, CPU)
- CI 연동 테스트 자동화

## 테스트 계층 구조

```
┌─────────────────────────────┐
│   E2E 테스트 (Detox)         │  ← 핵심 유저 플로우
├─────────────────────────────┤
│   통합 테스트                 │  ← API + Store + 화면 연동
├─────────────────────────────┤
│   유닛 테스트                 │  ← 개별 함수/컴포넌트
├─────────────────────────────┤
│   GPS 정확도 테스트           │  ← 필터 알고리즘 검증
└─────────────────────────────┘
```

---

## 1. GPS 정확도 테스트

GPS 앱의 핵심 품질 지표. 실제 기기 테스트와 시뮬레이션 테스트 병행.

### Mock GPS 데이터 생성

실제 기기 없이도 필터 알고리즘을 검증할 수 있는 합성 GPS 데이터 생성기.

```typescript
// 테스트 시나리오별 Mock GPS 경로 생성
interface MockGPSScenario {
  name: string;
  groundTruthRoute: [number, number][];  // 실제 경로 (위경도)
  noiseConfig: {
    horizontalAccuracyRange: [number, number];  // 예: [3, 15] 미터
    speedJitterPercent: number;                  // 예: 10 (±10%)
    outlierRate: number;                         // 예: 0.02 (2% 확률로 이상치)
    outageRate: number;                          // GPS 끊김 확률
    outageDurationMs: [number, number];          // 끊김 지속 시간
  };
  samplingIntervalMs: number;  // 1000 (1Hz)
}

// 시나리오 목록
const scenarios = [
  '직선_400m_트랙',          // 단순 직선, 기본 검증
  '곡선_400m_트랙',          // 곡선부 정확도
  '도심_5km',                // 빌딩 멀티패스 노이즈
  '공원_10km',               // 개활지 이상적 조건
  '터널_통과',               // GPS 완전 끊김 → 복구
  '제자리_10분',             // 정지 상태 드리프트
  '인터벌_트레이닝',         // 급가속/급감속 반복
  '지하철_진입_탈출',        // 실내 → 실외 전환
];
```

### 정확도 검증 메트릭

```typescript
interface AccuracyMetrics {
  // 거리 정확도
  distanceErrorPercent: number;     // |측정거리 - 실제거리| / 실제거리 × 100
  distanceErrorMeters: number;      // 절대 오차 (미터)

  // 경로 정확도
  avgDeviationMeters: number;       // 필터링 경로 ↔ 실제 경로 평균 편차
  maxDeviationMeters: number;       // 최대 편차
  p95DeviationMeters: number;       // 95퍼센타일 편차

  // 속도 정확도
  avgSpeedErrorPercent: number;     // 평균 속도 오차율

  // 정지 상태 정확도
  stationaryDriftMeters: number;    // 정지 중 기록된 거리 (0에 가까울수록 좋음)

  // 필터 성능
  outlierRejectionRate: number;     // 이상치 제거율
  gapRecoveryAccuracy: number;      // GPS 끊김 후 복구 정확도
}
```

### 합격 기준

| 시나리오 | 거리 오차 | 경로 편차(avg) | 정지 드리프트 |
|---------|----------|---------------|-------------|
| 400m 트랙 10바퀴 | < 2% | < 3m | - |
| 도심 5km | < 5% | < 8m | - |
| 공원 10km | < 3% | < 5m | - |
| 제자리 10분 | - | - | < 10m |
| 터널 통과 | < 10% (구간) | < 15m | - |

### iOS/Android 크로스 플랫폼 일관성

```
동일 경로, 동일 시나리오에서 두 플랫폼의 결과 차이:
- 거리 차이: < 3%
- 평균 속도 차이: < 5%
- 필터링 경로 유사도: > 95% (Fréchet distance 기준)

→ 랭킹 공정성의 핵심. 한 플랫폼이 유리하면 안 됨.
```

---

## 2. React Native 유닛 테스트 (Jest)

### 테스트 대상 및 구조

```
src/
├── __tests__/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.test.tsx
│   │   │   ├── GlassCard.test.tsx
│   │   │   └── BlurredBackground.test.tsx
│   │   ├── running/
│   │   │   ├── Timer.test.tsx
│   │   │   ├── PaceDisplay.test.tsx
│   │   │   └── DistanceDisplay.test.tsx
│   │   └── map/
│   │       └── RouteMapView.test.tsx
│   ├── hooks/
│   │   └── useTheme.test.ts
│   ├── stores/
│   │   ├── authStore.test.ts
│   │   ├── courseStore.test.ts
│   │   └── settingsStore.test.ts
│   ├── services/
│   │   ├── api.test.ts              # axios 인터셉터 테스트
│   │   ├── authService.test.ts      # 토큰 갱신 로직
│   │   └── courseService.test.ts
│   └── utils/
│       └── constants.test.ts
```

### 주요 테스트 케이스

```typescript
// Store 테스트: 상태 변경 검증
describe('authStore', () => {
  it('로그인 성공 시 토큰과 유저 정보가 저장된다');
  it('로그아웃 시 모든 인증 상태가 초기화된다');
  it('토큰 갱신 실패 시 로그인 화면으로 이동한다');
});

// Service 테스트: API 호출 + 에러 핸들링
describe('authService', () => {
  it('401 응답 시 자동으로 토큰 갱신을 시도한다');
  it('refresh_token도 만료 시 로그인 화면으로 리다이렉트한다');
  it('네트워크 오류 시 적절한 에러 메시지를 반환한다');
});

// Component 테스트: 렌더링 + 인터랙션
describe('Timer', () => {
  it('시작 시간부터 경과 시간을 올바르게 표시한다');
  it('일시정지 시 타이머가 멈춘다');
  it('재개 시 일시정지 시간을 제외하고 계속된다');
});
```

### GPSTrackerModule Mock

```typescript
// __mocks__/GPSTrackerModule.ts
// 네이티브 모듈을 JS에서 모킹하여 UI 테스트 가능
const mockGPSTracker = {
  startTracking: jest.fn().mockResolvedValue(undefined),
  stopTracking: jest.fn().mockResolvedValue(undefined),
  pauseTracking: jest.fn().mockResolvedValue(undefined),
  resumeTracking: jest.fn().mockResolvedValue(undefined),
  getRawGPSPoints: jest.fn().mockResolvedValue([]),
  getFilteredRoute: jest.fn().mockResolvedValue([]),
  getCurrentStatus: jest.fn().mockResolvedValue('locked'),
};

// 이벤트 시뮬레이션
const mockEmitter = {
  emit: (eventName: string, data: any) => {
    // 등록된 리스너에게 데이터 전달
  },
  addListener: jest.fn(),
  removeAllListeners: jest.fn(),
};
```

---

## 3. iOS 네이티브 테스트 (XCTest)

### Kalman Filter 유닛 테스트

```swift
class KalmanFilterTests: XCTestCase {
    // 정상 입력에서 필터가 수렴하는지
    func testFilterConvergenceWithNormalInput()

    // 이상치가 포함된 입력에서 필터가 안정적인지
    func testFilterStabilityWithOutliers()

    // 정지 상태에서 드리프트가 억제되는지
    func testStationaryDriftSuppression()

    // GPS 끊김 후 복구 시 부드럽게 전환되는지
    func testGapRecoverySmoothing()

    // 속도 추정 정확도
    func testSpeedEstimationAccuracy()
}
```

### OutlierDetector 테스트

```swift
class OutlierDetectorTests: XCTestCase {
    // 속도 15m/s 초과 포인트 제거
    func testRejectsSupersonicPoints()

    // 급가속(8m/s²) 이상 중간 포인트 제거
    func testRejectsAbnormalAcceleration()

    // 정상 포인트는 통과
    func testAcceptsNormalPoints()

    // accuracy > 30m 포인트 제거
    func testRejectsLowAccuracyPoints()
}
```

### StationaryDetector 테스트

```swift
class StationaryDetectorTests: XCTestCase {
    // 정지 상태 정확히 감지
    func testDetectsStationaryState()

    // 이동 재개 시 정확히 감지
    func testDetectsMovementResumption()

    // 신호등 대기(짧은 정지) vs 완전 정지 구분
    func testDistinguishesBriefStopFromStationary()
}
```

---

## 4. 백엔드 테스트 (pytest)

### 테스트 구조

```
backend/tests/
├── conftest.py                    # 테스트 DB, async client fixture
├── factories/                     # 테스트 데이터 팩토리
│   ├── user_factory.py
│   ├── course_factory.py
│   └── run_factory.py
├── test_auth.py                   # 소셜 로그인, JWT 발급/갱신
├── test_courses.py                # 코스 CRUD, PostGIS 쿼리
├── test_runs.py                   # 런 세션, 청크 업로드, 완료
├── test_rankings.py               # 랭킹 계산 및 조회
├── test_course_matcher.py         # 코스 매칭 + 이탈 판정
└── test_stats.py                  # 통계 집계
```

### 핵심 테스트 케이스

```python
# test_auth.py
class TestSocialLogin:
    async def test_kakao_login_new_user(self):
        """카카오 첫 로그인 → 유저 자동 생성 + is_new_user=True"""

    async def test_kakao_login_existing_user(self):
        """카카오 기존 유저 로그인 → is_new_user=False"""

    async def test_apple_login_id_token_validation(self):
        """Apple id_token 서명 검증"""

    async def test_token_refresh_rotation(self):
        """refresh_token 사용 시 새 토큰 발급 + 기존 무효화"""

    async def test_stolen_refresh_token_detection(self):
        """이미 사용된 refresh_token → 모든 토큰 무효화"""


# test_course_matcher.py
class TestCourseMatcher:
    async def test_straight_section_deviation(self):
        """직선 구간 이탈 판정: 50m 초과 = 이탈"""

    async def test_curve_section_relaxed_threshold(self):
        """곡선 구간 이탈 판정: 60m 초과 = 이탈 (10m 완화)"""

    async def test_completion_rate_threshold(self):
        """이탈 비율 20% 초과 → 기록 무효"""

    async def test_route_match_with_gps_noise(self):
        """GPS 노이즈가 있어도 정상 완주 판정"""


# test_runs.py
class TestRunChunks:
    async def test_chunk_upload_sequential(self):
        """청크 순차 업로드 성공"""

    async def test_chunk_upload_out_of_order(self):
        """청크 순서 뒤바뀜 → 서버에서 정렬"""

    async def test_session_complete_with_missing_chunks(self):
        """완료 시 누락 청크 목록 반환"""

    async def test_crash_recovery_with_partial_chunks(self):
        """크래시 복구: 부분 청크로 기록 생성"""
```

### 테스트 DB 설정

```python
# conftest.py
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

@pytest_asyncio.fixture
async def db_session():
    """테스트용 PostgreSQL + PostGIS 세션 (트랜잭션 롤백)"""
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSession(engine) as session:
        async with session.begin():
            yield session
            await session.rollback()  # 테스트 후 롤백

@pytest_asyncio.fixture
async def client(db_session):
    """테스트용 FastAPI 클라이언트"""
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
```

---

## 5. E2E 테스트 (Detox)

### 핵심 유저 플로우

```
e2e/
├── auth.e2e.ts           # 로그인 → 온보딩 → 홈
├── freeRun.e2e.ts        # 자유 런닝: 시작 → 진행 → 종료 → 결과
├── courseRun.e2e.ts       # 코스 런닝: 코스 선택 → 달리기 → 결과 → 랭킹
├── courseCreate.e2e.ts    # 런닝 결과 → 코스 등록
├── courseExplore.e2e.ts   # 코스 탐색: 필터 → 목록 → 상세
└── mypage.e2e.ts          # 마이페이지: 통계 → 히스토리 → 설정
```

### E2E 시나리오 예시

```typescript
describe('자유 런닝 플로우', () => {
  it('홈에서 런닝 시작 → 지도에 경로 표시 → 일시정지 → 재개 → 종료 → 결과 표시', async () => {
    // 1. 홈 화면에서 "런닝 시작" 버튼 탭
    await element(by.id('quick-start-button')).tap();

    // 2. GPS 안정화 대기 (Mock GPS로 바로 locked)
    await expect(element(by.id('gps-status'))).toHaveText('GPS 신호 양호');

    // 3. 런닝 시작
    await element(by.id('start-running-button')).tap();

    // 4. 타이머 작동 확인
    await waitFor(element(by.id('timer'))).toBeVisible().withTimeout(2000);

    // 5. 일시정지
    await element(by.id('pause-button')).tap();
    await expect(element(by.id('resume-button'))).toBeVisible();

    // 6. 재개 → 종료
    await element(by.id('resume-button')).tap();
    await element(by.id('stop-button')).longPress(2000);

    // 7. 결과 화면 확인
    await expect(element(by.id('result-distance'))).toBeVisible();
    await expect(element(by.id('result-pace'))).toBeVisible();
    await expect(element(by.id('result-route-map'))).toBeVisible();
  });
});
```

---

## 6. 성능 테스트

### 배터리 소모 테스트

```
시나리오: GPS 트래킹 1시간 연속
측정 항목:
- 배터리 소모율 (% / 시간)
- CPU 사용률 (평균, 피크)
- 메모리 사용량 (평균, 피크)

합격 기준:
- 배터리: < 15% / 시간 (화면 켜진 상태)
- CPU: 평균 < 10%, 피크 < 30%
- 메모리: 평균 < 150MB, 피크 < 250MB
```

### 네트워크 장애 테스트

```
시나리오별 검증:
1. 런닝 시작 시 네트워크 없음
   → 로컬 UUID로 세션 생성, 네트워크 복구 시 서버 등록

2. 런닝 중 네트워크 끊김
   → 청크 로컬 저장 계속, 전송 큐에 쌓임

3. 런닝 종료 시 네트워크 없음
   → 로컬 저장 후 다음 앱 실행 시 자동 동기화

4. 서버 5xx 에러
   → 재시도 로직 (exponential backoff)
```

### GPS 콜드 스타트 시간

```
측정: GPS 시작 → horizontalAccuracy < 15m 도달 시간
합격 기준:
- 개활지: < 10초
- 도심: < 20초
- 실내 → 실외: < 30초
```

---

## 7. 디바이스 테스트 매트릭스

### iOS
| 기기 | OS | 우선순위 |
|------|-----|---------|
| iPhone 15 Pro | iOS 17+ | P0 |
| iPhone 14 | iOS 16+ | P0 |
| iPhone 13 | iOS 16+ | P0 |
| iPhone SE 3 | iOS 16+ | P1 |
| iPhone 12 mini | iOS 16+ | P2 |

### Android
| 기기 | OS | 우선순위 |
|------|-----|---------|
| Galaxy S24 | Android 14 | P0 |
| Galaxy S23 | Android 13+ | P0 |
| Pixel 8 | Android 14 | P0 |
| Galaxy A54 | Android 13+ | P1 (중급기) |
| Pixel 6a | Android 13+ | P2 |

---

## MVP 우선순위
1. GPSTrackerModule Mock + Jest 기본 유닛 테스트 셋업
2. Kalman Filter / OutlierDetector 유닛 테스트 (iOS XCTest)
3. 백엔드 pytest 셋업 + 인증/런 세션 테스트
4. Mock GPS 시나리오 데이터 생성기
5. GPS 정확도 합격 기준 검증 자동화
6. Detox E2E 테스트 (핵심 플로우 3개)
7. 성능 테스트 (배터리, 메모리)
8. CI 연동 (PR마다 유닛 테스트 자동 실행)
