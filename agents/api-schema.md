# RUNVS API 통신 스키마

앱의 각 시점(moment)에서 어떤 데이터를 보내고 받는지 정의한다.
백엔드는 FastAPI (Python), DB는 PostgreSQL + PostGIS.
모든 API는 REST 기반이며, 인증은 JWT (Bearer Token)를 사용한다.
비동기 작업(썸네일 생성, 통계 갱신 등)은 FastAPI BackgroundTasks로 처리한다.

---

## 시점별 통신 흐름 전체 맵

```
[앱 시작] → 토큰 검증 → 유저 프로필 조회
[로그인] → 소셜 로그인 → 유저 생성/조회
[홈 화면 진입] → 추천 코스 + 최근 활동 조회
[코스 탐색] → 코스 목록 조회 (필터/정렬/페이지네이션)
[코스 상세] → 코스 정보 + 통계 + 랭킹 조회
[런닝 시작] → 세션 생성
[런닝 중]   → 1km/5분마다 청크 전송
[런닝 종료] → 최종 요약 전송
[코스 등록] → 런 기록 기반 코스 생성
[랭킹 조회] → 코스별 랭킹 조회
[마이페이지] → 개인 통계 + 런 히스토리 조회
```

---

## 공통 사항

### 인증 헤더
모든 인증 필요 API는 다음 헤더를 포함:
```
Authorization: Bearer {access_token}
```

### Base URL
```
개발: http://localhost:8000/api/v1
운영: https://api.runcrew.app/api/v1
```

---

## 1. 인증 (Auth)

### 1-1. 소셜 로그인
**시점**: 로그인 버튼 탭

```typescript
// 흐름: 클라이언트에서 소셜 SDK로 토큰 획득 → FastAPI에 전달 → JWT 발급
//
// Step 1: 클라이언트가 카카오/Apple SDK로 소셜 토큰(access_token 또는 id_token) 획득
// Step 2: 소셜 토큰을 FastAPI에 전달

// Request: POST /api/v1/auth/login
{
  provider: 'kakao' | 'apple';
  token: string;              // 카카오: access_token, Apple: id_token
  nonce?: string;             // Apple 전용
}

// Response: 200 OK
interface AuthResponse {
  access_token: string;       // JWT, 만료 30분
  refresh_token: string;      // 만료 30일
  token_type: 'Bearer';
  expires_in: number;         // 초 단위 (1800)
  user: {
    id: string;               // UUID
    email: string;
    provider: 'kakao' | 'apple';
    is_new_user: boolean;     // true이면 온보딩 화면으로
  };
}
```

**FastAPI 서버 내부 처리**:
1. 소셜 토큰으로 카카오/Apple API에 유저 정보 조회
2. DB에서 해당 소셜 ID로 유저 검색. 없으면 자동 생성 (is_new_user=true)
3. JWT access_token + refresh_token 발급

### 1-2. 토큰 갱신
**시점**: access_token 만료 시 (401 응답 받을 때 자동 시도)

```typescript
// Request: POST /api/v1/auth/refresh
{
  refresh_token: string;
}

// Response: 200 OK
{
  access_token: string;
  refresh_token: string;      // refresh token rotation
  expires_in: number;
}

// refresh_token도 만료되었으면 → 403 → 로그인 화면으로
```

### 1-3. 프로필 초기 설정 (최초 로그인 시)
**시점**: 소셜 로그인 응답에서 `is_new_user: true`일 때 온보딩 화면 표시

```typescript
// Request: POST /api/v1/users/me/profile
// Headers: Authorization: Bearer {access_token}
{
  nickname: string;           // 2~12자
  avatar_url?: string;        // 프로필 사진 URL (업로드 후)
}

// Response: 201 Created
{
  id: string;
  nickname: string;
  avatar_url: string | null;
  total_distance_meters: 0;
  total_runs: 0;
  created_at: string;         // ISO 8601
}
```

### 1-4. 앱 시작 시 토큰 검증 + 프로필 조회
**시점**: 앱 launch, 스플래시 화면

```typescript
// SecureStore에서 access_token 로드 후 프로필 조회
// Request: GET /api/v1/users/me
// Headers: Authorization: Bearer {access_token}

// Response: 200 OK
{
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  total_distance_meters: number;
  total_runs: number;
  created_at: string;
}

// 401 → refresh 시도 → 실패 시 로그인 화면
```

