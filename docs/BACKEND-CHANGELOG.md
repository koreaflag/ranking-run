# Backend Changelog — Production Readiness Update

## Summary
백엔드 프로덕션 배포를 위한 10개 기능 추가 및 인프라 설정 완료.

---

## 1. Rate Limiting (API 요청 제한)

**파일:** `backend/app/core/rate_limit.py`, `backend/app/main.py`, `backend/app/api/v1/auth.py`

- 전체 API: 100 req/min per IP (기본)
- 로그인/토큰 갱신: 10 req/min per IP (브루트포스 방지)
- slowapi 기반, Redis 없이 in-memory (단일 서버)
- 429 응답 시 JSON 형식으로 에러 반환

**배포 시 주의:** 로드밸런서 뒤에서는 X-Forwarded-For 헤더 설정 필요.

---

## 2. DB Index Optimization (인덱스 최적화)

**파일:** `backend/alembic/versions/0012_add_performance_indices.py`

20개 인덱스 추가:
- `courses`: creator_id, created_at DESC, is_public, start_point (GIST)
- `run_records`: user_id+started_at, course_id, started_at DESC
- `rankings`: course_id+time, user_id
- `follows`: follower/following_id
- `reviews`: course_id
- `social_accounts`: provider+provider_id
- `refresh_tokens`: user_id, expires_at
- `events`: 날짜 범위, center_point (GIST)
- `course_likes`, `course_favorites`: user_id

**배포:** `alembic upgrade head` 실행 필요.

---

## 3. Structured Logging + Sentry (로깅 + 에러 추적)

**파일:** `backend/app/core/logging_config.py`, `backend/app/core/sentry.py`, `backend/app/main.py`

- `JSON_LOGS=true` 시 JSON 구조화 로깅 (ELK/CloudWatch 연동)
- `JSON_LOGS=false` 시 컬러 텍스트 로깅 (개발용)
- Sentry DSN 설정 시 자동 에러 추적
  - FastAPI + SQLAlchemy integration
  - 프로덕션: 10% 트랜잭션 샘플링
  - 개발: 100% 샘플링

**환경변수:**
```
JSON_LOGS=true          # 프로덕션에서 활성화
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## 4. Docker + Docker Compose

**파일:** `backend/Dockerfile`, `docker-compose.yml`, `backend/.dockerignore`

- Python 3.12-slim 기반 컨테이너
- PostGIS 16 DB (healthcheck 포함)
- Alembic 마이그레이션 자동 실행
- 환경변수는 `.env` 파일에서 로드

**실행:**
```bash
# 개발 환경
docker compose up -d

# 프로덕션 (환경변수 설정 후)
cp backend/.env.example backend/.env
# .env 편집 후
docker compose up -d --build
```

---

## 5. S3 File Storage + CDN (파일 스토리지)

**파일:** `backend/app/core/storage.py`, `backend/app/api/v1/uploads.py`

- `FileStorage` Protocol 기반 추상화
- `LocalStorage`: 로컬 파일시스템 (기본)
- `S3Storage`: AWS S3 + 선택적 CDN URL 리라이트
- S3 환경변수 미설정 시 자동으로 로컬 폴백

**환경변수:**
```
S3_BUCKET_NAME=runcrew-uploads
S3_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
CDN_BASE_URL=https://cdn.runcrew.app
```

---

## 6. Course Thumbnail Generation (코스 썸네일)

**파일:** `backend/app/tasks/thumbnail.py`

- Mapbox Static Images API로 코스 경로 썸네일 자동 생성
- GeoJSON overlay (주황색 경로선)
- 600x400 @2x 고해상도
- 좌표 100개로 자동 간소화 (URL 길이 제한)
- Storage 추상화 사용 (S3 또는 로컬)

**환경변수:** `MAPBOX_ACCESS_TOKEN` 필수.

---

## 7. Strava Auto-Sync (스트라바 자동 동기화)

**파일:** `backend/app/services/strava_service.py`, `backend/app/tasks/strava_sync.py`, `backend/app/api/v1/strava.py`

- OAuth 연결 시 최근 러닝 기록 자동 import (백그라운드)
- `POST /strava/sync-all`: 수동 전체 동기화 (최대 200개)
- 토큰 자동 갱신 (6시간 만료)
- 중복 import 방지 (external_imports 테이블)
- Run 타입만 import

**환경변수:**
```
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc...
STRAVA_REDIRECT_URI=https://api.runcrew.app/api/v1/strava/callback
```

---

## 8. FCM Push Notifications (푸시 알림)

**파일:** `backend/app/services/notification_service.py`, `backend/app/api/v1/notifications.py`, `backend/app/models/device_token.py`

- Firebase Cloud Messaging 기반
- 디바이스 토큰 등록/해제 API
- 유저별 멀티 디바이스 지원
- 유효하지 않은 토큰 자동 제거
- Lazy SDK 초기화

**API:**
```
POST   /notifications/token    — 디바이스 토큰 등록
DELETE /notifications/token    — 디바이스 토큰 해제
```

**환경변수:** `FCM_SERVICE_ACCOUNT_PATH=/path/to/firebase-service-account.json`
**DB 마이그레이션:** `0013_add_device_tokens.py`

---

## 9. Google / Naver OAuth (소셜 로그인 추가)

**파일:** `backend/app/services/auth_service.py`, `backend/app/schemas/auth.py`

기존 카카오 + Apple에 추가:
- **Google**: `oauth2.googleapis.com/tokeninfo` 엔드포인트 검증
- **Naver**: `openapi.naver.com/v1/nid/me` 프로필 API 검증

**환경변수:**
```
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
NAVER_CLIENT_ID=xxx
NAVER_CLIENT_SECRET=xxx
```

**로그인 요청:** `POST /auth/login` body에 `provider: "google"` 또는 `"naver"` 추가.

---

## 10. Environment Variable Extraction (환경변수 정리)

**파일:** `backend/.env.example`, `docker-compose.yml`

- 모든 외부 리소스 값을 환경변수로 추출
- `.env.example`에 전체 환경변수 목록 문서화
- docker-compose에서 하드코딩된 비밀번호 제거 → `.env` 참조
- 프론트엔드도 `src/config/env.ts` + `app.config.ts`로 환경변수 주입 구조 완성

---

## 배포 체크리스트

1. [ ] `backend/.env.example` → `backend/.env` 복사 후 실제 값 입력
2. [ ] `JWT_SECRET_KEY` 강력한 랜덤 문자열로 변경
3. [ ] `alembic upgrade head` 실행 (인덱스 + device_tokens 마이그레이션)
4. [ ] Firebase service account JSON 파일 서버에 배치
5. [ ] S3 버킷 생성 + IAM 권한 설정 (선택)
6. [ ] Sentry 프로젝트 생성 + DSN 설정 (선택)
7. [ ] Strava API Application 등록 + redirect URI 설정 (선택)
8. [ ] Google Cloud Console에서 OAuth Client ID 발급 (선택)
9. [ ] Naver Developers에서 애플리케이션 등록 (선택)
10. [ ] `JSON_LOGS=true` 설정 (프로덕션)
11. [ ] CORS_ORIGINS 프로덕션 도메인으로 변경

## 새 Dependencies
```
sentry-sdk[fastapi]==2.19.2
slowapi==0.1.9
boto3==1.37.0
firebase-admin==6.6.0
```
