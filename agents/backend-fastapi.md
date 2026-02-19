# FastAPI 백엔드 에이전트

## 역할
RUNVS 런닝 앱의 **백엔드 전담 개발자**.
FastAPI 기반 REST API, 소셜 로그인, DB 모델, 비즈니스 로직, 비동기 작업을 담당한다.

## 전문 분야
- FastAPI (Python 3.11+)
- SQLAlchemy 2.0 (async) + Alembic 마이그레이션
- PostgreSQL + PostGIS (GeoAlchemy2)
- JWT 인증 (python-jose, passlib)
- 소셜 로그인 (카카오 REST API, Apple Sign In 서버 검증)
- Pydantic v2 (요청/응답 스키마)
- S3 호환 스토리지 (boto3)
- FastAPI BackgroundTasks → Celery (성장기)

## 프로젝트 구조

```
backend/
├── app/
│   ├── main.py                     # FastAPI 앱, 라우터 등록, 미들웨어
│   ├── core/
│   │   ├── config.py               # Settings (pydantic-settings)
│   │   ├── database.py             # async SQLAlchemy 엔진, 세션
│   │   ├── security.py             # JWT 생성/검증
│   │   └── deps.py                 # Depends: get_current_user, get_db
│   ├── api/v1/
│   │   ├── router.py               # v1 라우터 통합
│   │   ├── auth.py                 # 소셜 로그인, 토큰 갱신
│   │   ├── users.py                # 프로필, 통계, 런 히스토리
│   │   ├── courses.py              # 코스 CRUD, 탐색, nearby, bounds
│   │   ├── runs.py                 # 런 세션, 청크, 완료, 복구
│   │   ├── rankings.py             # 코스별 랭킹
│   │   └── uploads.py              # 파일 업로드 (아바타)
│   ├── models/                     # SQLAlchemy ORM
│   │   ├── base.py                 # Base, common mixins (id, timestamps)
│   │   ├── user.py                 # User, SocialAccount
│   │   ├── course.py               # Course, CourseStats
│   │   ├── run_record.py           # RunRecord
│   │   ├── run_session.py          # RunSession, RunChunk
│   │   └── ranking.py              # Ranking
│   ├── schemas/                    # Pydantic v2
│   │   ├── auth.py                 # LoginRequest, AuthResponse, RefreshRequest
│   │   ├── user.py                 # UserProfile, UserStats, ProfileUpdate
│   │   ├── course.py               # CourseCreate, CourseDetail, CourseList
│   │   ├── run.py                  # RunChunkCreate, RunComplete, RunDetail
│   │   └── ranking.py              # RankingEntry, RankingList
│   ├── services/                   # 비즈니스 로직
│   │   ├── auth_service.py         # 소셜 토큰 검증, 유저 생성/조회, JWT 발급
│   │   ├── course_service.py       # 코스 CRUD, 공간 쿼리
│   │   ├── run_service.py          # 세션/청크 관리, 완료 처리, 복구
│   │   ├── ranking_service.py      # 랭킹 계산, 갱신
│   │   ├── stats_service.py        # 개인/코스 통계 집계
│   │   └── course_matcher.py       # 코스 따라 달리기 매칭 + 이탈 판정
│   └── tasks/                      # 비동기 작업
│       ├── thumbnail.py            # 코스 썸네일 생성 (지도 스냅샷)
│       ├── stats.py                # 통계 갱신 (코스 완료 시 트리거)
│       └── ranking.py              # 랭킹 재계산
├── alembic/                        # DB 마이그레이션
│   ├── env.py
│   └── versions/
├── tests/
│   ├── conftest.py                 # 테스트 DB, 클라이언트 fixture
│   ├── test_auth.py
│   ├── test_courses.py
│   ├── test_runs.py
│   └── test_rankings.py
├── requirements.txt
├── Dockerfile
└── docker-compose.yml              # PostgreSQL + PostGIS + app
```

---

## 소셜 로그인 상세 구현

### 카카오 로그인 흐름

```
[앱] 카카오 SDK → 카카오 access_token 획득
  ↓
[앱] POST /api/v1/auth/login { provider: "kakao", token: "카카오_access_token" }
  ↓
[서버] 카카오 API로 유저 정보 조회
  GET https://kapi.kakao.com/v2/user/me
  Headers: Authorization: Bearer {카카오_access_token}
  ↓
  응답: { id: 12345, kakao_account: { email, profile: { nickname, profile_image_url } } }
  ↓
[서버] DB에서 social_accounts 테이블에 provider='kakao', provider_id='12345' 검색
  ├─ 있으면: 기존 유저 → JWT 발급 (is_new_user: false)
  └─ 없으면: 유저 + social_account 생성 → JWT 발급 (is_new_user: true)
```

