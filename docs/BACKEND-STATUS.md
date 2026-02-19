# RUNVS Backend — 현황 및 잔여 작업

최종 업데이트: 2026-02-19

---

## 1. 현재 상태 요약

| 항목 | 상태 |
|------|------|
| 전체 완성도 | **~85%** (MVP 배포 가능) |
| API 엔드포인트 | 18개 모듈, 60+ 엔드포인트 |
| DB 모델 | 16개 ORM 모델 |
| 마이그레이션 | 13개 (0001 ~ 0013) |
| 서비스 클래스 | 15개 |
| 백그라운드 태스크 | 4개 (썸네일, 통계, 랭킹, Strava) |
| 코드 라인 수 | ~9,000+ (backend 전체) |

---

## 2. 완료된 기능 목록

### 인증 & 보안
- [x] 소셜 로그인: 카카오, Apple, Google, Naver
- [x] JWT 인증 (Access Token 30분 + Refresh Token 30일)
- [x] Refresh Token Rotation (재사용 감지 → 전체 토큰 무효화)
- [x] Rate Limiting (전체 100/min, 인증 10/min)
- [x] CORS 설정 (환경변수로 관리)
- [x] 개발용 Dev Login (이메일 기반 바이패스)

### 러닝 코스
- [x] 코스 CRUD (생성/조회/수정/삭제)
- [x] 코스 목록 (페이지네이션 + 검색 + 정렬 + 거리 필터)
- [x] 근처 코스 검색 (PostGIS 공간 쿼리)
- [x] Viewport 바운드 쿼리 (지도 이동 시)
- [x] 코스 통계 자동 업데이트 (참여자 수, 평균 페이스, 완주율)
- [x] 코스 썸네일 자동 생성 (Mapbox Static API)
- [x] 난이도 자동 계산
- [x] 공개/비공개 설정

### GPS 트래킹 & 런닝 기록
- [x] 런닝 세션 생성/종료
- [x] 청크 기반 GPS 업로드 (1km/5분 단위)
- [x] 일괄 업로드 (배치)
- [x] 앱 크래시 복구 (미완료 세션 이어하기)
- [x] 완료 기록 생성 (경로 geometry, 고도 프로필, 스플릿)
- [x] 코스 완주 감지 (경로 매칭 알고리즘)
- [x] 기록 삭제

### 랭킹 & 리더보드
- [x] 코스별 랭킹 (페이스/시간 기준)
- [x] 개인 최고 기록 추적
- [x] 랭킹 자동 재계산 (백그라운드)

### 소셜 기능
- [x] 팔로우/언팔로우
- [x] 팔로워/팔로잉 목록 (페이지네이션)
- [x] 친구 활동 피드
- [x] 소셜 카운트 (팔로워 수, 팔로잉 수, 코스 수)
- [x] 공개 프로필 조회

### 코스 리뷰
- [x] 리뷰 작성 (1~5 별점 + 텍스트)
- [x] 리뷰 목록 (페이지네이션)
- [x] 리뷰 수정/삭제
- [x] 코스 생성자 답글

### 좋아요 & 즐겨찾기
- [x] 코스 좋아요 토글
- [x] 코스 즐겨찾기 토글
- [x] 즐겨찾기 목록

### 이벤트 (그룹 챌린지)
- [x] 이벤트 생성/조회
- [x] 참가/탈퇴
- [x] 진행률 추적 (거리/횟수)
- [x] 지도 마커 (공간 쿼리)

### 파일 Import
- [x] GPX 파일 업로드 및 파싱
- [x] FIT 파일 (Garmin) 업로드 및 파싱
- [x] 백그라운드 처리 + 상태 추적
- [x] 자동 코스 매칭

### Strava 연동
- [x] OAuth 인증 URL 생성
- [x] 콜백 처리 → 토큰 저장
- [x] 토큰 자동 갱신 (6시간 만료)
- [x] 연결 시 최근 기록 자동 동기화
- [x] 수동 전체 동기화 (최대 200개)
- [x] 연결 해제
- [x] 중복 import 방지

### 푸시 알림
- [x] Firebase Cloud Messaging (FCM) 연동
- [x] 디바이스 토큰 등록/해제
- [x] 멀티 디바이스 지원
- [x] 유효하지 않은 토큰 자동 제거

### 날씨 & 히트맵
- [x] 현재 날씨 + 대기질 (OpenWeatherMap)
- [x] 한국어 날씨 설명
- [x] API 키 미설정 시 Mock 데이터 폴백
- [x] Viewport 기반 히트맵 (PostGIS 그리드 집계)

