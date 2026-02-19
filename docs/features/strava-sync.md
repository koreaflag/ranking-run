# Strava Sync Feature

## Overview
Strava 계정 연동을 통해 기존 Strava 러닝 기록을 RUNVS로 자동 import하는 기능.

## 관련 파일

### Backend
- `backend/app/services/strava_service.py` — Strava API 통신, 토큰 관리, 활동 파싱
- `backend/app/models/strava_connection.py` — StravaConnection DB 모델
- `backend/app/tasks/strava_sync.py` — 백그라운드 자동 동기화 태스크
- `backend/app/api/v1/strava.py` — REST API 엔드포인트 (auth-url, callback, sync-all, disconnect)

### 환경변수
```
STRAVA_CLIENT_ID=       # Strava API Application Client ID
STRAVA_CLIENT_SECRET=   # Strava API Application Client Secret
STRAVA_REDIRECT_URI=    # OAuth callback URL (e.g. https://api.runcrew.app/api/v1/strava/callback)
```

### DB 마이그레이션
- `0008_add_strava_connections.py` — strava_connections 테이블
- `0009_add_external_imports.py` — external_imports 테이블 (중복 방지)

## API 엔드포인트
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/strava/auth-url` | Strava OAuth 인증 URL 생성 |
| POST | `/api/v1/strava/callback` | OAuth 콜백 → 토큰 저장 → 자동 동기화 시작 |
| POST | `/api/v1/strava/sync-all` | 수동 전체 동기화 (최대 200개) |
| DELETE | `/api/v1/strava/disconnect` | Strava 연결 해제 |

## 동기화 데이터 매핑
| Strava | RUNVS | 설명 |
|--------|---------|------|
| distance | distance_meters | 총 거리 (m) |
| moving_time | duration_seconds | 러닝 시간 (s) |
| start_date | started_at | 시작 시각 |
| average_speed | avg_pace | 평균 페이스 |
| total_elevation_gain | elevation_gain | 오르막 (m) |
| map.summary_polyline | route_geometry | GPS 경로 |
| calories | calories | 칼로리 |

## 핵심 로직
1. OAuth 연결 → access_token + refresh_token 저장
2. 토큰 만료 시 자동 갱신 (ensure_fresh_token)
3. Run 타입만 import (사이클/수영 제외)
4. external_imports로 중복 import 방지
5. BackgroundTasks로 비동기 실행
