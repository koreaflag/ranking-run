# RUNVS 디자인 방향: "Refined Competition"

## 컨셉
프리미엄 미니멀 디자인 + 경쟁 요소.
**핵심 키워드: 경쟁, 랭킹, 도전, 기록 갱신**

RUNVS는 **런닝 경쟁앱**이다.
유저가 코스를 만들고 그 코스에서 다른 러너와 기록으로 경쟁하는 것이 핵심.

---

## 디자인 원칙

1. **Premium Minimal** — 여백과 타이포그래피로 고급스러움 표현
2. **Warm Tone** — 차가운 회색 대신 Stone 계열 따뜻한 뉴트럴
3. **Bold Data** — 숫자(거리, 페이스, 시간)를 가장 크고 굵게
4. **Subtle Accent** — 인디고 기반 억제된 액센트, 과하지 않게
5. **Competition without Aggression** — 게임 느낌 없이 세련된 경쟁 UI

---

## 컬러 시스템

### Primary: Indigo (#6366F1)
- 프리미엄, 모던, 경쟁적이지만 공격적이지 않은 톤
- 다크 모드: #818CF8 (밝은 인디고)

### Secondary: Blue (#3B82F6)
- 데이터, 페이스, 정보성 요소

### Accent: Amber (#F59E0B)
- 달성, PB, 랭킹 하이라이트, 경쟁 에너지

### Neutrals: Stone 계열
- Background: #FAFAF9 (따뜻한 화이트)
- Surface: #F5F5F4
- Text: #1C1917 (따뜻한 블랙)
- TextSecondary: #78716C
- TextTertiary: #A8A29E

### Running HUD (다크 모드)
- 배경: #0C0A09 (Stone-950)
- 카드: #292524 (Stone-800)
- 악센트: 인디고 (#6366F1) — START 버튼, 재개 버튼

### 난이도 색상 (부드러운 톤)
| 난이도 | 색상 | 라벨 |
|--------|------|------|
| Easy | #34D399 | 입문 |
| Normal | #60A5FA | 보통 |
| Hard | #FBBF24 | 도전 |
| Expert | #F87171 | 고급 |
| Legend | #A78BFA | 전설 |

---

## 타이포그래피

- 수치 데이터: `fontWeight: '900'`, `fontVariant: ['tabular-nums']`
- 섹션 제목: `fontWeight: '800'`, 음의 letterSpacing
- 본문: `fontWeight: '500'`
- 라벨: `fontWeight: '600'`, 대문자, 넓은 letterSpacing

---

## 카드 & 컴포넌트

### 카드 스타일
- 배경: `c.card` (화이트)
- 보더: 1px `c.border` (미세한 선)
- 보더 레디우스: 18px (BORDER_RADIUS.lg)
- 그림자: 따뜻한 sm shadow (shadowColor: '#1C1917')

### 난이도 뱃지
- 배경: 난이도 색상 + 10% 투명도 (예: #34D399 + '18')
- 텍스트: 난이도 색상 원색
- 라운드 필 스타일

### 버튼
- Primary: 인디고 배경, 화이트 텍스트, md shadow (glow 아님)
- Outline: 미세한 보더, 투명 배경
- Full rounded (BORDER_RADIUS.full)

### GlassCard
- 글래스모피즘 유지 (프리미엄 느낌)
- BlurView + 반투명 배경

---

## 경쟁 UI 요소

### 리더보드
- 1-3위: 골드/실버/브론즈 배지 (원형)
- 내 기록 (ME): 인디고 배경 틴트, 인디고 닉네임
- 공격적인 빨간 하이라이트 대신 부드러운 강조

### 도전 CTA
- "도전하기" / "다시 도전하기"
- 1위와의 격차 표시
- 인디고 버튼 (md shadow)

### 코스 카드
- 좌측 보더 컬러 코딩 제거 (게임적 요소)
- 난이도 뱃지로 미세하게 표현
- 거리 수치를 가장 크게
- 통계는 하단에 디바이더로 구분

---

## 다크 모드

Stone 계열 다크 톤 사용 (순수 블랙 아닌 따뜻한 다크):
- Background: #0C0A09
- Surface: #1C1917
- Card: #1C1917
- Border: #292524
- Primary: #818CF8 (다크 모드용 밝은 인디고)
