# DevOps & 배포 에이전트

## 역할
RunCrew 런닝 앱의 **인프라, CI/CD, 배포 전담 개발자**.
로컬 개발 환경, Docker 컨테이너, CI/CD 파이프라인, 앱 빌드/배포, 모니터링을 담당한다.

## 전문 분야
- Docker / Docker Compose (백엔드 + PostgreSQL/PostGIS)
- GitHub Actions (CI/CD)
- EAS Build / EAS Submit (React Native 앱 빌드/배포)
- AWS (EC2, RDS, S3, CloudFront) 또는 동등 서비스
- Nginx (리버스 프록시, SSL)
- 환경 관리 (dev / staging / production)
- 시크릿 관리 (환경변수, API 키)
- 모니터링 & 로깅 (Sentry, CloudWatch)

---

## 1. 로컬 개발 환경

### Docker Compose (백엔드)

```yaml
# docker-compose.yml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: runcrew
      POSTGRES_USER: runcrew
      POSTGRES_PASSWORD: runcrew_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  app:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://runcrew:runcrew_dev@db:5432/runcrew
      JWT_SECRET: dev-secret-key-do-not-use-in-production
      KAKAO_CLIENT_ID: ${KAKAO_CLIENT_ID}
      APPLE_BUNDLE_ID: ${APPLE_BUNDLE_ID}
    depends_on:
      - db
    volumes:
      - ./backend:/app

volumes:
  pgdata:
```

### React Native 개발 환경

```bash
# 의존성 설치
npm install

# iOS 빌드 (로컬)
cd ios && pod install && cd ..
npx react-native run-ios

# Android 빌드 (로컬)
npx react-native run-android

# Expo Dev Client (EAS)
npx expo start --dev-client
```

### 환경변수 관리

```
프로젝트 루트/
├── .env.development          # 로컬 개발 (git 무시)
├── .env.staging              # 스테이징 (git 무시)
├── .env.production           # 프로덕션 (git 무시)
├── .env.example              # 템플릿 (git 포함)
└── eas.json                  # EAS Build 프로필별 환경변수 참조

backend/
├── .env                      # 백엔드 로컬 (git 무시)
└── .env.example              # 백엔드 템플릿 (git 포함)
```

```bash
# .env.example (React Native)
API_BASE_URL=http://localhost:8000/api/v1
MAPBOX_ACCESS_TOKEN=
KAKAO_APP_KEY=
SENTRY_DSN=

# backend/.env.example
DATABASE_URL=postgresql+asyncpg://runcrew:runcrew_dev@localhost:5432/runcrew
JWT_SECRET=
JWT_REFRESH_SECRET=
KAKAO_CLIENT_ID=
APPLE_BUNDLE_ID=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
```

---

## 2. CI/CD 파이프라인 (GitHub Actions)

### 워크플로우 구성

```
.github/workflows/
├── backend-ci.yml            # 백엔드 PR 체크
├── frontend-ci.yml           # 프론트엔드 PR 체크
├── backend-deploy.yml        # 백엔드 배포 (main 머지 시)
├── app-build-staging.yml     # 앱 스테이징 빌드 (develop 머지 시)
└── app-build-production.yml  # 앱 프로덕션 빌드 (release 태그 시)
```

### 백엔드 CI

```yaml
# .github/workflows/backend-ci.yml
name: Backend CI
on:
  pull_request:
    paths: ['backend/**']

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: runcrew_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r backend/requirements.txt
      - run: pip install pytest pytest-asyncio httpx
      - name: Run tests
        env:
          DATABASE_URL: postgresql+asyncpg://test:test@localhost:5432/runcrew_test
          JWT_SECRET: test-secret
        run: pytest backend/tests/ -v --tb=short

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install ruff
      - run: ruff check backend/
      - run: ruff format --check backend/
```

### 프론트엔드 CI

```yaml
# .github/workflows/frontend-ci.yml
name: Frontend CI
on:
  pull_request:
    paths: ['src/**', 'package.json']

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit          # TypeScript 타입 체크
      - run: npx eslint src/            # 린트
      - run: npx jest --passWithNoTests # 유닛 테스트
```

### 백엔드 배포

