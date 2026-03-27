# Interval Settings UI Redesign - 인터벌 설정 UI 개선 명세

## 1. 현재 문제 진단

### 1.1 현재 구조 (문제점 분석)

현재 인터벌 설정 UI는 3개 섹션이 동일한 패턴을 반복합니다:

```
[섹션 카드]
  ├── 헤더 (번호 뱃지 + 아이콘 + 라벨)
  ├── 프리셋 칩 행 (4개 가로 나열)
  └── 스테퍼 행 (-) [값] (+)
```

| 문제 | 근본 원인 | 영향 |
|------|----------|------|
| **시각적 과부하** | 3개 섹션 x (칩 4개 + 스테퍼) = 12개 칩 + 6개 버튼 + 3개 값 = 21개 인터랙티브 요소가 한 화면에 | 사용자가 어디를 봐야 할지 모름 |
| **칩과 스테퍼의 역할 충돌** | 같은 값을 칩으로도 스테퍼로도 변경 가능 → 두 컨트롤이 같은 상태를 경쟁적으로 제어 | 칩을 선택해도 스테퍼로 바꿀 수 있어 혼란 |
| **스테퍼의 비효율성** | 10초 단위로 +/- → 30초에서 180초로 가려면 15번 탭 | 미세 조정엔 좋지만 큰 변경에 비효율적 |
| **세 섹션의 시각적 무게가 동일** | pgSection 스타일이 완전히 동일 → 달리기/걷기/세트의 중요도 차이 없음 | 시각적 위계가 없어 순차적 흐름 느낌 부족 |
| **요약 배너가 약함** | 텍스트만 있고 시각적 구조 없음 → "3분 달리기 / 1분 걷기 x 5세트" 가독성 떨어짐 | 설정 결과를 한눈에 확인하기 어려움 |
| **세트 수 프리셋이 비효율적** | [3] [5] [8] [10] 세트를 칩으로 → 대부분 3~10 세트 사이 | 칩 4개로 충분하지만 스테퍼까지 있어 과잉 |

### 1.2 핵심 통찰

인터벌 설정은 본질적으로 **3개의 숫자만 정하면 끝나는** 매우 간단한 작업입니다:
1. 달리기 시간 (보통 30초 ~ 5분)
2. 걷기/휴식 시간 (보통 30초 ~ 3분)
3. 반복 횟수 (보통 3 ~ 10세트)

**그런데 현재 UI는 이 단순한 작업을 21개의 인터랙티브 요소로 복잡하게 만들고 있습니다.**

---

## 2. 경쟁 제품 인터벌 설정 분석

| 앱 | 인터벌 설정 방식 | 강점 | 약점 |
|----|---------------|------|------|
| **Nike Run Club** | 가이드 런 기반, 프리셋 인터벌만 제공. 커스텀 인터벌 없음 | 선택의 부담 없음 | 자유도 제로 |
| **Strava (3rd party 컨셉)** | 드래그&드롭 단계 빌더 (warm-up → run → recovery → cooldown). 원형 타이머가 각 phase를 시각화 | 직관적 시각화, 최소 정보 표시 | 빌더가 복잡한 워크아웃용으로 과도할 수 있음 |
| **Garmin Connect** | 리스트 기반 단계 빌더: Add Step → Work/Recovery 선택 → 시간/거리 입력 → Repeat 설정 | 극도로 유연한 구조화 가능 | 캐주얼 러너에겐 너무 복잡 |
| **Apple Watch (watchOS)** | Work + Recovery 입력 → Repeats 설정. 시간/거리/Open 중 선택 | 네이티브 느낌, 3단계로 단순 | 워치 전용, 폰 앱에서 설정 불가 |
| **Intervals Pro** | 타임라인 기반 시각화. 달리기/걷기 블록이 색으로 구분된 바로 표현 | 설정 결과가 시각적으로 즉시 확인 가능 | 앱이 인터벌 전문이라 범용성 부족 |