---

## 2. 홈 화면

### 2-1. 홈 데이터 로드
**시점**: 홈 탭 진입 시 (병렬 호출)

```typescript
// --- 호출 1: 내 주변 추천 코스 (최대 5개) ---
// Request: GET /api/v1/courses/nearby?lat={lat}&lng={lng}&radius=5000&limit=5

// Response:
interface NearbyCourse {
  id: string;
  title: string;
  thumbnail_url: string | null;
  distance_meters: number;
  estimated_duration_seconds: number;
  total_runs: number;
  avg_pace_seconds_per_km: number | null;
  creator_nickname: string;
  distance_from_user_meters: number;  // 유저와의 거리
}[]

// --- 호출 2: 내 최근 런닝 기록 (최대 3개) ---
// Request: GET /api/v1/users/me/runs?limit=3&order_by=finished_at&order=desc

// Response:
interface RecentRun {
  id: string;
  distance_meters: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  started_at: string;
  finished_at: string;
  course: {               // null이면 자유 런닝
    id: string;
    title: string;
  } | null;
}[]

// --- 호출 3: 이번 주 요약 통계 ---
// Request: GET /api/v1/users/me/stats/weekly

// Response:
interface WeeklySummary {
  total_distance_meters: number;
  total_duration_seconds: number;
  run_count: number;
  avg_pace_seconds_per_km: number | null;
  compared_to_last_week_percent: number;  // +15 = 지난주 대비 15% 증가
}
```

---

## 3. 코스 탐색

### 3-1. 코스 목록 조회
**시점**: 코스 탐색 탭 진입 시, 필터/정렬 변경 시, 스크롤 페이지네이션

```typescript
// Request: GET /api/v1/courses?min_distance=3000&max_distance=10000
//          &near_lat=37.5&near_lng=127.0&near_radius=10000
//          &order_by=total_runs&order=desc&page=0&per_page=20
//
// Query Parameters:
{
  min_distance?: number;           // 최소 거리 (미터)
  max_distance?: number;           // 최대 거리 (미터)
  near_lat?: number;               // 위치 기반 필터
  near_lng?: number;
  near_radius?: number;            // 기본 10000 (10km)
  order_by?: 'created_at' | 'total_runs' | 'distance_meters' | 'distance_from_user';
  order?: 'asc' | 'desc';
  page?: number;                   // 0부터 시작
  per_page?: number;               // 기본 20
}

// Response:
interface CourseListResponse {
  data: {
    id: string;
    title: string;
    thumbnail_url: string | null;
    distance_meters: number;
    estimated_duration_seconds: number;
    elevation_gain_meters: number;
    creator: {
      id: string;
      nickname: string;
      avatar_url: string | null;
    };
    stats: {
      total_runs: number;
      unique_runners: number;
      avg_pace_seconds_per_km: number | null;
    };
    created_at: string;
    distance_from_user_meters?: number;  // 위치 기반 필터 시에만
  }[];
  total_count: number;
  has_next: boolean;
}
```

### 3-2. 코스 지도 뷰용 마커 데이터
**시점**: 코스 탐색에서 지도 뷰 전환 시

```typescript
// Request: GET /api/v1/courses/bounds?sw_lat=37.4&sw_lng=126.9&ne_lat=37.6&ne_lng=127.1&limit=50

// Response:
interface CourseMarker {
  id: string;
  title: string;
  start_lat: number;      // 코스 시작점 좌표 (마커 위치)
  start_lng: number;
  distance_meters: number;
  total_runs: number;
}[]
```

---

## 4. 코스 상세

### 4-1. 코스 상세 정보
**시점**: 코스 목록에서 코스 탭 시 (병렬 호출)