### 인프라
- [x] Docker + docker-compose (PostGIS 16)
- [x] 환경변수 관리 (.env.example 전체 문서화)
- [x] S3 파일 스토리지 + CDN URL 리라이트
- [x] 구조화 로깅 (JSON 모드 for 프로덕션)
- [x] Sentry 에러 추적
- [x] Health Check 엔드포인트 (`/health`)
- [x] DB 인덱스 최적화 (20개)
- [x] 아바타 이미지 업로드 (JPEG/PNG/WebP, 5MB)

---

## 3. API 엔드포인트 전체 목록

### 인증 (`/api/v1/auth`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/auth/login` | 소셜 로그인 (kakao/apple/google/naver) |
| POST | `/auth/refresh` | Access Token 갱신 |
| POST | `/auth/dev-login` | 개발용 이메일 로그인 (__DEV__ only) |

### 사용자 (`/api/v1/users`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/users/me` | 내 프로필 |
| POST | `/users/me/profile` | 초기 프로필 설정 |
| PATCH | `/users/me/profile` | 프로필 수정 |
| GET | `/users/me/stats` | 누적 통계 |
| GET | `/users/me/stats/weekly` | 주간 통계 |
| GET | `/users/me/runs` | 내 달리기 기록 |
| GET | `/users/me/courses` | 내 코스 목록 |
| GET | `/users/{id}` | 공개 프로필 |
| GET | `/users/{id}/social-counts` | 소셜 카운트 |

### 코스 (`/api/v1/courses`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/courses` | 코스 생성 |
| GET | `/courses` | 코스 목록 (페이지네이션/검색/필터/정렬) |
| GET | `/courses/nearby` | 근처 코스 (PostGIS) |
| GET | `/courses/bounds` | Viewport 내 코스 |
| GET | `/courses/{id}` | 코스 상세 |
| PATCH | `/courses/{id}` | 코스 수정 |
| DELETE | `/courses/{id}` | 코스 삭제 |
| GET | `/courses/{id}/stats` | 코스 통계 |

### 달리기 (`/api/v1/runs`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/runs/sessions` | 세션 시작 |
| POST | `/runs/sessions/{id}/chunks` | GPS 청크 업로드 |
| POST | `/runs/sessions/{id}/chunks/batch` | 청크 일괄 업로드 |
| POST | `/runs/sessions/{id}/complete` | 세션 완료 → 기록 생성 |
| GET | `/runs/sessions/recover` | 미완료 세션 복구 |
| GET | `/runs/{id}` | 기록 상세 |
| DELETE | `/runs/{id}` | 기록 삭제 |

### 랭킹 (`/api/v1/rankings`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/rankings/courses/{id}` | 코스별 리더보드 |
| GET | `/rankings/me` | 내 랭킹 목록 |
| GET | `/rankings/courses/{id}/me` | 특정 코스 내 랭킹 |

### 리뷰 (`/api/v1/reviews`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/reviews/courses/{id}` | 리뷰 작성 |
| GET | `/reviews/courses/{id}` | 리뷰 목록 |
| PATCH | `/reviews/{id}` | 리뷰 수정 |
| DELETE | `/reviews/{id}` | 리뷰 삭제 |
| POST | `/reviews/{id}/reply` | 생성자 답글 |

### 팔로우 (`/api/v1/follows`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/follows/{id}` | 팔로우 |
| DELETE | `/follows/{id}` | 언팔로우 |
| GET | `/follows/followers` | 팔로워 목록 |
| GET | `/follows/following` | 팔로잉 목록 |
| GET | `/follows/feed` | 친구 활동 피드 |

### 좋아요 (`/api/v1/likes`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/likes/courses/{id}/toggle` | 좋아요 토글 |
| GET | `/likes/courses/{id}` | 좋아요 상태 |

### 즐겨찾기 (`/api/v1/favorites`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/favorites/courses/{id}/toggle` | 즐겨찾기 토글 |
| GET | `/favorites` | 즐겨찾기 목록 |
| GET | `/favorites/courses/{id}` | 즐겨찾기 상태 |

### 이벤트 (`/api/v1/events`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/events` | 이벤트 목록 |
| GET | `/events/markers` | 지도 마커 |
| GET | `/events/{id}` | 이벤트 상세 |
| POST | `/events/{id}/join` | 참가 |
| DELETE | `/events/{id}/leave` | 탈퇴 |

### Import (`/api/v1/imports`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/imports/gpx` | GPX 파일 업로드 |
| POST | `/imports/fit` | FIT 파일 업로드 |
| GET | `/imports/{id}/status` | 처리 상태 확인 |
| GET | `/imports` | Import 기록 목록 |

### Strava (`/api/v1/strava`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/strava/auth-url` | OAuth 인증 URL |
| POST | `/strava/callback` | 콜백 처리 + 자동 동기화 |
| POST | `/strava/sync-all` | 전체 동기화 |
| GET | `/strava/status` | 연결 상태 |
| DELETE | `/strava/disconnect` | 연결 해제 |

