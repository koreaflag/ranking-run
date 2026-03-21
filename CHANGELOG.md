# CHANGELOG

## 2026-03-21

### UI/UX
- **WelcomeOverlay 목표 상세정보**: 목표 타입 아이콘(거리/시간/페이스/목표러닝) + 큰 폰트 값 표시. 목표러닝일 때 목표시간·필요페이스·메트로놈 BPM/OFF 칩 추가
- **WelcomeOverlay 유머 텍스트 가독성 개선**: 폰트 17pt, fontWeight 500, italic, 투명도 상향 (dark 0.7 / light 0.55)
- **날씨 UI를 WelcomeOverlay 위로 이동**: worldOverlayOpacity 래퍼 밖으로 분리, zIndex 100으로 항상 표시
- **투어 복귀 버튼 텍스트 추가**: X 아이콘만 → "← 러닝 준비" 버튼 (ko/en/ja)
- **레벨 배지/배너 라이트모드 대응**: 12개 티어 모두에 bgColorLight, borderColorLight, textColorLight 추가. RunnerLevelBadge, MyPageScreen 러너 배너, PlayerCard 프로필 카드 모두 테마 자동 전환

### 버그 수정
- **인라인 러닝 UI 미표시 수정**: runPanel Animated.View를 항상 렌더 (조건부 → 상시). useNativeDriver 애니메이션이 뷰 미마운트 상태에서 실패하던 문제 해결
- **카운트다운 → 러닝 전환 프리즈 수정**: `await startTracking()` → fire-and-forget. 네이티브 GPS 모듈 초기화가 JS 스레드 블로킹하던 문제 해결
- **시작 버튼 딜레이 수정**: 위치 권한 체크를 카운트다운과 병렬 실행 (기존 최대 5초 블로킹 제거)
- **카운트다운/러닝 UI 겹침 수정**: 카운트다운 페이드아웃(250ms) 완료 후 패널 표시로 변경