```typescript
// --- 호출 1: 코스 기본 정보 + 경로 ---
// Request: GET /api/v1/courses/{courseId}

// Response:
interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  route_geometry: GeoJSON.LineString;  // 경로 좌표 배열
  distance_meters: number;
  estimated_duration_seconds: number;
  elevation_gain_meters: number;
  elevation_profile: number[];         // 고도 프로필 (샘플링된 배열)
  thumbnail_url: string | null;
  is_public: boolean;
  created_at: string;
  creator: {
    id: string;
    nickname: string;
    avatar_url: string | null;
  };
}

// --- 호출 2: 코스 통계 ---
// Request: GET /api/v1/courses/{courseId}/stats

// Response:
interface CourseStats {
  course_id: string;
  total_runs: number;
  unique_runners: number;
  avg_duration_seconds: number;
  avg_pace_seconds_per_km: number;
  best_duration_seconds: number;
  best_pace_seconds_per_km: number;
  completion_rate: number;           // 완주율 (0~1)
  runs_by_hour: Record<string, number>;  // 시간대별 런닝 횟수 {"09": 15, "18": 42}
  updated_at: string;
}

// --- 호출 3: 코스 랭킹 (상위 10명) ---
// Request: GET /api/v1/courses/{courseId}/rankings?limit=10

// Response:
interface RankingEntry {
  rank: number;
  user: {
    id: string;
    nickname: string;
    avatar_url: string | null;
  };
  best_duration_seconds: number;
  best_pace_seconds_per_km: number;
  achieved_at: string;
}[]

// --- 호출 4: 내 기록 (이 코스) ---
// Request: GET /api/v1/courses/{courseId}/my-best

// Response (내 최고 기록):
{
  id: string;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  finished_at: string;
} | null   // 달린 적 없으면 null
```

---

## 5. 런닝 세션

### 설계 원칙: 청크 기반 전송

런닝 데이터를 종료 시 한번에 보내는 방식의 문제점:
- **데이터 유실**: 앱 크래시, 폰 꺼짐, OOM kill 시 전체 데이터 소실
- **용량 폭탄**: 마라톤(4시간+) = 수천 포인트 = 수MB, 업로드 실패 시 전부 날아감
- **복구 불가**: 런닝 중 강제 종료 시 기록 자체가 사라짐

→ **청크 단위 로컬 저장 + 주기적 서버 동기화** 방식으로 설계

```
[런닝 시작] → 세션 생성 (서버)
[런닝 중]   → 1km 또는 5분마다 → 로컬 청크 저장 → 서버 백그라운드 동기화
[런닝 종료] → 마지막 청크 + 최종 요약 전송
[앱 크래시] → 다음 앱 실행 시 미전송 청크 자동 복구/전송
```

---

### 5-1. 런닝 시작 (세션 생성)
**시점**: "런닝 시작" 버튼 탭

```typescript
// Request: POST /api/v1/runs/sessions
{
  course_id: string | null;       // null이면 자유 런닝
  started_at: string;             // ISO 8601
  device_info: {
    platform: 'android' | 'ios';
    os_version: string;
    device_model: string;
    app_version: string;
  };
}

// Response: 201 Created
{
  session_id: string;             // 이후 모든 청크가 이 ID를 참조
  created_at: string;
}
```

**실패 대응**: 네트워크 없으면 로컬에 session_id를 UUID로 자체 생성. 네트워크 복구 시 서버에 세션 등록.

---

### 5-2. 런닝 진행 중 - 로컬 청크 저장
**시점**: 매 1km 도달 또는 5분 경과 (둘 중 먼저 도달하는 시점)

```typescript
// 로컬 스토리지에 청크 단위로 저장
// 저장 위치: {앱 내부 저장소}/run_sessions/{session_id}/chunk_{sequence}.json

interface RunChunk {
  session_id: string;
  sequence: number;               // 0부터 순차 증가
  chunk_type: 'intermediate';     // 'intermediate' | 'final'

  // 이 청크 구간의 GPS 데이터
  raw_gps_points: {
    lat: number;
    lng: number;
    alt: number;
    speed: number;
    bearing: number;
    accuracy: number;
    timestamp: number;            // Unix timestamp (ms)
  }[];

  filtered_points: {
    lat: number;
    lng: number;
    alt: number;
    speed: number;
    bearing: number;
    timestamp: number;
    is_interpolated: boolean;     // dead reckoning 포인트 여부
  }[];

  // 이 청크 구간의 요약
  chunk_summary: {
    distance_meters: number;      // 이 구간 거리
    duration_seconds: number;     // 이 구간 시간
    avg_pace_seconds_per_km: number;
    elevation_change_meters: number;
    point_count: number;          // GPS 포인트 수
    start_timestamp: number;
    end_timestamp: number;
  };

  // 누적 요약 (이 청크 시점까지의 전체)
  cumulative: {
    total_distance_meters: number;
    total_duration_seconds: number;
    avg_pace_seconds_per_km: number;
  };

  // 스플릿 (이 청크에서 완성된 1km 구간이 있으면)
  completed_splits: {
    split_number: number;         // 1km, 2km, ...
    duration_seconds: number;
    pace_seconds_per_km: number;
    elevation_change_meters: number;
  }[];

  // 일시정지 구간 (이 청크 내에서 발생한 것만)
  pause_intervals: {
    paused_at: string;
    resumed_at: string;
  }[];

  // 메타데이터
  created_at: string;
  is_uploaded: boolean;           // 서버 전송 완료 여부
}
```