```yaml
# .github/workflows/backend-deploy.yml
name: Backend Deploy
on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Docker 이미지 빌드 & 푸시
      - name: Build and push Docker image
        run: |
          docker build -t runcrew-api:${{ github.sha }} ./backend
          # ECR/Docker Hub 푸시 또는 서버 직접 배포

      # DB 마이그레이션
      - name: Run migrations
        run: |
          # SSH로 서버 접속 후 alembic upgrade head
          # 또는 ECS task definition 업데이트

      # 서버 배포
      - name: Deploy to server
        run: |
          # docker-compose pull && docker-compose up -d
          # 또는 ECS 서비스 업데이트
```

---

## 3. 앱 빌드 & 배포 (EAS)

### EAS 프로필 설정

```json
// eas.json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true },
      "env": { "API_BASE_URL": "http://localhost:8000/api/v1" }
    },
    "staging": {
      "distribution": "internal",
      "ios": { "buildConfiguration": "Release" },
      "android": { "buildType": "apk" },
      "env": { "API_BASE_URL": "https://staging-api.runcrew.app/api/v1" }
    },
    "production": {
      "ios": { "buildConfiguration": "Release" },
      "android": { "buildType": "app-bundle" },
      "env": { "API_BASE_URL": "https://api.runcrew.app/api/v1" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "...", "ascAppId": "...", "appleTeamId": "..." },
      "android": { "serviceAccountKeyPath": "./google-service-account.json" }
    }
  }
}
```

### 빌드 명령어

```bash
# 개발 빌드 (Dev Client)
eas build --profile development --platform ios
eas build --profile development --platform android

# 스테이징 빌드 (테스트용)
eas build --profile staging --platform all

# 프로덕션 빌드
eas build --profile production --platform all

# 앱스토어/플레이스토어 제출
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

### 앱 빌드 CI (스테이징)

```yaml
# .github/workflows/app-build-staging.yml
name: App Build (Staging)
on:
  push:
    branches: [develop]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: eas build --profile staging --platform all --non-interactive
```

---

## 4. 서버 인프라 구성

### MVP (단일 서버)

```
┌─────────────────────────────────────┐
│              EC2 / VPS               │
│  ┌─────────┐  ┌──────────────────┐  │
│  │  Nginx   │→│   FastAPI (uvicorn)│  │
│  │  (SSL)   │  │   :8000           │  │
│  └─────────┘  └──────────────────┘  │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  PostgreSQL + PostGIS         │   │
│  │  :5432                        │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  S3-compatible (MinIO 또는     │   │
│  │  AWS S3 외부 서비스)           │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 성장기 (분리)

```
┌──────────┐      ┌──────────────┐
│ CloudFront│ ──→  │ S3 (정적파일)  │
└──────────┘      └──────────────┘
      │
┌──────────┐      ┌──────────────┐
│   ALB     │ ──→  │ ECS / EC2     │
│  (SSL)    │      │ FastAPI × 2+  │
└──────────┘      └──────────────┘
                        │
                  ┌──────────────┐
                  │ RDS PostgreSQL│
                  │ + PostGIS     │
                  └──────────────┘
                        │
                  ┌──────────────┐
                  │ ElastiCache   │
                  │ (Redis)       │
                  └──────────────┘
```

### Nginx 설정 (MVP)