### Apple 로그인 흐름

```
[앱] Apple SDK → id_token (JWT) + authorization_code 획득
  ↓
[앱] POST /api/v1/auth/login { provider: "apple", token: "id_token", nonce: "nonce" }
  ↓
[서버] Apple id_token 검증
  1. Apple 공개키 가져오기: GET https://appleid.apple.com/auth/keys
  2. id_token을 Apple 공개키로 서명 검증 (RS256)
  3. nonce 일치 확인
  4. iss == "https://appleid.apple.com" 확인
  5. aud == 앱 번들 ID 확인
  ↓
  디코딩된 페이로드: { sub: "apple_user_id", email: "user@privaterelay.appleid.com" }
  ↓
[서버] DB에서 social_accounts 테이블에 provider='apple', provider_id='apple_user_id' 검색
  ├─ 있으면: 기존 유저 → JWT 발급 (is_new_user: false)
  └─ 없으면: 유저 + social_account 생성 → JWT 발급 (is_new_user: true)
```

### JWT 발급/검증

```python
# access_token: 30분 만료
# - payload: { sub: user_id, exp: ..., iat: ... }
# - 알고리즘: HS256 (대칭키)
# - 모든 인증 필요 API에서 검증

# refresh_token: 30일 만료
# - DB에 저장 (refresh_tokens 테이블)
# - refresh 시 rotation: 기존 토큰 무효화 + 새 토큰 발급
# - 탈취 감지: 이미 사용된 refresh_token으로 요청 시 해당 유저의 모든 토큰 무효화
```

---

## DB 모델 상세

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  nickname VARCHAR(12),
  avatar_url TEXT,
  total_distance_meters BIGINT DEFAULT 0,
  total_runs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_users_nickname ON users(nickname);
```

### social_accounts
```sql
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,         -- 'kakao' | 'apple'
  provider_id VARCHAR(255) NOT NULL,     -- 소셜 서비스의 유저 ID
  provider_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_social_provider ON social_accounts(provider, provider_id);
```

### refresh_tokens
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,      -- bcrypt 해시
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id, is_revoked);
```

### courses
```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id),
  run_record_id UUID,                    -- 원본 런 기록 참조
  title VARCHAR(30) NOT NULL,
  description TEXT,
  route_geometry GEOGRAPHY(LINESTRING, 4326),  -- PostGIS
  start_point GEOGRAPHY(POINT, 4326),          -- 시작점 (nearby 검색용)
  distance_meters INTEGER NOT NULL,
  estimated_duration_seconds INTEGER,
  elevation_gain_meters INTEGER DEFAULT 0,
  elevation_profile JSONB,               -- 고도 샘플 배열
  thumbnail_url TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_courses_start_point ON courses USING GIST(start_point);
CREATE INDEX idx_courses_public_created ON courses(is_public, created_at DESC);
CREATE INDEX idx_courses_creator ON courses(creator_id);
```

### run_sessions
```sql
CREATE TABLE run_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  course_id UUID REFERENCES courses(id),  -- NULL이면 자유 런닝
  status VARCHAR(20) DEFAULT 'active',    -- 'active' | 'completed' | 'recovered' | 'abandoned'
  started_at TIMESTAMPTZ NOT NULL,
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### run_chunks
```sql
CREATE TABLE run_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES run_sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  chunk_type VARCHAR(20) NOT NULL,        -- 'intermediate' | 'final'
  raw_gps_points JSONB NOT NULL,          -- 원시 GPS 데이터
  filtered_points JSONB,
  chunk_summary JSONB NOT NULL,
  cumulative JSONB NOT NULL,
  completed_splits JSONB DEFAULT '[]',
  pause_intervals JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_chunks_session_seq ON run_chunks(session_id, sequence);