**로컬 저장이 핵심인 이유**:
- 청크가 로컬 파일에 쓰이는 순간 데이터는 안전
- 앱 크래시 시에도 이미 저장된 청크는 유실되지 않음
- 메모리에만 들고 있다가 한번에 쓰는 게 아닌, **1km/5분마다 디스크 플러시**

---

### 5-3. 런닝 진행 중 - 서버 백그라운드 동기화
**시점**: 로컬 청크 저장 직후, 백그라운드에서 비동기 전송

```typescript
// Request: POST /api/v1/runs/sessions/{session_id}/chunks
{
  session_id: string;
  sequence: number;
  chunk_type: 'intermediate';
  raw_gps_points: RawGPSPoint[];   // 원시 데이터
  chunk_summary: ChunkSummary;     // 구간 요약
  cumulative: CumulativeSummary;   // 누적 요약
  completed_splits: Split[];       // 완성된 스플릿
  pause_intervals: PauseInterval[];
}

// Response: 201 Created
{
  chunk_id: string;
  sequence: number;
  received_at: string;
}
```

**전송 정책**:
- 네트워크 가용 시에만 전송. 없으면 큐에 쌓아두고 나중에 전송
- 전송 실패 시 다음 청크 전송 시 함께 재시도 (배치)
- **런닝 성능에 절대 영향 주지 않음** - 별도 스레드, 저우선순위
- WiFi가 아닌 셀룰러에서도 전송 (청크 1개 ≈ 5~15KB로 작음)

**배터리 영향 최소화**:
- 네트워크 전송은 5분 1회, 1건당 5~15KB → 무시할 수 있는 수준
- GPS 수집(연속) 대비 네트워크 전송(간헐적 소량)은 배터리에 미미

---

### 5-4. 런닝 종료
**시점**: "런닝 종료" 버튼 탭

2단계로 나눠서 전송:

**Step 1: 마지막 청크 전송**

```typescript
// Request: POST /api/v1/runs/sessions/{session_id}/chunks
{
  session_id: string;
  sequence: number;               // 마지막 시퀀스
  chunk_type: 'final';            // 마지막 청크 표시
  raw_gps_points: RawGPSPoint[];
  chunk_summary: ChunkSummary;
  cumulative: CumulativeSummary;
  completed_splits: Split[];
  pause_intervals: PauseInterval[];
}
```

**Step 2: 세션 완료 + 최종 요약 전송**