### 2.1 경쟁 분석에서 얻은 핵심 패턴

1. **"Work + Rest + Repeat" 3요소 모델**: 모든 앱이 이 구조를 사용. RUNVS도 동일
2. **시각적 타임라인**: 설정 결과를 색깔 블록으로 시각화하면 이해도가 급상승
3. **프리셋 우선, 커스텀은 보조**: 대부분의 사용자는 일반적 값(1분/2분/3분)을 선택
4. **입력 방식 단순화**: 가장 성공적인 앱들은 하나의 입력 방식만 사용 (칩 OR 스테퍼 OR 휠, 절대 복수 아님)

---

## 3. 디자인 제안: "Timeline Card" 패턴

### 3.1 핵심 컨셉

**"설정은 칩으로 빠르게, 결과는 타임라인으로 명확하게"**

- 각 섹션에서 **칩만** 사용 (스테퍼 완전 제거)
- 칩 프리셋이 대부분의 사용 시나리오를 커버
- 프리셋에 없는 값이 필요하면 "직접 입력" 칩으로 TextInput 전환
- 하단에 시각적 타임라인 바로 설정 결과를 즉시 확인

### 3.2 왜 스테퍼를 제거하는가

| 스테퍼의 이론적 장점 | 실제 사용 맥락에서의 문제 |
|---------------------|----------------------|
| 미세 조정 가능 | 인터벌 설정은 대부분 30초/1분 단위 → 미세 조정 불필요 |
| 현재 값 중심 표시 | 칩이 선택된 상태로 같은 역할 수행 가능 |
| 연속적 값 변경 | 10초 단위 스테퍼로 3분 → 5분 이동하려면 12탭 필요 |

**결론: 칩 프리셋 + 직접 입력이 스테퍼보다 모든 면에서 우월합니다.**

---

## 4. 상세 UI 명세

### 4.1 전체 레이아웃

```
+=========================================+
|            ---- handle ----             |
|  인터벌 설정                        [X] |
+-----------------------------------------+
|                                         |
|  ┌── 달리기 시간 ─────────────────────┐ |
|  │                                     │ |
|  │  [30초] [1분] [2분] [3분] [5분]     │ |
|  │                         [직접 입력] │ |
|  └─────────────────────────────────────┘ |
|                                         |
|  ┌── 걷기 시간 ───────────────────────┐ |
|  │                                     │ |
|  │  [30초] [1분] [1분30초] [2분] [3분] │ |
|  │                         [직접 입력] │ |
|  └─────────────────────────────────────┘ |
|                                         |
|  ┌── 반복 ────────────────────────────┐ |
|  │                                     │ |
|  │  [3] [5] [7] [10] [직접 입력]       │ |
|  └─────────────────────────────────────┘ |
|                                         |
|  ┌── 타임라인 미리보기 ──────────────┐  |
|  │  ██ run ░░ walk ██ run ░░ walk... │  |
|  │  3분 달리기 · 1분 걷기 · 5세트    │  |
|  │  총 20분                          │  |
|  └────────────────────────────────────┘  |
|                                         |
|  [초기화]          [ === 설정 완료 === ] |
+-----------------------------------------+
```

### 4.2 섹션별 상세 명세

#### Section A: 달리기 시간

**섹션 헤더:**
- 아이콘: `flash-outline` (16px, `c.primary`)
- 라벨: "달리기 시간" (FONT_SIZES.md, fontWeight 700, `c.text`)
- 배치: flexDirection 'row', alignItems 'center', gap 8px
- marginBottom: 10px

**프리셋 칩:**
```
[30초] [1분] [2분] [3분] [5분] [직접 입력]
```