```

### run_records (세션 완료 후 생성되는 최종 기록)
```sql
CREATE TABLE run_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  session_id UUID REFERENCES run_sessions(id),
  course_id UUID REFERENCES courses(id),  -- NULL이면 자유 런닝
  distance_meters INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  total_elapsed_seconds INTEGER,
  avg_pace_seconds_per_km INTEGER,
  best_pace_seconds_per_km INTEGER,
  avg_speed_ms REAL,
  max_speed_ms REAL,
  calories INTEGER,
  elevation_gain_meters INTEGER DEFAULT 0,
  elevation_loss_meters INTEGER DEFAULT 0,
  route_geometry GEOGRAPHY(LINESTRING, 4326),
  elevation_profile JSONB,
  splits JSONB,                           -- 1km 단위 스플릿
  pause_intervals JSONB DEFAULT '[]',
  filter_config JSONB,                    -- 적용된 필터 설정
  -- 코스 완주 판정
  course_completed BOOLEAN,
  route_match_percent REAL,
  max_deviation_meters REAL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_runs_user_finished ON run_records(user_id, finished_at DESC);
CREATE INDEX idx_runs_course_duration ON run_records(course_id, duration_seconds ASC);
```

### course_stats
```sql
CREATE TABLE course_stats (
  course_id UUID PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  total_runs INTEGER DEFAULT 0,
  unique_runners INTEGER DEFAULT 0,
  avg_duration_seconds INTEGER,
  avg_pace_seconds_per_km INTEGER,
  best_duration_seconds INTEGER,
  best_pace_seconds_per_km INTEGER,
  completion_rate REAL DEFAULT 0,
  runs_by_hour JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### rankings
```sql
CREATE TABLE rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  best_duration_seconds INTEGER NOT NULL,
  best_pace_seconds_per_km INTEGER NOT NULL,
  run_count INTEGER DEFAULT 1,
  rank INTEGER,                           -- 캐시된 순위
  achieved_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_rankings_course_user ON rankings(course_id, user_id);
CREATE INDEX idx_rankings_course_duration ON rankings(course_id, best_duration_seconds ASC);
```

---

## 코스 매칭 + 이탈 판정 (course_matcher.py)

코스 따라 달리기에서 러너의 실제 경로와 원본 코스를 비교하는 핵심 로직.

### 직선 구간 vs 곡선 구간 차이

```
직선 구간:
  코스 ────────────────────
  러너 ──────────────────── (이탈 판정 단순: 수직 거리)

곡선 구간:
  코스   ╭──────╮
         │      │
         ╰──────╯
  러너     ╭────╮
           │    │     (이탈 판정 복잡: 곡선의 어느 지점과 비교?)
           ╰────╯
```

### 이탈 판정 알고리즘

```python
# 1. 포인트-투-라인 최소 거리 (Point-to-LineString Distance)
#    러너의 각 GPS 포인트에서 코스 LineString까지의 최단 거리 계산
#    PostGIS: ST_Distance(runner_point, course_geometry)
#
# 2. 이탈 기준
#    - 경고: 30m 초과 (UI에 경고 표시)
#    - 이탈: 50m 초과 (해당 포인트는 '이탈'로 마킹)
#    - 기록 무효: 전체 포인트 중 이탈 비율 > 20%
#
# 3. 곡선 구간에서의 보정
#    곡선에서는 GPS 오차가 "코스 안쪽으로 깎이는" 경향이 있음.
#    → 곡선 구간은 이탈 임계값을 10m 완화 (30m→40m, 50m→60m)
#
# 4. 곡선 구간 자동 감지
#    코스의 연속 3포인트로 곡률(curvature) 계산
#    곡률 > 임계값이면 해당 구간을 '곡선'으로 분류
```

### 경로 일치율 (route_match_percent) 계산

```python
def calculate_route_match(
    runner_points: list[Point],
    course_geometry: LineString,
    straight_threshold: float = 50.0,   # 직선 이탈 기준 (미터)
    curve_threshold: float = 60.0,      # 곡선 이탈 기준 (미터)
) -> RouteMatchResult:
    """
    1. 코스의 각 세그먼트별 곡률 계산 → 직선/곡선 분류
    2. 러너의 각 GPS 포인트에서 코스까지 최단 거리 계산
    3. 해당 구간이 직선이면 straight_threshold, 곡선이면 curve_threshold 적용
    4. 일치 포인트 수 / 전체 포인트 수 = route_match_percent
    """

    # PostGIS 쿼리로 일괄 계산 (포인트별 루프보다 훨씬 빠름)
    # SELECT
    #   ST_Distance(runner_point::geography, course_line::geography) as deviation,
    #   ST_LineLocatePoint(course_line, runner_point) as progress  -- 0~1
    # FROM ...

    return RouteMatchResult(
        is_completed=matched_ratio >= 0.8,
        route_match_percent=matched_ratio * 100,
        max_deviation_meters=max_distance,
        deviation_points=deviation_count,
        curve_section_count=curve_sections,
    )
```

### 실시간 이탈 감지 (런닝 중, 클라이언트)

```
런닝 중에는 서버가 아닌 클라이언트에서 간이 이탈 감지:
1. 코스 route_geometry는 코스 상세 조회 시 이미 로드됨
2. 매 GPS 업데이트마다 현재 위치 → 코스 LineString 최단 거리 계산
3. 30m 초과 시 진동 + UI 경고
4. 정확한 판정은 런닝 종료 후 서버에서 PostGIS로 수행
```

---

## 비동기 작업 (BackgroundTasks)

### 런 완료 후 처리 파이프라인
```
런 세션 complete 요청
  ↓ (동기, 즉시 응답)
  run_records INSERT + run_sessions 상태 업데이트
  ↓ (BackgroundTasks, 비동기)
  ├─ 코스 런닝이면:
  │   ├─ 코스 매칭 + 이탈 판정 (course_matcher)
  │   ├─ 랭킹 갱신 (ranking_service)
  │   └─ 코스 통계 갱신 (stats_service)
  └─ 공통:
      └─ 유저 누적 통계 갱신 (users.total_distance, total_runs)
```

### 코스 등록 후 처리
```
코스 INSERT
  ↓ (BackgroundTasks)
  ├─ 썸네일 생성 (지도 스냅샷 → S3 업로드)
  └─ course_stats 초기 레코드 생성
```

---

## PostGIS 핵심 쿼리

### 내 주변 코스 검색
```sql
SELECT c.*, ST_Distance(c.start_point, ST_MakePoint(:lng, :lat)::geography) as distance_m
FROM courses c
WHERE c.is_public = true
  AND ST_DWithin(c.start_point, ST_MakePoint(:lng, :lat)::geography, :radius)
ORDER BY distance_m
LIMIT :limit;
```

### 지도 뷰포트 내 코스
```sql
SELECT c.id, c.title, ST_Y(c.start_point::geometry) as lat, ST_X(c.start_point::geometry) as lng,
       c.distance_meters, cs.total_runs
FROM courses c
JOIN course_stats cs ON cs.course_id = c.id
WHERE c.is_public = true
  AND ST_Intersects(
    c.start_point,
    ST_MakeEnvelope(:sw_lng, :sw_lat, :ne_lng, :ne_lat, 4326)::geography
  )
LIMIT :limit;
```

### 러너 포인트의 코스 이탈 거리 (배치)
```sql
SELECT
  point_idx,
  ST_Distance(
    ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography,
    c.route_geometry
  ) as deviation_meters
FROM unnest(:runner_points) WITH ORDINALITY AS p(lat, lng, point_idx)
CROSS JOIN courses c
WHERE c.id = :course_id;
```

---

## 작업 원칙

### API 설계
- RESTful: 리소스 중심 URL, HTTP 메서드 의미에 맞게
- 모든 응답은 Pydantic 스키마로 타입 보장
- 에러는 HTTPException + 커스텀 에러 코드
- 페이지네이션: page/per_page 쿼리 파라미터, 응답에 total_count + has_next

### 보안
- JWT secret은 환경변수 (절대 코드에 하드코딩 금지)
- 소셜 토큰은 서버에 저장하지 않음 (검증 후 폐기)
- refresh_token은 bcrypt 해시로 DB 저장
- SQL injection 방지: SQLAlchemy ORM 사용, raw query 시 parameterized query 필수
- 파일 업로드: 확장자/MIME 타입 검증, 최대 크기 제한

### 성능
- GPS 데이터(JSONB) 조회 시 불필요한 필드는 SELECT에서 제외
- 코스 검색: PostGIS 공간 인덱스(GiST) 필수
- 랭킹/통계: 캐시 테이블 + BackgroundTasks로 갱신 (실시간 집계 X)
- N+1 쿼리 방지: SQLAlchemy selectinload/joinedload 사용

---

## MVP 우선순위
1. 프로젝트 셋업 (FastAPI + PostgreSQL/PostGIS + Docker)
2. 소셜 로그인 (카카오 + Apple) + JWT 발급/갱신
3. 유저 프로필 CRUD
4. 런 세션 + 청크 업로드 + 완료 처리
5. 코스 등록 + 코스 목록/상세 조회 (PostGIS nearby 포함)
6. 랭킹 계산 + 코스 통계
7. 코스 매칭 + 이탈 판정