```typescript
// Request: POST /api/v1/runs/sessions/{session_id}/complete
{
  // 최종 기록 요약
  distance_meters: number;
  duration_seconds: number;          // 순수 런닝 시간 (일시정지 제외)
  total_elapsed_seconds: number;     // 전체 경과 시간 (일시정지 포함)
  avg_pace_seconds_per_km: number;
  best_pace_seconds_per_km: number;
  avg_speed_ms: number;
  max_speed_ms: number;
  calories: number | null;
  finished_at: string;

  // 최종 필터링 경로 (RTS 후처리 적용된 최종본)
  route_geometry: {
    type: 'LineString';
    coordinates: [number, number, number][];  // [lng, lat, alt]
  };

  // 고도 데이터
  elevation_gain_meters: number;
  elevation_loss_meters: number;
  elevation_profile: number[];       // 100m 간격 샘플

  // 전체 스플릿 (1km 단위)
  splits: {
    split_number: number;
    distance_meters: number;
    duration_seconds: number;
    pace_seconds_per_km: number;
    elevation_change_meters: number;
  }[];

  // 전체 일시정지 구간
  pause_intervals: {
    paused_at: string;
    resumed_at: string;
  }[];

  // 코스 런닝 시 완주 판정 (클라이언트에서 간이 계산, 서버에서 최종 확정)
  course_completion?: {
    is_completed: boolean;
    max_deviation_meters: number;
    deviation_points: number;        // 이탈 포인트 수
    route_match_percent: number;     // 0~100
    // 서버가 PostGIS로 최종 판정 시 곡선 구간은 임계값 완화 적용
    // 직선 구간: 50m 초과 = 이탈
    // 곡선 구간: 60m 초과 = 이탈 (GPS가 곡선 안쪽으로 깎이는 오차 보정)
  };

  // 필터 설정 (재현성)
  filter_config: {
    kalman_q: number;
    kalman_r_base: number;
    outlier_speed_threshold: number;
    outlier_accuracy_threshold: number;
  };

  // 미전송 청크 번호 목록 (서버가 빠진 청크를 알 수 있도록)
  total_chunks: number;
  uploaded_chunk_sequences: number[];
}

// Response: 201 Created
interface RunCompleteResponse {
  run_record_id: string;           // 생성된 최종 런 기록 ID

  // 코스 런닝이고 완주 시 랭킹 정보
  ranking?: {
    rank: number;
    total_runners: number;
    is_personal_best: boolean;
    previous_best_duration?: number;
  };

  // 개인 통계 업데이트
  user_stats_update: {
    total_distance_meters: number;
    total_runs: number;
    streak_days: number;
  };

  // 서버가 못 받은 청크 (클라이언트가 재전송 필요)
  missing_chunk_sequences: number[];
}
```

---

### 5-5. 미전송 청크 복구
**시점**: 런닝 완료 응답에서 `missing_chunk_sequences`가 있을 때, 또는 앱 재시작 시

```typescript
// 로컬에 남아있는 미전송 청크를 배치로 전송
// Request: POST /api/v1/runs/sessions/{session_id}/chunks/batch
{
  session_id: string;
  chunks: RunChunk[];              // 미전송 청크 배열
}

// Response: 200 OK
{
  received_sequences: number[];
  failed_sequences: number[];      // 실패한 것은 재시도
}
```

---

### 5-6. 앱 크래시/강제 종료 복구
**시점**: 앱 재시작 시 미완료 세션이 로컬에 있는 경우

```typescript
// 앱 시작 시 체크:
// 1. 로컬에 is_completed=false인 세션이 있는지 확인
// 2. 있으면 사용자에게 복구 여부 물어봄
//    "이전 런닝 기록이 있습니다. 저장하시겠습니까?"

// Case 1: 복구 저장 → 마지막 청크까지의 데이터로 런 기록 생성
// Request: POST /api/v1/runs/sessions/{session_id}/recover
{
  finished_at: string;             // 마지막 청크의 end_timestamp 사용
  total_chunks: number;
  uploaded_chunk_sequences: number[];
  // 서버가 보유한 청크들로 경로/거리/시간을 재계산
}

// Response:
{
  run_record_id: string;
  recovered_distance_meters: number;
  recovered_duration_seconds: number;
  missing_chunk_sequences: number[];  // 로컬에서 추가 전송 필요
}

// Case 2: 폐기 → 로컬 청크 파일 삭제
// Request: DELETE /api/v1/runs/sessions/{session_id}
```

---

### 데이터 흐름 정리

```
시간축 →

0km        1km        2km        3km        ...     종료
 |          |          |          |                   |
 ├─시작─┐   ├─청크0──┐  ├─청크1──┐  ├─청크2──┐        ├─최종─┐
 │서버:  │   │로컬저장│  │로컬저장│  │로컬저장│        │완료  │
 │세션   │   │서버동기│  │서버동기│  │서버동기│        │요약  │
 │생성   │   │(비동기)│  │(비동기)│  │(비동기)│        │전송  │
 └──────┘   └───────┘  └───────┘  └───────┘        └────┘

 ~0.5KB     ~5-15KB    ~5-15KB    ~5-15KB           ~5KB
            (원시GPS    (원시GPS    (원시GPS         (요약만,
             포함)       포함)       포함)           GPS없음)
```