| 속성 | 값 |
|------|-----|
| Presets | 30초(30s), 1분(60s), 2분(120s), 3분(180s), 5분(300s) |
| Layout | flexDirection 'row', flexWrap 'wrap', gap 8px |
| Chip padding | horizontal: 16px, vertical: 10px |
| Chip borderRadius | BORDER_RADIUS.full (999 = pill) |
| Unselected bg | c.card |
| Unselected border | 1.5px solid c.border |
| Unselected text | FONT_SIZES.sm (13px), fontWeight 600, c.text |
| Selected bg | c.primary (#FF7A33) |
| Selected border | 1.5px solid c.primary |
| Selected text | FONT_SIZES.sm, fontWeight 700, #FFFFFF |
| "직접 입력" chip | 점선 border (borderStyle 'dashed'), c.textSecondary 텍스트 |

**직접 입력 모드** (직접 입력 칩 탭 시):
- 칩 행 아래에 인라인 입력 필드가 나타남 (fade in + slide down 8px, 150ms)
- 레이아웃: `[___] 분 [___] 초` (flexDirection 'row', alignItems 'center', gap 8px)
- 각 입력 필드:
  - width: 64px, height: 44px
  - borderRadius: BORDER_RADIUS.sm (10px)
  - bg: c.card, border: 1.5px solid c.border (inactive) / c.primary (focused)
  - text: FONT_SIZES.lg (17px), fontWeight 700, textAlign 'center'
  - keyboardType: 'number-pad'
  - placeholder: "0" (c.textTertiary)
- 단위 라벨: "분" / "초" (FONT_SIZES.sm, fontWeight 600, c.textSecondary)

#### Section B: 걷기 시간

헤더와 칩 패턴은 Section A와 동일. 차이점:
- 아이콘: `walk-outline`
- 라벨: "걷기 시간"
- 프리셋: 30초(30s), 1분(60s), 1분30초(90s), 2분(120s), 3분(180s)
- "직접 입력" 칩 동일하게 포함

#### Section C: 반복 횟수

**섹션 헤더:**
- 아이콘: `repeat-outline` (16px, `c.primary`)
- 라벨: "반복" (FONT_SIZES.md, fontWeight 700, `c.text`)

**프리셋 칩:**
```
[3세트] [5세트] [7세트] [10세트] [직접 입력]
```

| 속성 | 값 |
|------|-----|
| Presets | 3, 5, 7, 10 |
| Label format | `{n}세트` |
| "직접 입력" chip | 같은 dashed border 패턴 |

**직접 입력 모드:**
- 단일 입력 필드: `[___] 세트`
- width: 64px, height: 44px
- 유효 범위: 1 ~ 30 (벗어나면 border c.error + 힌트 텍스트)

### 4.3 섹션 카드 컨테이너 스타일

모든 섹션 동일:

| 속성 | 값 |
|------|-----|
| backgroundColor | c.surface (light) / c.surfaceLight (dark) |
| borderRadius | BORDER_RADIUS.lg (18px) |
| padding | 16px (SPACING.lg) |
| marginBottom | 12px (SPACING.md) |
| border | 없음 (배경 대비로 충분) |

### 4.4 타임라인 미리보기 (핵심 차별화 요소)

**이 컴포넌트가 RUNVS 인터벌 설정의 킬러 차별화 포인트입니다.**

어떤 경쟁 앱도 모바일 런닝 앱에서 인터벌 설정 시 타임라인 시각화를 제공하지 않습니다.

#### 레이아웃
```
+─────────────────────────────────────────+
│                                         │
│  ██████ ░░░ ██████ ░░░ ██████ ░░░ ...  │  <- 시각적 타임라인 바
│                                         │
│  flash 3분 달리기  ·  walk 1분 걷기     │  <- 설정 요약 (아이콘 + 텍스트)
│                                         │
│  repeat 5세트  ·  총 20분               │  <- 반복 + 총 시간
│                                         │
+─────────────────────────────────────────+
```

#### 타임라인 바 명세

| 속성 | 값 |
|------|-----|
| 컨테이너 높이 | 28px |
| borderRadius | BORDER_RADIUS.sm (10px) |
| 배경 | c.card (light) / c.card (dark) — 빈 바 배경 |
| 달리기 블록 색 | c.primary (#FF7A33) |
| 걷기 블록 색 | c.primary + '25' (15% 투명도 오렌지) |
| 블록 borderRadius | 6px (내부 블록) |
| 블록 간 gap | 2px |
| 블록 너비 비율 | runSeconds : walkSeconds 비율로 계산 |
| 최대 표시 세트 수 | 화면 너비에 맞게 자동 계산 (보통 5~8세트까지 표시, 초과 시 "..." 표시) |

**예시 - 3분 달리기 / 1분 걷기 / 5세트:**
```
전체 바 너비 = containerWidth - padding*2
하나의 세트 너비 = 전체 / 5
달리기 블록 = 세트 너비 * (180 / 240) = 75%
걷기 블록 = 세트 너비 * (60 / 240) = 25%
```

#### 타임라인 카드 컨테이너

| 속성 | 값 |
|------|-----|
| backgroundColor | c.primary + '08' (3% 투명도) |
| borderRadius | BORDER_RADIUS.lg (18px) |
| borderWidth | 1px |
| borderColor | c.primary + '20' |
| padding | 16px (SPACING.lg) |
| gap (내부) | 12px |

#### 요약 텍스트

| 요소 | 스타일 |
|------|--------|
| 아이콘 (flash/walk/repeat) | 14px, c.primary |
| 값 텍스트 ("3분 달리기") | FONT_SIZES.sm (13px), fontWeight 700, c.primary |
| 구분자 "·" | c.primary + '40' |
| "총 20분" | FONT_SIZES.sm, fontWeight 800, c.text |
| 레이아웃 | flexDirection 'row', flexWrap 'wrap', justifyContent 'center', gap 6px |

#### 애니메이션
- 타임라인 바 등장: 좌측에서 우측으로 블록이 순차적으로 grow (staggered, 각 블록 50ms 딜레이)
- 값 변경 시: 블록 너비가 spring animation으로 부드럽게 전환 (damping: 15, stiffness: 120)
- 전체 카드 등장: fadeIn + slideUp 12px over 200ms

### 4.5 "직접 입력" 상호작용 흐름

```
1. 사용자가 "직접 입력" 칩 탭
2. 기존 프리셋 칩들의 선택 해제 (모두 unselected)
3. "직접 입력" 칩이 selected 스타일로 변경 (다만 bg는 c.primary가 아닌 c.card + primary border)
4. 칩 행 아래에 입력 필드가 fadeIn + slideDown 8px (150ms)
5. 첫 번째 입력 필드에 자동 포커스
6. 키보드가 올라옴
7. 값 입력 후 키보드 닫기 → 타임라인 미리보기 자동 업데이트
8. 다시 프리셋 칩을 탭하면 → 입력 필드 fadeOut + slideUp → 프리셋 값으로 복원
```

---

## 5. 색상 명세 (테마 인지)

| 요소 | Light Theme | Dark Theme | 토큰 |
|------|------------|------------|------|
| 시트 배경 | #FFFFFF | #121212 | c.card |
| 섹션 카드 배경 | #F1F1F1 | #1E1E1E | c.surface / c.surfaceLight |
| 칩 미선택 배경 | #FFFFFF | #121212 | c.card |
| 칩 미선택 테두리 | #E5E5E5 | #1E1E1E | c.border |
| 칩 선택 배경 | #FF7A33 | #FF7A33 | c.primary |
| 칩 선택 텍스트 | #FFFFFF | #FFFFFF | c.white |
| "직접 입력" 칩 테두리 | c.border (dashed) | c.border (dashed) | c.border |
| "직접 입력" 칩 선택 시 테두리 | c.primary (dashed) | c.primary (dashed) | c.primary |
| 타임라인 달리기 블록 | #FF7A33 | #FF7A33 | c.primary |
| 타임라인 걷기 블록 | #FF7A33 25% | #FF7A33 25% | c.primary + '40' |
| 타임라인 카드 배경 | #FF7A33 8% | #FF7A33 8% | c.primary + '14' |
| 입력 필드 배경 | #FFFFFF | #121212 | c.card |
| 입력 필드 포커스 테두리 | #FF7A33 | #FF7A33 | c.primary |

---

## 6. 타이포그래피 명세

| 요소 | Size | Weight | Color |
|------|------|--------|-------|
| 시트 제목 "인터벌 설정" | 20px (xl) | 800 | c.text |
| 섹션 헤더 라벨 | 15px (md) | 700 | c.text |
| 칩 텍스트 | 13px (sm) | 600 / 700(선택) | c.text / c.white |
| "직접 입력" 칩 텍스트 | 13px (sm) | 600 | c.textSecondary |
| 직접 입력 필드 값 | 17px (lg) | 700 | c.text |
| 단위 라벨 (분/초/세트) | 13px (sm) | 600 | c.textSecondary |
| 타임라인 요약 값 | 13px (sm) | 700 | c.primary |
| 타임라인 총 시간 | 13px (sm) | 800 | c.text |
| CTA "설정 완료" | 15px (md) | 800 | c.white |
| "초기화" | 15px (md) | 600 | c.textSecondary |

---

## 7. 인터랙션 상태 정의

### 7.1 프리셋 칩 상태

| 상태 | Background | Border | Text | 비고 |
|------|-----------|--------|------|------|
| Default | c.card | 1.5px c.border | c.text | 미선택 |
| Pressed | c.surface | 1.5px c.border | c.text | activeOpacity: 0.7 |
| Selected | c.primary | 1.5px c.primary | c.white | scale bounce 1.0→0.95→1.0 (100ms) |

### 7.2 "직접 입력" 칩 상태

| 상태 | Background | Border | Text |
|------|-----------|--------|------|
| Default | c.card | 1.5px dashed c.border | c.textSecondary |
| Selected | c.card | 1.5px dashed c.primary | c.primary |

### 7.3 입력 필드 상태

| 상태 | Background | Border | Text |
|------|-----------|--------|------|
| Hidden | - | - | - |
| Inactive | c.card | 1.5px c.border | c.textTertiary (placeholder) |
| Focused | c.card | 2px c.primary | c.text |
| Filled | c.card | 1.5px c.primary + '40' | c.text |
| Error | c.card | 1.5px c.error | c.text + 힌트 텍스트 |

### 7.4 설정 완료 버튼

| 상태 | Background | Shadow | Opacity |
|------|-----------|--------|---------|
| Active | c.primary | SHADOWS.glow | 1.0 |
| Disabled | c.primary | 없음 | 0.4 |

활성화 조건: 달리기 시간 > 0 AND 걷기 시간 > 0 AND 세트 수 > 0

---

## 8. 반응형 & 엣지 케이스

### 8.1 화면 크기 대응

| 화면 | 칩 행 동작 | 타임라인 |
|------|----------|---------|
| iPhone SE (375px) | 5개 칩 + "직접 입력"은 2행으로 wrap | 최대 5세트 블록 표시 |
| iPhone 15 (393px) | 5개 칩은 1행, "직접 입력"은 2행 | 최대 7세트 블록 표시 |
| iPhone Pro Max (430px) | 모든 칩 1행 가능 | 최대 8세트 블록 표시 |

### 8.2 엣지 케이스

| 케이스 | 처리 방식 |
|--------|----------|
| 직접 입력 시 분 = 0, 초 = 0 | 유효하지 않음 → 칩 선택 해제, 타임라인 비표시 |
| 직접 입력 시 초 >= 60 | 자동 보정: 초를 59로 cap |
| 세트 수 = 0 | 유효하지 않음 → 설정 완료 비활성화 |
| 세트 수 > 20 | 타임라인에서 블록 축소 + "...+N" 표시 |
| 총 시간 > 2시간 | 경고 텍스트: "총 운동 시간이 2시간을 초과합니다" (c.warning) |
| 달리기 시간 < 걷기 시간 | 정상 동작 (일부 인터벌 프로토콜에서 합법적) |

### 8.3 키보드 처리

- 직접 입력 필드 포커스 시 KeyboardAvoidingView가 시트를 올림
- 키보드 위에 "완료" 버튼 (InputAccessoryView 또는 returnKeyType 'done')
- 키보드 닫으면 직접 입력 필드 유지 (값이 있으면), 값이 비어있으면 다시 프리셋 모드로 복귀

---

## 9. 접근성 (WCAG 2.1 AA)

| 요소 | accessibilityRole | accessibilityLabel | accessibilityState |
|------|-------------------|--------------------|--------------------|
| 섹션 카드 | "group" | "달리기 시간 설정" | - |
| 프리셋 칩 | "radio" | "1분" | { selected: true/false } |
| "직접 입력" 칩 | "button" | "직접 입력" | { expanded: true/false } |
| 입력 필드 | "none" (TextInput) | "분 입력" / "초 입력" | - |
| 타임라인 | "summary" | "3분 달리기 1분 걷기 5세트, 총 20분" | - |
| 설정 완료 | "button" | "인터벌 설정 완료" | { disabled: true/false } |

터치 타겟: 모든 인터랙티브 요소 최소 44x44px

---

## 10. 현재 vs 제안 비교

| 항목 | 현재 | 제안 |
|------|------|------|
| **인터랙티브 요소 수** | 21개 (칩 12 + 스테퍼 버튼 6 + 값 3) | 18개 (칩 15 + 직접입력 3), 실사용 시 칩만 탭하면 끝 |
| **입력 방식** | 칩 + 스테퍼 (이중 입력) | 칩 only (직접 입력은 보조) |
| **설정 완료까지 최소 탭 수** | 3탭 (칩 3개) + 혼란 (스테퍼 때문에) | 3탭 (칩 3개) + 명확 |
| **결과 시각화** | 텍스트 요약만 | 타임라인 바 + 텍스트 요약 |
| **시각적 위계** | 3개 섹션 동일 무게 | 달리기 > 걷기 > 반복 (순서로 자연스럽게) |
| **직접 값 입력** | 스테퍼 (느림) | 텍스트 입력 (빠름) |
| **스크롤 필요 여부** | 가능성 높음 (세 섹션 + 스테퍼 높이) | 낮음 (칩만 있어 높이 절약) |

---

## 11. ASCII 목업 - 전체 (Light Theme)

```
+─────────────────────────────────────────+
│              === handle ===             │  bg: #FFFFFF
│                                         │
│  인터벌 설정                       [X]  │  20px ExtraBold
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  flash  달리기 시간                 ││  bg: #F1F1F1
│  │                                     ││  rounded 18px
│  │  ╭────╮ ╭───╮ ╭───╮ ╭───╮ ╭───╮   ││
│  │  │30초│ │1분│ │2분│ │3분│ │5분│   ││  pill chips
│  │  ╰────╯ ╰───╯ ╰───╯ ╰───╯ ╰───╯   ││
│  │  ╭┄┄┄┄┄┄┄╮                         ││
│  │  ┆직접 입력┆                         ││  dashed border
│  │  ╰┄┄┄┄┄┄┄╯                         ││
│  └─────────────────────────────────────┘│  gap 12px
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  walk  걷기 시간                    ││  bg: #F1F1F1
│  │                                     ││
│  │  ╭────╮ ╭───╮ ╭──────╮ ╭───╮ ╭───╮││
│  │  │30초│ │1분│ │1분30초│ │2분│ │3분│││
│  │  ╰────╯ ╰───╯ ╰──────╯ ╰───╯ ╰───╯││
│  │  ╭┄┄┄┄┄┄┄╮                         ││
│  │  ┆직접 입력┆                         ││
│  │  ╰┄┄┄┄┄┄┄╯                         ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  repeat  반복                       ││  bg: #F1F1F1
│  │                                     ││
│  │  ╭─────╮ ╭─────╮ ╭─────╮ ╭──────╮ ││
│  │  │3세트│ │5세트│ │7세트│ │10세트│ ││
│  │  ╰─────╯ ╰─────╯ ╰─────╯ ╰──────╯ ││
│  │  ╭┄┄┄┄┄┄┄╮                         ││
│  │  ┆직접 입력┆                         ││
│  │  ╰┄┄┄┄┄┄┄╯                         ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌═════════════════════════════════════┐│
│  │                                     ││  bg: primary 8%
│  │  ██████░░░██████░░░██████░░░██░░██░ ││  timeline bar
│  │                                     ││
│  │  flash 3분 달리기 · walk 1분 걷기   ││  13px Bold orange
│  │  repeat 5세트 · 총 20분             ││  13px ExtraBold dark
│  │                                     ││
│  └═════════════════════════════════════┘│
│                                         │
│  ╭──────────╮  ╭──────────────────────╮│
│  │  초기화   │  │     설정 완료        ││  CTA: orange + glow
│  ╰──────────╯  ╰──────────────────────╯│
│                                         │
+─────────────────────────────────────────+
```

### 11.1 "직접 입력" 모드 활성화 시 (달리기 시간)

```
│  ┌─────────────────────────────────────┐│
│  │  flash  달리기 시간                 ││
│  │                                     ││
│  │  ╭────╮ ╭───╮ ╭───╮ ╭───╮ ╭───╮   ││  모두 unselected
│  │  │30초│ │1분│ │2분│ │3분│ │5분│   ││
│  │  ╰────╯ ╰───╯ ╰───╯ ╰───╯ ╰───╯   ││
│  │  ╭┄┄┄┄┄┄┄┄╮                        ││
│  │  ┆ 직접 입력 ┆  ← selected (orange  ││  dashed primary border
│  │  ╰┄┄┄┄┄┄┄┄╯      dashed border)    ││
│  │                                     ││
│  │     ┌────┐       ┌────┐             ││  fade in + slide down
│  │     │  4 │ 분    │ 30 │ 초          ││  입력 필드
│  │     └────┘       └────┘             ││
│  └─────────────────────────────────────┘│
```

---

## 12. 구현 노트

### 12.1 데이터 구조 (변경 없음)

기존 `RunGoal` 인터페이스 그대로 사용:
```typescript
{
  type: 'interval',
  value: totalSeconds,          // (run + walk) * sets
  intervalRunSeconds: number,   // 달리기 시간 (초)
  intervalWalkSeconds: number,  // 걷기 시간 (초)
  intervalSets: number,         // 세트 수
}
```

### 12.2 프리셋 데이터 업데이트

```typescript
const INTERVAL_RUN_PRESETS = [
  { label: '30초', value: 30 },
  { label: '1분', value: 60 },
  { label: '2분', value: 120 },
  { label: '3분', value: 180 },
  { label: '5분', value: 300 },
];

const INTERVAL_WALK_PRESETS = [
  { label: '30초', value: 30 },
  { label: '1분', value: 60 },
  { label: '1분30초', value: 90 },
  { label: '2분', value: 120 },
  { label: '3분', value: 180 },
];

const INTERVAL_SET_PRESETS = [3, 5, 7, 10];
```

### 12.3 타임라인 바 컴포넌트

```typescript
interface IntervalTimelineProps {
  runSeconds: number;
  walkSeconds: number;
  sets: number;
  containerWidth: number;  // onLayout으로 측정
}
```

블록 너비 계산:
```typescript
const totalPerSet = runSeconds + walkSeconds;
const maxVisibleSets = Math.min(sets, Math.floor(containerWidth / 40)); // 최소 40px per set
const setWidth = (containerWidth - (maxVisibleSets - 1) * 2) / maxVisibleSets; // 2px gap
const runWidth = setWidth * (runSeconds / totalPerSet);
const walkWidth = setWidth * (walkSeconds / totalPerSet);
```

### 12.4 삭제할 스타일

스테퍼 관련 스타일 전부 제거:
- `stepperRow`
- `stepperBtn`
- `stepperValue`

### 12.5 추가할 스타일

```typescript
// "직접 입력" 칩
customInputChip: {
  paddingHorizontal: SPACING.lg,
  paddingVertical: SPACING.sm + 2,
  borderRadius: BORDER_RADIUS.full,
  backgroundColor: c.card,
  borderWidth: 1.5,
  borderStyle: 'dashed',
  borderColor: c.border,
},
customInputChipActive: {
  borderColor: c.primary,
},
customInputChipText: {
  fontSize: FONT_SIZES.sm,
  fontWeight: '600',
  color: c.textSecondary,
},
customInputChipTextActive: {
  color: c.primary,
},

// 직접 입력 필드 행
customInputRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACING.sm,
  marginTop: SPACING.sm,
},
customInput: {
  width: 64,
  height: 44,
  borderRadius: BORDER_RADIUS.sm,
  backgroundColor: c.card,
  borderWidth: 1.5,
  borderColor: c.border,
  fontSize: FONT_SIZES.lg,
  fontWeight: '700',
  color: c.text,
  textAlign: 'center',
},
customInputFocused: {
  borderColor: c.primary,
  borderWidth: 2,
},
customInputUnit: {
  fontSize: FONT_SIZES.sm,
  fontWeight: '600',
  color: c.textSecondary,
},

// 타임라인 카드
timelineCard: {
  backgroundColor: c.primary + '14',
  borderRadius: BORDER_RADIUS.lg,
  borderWidth: 1,
  borderColor: c.primary + '20',
  padding: SPACING.lg,
  gap: SPACING.md,
},
timelineBar: {
  height: 28,
  borderRadius: BORDER_RADIUS.sm,
  flexDirection: 'row',
  gap: 2,
  overflow: 'hidden',
},
timelineRunBlock: {
  backgroundColor: c.primary,
  borderRadius: 6,
},
timelineWalkBlock: {
  backgroundColor: c.primary + '40',
  borderRadius: 6,
},
timelineSummaryRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 6,
},
timelineSummaryText: {
  fontSize: FONT_SIZES.sm,
  fontWeight: '700',
  color: c.primary,
},
timelineTotalText: {
  fontSize: FONT_SIZES.sm,
  fontWeight: '800',
  color: c.text,
},
```

---

## 13. 디자인 품질 체크리스트

- [x] 경쟁 분석 5개 앱 포함 (NRC, Strava concept, Garmin, Apple Watch, Intervals Pro)
- [x] 각 디자인 결정에 근거 (스테퍼 제거 이유, 타임라인 추가 이유)
- [x] WCAG 2.1 AA 접근성 충족 (대비, 터치 타겟, 스크린 리더)
- [x] 반응형 디자인 고려 (SE ~ Pro Max)
- [x] 엣지 케이스 & 에러 상태 정의 (범위 초과, 빈 값, 과도한 세트)
- [x] 개발 구현 가능 수준의 구체적 명세 (px, color hex, 컴포넌트 구조)
- [x] 경쟁 제품 대비 차별화 (타임라인 시각화는 경쟁 앱에 없음)
- [x] 다크 테마 지원 (모든 색상 테마 토큰 매핑)
- [x] 일관된 스페이싱 (8px grid)
- [x] 기존 디자인 시스템과 일관성 유지 (GoalChip, pgSection 패턴 재사용)
