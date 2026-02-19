# RUNVS x Assetto Corsa Design Direction
## 레이싱 게임 UI에서 영감을 받은 런닝 앱 디자인 가이드

**작성일**: 2026-02-17
**상태**: 확정 제안

---

## 1. 레퍼런스 분석 요약

### Assetto Corsa UI에서 관찰된 핵심 패턴

| 요소 | AC 패턴 | RUNVS 적용 방향 |
|------|---------|-------------------|
| **배경** | 깊은 다크 (#0A0A0A ~ #1A1A1A) | 다크 모드 기본, 런닝 HUD 동일 |
| **액센트** | 레이싱 레드 (#E01010) | E10600 유지, 경쟁/긴박감 표현 |
| **카드** | 사진 썸네일 + 메타데이터 하단 | 코스 미니맵 + 통계 하단 |
| **마커** | 다이아몬드/방패 + 컬러 코딩 | 난이도/카테고리 기반 컬러 마커 |
| **뱃지** | 모노톤 화이트 아웃라인, 원형/방패 프레임 | 러닝 업적 뱃지 시스템 |
| **정보 밀도** | 높음 (설정 화면에 토글/슬라이더 밀집) | 통계 대시보드에 활용, HUD 집약형 |
| **타이포** | 산세리프 볼드, 대문자 레이블 | 이미 적용 중 (fontWeight 800-900) |

### 레이싱 게임 UI의 근본 UX 원리 (런닝 앱 적용 가능)

1. **텔레메트리 대시보드**: 실시간 데이터를 한눈에, 주행(달리기) 중 시선 분산 최소화
2. **트랙(코스) 선택의 물리적 실감**: 카드에 트랙 프리뷰, 난이도, 길이 등 핵심 정보 집약
3. **업적/도전과제 시스템**: 단계적 성취감으로 재방문 유도
4. **컬러 코딩 마커**: 지도 위에서 즉시 카테고리 식별
5. **다크 우선 UI**: 집중력 향상, 프리미엄 느낌

---

## 2. RUNVS만의 차별화 전략

### "Pit Lane to Finish Line" 컨셉

레이싱 게임의 핵심 루프를 런닝에 대응시킨다:

```
레이싱 게임         RUNVS 런닝
-----------         -----------
트랙 선택     -->   코스 탐색 (WorldScreen)
그리드 출발    -->   카운트다운 + START
랩 타이밍      -->   구간(Split) 기록
텔레메트리     -->   러닝 HUD (페이스, 거리, 심박)
체커 플래그    -->   피니시 + 랭킹 결과
업적 해금      -->   뱃지 획득
리더보드       -->   코스별 랭킹
```

### AC에서 직접 차용하되 변환하는 요소

| AC 원본 | RUNVS 변환 | 차별화 포인트 |
|---------|-------------|--------------|
| 트랙 카드: 사진 + 길이/피트박스 | 코스 카드: 미니맵 루트 프리뷰 + 거리/고도/난이도 | 사진 대신 실제 GPS 경로 시각화 |
| 레이싱 레드 일색 | 레드(경쟁) + 블루(데이터) + 오렌지(업적) 3색 체계 | 감정 상태별 컬러 분리 |
| 평면적 아이콘 뱃지 | Glass morphism + 미묘한 그라데이션 뱃지 | 기존 Glass 디자인과 조화 |
| 컨트롤러 기반 네비게이션 | 터치 기반 + 제스처 + 햅틱 | 모바일 최적화 |

---

## 3. 컬러 시스템 (확정)

### 현재 시스템 유지 + 보강

현재 constants.ts의 컬러 체계는 이미 Assetto Corsa에서 영감을 받아 구축되어 있다.
추가로 필요한 색상과 의미 체계를 정리한다.

```
[의미 기반 컬러 매핑]

Racing Red (#E10600)   = 경쟁, CTA, 긴박감, 랭킹 도전
  - primaryDark: #B80500  (눌림 상태)
  - primaryLight: #FF4444 (호버/포커스)
  - glow shadow color    (주요 버튼 발광)

Telemetry Blue (#00B4D8) = 데이터, 링크, 최고 기록 하이라이트
  - secondaryDark: #0090AB

Achievement Orange (#FF6B00) = 업적, PB, 축하, 보상
  - accentLight: #FF9D4D

성공 Green (#00C853)    = GPS 잠금, 완료, 긍정 피드백
경고 Amber (#FFB300)    = GPS 탐색, 주의
오류 Red (#FF3B30)      = GPS 미연결, 에러, 정지 버튼
```

### 다크 모드 팔레트 (Assetto Corsa 직접 참조)

```
Layer 0 (배경): #0A0A0A  -- 순수 블랙에 가까움 (AC 메인 배경)
Layer 1 (서피스): #141414 -- 카드/패널 배경
Layer 2 (상위):  #1E1E1E  -- 인터랙티브 요소, 입력 필드
Layer 3 (강조):  #2C2C2E  -- 보더, 디바이더

텍스트:
  Primary:   #FFFFFF (100%)
  Secondary: #ABABAB (67%)
  Tertiary:  #6E6E73 (43%)
  Disabled:  #3A3A3C (24%)
```

### Glass Morphism과의 조화

다크 모드에서 Glass는 다음과 같이 적용:
```
glassBackground: rgba(20, 20, 20, 0.65)   -- 반투명 다크
glassBorder:     rgba(255, 255, 255, 0.08) -- 극미세 화이트 테두리
glassOverlay:    rgba(10, 10, 10, 0.75)    -- 배경 이미지 위 오버레이
```

라이트 모드에서:
```
glassBackground: rgba(255, 255, 255, 0.55) -- 반투명 화이트
glassBorder:     rgba(0, 0, 0, 0.06)       -- 극미세 다크 테두리
glassOverlay:    rgba(255, 255, 255, 0.65)
```

---

## 4. 코스 카드 디자인 (AC Track Selection -> RUNVS Course Card)

### 4.1 카드 구조 비교

**Assetto Corsa 트랙 카드:**
```
+---------------------------+
| [트랙 사진 썸네일]         |
|                           |
|---------------------------|
| Monza                     |
| Italy | 5.8 km | 30 pits  |
+---------------------------+
  선택시: 밝은 보더 하이라이트
```

**RUNVS 코스 카드 (새 제안):**
```
+---------------------------+
| [미니맵 루트 프리뷰]       |  <-- GPS 경로를 시각화
|   ~~~경로선~~~            |
|          [난이도 뱃지]     |
|---------------------------|
| 한강 반포 나이트런         |
| 5.2 km  |  +42m  |  Lv.2 |
| 127회 도전  |  4.3         |
+---------------------------+
  선택시: primary(red) 보더 glow
```

### 4.2 코스 카드 React Native 스타일 명세

```typescript
// CourseCard - Assetto Corsa Track Card 변환
// 위치: src/components/course/CourseCard.tsx

interface CourseCardProps {
  course: CourseListItem;
  onPress: () => void;
  isSelected?: boolean;    // AC의 선택 하이라이트
  variant?: 'vertical' | 'horizontal';  // 세로(홈) | 가로(코스 리스트)
}

// 세로형 카드 (홈스크린 가로 스크롤용)
const verticalCardStyle = {
  container: {
    width: 200,
    backgroundColor: DARK_THEME.card,        // '#141414'
    borderRadius: BORDER_RADIUS.lg,           // 16
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DARK_THEME.border,           // '#2C2C2E'
  },
  containerSelected: {
    borderColor: COLORS.primary,              // '#E10600'
    borderWidth: 2,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  mapPreview: {
    height: 120,
    backgroundColor: DARK_THEME.surface,       // '#141414'
  },
  difficultyBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.full,
    // backgroundColor: 난이도별 컬러 (아래 참조)
  },
  info: {
    padding: SPACING.lg,                       // 16
    gap: SPACING.xs,                           // 4
  },
  title: {
    fontSize: FONT_SIZES.md,                   // 15
    fontWeight: '700',
    color: DARK_THEME.text,                    // '#FFFFFF'
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,                           // 8
    marginTop: SPACING.xs,                     // 4
  },
  distance: {
    fontSize: FONT_SIZES.lg,                   // 17
    fontWeight: '800',
    color: DARK_THEME.text,
    fontVariant: ['tabular-nums'],
  },
  metaText: {
    fontSize: FONT_SIZES.xs,                   // 11
    fontWeight: '500',
    color: DARK_THEME.textTertiary,            // '#6E6E73'
  },
};

// 가로형 카드 (코스 리스트용)
const horizontalCardStyle = {
  container: {
    flexDirection: 'row',
    backgroundColor: DARK_THEME.card,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DARK_THEME.border,
    height: 100,
  },
  mapPreview: {
    width: 100,
    height: '100%',
    backgroundColor: DARK_THEME.surface,
  },
  info: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
    gap: SPACING.xs,
  },
};
```

### 4.3 난이도 컬러 코딩

AC의 트랙 난이도를 런닝 코스 난이도로 변환:

```
easy   (Lv.1): #00C853 (Green)   -- 평지, 짧은 거리
medium (Lv.2): #FFB300 (Amber)   -- 약간의 오르막, 중간 거리
hard   (Lv.3): #FF6B00 (Orange)  -- 급경사, 장거리
expert (Lv.4): #E10600 (Red)     -- 극한 코스
```

---

## 5. 뱃지/업적 시스템

### 5.1 AC 아이콘 세트 분석 -> 런닝 업적 카테고리

AC는 약 30개 이상의 모노톤 화이트 아웃라인 아이콘을 사용한다.
원형 또는 방패형 프레임 안에 아이콘을 배치하고, 해금 여부에 따라 밝기가 달라진다.

RUNVS에서는 다음 6개 카테고리로 분류한다:

```
1. DISTANCE (거리)
   - 아이콘: 도로/경로 형태
   - 예시: 첫 1km, 누적 10km, 100km, 마라톤 달성
   - 프레임: 원형
   - 컬러: 해금시 Telemetry Blue (#00B4D8)

2. SPEED (속도)
   - 아이콘: 스피드미터/번개
   - 예시: 5'00" 이하 페이스, 4'30" 이하, 최고 속도 기록
   - 프레임: 다이아몬드형 (AC 마커에서 차용)
   - 컬러: 해금시 Racing Red (#E10600)

3. CONSISTENCY (꾸준함)
   - 아이콘: 달력/연속 표시
   - 예시: 7일 연속, 30일 연속, 365일
   - 프레임: 방패형
   - 컬러: 해금시 Achievement Orange (#FF6B00)

4. COMPETITION (경쟁)
   - 아이콘: 트로피/왕관/메달
   - 예시: 첫 코스 1위, 10회 TOP3, 50코스 완주
   - 프레임: 왕관형 (상단 뾰족)
   - 컬러: 해금시 Gold (#FFD700)

5. EXPLORER (탐험)
   - 아이콘: 지도핀/나침반/깃발
   - 예시: 5개 코스 탐험, 전 구 탐험, 새 코스 개설
   - 프레임: 원형
   - 컬러: 해금시 Success Green (#00C853)

6. SOCIAL (소셜)
   - 아이콘: 사람/하트/별
   - 예시: 첫 팔로워, 코스 리뷰 작성, 10명 함께 달리기
   - 프레임: 원형
   - 컬러: 해금시 Secondary (#00B4D8)
```

### 5.2 뱃지 비주얼 스펙

```
[미해금 상태]
- 프레임: #2C2C2E (다크 보더)
- 아이콘: #3A3A3C (거의 안 보임)
- 배경: #141414
- opacity: 0.5

[해금 상태]
- 프레임: 카테고리 컬러 (위 참조)
- 아이콘: #FFFFFF (화이트)
- 배경: Glass morphism (rgba(20, 20, 20, 0.65))
- 프레임 glow: 카테고리 컬러, shadowOpacity 0.3, shadowRadius 8
- 해금 애니메이션: scale 0 -> 1.1 -> 1.0 (300ms, spring)

[뱃지 크기]
- 그리드 뷰: 64x64 (3열)
- 프로필 하이라이트: 48x48
- 인라인 (채팅/피드): 24x24
```

### 5.3 뱃지 컴포넌트 React Native 스펙

```typescript
// src/components/badge/AchievementBadge.tsx

interface AchievementBadgeProps {
  category: 'distance' | 'speed' | 'consistency' | 'competition' | 'explorer' | 'social';
  tier: 1 | 2 | 3 | 4 | 5;   // 동일 카테고리 내 단계
  unlocked: boolean;
  size?: 'sm' | 'md' | 'lg';   // 24 | 48 | 64
  showLabel?: boolean;
}

const BADGE_SIZES = { sm: 24, md: 48, lg: 64 };

const CATEGORY_COLORS = {
  distance: '#00B4D8',
  speed: '#E10600',
  consistency: '#FF6B00',
  competition: '#FFD700',
  explorer: '#00C853',
  social: '#00B4D8',
};

const CATEGORY_FRAMES = {
  distance: 'circle',
  speed: 'diamond',
  consistency: 'shield',
  competition: 'crown',
  explorer: 'circle',
  social: 'circle',
};

// 스타일
const badgeStyles = {
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 해금 상태의 glow 효과
  unlocked: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  }),
  // 미해금 상태
  locked: {
    opacity: 0.35,
  },
  frame: {
    borderWidth: 2,
    // borderColor: 카테고리 컬러 or #2C2C2E
  },
  icon: {
    // color: #FFFFFF (해금) or #3A3A3C (미해금)
  },
};
```

---

## 6. 맵 마커 디자인

### 6.1 AC 마커 패턴 분석

AC는 다이아몬드/방패 형태의 마커를 사용하며, 아래쪽에 화살표(포인터)가 있다.
각 마커는 카테고리별 고유 색상을 가지며, 내부에 아이콘이 들어간다.

### 6.2 RUNVS 맵 마커 시스템

```
[마커 형태]
- 기본: 둥근 핀 (원형 상단 + 아래 뾰족 포인터)
- 크기: 40x48 (기본), 48x56 (선택됨)
- 포인터 높이: 8px

[마커 내부]
- 코스 난이도 아이콘 또는 깃발 아이콘
- 아이콘 크기: 18x18 (기본), 22x22 (선택됨)
- 아이콘 색상: #FFFFFF

[컬러 코딩 기준 - 3가지 모드 중 선택]

Mode A: 난이도 기반 (기본)
  Lv.1 (Easy):   #00C853 (Green)
  Lv.2 (Medium): #FFB300 (Amber)
  Lv.3 (Hard):   #FF6B00 (Orange)
  Lv.4 (Expert): #E10600 (Red)

Mode B: 인기도 기반
  0-10회:    #6E6E73 (Gray)
  11-50회:   #00B4D8 (Blue)
  51-200회:  #FFB300 (Amber)
  200회+:    #E10600 (Red)

Mode C: 내 기록 기반
  미완주:     #6E6E73 (Gray, 반투명)
  완주:      #00B4D8 (Blue)
  TOP 10:    #FFB300 (Amber)
  TOP 3:     #FFD700 (Gold)
  1위:       #E10600 (Red, glow)
```

### 6.3 마커 선택 상태

```
[기본 상태]
- 마커 크기: 40x48
- 그림자 없음

[선택 상태]
- 마커 크기: 48x56 (scale up)
- 선택 링: 마커 컬러 기반 외곽 링 (2px, 60% opacity)
- 펄스 애니메이션: 외곽 링이 확산되었다 수축 (1.5초 주기)
- 그림자: 마커 컬러, shadowOpacity 0.4, shadowRadius 16

[클러스터 마커]
- 코스가 밀집된 영역에서 카운트 표시
- 크기: 44x44 원형
- 배경: #E10600 (primary)
- 텍스트: #FFFFFF, fontWeight 800
- 개수 표시: "12+" 형태
```

### 6.4 마커 컴포넌트 스펙

```typescript
// src/components/map/CourseMarker.tsx

interface CourseMarkerProps {
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  isSelected: boolean;
  hasMyRecord: boolean;
  myRank?: number;
}

const DIFFICULTY_MARKER_COLORS = {
  easy: '#00C853',
  medium: '#FFB300',
  hard: '#FF6B00',
  expert: '#E10600',
};

const markerStyles = {
  pin: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSelected: {
    width: 48,
    height: 56,
    // + glow shadow
  },
  pinBody: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor: DIFFICULTY_MARKER_COLORS[difficulty]
  },
  pinPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    // borderTopColor: DIFFICULTY_MARKER_COLORS[difficulty]
    marginTop: -2,
  },
  icon: {
    color: '#FFFFFF',
    fontSize: 18,
  },
};
```

---

## 7. 전체 디자인 톤 & Glass Morphism 조화

### 7.1 디자인 원칙: "Dark Cockpit, Glass Dashboard"

레이싱 시뮬레이터의 조종석(Cockpit)처럼 어두운 기본 배경 위에,
Glass morphism 패널들이 계기판(Dashboard)처럼 떠있는 형태.

```
[배경 레이어]
  - 다크 솔리드 (#0A0A0A) 또는 배경 이미지 + 블러 오버레이

[콘텐츠 레이어]
  - GlassCard: 반투명 패널 (계기판 느낌)
  - 솔리드 카드: 정보 밀도가 높은 곳 (코스 카드, 랭킹 테이블)

[인터랙션 레이어]
  - 버튼: 솔리드 컬러 (레드 CTA, Glass가 아님)
  - 토글/칩: Glass 배경 + 컬러 악센트
  - 마커: 솔리드 컬러 핀 (지도 위 가독성)
```

### 7.2 Glass 사용 가이드라인

**Glass를 사용하는 곳:**
- 홈스크린 주간 요약 카드 (배경 이미지 위)
- 런닝 결과 통계 그리드 (배경 이미지 위)
- 월드맵 위 날씨 위젯
- 월드맵 위 코스 정보 카드 (지도 배경 위)

**Glass를 사용하지 않는 곳:**
- 코스 리스트 카드 (솔리드가 가독성 우위)
- 리더보드 테이블 (데이터 밀도 높음)
- 설정 화면 (AC 설정 화면처럼 솔리드 다크)
- 버튼 (CTA는 솔리드 컬러)
- 맵 마커 (가독성)

### 7.3 Glass + Racing 결합 예시

```
[월드맵 코스 선택 카드]

+-----Glass Panel-----------------------+
|  [Lv.2 뱃지]     [LIVE 3명 도전중]     |
|                                       |
|  한강 반포 나이트런                     |
|  5.2 km  |  +42m  |  127회 도전       |
|                                       |
|  [상세보기]   [START (레드 솔리드)]      |
+---------------------------------------+

- 배경: glassBackground (지도가 비침)
- 보더: glassBorder
- 상단 하이라이트 라인 (기존 GlassCard topHighlight)
- START 버튼만 솔리드 레드 (#E10600)
```

---

## 8. 화면별 AC 디자인 적용 가이드

### 8.1 러닝 HUD (이미 AC 스타일 적용됨)

현재 RunningScreen은 이미 다크 HUD 스타일이다.
추가 개선 사항:

```
- 대시보드 셀 간 구분선: #2C2C2E -> #333333 (약간 밝게, AC 설정 화면 참조)
- GPS 상태 칩: 현재 유지 (green/amber/red 도트 + 레이블)
- START 버튼: 레드 glow 유지
- 카운트다운 숫자: 현재 160px, 유지 (AC의 대형 타이포 참조)
- 추가 제안: 구간(Split) 알림 배너 (상단에서 슬라이드 인, 1.5초 후 사라짐)
  배경: 카테고리 컬러 (PB일 경우 오렌지, 일반이면 블루)
```

### 8.2 코스 상세 화면

AC 트랙 정보 화면 -> RUNVS 코스 상세로 변환:

```
[상단]
- 전체 폭 맵 (현재 유지, borderRadius.xl)
- 맵 위 Glass 오버레이로 난이도 뱃지 표시

[타이틀 섹션]
- 볼드 블랙 제목 (현재 유지)
- by 크리에이터 (현재 유지)

[대시보드 그리드]
- AC 설정화면의 정보 밀도 참조
- 현재 3열 그리드 유지
- 추가: 시각적 구분을 위해 아이콘 추가 (Ionicons)

[리더보드]
- AC의 랩 타임 리스트 참조
- 현재 유지하되, TOP 3 열에 미묘한 배경색 적용
  1위: rgba(255, 215, 0, 0.06)
  2위: rgba(192, 192, 192, 0.06)
  3위: rgba(205, 127, 50, 0.06)

[CTA 버튼]
- 현재 레드 솔리드 + glow 유지
- 텍스트: "이 코스 달리기" (현재 유지)
```

### 8.3 홈스크린

```
[인사 섹션]
- 현재 유지 (볼드, 캐주얼)

[주간 요약]
- GlassCard 유지
- 추가 제안: 주간 목표 진행률 바 (레드 프로그레스)
  - 트랙 배경: #2C2C2E
  - 채우기: #E10600 (레드)
  - 달성시: #00C853 (그린) + 축하 뱃지

[코스 카드 가로 스크롤]
- AC 트랙 선택 가로 스크롤 직접 참조
- 현재 200px 폭 카드 유지
- 추가: 미니맵 프리뷰 (현재 Ionicons 아이콘 대신)
- 선택/하이라이트: primary 보더 glow (AC 스타일)
```

---

## 9. 모션 & 인터랙션 원칙

### AC에서 차용하는 모션 패턴

```
1. 카드 선택: scale(0.98) -> scale(1.0) (100ms, easeOut)
   - AC: 선택시 카드가 약간 커지고 보더 밝아짐
   - RUNVS: 동일 + primary 컬러 보더 glow 추가

2. 뱃지 해금: scale(0) -> scale(1.15) -> scale(1.0) (300ms, spring)
   - AC: 업적 팝업이 중앙에서 확대
   - RUNVS: 뱃지 아이콘이 팝 + 카테고리 컬러 파티클

3. 카운트다운: 숫자 scale + fade 전환 (300ms)
   - AC: 그리드 출발 카운트다운의 긴박감
   - RUNVS: 이미 적용 중, 햅틱 피드백 추가

4. 랭킹 등장: 위에서 슬라이드인 (200ms, stagger 50ms)
   - AC: 레이스 결과가 순서대로 나타남
   - RUNVS: 피니시 후 랭킹 카드 등장

5. 데이터 업데이트: 숫자 롤링 (CountUp 애니메이션)
   - AC: 텔레메트리 수치 변화
   - RUNVS: HUD 거리/페이스 숫자 변화시 부드러운 전환
```

### 햅틱 피드백 매핑

```
- START 버튼 탭: impactHeavy
- 카운트다운 매 초: impactMedium
- 러닝 시작 (GO): notificationSuccess
- 구간(Split) 완료: impactLight
- PB 달성: notificationSuccess (3회 연속, 100ms 간격)
- 뱃지 해금: notificationSuccess + impactHeavy
- 일시정지: impactLight
- 종료: notificationWarning
```

---

## 10. 컴포넌트 토큰 업데이트 제안 (constants.ts)

현재 constants.ts에 추가할 토큰:

```typescript
// 뱃지 카테고리 컬러
export const BADGE_COLORS = {
  distance: '#00B4D8',
  speed: '#E10600',
  consistency: '#FF6B00',
  competition: '#FFD700',
  explorer: '#00C853',
  social: '#00B4D8',
} as const;

// 난이도 컬러
export const DIFFICULTY_COLORS = {
  easy: '#00C853',
  medium: '#FFB300',
  hard: '#FF6B00',
  expert: '#E10600',
} as const;

// 마커 사이즈
export const MARKER_SIZES = {
  default: { width: 40, height: 48 },
  selected: { width: 48, height: 56 },
  cluster: { width: 44, height: 44 },
} as const;

// 애니메이션 듀레이션
export const ANIMATION = {
  fast: 100,
  normal: 200,
  slow: 300,
  spring: { damping: 15, stiffness: 150 },
} as const;
```

---

## 11. 구현 우선순위

### Phase 1 (이번 스프린트)
1. **constants.ts 업데이트**: BADGE_COLORS, DIFFICULTY_COLORS, MARKER_SIZES, ANIMATION 토큰 추가
2. **CourseMarker 컴포넌트**: 난이도 기반 컬러 코딩 마커
3. **코스 카드 리디자인**: 미니맵 프리뷰 + AC 스타일 선택 하이라이트

### Phase 2 (다음 스프린트)
4. **AchievementBadge 컴포넌트**: 6개 카테고리, 해금/미해금 상태
5. **업적 화면**: 마이페이지 내 뱃지 그리드
6. **코스 상세 리더보드 개선**: TOP 3 배경색 + 진입 애니메이션

### Phase 3 (이후)
7. **런닝 HUD 개선**: 구간 알림 배너, 숫자 롤링 애니메이션
8. **주간 목표 프로그레스 바**: 홈스크린 GlassCard 내
9. **마커 클러스터링**: 줌 레벨에 따른 자동 클러스터링

---

## 12. 접근성 체크리스트

- [ ] 모든 마커 컬러가 WCAG 2.1 AA 대비율 충족 (최소 4.5:1 텍스트, 3:1 UI)
- [ ] 뱃지의 해금/미해금 상태가 색상만으로 구분되지 않도록 형태 차이 병용
- [ ] 다크 모드에서 텍스트 대비율: #FFFFFF on #0A0A0A = 21:1 (통과)
- [ ] 터치 타겟: 마커 최소 44x44, 버튼 최소 48px 높이
- [ ] 스크린 리더 레이블: 모든 아이콘 버튼에 accessibilityLabel
- [ ] 모션 감소 설정 존중: reducedMotionPreference 체크 후 애니메이션 비활성화