| 구분 | 크기 | 빈도 | 실패 시 |
|------|------|------|--------|
| 세션 생성 | ~0.5KB | 런닝 시작 1회 | 로컬 UUID 자체 생성 |
| 중간 청크 | 5~15KB | 1km 또는 5분마다 | 로컬에 보관, 나중에 재전송 |
| 최종 요약 | ~5KB | 런닝 종료 1회 | 로컬에 보관, 재시도 |
| 미전송 복구 | 가변 | 앱 재시작 시 | 재시도 큐 |

**기존 방식 대비 개선**:
- ~~종료 시 50~200KB 한번에~~ → 5~15KB씩 나눠서, 종료 시에는 5KB 요약만
- ~~크래시 시 전체 유실~~ → 마지막 청크 시점까지 100% 복구
- ~~마라톤 4시간 = 수MB 일괄~~ → 40~50개 청크로 분산, 대부분 이미 서버에 있음

---

## 6. 코스 등록

### 6-1. 런닝 기록을 코스로 등록
**시점**: 런닝 결과 화면에서 "코스로 등록" 버튼 탭

```typescript
// Request: POST /api/v1/courses
{
  run_record_id: string;            // creator_id는 JWT에서 추출          // 원본 런 기록 ID (경로 참조)
  title: string;                  // 코스 이름 (2~30자)
  description?: string;           // 코스 설명 (최대 500자)
  route_geometry: GeoJSON.LineString;  // 필터링된 경로
  distance_meters: number;
  estimated_duration_seconds: number;
  elevation_gain_meters: number;
  elevation_profile: number[];
  is_public: boolean;             // 공개 여부
  tags?: string[];                // 태그 (예: "한강", "야경", "평지")
}

// Response: 201 Created
interface CourseCreateResponse {
  id: string;
  title: string;
  distance_meters: number;
  thumbnail_url: string;          // 서버에서 경로 기반 자동 생성
  share_url: string;              // 딥링크 공유 URL
  created_at: string;
}
```

### 6-2. 코스 썸네일 (서버 사이드 자동 생성)
**시점**: 코스 등록 직후, 서버에서 비동기 처리

```
서버가 route_geometry를 기반으로 지도 스냅샷 이미지를 생성하여
S3 스토리지에 저장하고 thumbnail_url을 업데이트한다.
FastAPI BackgroundTasks로 비동기 처리.
(성장기에는 Celery task로 전환)
```

---

## 7. 랭킹

### 7-1. 코스별 전체 랭킹
**시점**: 코스 상세 → 랭킹 탭, 또는 랭킹 더보기

```typescript
// Request: GET /api/v1/courses/{courseId}/rankings?page=0&per_page=20

// Response:
interface RankingListResponse {
  data: {
    rank: number;
    user: {
      id: string;
      nickname: string;
      avatar_url: string | null;
    };
    best_duration_seconds: number;
    best_pace_seconds_per_km: number;
    run_count: number;              // 이 코스를 달린 횟수
    achieved_at: string;
  }[];
  my_ranking: {                     // 내 순위 (항상 포함)
    rank: number;
    best_duration_seconds: number;
    best_pace_seconds_per_km: number;
  } | null;                         // 달린 적 없으면 null
  total_runners: number;
}
```

### 7-2. 내 순위 조회 (빠른 조회)
**시점**: 코스 상세 화면 상단에 내 순위 표시

```typescript
// Request: GET /api/v1/courses/{courseId}/my-ranking

// Response:
{
  rank: number | null;              // null이면 기록 없음
  best_duration_seconds: number | null;
  total_runners: number;
  percentile: number | null;        // 상위 몇 % (예: 15.3)
}
```

---

## 8. 마이페이지

### 8-1. 개인 통계 대시보드
**시점**: 마이페이지 탭 진입

```typescript
// Request: GET /api/v1/users/me/stats?period=month
// period: 'all' | 'week' | 'month' | 'year'

// Response:
interface UserStats {
  // 기간별 요약
  total_distance_meters: number;
  total_duration_seconds: number;
  total_runs: number;
  avg_pace_seconds_per_km: number | null;
  avg_distance_per_run_meters: number;
  best_pace_seconds_per_km: number | null;
  longest_run_meters: number;
  total_elevation_gain_meters: number;
  estimated_calories: number;

  // 연속 기록
  current_streak_days: number;
  best_streak_days: number;

  // 코스 관련
  courses_created: number;
  courses_completed: number;         // 완주한 코스 종류 수
  total_course_runs: number;
  ranking_top10_count: number;       // 10위 안에 든 코스 수

  // 월간 거리 추이 (최근 6개월)
  monthly_distance: {
    month: string;                   // "2026-01"
    distance_meters: number;
    run_count: number;
  }[];
}
```

