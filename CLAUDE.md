# RUNVS - 런닝 코스 공유 앱

## 프로젝트 개요
유저가 직접 달리면서 코스를 제작하고, 다른 유저들과 공유하며, 코스별 랭킹으로 경쟁하는 런닝 앱.

## 핵심 기능
1. **런닝 코스 제작**: 유저가 달리면서 GPS로 경로 기록 → 코스로 공개
2. **코스 통계**: 코스별 참여자 수, 평균 페이스, 완주율 등
3. **자유 런닝**: 코스 없이 일반 런닝 트래킹
4. **소셜 로그인**: 카카오 + Apple (우선), Google/Naver (후순위)
5. **랭킹**: 코스별 러너 랭킹 (시간/페이스 기준)

## 기술 스택
- **프론트엔드**: React Native + Expo (bare workflow)
- **백엔드**: FastAPI (Python)
- **DB**: PostgreSQL + PostGIS (JSONB + 공간쿼리)
- **인증**: 소셜 로그인 (카카오, Apple) - JWT 기반
- **파일 저장**: S3 호환 스토리지 (AWS S3 또는 MinIO)
- **지도**: Mapbox 또는 Google Maps
- **비동기 처리 (MVP)**: FastAPI BackgroundTasks
- **비동기 처리 (성장기)**: Redis + Celery

## 팀 에이전트
이 프로젝트는 6개의 전문 에이전트로 개발합니다.

### 사용법
각 에이전트는 `agents/` 디렉토리에 정의되어 있으며, Task tool의 프롬프트에 해당 에이전트 파일의 내용을 포함하여 호출합니다.

| 에이전트 | 파일 | 담당 |
|---------|------|------|
| UI 개발자 | `agents/ui-developer.md` | 화면 구성, 컴포넌트, 네비게이션, 상태관리 |
| Android GPS | `agents/android-gps.md` | Android GPS 트래킹, 센서 퓨전, Fused Location |
| iOS GPS | `agents/ios-gps.md` | iOS GPS 트래킹, Core Location, Core Motion |
| 백엔드 | `agents/backend-fastapi.md` | FastAPI, 소셜 로그인, DB, 랭킹, 통계, 코스 매칭 |
| QA & 테스팅 | `agents/qa-testing.md` | GPS 정확도 검증, 유닛/E2E 테스트, 성능 테스트 |
| DevOps | `agents/devops.md` | Docker, CI/CD, EAS 빌드, 서버 배포, 모니터링 |

### 참조 문서
| 문서 | 파일 | 내용 |
|-----|------|------|
| 공통 인터페이스 | `agents/shared-interfaces.md` | GPS 모듈 메서드, 이벤트, 데이터 모델, 에러 코드 |
| API 스키마 | `agents/api-schema.md` | 전체 REST API 통신 명세, 청크 기반 전송 설계 |

## GPS 정확도 전략 (다층 방어)
```
Layer 1: 플랫폼 GPS 설정 최적화
Layer 2: 유효성 검사 + 이상치 제거 (속도 > 15m/s 폐기, accuracy > 30m 폐기)
Layer 3: Kalman Filter + 센서 퓨전
Layer 4: 후처리 스무딩 (RTS Smoother)
Layer 5: Map Matching (도심, 서버 사이드)
```

## API 통신 스키마
`agents/api-schema.md`에 전체 통신 스키마가 정의되어 있습니다.
- 각 시점(로그인, 홈 진입, 런닝 종료 등)에서 어떤 데이터를 보내고 받는지 명세
- **런닝 중 청크 기반 전송**: 1km/5분마다 로컬 저장 + 서버 백그라운드 동기화 (데이터 유실 방지)
- 앱 크래시 시 미전송 청크 자동 복구
- FastAPI REST 엔드포인트 + JWT 인증 기반

## 공통 규칙
- 원시 GPS 데이터는 반드시 서버에 저장 (랭킹 공정성 + 알고리즘 개선 시 재처리)
- GPS 필터링 인터페이스는 플랫폼 공통으로 정의 (agents/shared-interfaces.md 참조)
- 커밋 메시지는 Conventional Commits 사용 (feat:, fix:, refactor: 등)
- **⚠️ 플랫폼 분리 원칙**: Android는 Android에 맞게, iOS는 iPhone에 맞게 독립 개발. 한 플랫폼 수정 시 다른 플랫폼 코드/값 절대 건드리지 않기. Platform.select/Platform.OS 분기에서 요청된 플랫폼만 수정할 것.

## 변경 로그 자동 기록

코드 변경 작업을 완료한 후, 반드시 관리자 변경 로그 API를 호출하여 기록합니다.

### API
POST https://admin.runvs.run/admin-api/changelogs
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0Y2ZhZmQyYy01MTQ4LTQzYmEtOGViNy0yMWE0MGE3NjE5MjQiLCJlbWFpbCI6ImRvbmczODMxQGhhbm1haWwubmV0Iiwicm9sZSI6InNlcnZpY2UiLCJleHAiOjE4OTM0NTYwMDB9.WWrxcxXXaI44WMSxw00bNnMjaPc38ub6oKrANA9wxqw
Content-Type: application/json

{
"categories": ["feature", "ui", "db"],
"scope": "app",
"title": "변경 사항 제목 (한글, 50자 이내)",
"description": "상세 내용\n- 변경된 파일\n- 영향 범위",
"author": "Claude"
}

### 분류 기준
- **feature**: 새 기능, 기능 변경/삭제, 버그 수정
- **ui**: 화면 레이아웃, 컴포넌트, 스타일, 텍스트 변경
- **db**: 테이블/컬럼 추가·수정·삭제, 마이그레이션, 인덱스

### 대상 (scope)
- **admin**: 어드민 페이지 (rankingrun-admin) 변경
- **app**: 앱 서비스 (ranking-run) 변경

### 규칙
- 작업 완료 후 커밋 직후에 API 호출
- scope는 이 프로젝트에서는 항상 "app"
- 해당되는 분류를 모두 categories 배열에 포함 (예: 기능 추가 + DB 마이그레이션 = ["feature", "db"])
- title은 한글, 간결하게
- description에 변경된 주요 파일과 내용 포함

## DB 핵심 엔티티
```
User → Course (1:N)
User → RunRecord (1:N)
Course → RunRecord (1:N, nullable)
Course → CourseStats (1:1)
Course → Ranking (1:N)
```