```nginx
server {
    listen 443 ssl http2;
    server_name api.runcrew.app;

    ssl_certificate /etc/letsencrypt/live/api.runcrew.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.runcrew.app/privkey.pem;

    # API 프록시
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 청크 업로드: 요청 크기 제한 완화
        client_max_body_size 5m;
    }

    # 헬스체크
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
```

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 (PostGIS 클라이언트)
RUN apt-get update && apt-get install -y \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Gunicorn + Uvicorn workers
CMD ["gunicorn", "app.main:app", \
     "-w", "4", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--access-logfile", "-"]
```

---

## 5. DB 마이그레이션 전략

### Alembic 운영 규칙

```bash
# 마이그레이션 파일 생성
cd backend
alembic revision --autogenerate -m "add_reviews_table"

# 로컬 적용
alembic upgrade head

# 특정 버전으로 이동
alembic upgrade +1    # 한 단계 앞으로
alembic downgrade -1  # 한 단계 뒤로

# 배포 시 마이그레이션 (CI/CD에서 자동)
alembic upgrade head
```

### 마이그레이션 안전 규칙

```
1. 컬럼 삭제 금지 (deprecate → 한 달 후 삭제)
2. NOT NULL 컬럼 추가 시 반드시 DEFAULT 값 지정
3. 대용량 테이블 인덱스 생성: CREATE INDEX CONCURRENTLY 사용
4. 마이그레이션 파일은 반드시 리뷰 후 머지
5. production 롤백 계획 항상 준비 (downgrade 테스트)
```

### 백업 전략

```
- 일일 자동 백업 (pg_dump → S3)
- 마이그레이션 전 수동 백업
- Point-in-Time Recovery (AWS RDS) 또는 WAL 아카이브
- 복원 테스트: 월 1회
```

---

## 6. 모니터링 & 로깅

### 에러 추적 (Sentry)

```typescript
// React Native: Sentry 초기화
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,  // 성능 모니터링 20% 샘플링
});
```

```python
# FastAPI: Sentry 초기화
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    integrations=[FastApiIntegration(), SqlalchemyIntegration()],
    traces_sample_rate=0.1,
    environment=settings.ENVIRONMENT,
)
```

### 로깅 구조

```python
# 백엔드 로깅
import structlog

logger = structlog.get_logger()

# 요청 로그: method, path, status_code, duration_ms
# 비즈니스 로그: user_id, action, details
# 에러 로그: exception, stack_trace, context

# 로그 수준:
# DEBUG: 개발 환경만
# INFO: 정상 요청, 비즈니스 이벤트
# WARNING: 재시도, 타임아웃, 비정상 입력
# ERROR: 처리 실패, 외부 서비스 오류
# CRITICAL: 서비스 중단 수준
```

### 헬스체크

```python
# FastAPI 헬스체크 엔드포인트
@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "db": "connected"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "db": "disconnected"}
        )
```

### 주요 모니터링 메트릭

```
앱:
- 크래시율 (< 0.5%)
- GPS 콜드 스타트 시간 (p50, p95)
- 청크 전송 성공률 (> 99%)
- ANR (Android Not Responding) 비율

백엔드:
- API 응답 시간 (p50 < 100ms, p95 < 500ms)
- 에러율 (5xx < 0.1%)
- DB 커넥션 풀 사용률
- 청크 처리 지연시간
```

---

## 7. 시크릿 관리

### 절대 코드에 포함하면 안 되는 것들

```
- JWT_SECRET, JWT_REFRESH_SECRET
- DATABASE_URL (비밀번호 포함)
- KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET
- APPLE_PRIVATE_KEY, APPLE_KEY_ID, APPLE_TEAM_ID
- AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
- SENTRY_DSN
- MAPBOX_SECRET_TOKEN (public token은 OK)
```

### 환경별 시크릿 저장소

```
로컬: .env 파일 (git 무시)
CI/CD: GitHub Secrets
서버: 환경변수 또는 AWS Secrets Manager
앱 빌드: EAS Secrets (eas secret:create)
```

---

## 8. Git 브랜치 전략

```
main (production)
  ├── develop (스테이징)
  │   ├── feature/login-screen
  │   ├── feature/gps-kalman-filter
  │   ├── feature/course-api
  │   └── fix/gps-drift-issue
  └── hotfix/critical-crash-fix (긴급 수정 → main 직접 머지)

규칙:
- feature → develop: PR + 코드 리뷰 + CI 통과
- develop → main: QA 검증 후 머지
- hotfix → main: 긴급 시 직접 머지 후 develop에도 반영
- main에 태그(v1.0.0) → 앱 프로덕션 빌드 트리거
```

---

## MVP 우선순위
1. Docker Compose 로컬 개발 환경 (PostgreSQL/PostGIS + FastAPI)
2. GitHub Actions: 백엔드 CI (pytest + lint)
3. GitHub Actions: 프론트엔드 CI (tsc + eslint + jest)
4. EAS Build 프로필 설정 (development, staging, production)
5. 서버 배포 (단일 EC2 + Nginx + Docker)
6. Sentry 연동 (앱 + 백엔드)
7. 자동 배포 파이프라인 (main 머지 → 서버 배포)
8. DB 백업 자동화