### 8-2. 런 히스토리
**시점**: 마이페이지 → 런 히스토리, 스크롤 페이지네이션

```typescript
// Request: GET /api/v1/users/me/runs?page=0&per_page=20&order_by=finished_at&order=desc

// Response:
interface RunHistoryResponse {
  data: {
    id: string;
    distance_meters: number;
    duration_seconds: number;
    avg_pace_seconds_per_km: number;
    elevation_gain_meters: number;
    started_at: string;
    finished_at: string;
    course: {
      id: string;
      title: string;
    } | null;
  }[];
  total_count: number;
  has_next: boolean;
}
```

### 8-3. 런 기록 상세
**시점**: 런 히스토리에서 개별 기록 탭

```typescript
// Request: GET /api/v1/runs/{runId}

// Response:
interface RunRecordDetail {
  id: string;
  user_id: string;
  course_id: string | null;
  distance_meters: number;
  duration_seconds: number;
  total_elapsed_seconds: number;
  avg_pace_seconds_per_km: number;
  best_pace_seconds_per_km: number;
  avg_speed_ms: number;
  max_speed_ms: number;
  calories: number | null;
  elevation_gain_meters: number;
  elevation_loss_meters: number;
  route_geometry: GeoJSON.LineString;
  elevation_profile: number[];
  splits: {
    distance_meters: number;
    duration_seconds: number;
    pace_seconds_per_km: number;
    elevation_change_meters: number;
  }[];
  started_at: string;
  finished_at: string;
  course: {
    id: string;
    title: string;
    distance_meters: number;
  } | null;

  // 코스 런닝인 경우
  course_completion?: {
    is_completed: boolean;
    route_match_percent: number;
    ranking_at_time: number;        // 기록 당시 순위
  };
}
```

---

## 9. 프로필 관리

### 9-1. 프로필 수정
**시점**: 마이페이지 → 프로필 편집 → 저장

```typescript
// Request: PATCH /api/v1/users/me/profile
{
  nickname?: string;
  avatar_url?: string;
}

// Response: 200 OK
{ id: string; nickname: string; avatar_url: string | null; }
```

### 9-2. 프로필 사진 업로드
**시점**: 프로필 편집에서 사진 선택

```typescript
// Request: POST /api/v1/uploads/avatar
// Content-Type: multipart/form-data
// Body: file (image/jpeg, image/png, max 5MB)

// Response: 200 OK
{
  url: string;            // 업로드된 이미지의 public URL (S3)
}
// → 이 URL을 프로필 수정 API에 avatar_url로 전달
```

---

## 10. 코스 관리 (내가 만든 코스)

### 10-1. 내 코스 목록
**시점**: 마이페이지 → 내 코스

```typescript
// Request: GET /api/v1/users/me/courses

// Response:
{
  id: string;
  title: string;
  distance_meters: number;
  thumbnail_url: string | null;
  is_public: boolean;
  created_at: string;
  stats: {
    total_runs: number;
    unique_runners: number;
    avg_pace_seconds_per_km: number | null;
  };
}[]
```

### 10-2. 코스 수정
**시점**: 내 코스 → 편집

```typescript
// Request: PATCH /api/v1/courses/{courseId}
{
  title?: string;
  description?: string;
  is_public?: boolean;
  tags?: string[];
}

// Response: 200 OK
```

### 10-3. 코스 삭제
**시점**: 내 코스 → 삭제

```typescript
// Request: DELETE /api/v1/courses/{courseId}
// Response: 204 No Content
// 서버에서 JWT의 user_id와 코스 creator_id 일치 확인
// 관련 run_records의 course_id는 null로 변경 (런 기록은 유지)
```

---

## 통신 타이밍 요약