### 알림 (`/api/v1/notifications`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/notifications/token` | 디바이스 토큰 등록 |
| DELETE | `/notifications/token` | 디바이스 토큰 해제 |

### 날씨 (`/api/v1/weather`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/weather` | 현재 날씨 + 대기질 |

### 히트맵 (`/api/v1/heatmap`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/heatmap` | Viewport 내 히트맵 데이터 |

### 파일 (`/api/v1/uploads`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/uploads/avatar` | 아바타 이미지 업로드 |

### 헬스체크
| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 서버 상태 확인 |

---

## 4. DB 스키마 (16개 모델)

```
users ─────────────────────── 사용자 프로필
├── social_accounts          소셜 계정 연동 (1:N)
├── refresh_tokens           JWT 리프레시 토큰 (1:N)
├── device_tokens            FCM 푸시 토큰 (1:N)
├── strava_connections       Strava 연동 (1:1)
├── courses                  생성한 코스 (1:N)
│   ├── course_stats         코스 통계 (1:1)
│   ├── rankings             랭킹 (1:N)
│   ├── reviews              리뷰 (1:N)
│   ├── course_likes         좋아요 (1:N)
│   └── course_favorites     즐겨찾기 (1:N)
├── run_records              달리기 기록 (1:N)
├── run_sessions             진행중 세션 (1:N)
│   └── run_chunks           GPS 청크 (1:N)
├── follows                  팔로우 관계 (N:M)
├── events                   이벤트 (1:N)
│   └── event_participants   참가자 (1:N)
└── external_imports         외부 Import 기록 (1:N)
```

---