| 시점 | 방향 | 데이터 크기 | 빈도 |
|------|------|-----------|------|
| 앱 시작 | ← 서버 | ~1KB | 앱 실행마다 |
| 홈 로드 | ← 서버 | ~5KB | 탭 진입마다 |
| 코스 목록 | ← 서버 | ~10KB/페이지 | 스크롤마다 |
| 코스 상세 | ← 서버 | ~20KB (경로 포함) | 코스 탭마다 |
| 런닝 시작 | → 서버 | ~0.5KB | 런닝 시작 1회 |
| **런닝 중 청크** | **→ 서버** | **5~15KB** | **1km 또는 5분마다** |
| 런닝 종료 | → 서버 | ~5KB (요약만) | 런닝 종료 1회 |
| 미전송 복구 | → 서버 | 가변 | 앱 재시작 시 |
| 코스 등록 | → 서버 | ~30KB | 코스 등록 시 |
| 랭킹 조회 | ← 서버 | ~3KB | 랭킹 조회마다 |

---

## 에러 응답 공통 형식

```typescript
interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// 주요 에러 코드
// AUTH_EXPIRED          - 토큰 만료 → 자동 갱신 시도 → 실패 시 로그인 화면
// PERMISSION_DENIED     - 권한 없음 (남의 코스 수정 시도 등)
// NOT_FOUND             - 리소스 없음
// VALIDATION_ERROR      - 입력값 유효성 오류
// COURSE_NOT_COMPLETED  - 코스 완주 기준 미달 (이탈률 초과)
// DUPLICATE_NICKNAME    - 닉네임 중복
// RATE_LIMITED          - 요청 과다
// UPLOAD_TOO_LARGE      - 파일 크기 초과 (원시 GPS 데이터 등)
```

---

## 권한 체계 (FastAPI Dependency Injection)

```python
# 인증: JWT Bearer 토큰에서 user_id 추출
# FastAPI의 Depends()로 엔드포인트마다 주입

# 권한 규칙:
# - profiles: 본인만 수정 가능 (JWT user_id == profile.user_id), 모든 유저 조회 가능
# - courses: 생성자만 수정/삭제 (JWT user_id == course.creator_id), is_public=true인 것은 모두 조회
# - run_records: 본인만 생성, 본인 기록만 상세 조회, 랭킹용 집계 데이터는 공개
# - raw_gps_data: 본인만 생성/조회 (다른 유저 접근 불가)
# - rankings: 모든 유저 조회 가능, 서버 내부 로직만 수정 (BackgroundTasks)
# - course_stats: 모든 유저 조회 가능, 서버 내부 로직만 수정 (BackgroundTasks)
```

## FastAPI 백엔드 구조 (참고)

```
backend/
├── app/
│   ├── main.py                 # FastAPI 앱 진입점
│   ├── core/
│   │   ├── config.py           # 환경 설정 (DB URL, JWT 시크릿 등)
│   │   ├── security.py         # JWT 생성/검증, 소셜 로그인 처리
│   │   └── deps.py             # Depends: get_current_user, get_db
│   ├── api/v1/
│   │   ├── auth.py             # POST /auth/login, /auth/refresh
│   │   ├── users.py            # GET /users/me, PATCH /users/me/profile
│   │   ├── courses.py          # CRUD /courses, /courses/nearby, /courses/bounds
│   │   ├── runs.py             # /runs/sessions, /runs/sessions/{id}/chunks, /runs/{id}
│   │   ├── rankings.py         # GET /courses/{id}/rankings
│   │   └── uploads.py          # POST /uploads/avatar
│   ├── models/                 # SQLAlchemy ORM 모델
│   │   ├── user.py
│   │   ├── course.py
│   │   ├── run_record.py
│   │   ├── run_session.py
│   │   ├── run_chunk.py
│   │   └── ranking.py
│   ├── schemas/                # Pydantic 스키마 (요청/응답 타입)
│   ├── services/               # 비즈니스 로직
│   │   ├── auth_service.py
│   │   ├── course_service.py
│   │   ├── run_service.py
│   │   ├── ranking_service.py
│   │   └── stats_service.py
│   └── tasks/                  # BackgroundTasks (성장기: Celery)
│       ├── thumbnail.py        # 코스 썸네일 생성
│       ├── stats.py            # 통계 갱신
│       └── ranking.py          # 랭킹 재계산
├── alembic/                    # DB 마이그레이션
├── requirements.txt
└── Dockerfile
```