## 5. 환경변수 목록

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `DATABASE_URL` | O | PostgreSQL+asyncpg 연결 문자열 |
| `JWT_SECRET_KEY` | O | JWT 서명 시크릿 (**프로덕션 반드시 변경**) |
| `KAKAO_CLIENT_ID` | 카카오 로그인 시 | 카카오 REST API 키 |
| `APPLE_BUNDLE_ID` | Apple 로그인 시 | iOS 앱 번들 ID |
| `APPLE_TEAM_ID` | Apple 로그인 시 | Apple Developer Team ID |
| `GOOGLE_CLIENT_ID` | Google 로그인 시 | Google OAuth Client ID |
| `NAVER_CLIENT_ID` | 네이버 로그인 시 | 네이버 Client ID |
| `NAVER_CLIENT_SECRET` | 네이버 로그인 시 | 네이버 Client Secret |
| `STRAVA_CLIENT_ID` | Strava 연동 시 | Strava API Application ID |
| `STRAVA_CLIENT_SECRET` | Strava 연동 시 | Strava Client Secret |
| `STRAVA_REDIRECT_URI` | Strava 연동 시 | OAuth 콜백 URL |
| `OPENWEATHER_API_KEY` | 날씨 기능 시 | OpenWeatherMap API 키 |
| `MAPBOX_ACCESS_TOKEN` | 썸네일 생성 시 | Mapbox Public Token |
| `S3_BUCKET_NAME` | S3 사용 시 | AWS S3 버킷명 |
| `S3_REGION` | S3 사용 시 | AWS 리전 (기본: ap-northeast-2) |
| `AWS_ACCESS_KEY_ID` | S3 사용 시 | AWS 키 |
| `AWS_SECRET_ACCESS_KEY` | S3 사용 시 | AWS 시크릿 |
| `CDN_BASE_URL` | CDN 사용 시 | CDN 도메인 (예: https://cdn.runcrew.app) |
| `FCM_SERVICE_ACCOUNT_PATH` | 푸시 알림 시 | Firebase 서비스 계정 JSON 경로 |
| `SENTRY_DSN` | 에러 추적 시 | Sentry DSN |
| `JSON_LOGS` | 프로덕션 | true면 JSON 로깅 |
| `CORS_ORIGINS` | O | 허용 Origin 목록 (JSON 배열) |

---

## 6. 앞으로 해야 할 작업

### 필수 (배포 전)

| # | 작업 | 우선순위 | 예상 작업량 | 설명 |
|---|------|---------|-----------|------|
| 1 | **JWT_SECRET_KEY 교체** | 긴급 | 5분 | 프로덕션용 강력한 랜덤 키 생성 |
| 2 | **alembic upgrade head** | 긴급 | 5분 | DB에 마이그레이션 적용 |
| 3 | **유저 계정 삭제 API** | 높음 | 2시간 | `DELETE /users/me` + 연관 데이터 Cascade 삭제. 앱스토어 심사 필수 요구사항 |
| 4 | **알림 발송 트리거 연결** | 높음 | 3시간 | 현재 토큰 등록만 됨. 실제 이벤트(팔로우, 코스 좋아요, 랭킹 변동 등)에서 `send_to_user` 호출 추가 |
| 5 | **OAuth 키 발급 & 설정** | 높음 | 1시간 | 카카오/Apple/Google/Naver 각 서비스 콘솔에서 실제 키 발급 후 .env에 입력 |
| 6 | **프로덕션 CORS 설정** | 높음 | 5분 | `CORS_ORIGINS`에 실제 도메인 추가 |
| 7 | **HTTPS 설정** | 높음 | 1시간 | Nginx/Caddy reverse proxy + SSL 인증서 (Let's Encrypt) |

### 권장 (베타 전)

| # | 작업 | 우선순위 | 예상 작업량 | 설명 |
|---|------|---------|-----------|------|
| 8 | **Redis 캐싱 레이어** | 중간 | 8시간 | 코스 목록, 랭킹, 통계 캐싱. 현재 매번 DB 쿼리 |
| 9 | **테스트 코드 작성** | 중간 | 16시간 | pytest + httpx 기반 API 통합 테스트. 현재 테스트 0개 |
| 10 | **이메일 알림 서비스** | 중간 | 4시간 | 계정 관련 (가입 확인, 비밀번호 변경 등). SendGrid/AWS SES |
| 11 | **관리자 RBAC** | 중간 | 6시간 | User 모델에 role 필드 추가, 관리자 전용 엔드포인트 (유저 관리, 코스 관리) |
| 12 | **Rate Limiting 세분화** | 중간 | 2시간 | 파일 업로드, Import, Strava sync 등 헤비 엔드포인트에 개별 제한 |
| 13 | **이벤트 생성 API** | 중간 | 3시간 | 현재 이벤트 조회/참가만 가능. 관리자 또는 일반 유저의 이벤트 생성 엔드포인트 |

### 향후 (스케일링)

| # | 작업 | 우선순위 | 예상 작업량 | 설명 |
|---|------|---------|-----------|------|
| 14 | **Celery + Redis 태스크 큐** | 낮음 | 6시간 | BackgroundTasks → Celery 전환. 서버 재시작해도 태스크 유실 없음 |
| 15 | **Map Matching (도로 보정)** | 낮음 | 12시간 | OSRM/Valhalla로 GPS 경로를 실제 도로에 맞춤 |
| 16 | **글로벌 랭킹** | 낮음 | 8시간 | 코스별이 아닌 전체/지역별/국가별 랭킹 |
| 17 | **신고/차단 시스템** | 낮음 | 6시간 | 유저 신고, 코스 신고, 리뷰 신고 + 관리자 처리 |
| 18 | **Webhook / 실시간 알림** | 낮음 | 12시간 | WebSocket 기반 실시간 이벤트 (러닝 중 친구 위치 등) |
| 19 | **데이터 백업 자동화** | 낮음 | 4시간 | pg_dump 크론잡 또는 AWS RDS 자동 백업 |
| 20 | **CI/CD 파이프라인** | 낮음 | 4시간 | GitHub Actions: lint → test → build → deploy |

---

## 7. 기술 스택 정리

| 카테고리 | 기술 | 버전 |
|---------|------|------|
| Framework | FastAPI | 0.129.0 |
| ORM | SQLAlchemy (AsyncIO) | 2.0.46 |
| DB Driver | asyncpg | 0.31.0 |
| DB | PostgreSQL + PostGIS | 16 |
| Migration | Alembic | 1.18.4 |
| Auth | python-jose (JWT) | 3.5.0 |
| HTTP Client | httpx | 0.28.1 |
| DI Container | dependency-injector | 4.48.3 |
| Validation | Pydantic + pydantic-settings | 2.12.5 |
| File Storage | boto3 (S3) + 로컬 | 1.37.0 |
| Push | firebase-admin (FCM) | 6.6.0 |
| Error Tracking | sentry-sdk | 2.19.2 |
| Rate Limiting | slowapi | 0.1.9 |
| GPS Parsing | gpxpy + fitparse | latest |
| GIS | GeoAlchemy2 + Shapely | latest |
| Image | Pillow | 12.1.1 |
| Server | Uvicorn | 0.40.0 |
| Container | Docker + docker-compose | latest |

---

## 8. 로컬 개발 환경 구축

```bash
# 1. 저장소 클론
git clone https://github.com/koreaflag/ranking-run.git
cd ranking-run

# 2. Docker로 DB 실행
docker compose up db -d

# 3. Python 환경 (uv 사용)
cd backend
cp .env.example .env   # 편집: JWT_SECRET_KEY, DB URL 등
uv sync

# 4. DB 마이그레이션
alembic upgrade head

# 5. 서버 실행
uvicorn app.main:app --reload --port 8000

# 6. API 문서 확인
open http://localhost:8000/docs
```
