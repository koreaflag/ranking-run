# WorldScreen - Map Search & Walking Navigation Design Specification

## Document Info
- **Date**: 2026-02-17
- **Feature**: Map Search (지도 검색) + Walking Navigation (도보 네비게이션)
- **Screen**: WorldScreen (`/src/screens/world/WorldScreen.tsx`)
- **Design System**: `/src/utils/constants.ts`

---

## 1. Competitor Analysis (경쟁 제품 분석)

### 1.1 Map Search Patterns

| Product | Search Placement | Autocomplete Style | Result Display | Unique Pattern |
|---------|-----------------|-------------------|----------------|----------------|
| **Kakao Map** | Top bar, full-width pill | Full-screen overlay with categorized results (recent, favorites, places) | Red pins + list panel | Single search box handles all queries (bus, place, address) |
| **Naver Map** | Top bar, pill with category chips below | Full-screen takeover with tab categories | Green pins + bottom sheet | Category tabs (맛집/카페/편의점) for quick filtering |
| **Google Maps** | Top bar, rounded rectangle with shadow | Full-screen overlay, recent + suggestion mix | Red standard pins + info card | "Explore nearby" suggestions, voice search icon |
| **Strava** | Routes tab search bar, filters below | Inline dropdown, keyword-based | Route overlay on map, list toggle | Filters by distance/elevation/surface type |

**Key Insights**:
- Korean map apps (Kakao, Naver) use full-screen search overlays -- users expect this pattern
- All major apps place search at the very top of the screen, inside SafeAreaView
- Autocomplete should show recent searches + suggested places simultaneously
- Search results should appear both as map pins AND in a scrollable list

### 1.2 Walking Navigation Patterns

| Product | Nav Entry Point | Direction Display | Progress Indicator | Arrival Feedback |
|---------|----------------|-------------------|-------------------|-----------------|
| **Kakao Map** | "길찾기" button on place card | Bottom sheet with step list + top turn card | Blue route line, position dot | Distance countdown, vibration |
| **Naver Map** | "도보" tab in route planner | Full-width turn card at top, step-by-step below | Animated blue chevrons on route | Voice announcement, badge popup |
| **Google Maps** | Walking mode in directions | Top banner with next turn arrow + street name | Blue route line with progress dot | "You have arrived" card + sound |
| **Strava** | "Navigate to Start" on route page | Compass arrow pointing to start | Distance/time remaining in header | Transition to activity recording |

**Key Insights**:
- Walking navigation typically shows a simplified UI compared to driving
- Turn cards at the top are standard; bottom sheets for full step list
- Route progress is shown via a shrinking route line (walked portion fades/changes color)
- Running apps (Strava) specifically have "navigate to start point" as a distinct feature
- ETA display uses both time and distance remaining

### 1.3 Differentiation Opportunities for RunCrew

| Gap | Opportunity | RunCrew Approach |
|-----|-------------|-----------------|
| No running app combines course discovery with walk-to-start navigation | Seamless flow: find course -> navigate to start -> begin race | "코스로 안내" button on course card |
| Map search in running apps is basic (text only) | Rich search with course-aware results | Search shows both places AND nearby RunCrew courses |
| Navigation UIs are generic (not sport-themed) | Sport/racing-themed navigation | Countdown-style ETA, "approaching start line" metaphor |
| No "search for courses by area" | Area-based course discovery via map search | Search "한강" shows Hangang-area courses |

---

## 2. Screen Modes (화면 모드)

WorldScreen operates in THREE distinct modes with smooth transitions:

```
[Normal Mode] --tap search--> [Search Mode] --select place--> [Normal Mode (camera moved)]
[Normal Mode] --tap 코스로 안내--> [Navigation Mode] --arrive--> [Normal Mode + celebration]
```

### Mode Summary

| Mode | Top Area | Map State | Bottom Area | Right Controls |
|------|----------|-----------|-------------|----------------|
| **Normal** | Weather widget + search icon | Full interactive, course markers | Course card / nearest card | My location button |
| **Search** | Search input (focused) | Dimmed, non-interactive | Autocomplete results list | Cancel button |
| **Navigation** | Navigation header (ETA + distance) | Route line + user position, auto-follow | Turn instruction card | Pause/cancel controls |

---

## 3. Feature 1: Map Search UI (지도 검색)

### 3.1 Search Entry Point (Normal Mode)

**Design Decision**: Replace the current weather widget's position with a combined weather + search row. Add a search icon button to the right of the weather widget, before the marker count badge. This avoids cluttering the top bar while making search discoverable.

**Alternative Considered**: Full search bar always visible at top. Rejected because it would obscure map content and conflict with the "open world" immersive feeling.

#### Component: SearchTriggerButton

```
Location: Top bar, between weather widget and marker count badge
Size: 36 x 36px (touchable: 44 x 44px)
Shape: Circle
Background: COLORS.white (#FFFFFF)
Shadow: SHADOWS.sm
Icon: Ionicons "search" size 18, color COLORS.text (#111111)
```

**Interaction**: Tap triggers transition to Search Mode.

### 3.2 Search Mode (Full-Screen Overlay)

When the user taps the search trigger, WorldScreen transitions to Search Mode.

#### Transition Animation (Normal -> Search)
```
Duration: 280ms
Easing: Expo.easeOut (cubic-bezier(0.16, 1, 0.3, 1))

1. Map dims to 40% opacity (overlay backgroundColor: rgba(0,0,0,0.6))
2. Search bar slides down from top (translateY: -60 -> 0)
3. Bottom course card slides down and fades (translateY: 0 -> 100, opacity: 1 -> 0)
4. Weather widget fades out (opacity: 1 -> 0)
5. Marker count badge fades out (opacity: 1 -> 0)
6. Autocomplete panel fades in (opacity: 0 -> 1, delay: 100ms)
```

#### Component: SearchBar

```
Position: SafeAreaView top, paddingHorizontal: SPACING.xxl (24px)
Height: 52px
Background: COLORS.white (#FFFFFF)
Border: 2px solid COLORS.text (#111111)
BorderRadius: BORDER_RADIUS.full (999px) -- pill shape
Shadow: SHADOWS.md

Layout (row):
  [Back Arrow 20px] [gap 12px] [TextInput flex:1] [Clear Button 20px | Voice Button 20px]

Back Arrow:
  Icon: Ionicons "arrow-back" size 20
  Color: COLORS.text (#111111)
  Touch target: 44x44
  Action: Exit search mode

TextInput:
  Placeholder: "장소, 주소, 코스 검색"
  PlaceholderColor: COLORS.textTertiary (#999999)
  Font: FONT_SIZES.md (15px), weight 500
  Color: COLORS.text (#111111)
  autoFocus: true
  returnKeyType: "search"

Clear Button (visible when text.length > 0):
  Icon: Ionicons "close-circle" size 20
  Color: COLORS.textTertiary (#999999)
  Action: Clear text input

Voice Button (visible when text.length === 0):
  Icon: Ionicons "mic-outline" size 20
  Color: COLORS.textTertiary (#999999)
  Action: Voice search (future feature)
```

#### Component: AutocompleteDropdown

```
Position: Below SearchBar, marginTop: SPACING.sm (8px)
Horizontal padding: SPACING.xxl (24px)
Background: COLORS.white (#FFFFFF)
BorderRadius: BORDER_RADIUS.lg (16px)
Shadow: SHADOWS.lg
MaxHeight: 60% of screen height
```

**Content Sections** (in order of priority):

##### Section A: Recent Searches (최근 검색)
```
Header:
  Text: "최근 검색"
  Font: FONT_SIZES.sm (13px), weight 700
  Color: COLORS.textSecondary (#666666)
  Padding: 16px horizontal, 12px vertical
  Right action: "전체 삭제" (clear all)
    Font: FONT_SIZES.xs (11px), weight 500
    Color: COLORS.textTertiary (#999999)

Each row:
  Height: 48px
  Layout (row): [Icon 20px] [gap 12px] [Text flex:1] [Delete 16px]
  Icon: Ionicons "time-outline" size 18, color COLORS.textTertiary
  Text: FONT_SIZES.md (15px), weight 500, color COLORS.text
  Delete: Ionicons "close" size 16, color COLORS.textTertiary
  Separator: 1px solid COLORS.divider (#F0F0F0), marginLeft 44px
```

##### Section B: Course Suggestions (코스 추천) -- shown when query matches course names
```
Header:
  Text: "코스"
  Font: FONT_SIZES.sm (13px), weight 700
  Color: COLORS.textSecondary (#666666)
  Left icon: Ionicons "flag" size 14, color COLORS.primary (#C8FF00)
  Background highlight: rgba(200, 255, 0, 0.08) -- subtle lime tint

Each row:
  Height: 56px
  Layout (row): [DifficultyDot 8px] [gap 12px] [Column flex:1] [Distance badge]
  DifficultyDot: Circle, colored by difficulty (easy=success, medium=warning, hard=accent)
  Column:
    Title: FONT_SIZES.md (15px), weight 700, color COLORS.text
    Subtitle: FONT_SIZES.xs (11px), weight 500, color COLORS.textTertiary
             Format: "2.4km  32회 도전  4.2"
  Distance badge:
    Text: "850m" (distance from user)
    Font: FONT_SIZES.xs (11px), weight 700
    Color: COLORS.text
    Background: COLORS.surface (#F7F8FA)
    Padding: 4px 8px
    BorderRadius: BORDER_RADIUS.full
```

##### Section C: Place Suggestions (장소) -- from geocoding API
```
Header:
  Text: "장소"
  Font: FONT_SIZES.sm (13px), weight 700
  Color: COLORS.textSecondary (#666666)

Each row:
  Height: 52px
  Layout (row): [Icon 20px] [gap 12px] [Column flex:1]
  Icon: Ionicons "location-outline" size 18, color COLORS.textSecondary
  Column:
    Title: FONT_SIZES.md (15px), weight 500, color COLORS.text
      Matching text is bolded (weight 800)
    Address: FONT_SIZES.xs (11px), weight 400, color COLORS.textTertiary
  Separator: 1px solid COLORS.divider, marginLeft 44px
```

#### Component: SearchResultPin (on map, after search)

```
When a place is selected from autocomplete:
1. Search mode dismisses (reverse animation)
2. Map animates to the selected location
3. A search result pin appears at the location

Pin design:
  Outer container: 40 x 52px
  Pin head: 40 x 40px circle
    Background: COLORS.text (#111111)
    Icon: Ionicons "search" size 18, color COLORS.primary (#C8FF00)
  Pin tail: Triangle pointing down, 12px height
    Color: COLORS.text (#111111)
  Drop shadow: SHADOWS.md

  Animation on appear:
    Scale from 0 -> 1.1 -> 1.0 (spring, 300ms)
    Translate from -20px -> 0 (drop-in effect)
```

### 3.3 Search State Diagram

```
[Empty State]
  -> User types -> [Showing Autocomplete]
  -> User taps recent -> [Result Selected]

[Showing Autocomplete]
  -> User taps course -> Navigate to CourseDetail screen
  -> User taps place -> [Result Selected]
  -> User taps search/return key -> [Showing Results List]
  -> User taps back arrow -> [Normal Mode]
  -> User taps clear -> [Empty State]

[Result Selected]
  -> Map moves to location
  -> Search mode dismisses
  -> Search pin appears on map
  -> Nearby courses around pin location load
```

---

## 4. Feature 2: Walking Navigation UI (도보 네비게이션)

### 4.1 Navigation Entry Point

**Entry**: From the selected course card in Normal Mode. Add a third button "코스로 안내" (Navigate to Course) between "상세보기" and "달리기".

**Design Decision**: Three buttons is too crowded in a row. Instead, restructure the course card actions:
- Primary row: "코스로 안내" (full-width, secondary style)
- Second row: "상세보기" (half, outline) + "달리기" (half, primary lime)

This prioritizes the new navigation feature while keeping existing actions accessible.

#### Updated selectedActions Layout

```
Updated card actions area:

Row 1 (Navigation CTA):
  "코스로 안내" button
  Width: 100%
  Height: 44px
  Background: COLORS.text (#111111)
  BorderRadius: BORDER_RADIUS.md (12px)
  Icon: Ionicons "navigate" size 16, color COLORS.primary (#C8FF00)
  Text: "코스로 안내"
    Font: FONT_SIZES.md (15px), weight 700
    Color: COLORS.white (#FFFFFF)
  Subtext (right-aligned): "도보 8분"
    Font: FONT_SIZES.xs (11px), weight 500
    Color: COLORS.textTertiary (#999999)

Row 2 (Existing actions, side by side):
  "상세보기" button -- unchanged (outline style)
  "달리기" button -- unchanged (primary lime)
  Gap between: SPACING.md (12px)

Gap between rows: SPACING.sm (8px)
```

### 4.2 Navigation Mode Transition (Normal -> Navigation)

```
Trigger: User taps "코스로 안내"
Duration: 400ms total
Easing: Expo.easeInOut

Step 1 (0-150ms): Prepare
  - Course card slides down (translateY: 0 -> 150, opacity: 1 -> 0)
  - Weather widget fades out
  - My location button fades out
  - Marker count badge transforms into navigation badge

Step 2 (150-300ms): Route appears
  - Walking route polyline draws on map (animated stroke from user to course start)
  - Map camera adjusts to fit both user position and course start point
  - Route line style: dashed, color COLORS.text (#111111), strokeWidth 4

Step 3 (300-400ms): Navigation UI appears
  - Navigation header slides down from top (translateY: -80 -> 0)
  - Turn instruction card slides up from bottom (translateY: 80 -> 0)
  - Control buttons fade in on right side
```

### 4.3 Navigation Header (Top)

#### Component: NavigationHeader

```
Position: SafeAreaView top area
Height: 72px (content) + SafeArea inset
Background: COLORS.text (#111111)
BorderRadius: 0 0 BORDER_RADIUS.lg BORDER_RADIUS.lg (0 top, 16px bottom corners)
PaddingHorizontal: SPACING.xxl (24px)
PaddingVertical: SPACING.md (12px)
Shadow: SHADOWS.lg

Layout:
  Row: [LeftColumn flex:1] [CenterDivider] [RightColumn flex:1]

LeftColumn (ETA):
  Label: "도착 예정"
    Font: FONT_SIZES.xs (11px), weight 500
    Color: COLORS.runTextSecondary (#999999)
    TextTransform: uppercase, letterSpacing 1
  Value: "8분"
    Font: FONT_SIZES.xxl (24px), weight 900
    Color: COLORS.primary (#C8FF00)
    FontVariant: tabular-nums

CenterDivider:
  Width: 1px
  Height: 36px
  Color: COLORS.runCard (#222222)
  MarginHorizontal: SPACING.xl (20px)

RightColumn (Distance remaining):
  Label: "남은 거리"
    Font: FONT_SIZES.xs (11px), weight 500
    Color: COLORS.runTextSecondary (#999999)
    TextTransform: uppercase, letterSpacing 1
  Value: "650m"
    Font: FONT_SIZES.xxl (24px), weight 900
    Color: COLORS.runText (#FFFFFF)
    FontVariant: tabular-nums

Progress Bar (below the row):
  Height: 3px
  Background: COLORS.runCard (#222222)
  Fill: COLORS.primary (#C8FF00)
  BorderRadius: 1.5px
  Width: percentage based on distance walked / total distance
  Animation: width transitions smoothly (200ms linear)
```

### 4.4 Turn Instruction Card (Bottom)

#### Component: TurnInstructionCard

```
Position: Bottom of screen, above tab bar (bottom: 100px)
Horizontal margin: SPACING.xxl (24px)
Height: auto (content-driven)
Background: COLORS.white (#FFFFFF)
BorderRadius: BORDER_RADIUS.lg (16px)
Padding: SPACING.xl (20px)
Shadow: SHADOWS.lg

Layout:
  Row: [TurnIcon 48x48] [gap 16px] [TextColumn flex:1] [DistanceBadge]

TurnIcon:
  Size: 48 x 48px
  Background: COLORS.surface (#F7F8FA)
  BorderRadius: BORDER_RADIUS.md (12px)
  Icon: Direction arrow (see Turn Icon System below)
  IconSize: 24px
  IconColor: COLORS.text (#111111)

TextColumn:
  Direction text: "좌회전"
    Font: FONT_SIZES.lg (17px), weight 800
    Color: COLORS.text (#111111)
  Street name: "올림픽대로 방면"
    Font: FONT_SIZES.sm (13px), weight 500
    Color: COLORS.textSecondary (#666666)
    marginTop: 2px

DistanceBadge:
  Text: "120m"
  Font: FONT_SIZES.md (15px), weight 800
  Color: COLORS.text (#111111)
  FontVariant: tabular-nums
  Alignment: center, self vertical center
```

#### Turn Icon System
```
Straight: Ionicons "arrow-up"
Turn left: Ionicons "arrow-undo" (mirrored for right)
Turn right: Ionicons "arrow-redo"
Slight left: Ionicons "arrow-up" rotated -30deg
Slight right: Ionicons "arrow-up" rotated 30deg
U-turn: Ionicons "return-down-back"
Arrive: Ionicons "flag" with color COLORS.primary (#C8FF00)
```

### 4.5 Route Line on Map

```
Walking route polyline:
  Color: COLORS.text (#111111)
  StrokeWidth: 4px
  LineDashPattern: [8, 6] (dashed line -- differentiates from course route lines)
  LineCap: "round"

Walked portion (behind user):
  Color: COLORS.textTertiary (#999999)
  StrokeWidth: 3px
  Opacity: 0.4
  LineDashPattern: [8, 6]

Destination marker (course start point):
  Animated pulsing circle:
    Inner: 16px diameter, COLORS.primary (#C8FF00), border 2px COLORS.text
    Outer pulse: 32px diameter, COLORS.primaryLight (#DEFF66), opacity pulsing 0.3 -> 0.0
    Pulse animation: scale 1.0 -> 1.5, opacity 0.3 -> 0, duration 1500ms, infinite loop

  Label above pin:
    Text: "START"
    Font: FONT_SIZES.xs (11px), weight 900, letterSpacing 2
    Color: COLORS.text (#111111)
    Background: COLORS.primary (#C8FF00)
    Padding: 3px 8px
    BorderRadius: BORDER_RADIUS.full (999px)
    Shadow: SHADOWS.sm
    Offset: translateY -28px above the pin
```

### 4.6 Navigation Controls (Right Side)

```
Position: Right side of screen
Bottom: 200px (same as current myLocationButton position)
Gap between buttons: SPACING.sm (8px)

Button 1: Recenter Map
  Same as existing myLocationButton spec:
    44 x 44px, borderRadius 22, white bg, SHADOWS.md
    Icon: Ionicons "locate" size 22, color COLORS.text

Button 2: Cancel Navigation
  44 x 44px, borderRadius 22
  Background: COLORS.white (#FFFFFF)
  Shadow: SHADOWS.md
  Icon: Ionicons "close" size 22, color COLORS.accent (#FF5252)
  Action: Shows confirmation dialog, then exits navigation mode
```

### 4.7 Approaching Destination (< 50m)

When user is within 50 meters of the course start point:

#### Component: ArrivalBanner

```
Trigger: distance to start point < 50m
Animation: Slides down from below navigation header

Position: Below NavigationHeader
Width: 100% - (SPACING.xxl * 2)
Height: 56px
Background: COLORS.primary (#C8FF00)
BorderRadius: BORDER_RADIUS.md (12px)
MarginHorizontal: SPACING.xxl (24px)
MarginTop: SPACING.sm (8px)
Shadow: SHADOWS.glow (lime glow)

Layout (row, centered):
  Icon: Ionicons "flag" size 20, color COLORS.text (#111111)
  Gap: SPACING.sm (8px)
  Text: "출발 지점에 도착했습니다!"
    Font: FONT_SIZES.md (15px), weight 800
    Color: COLORS.text (#111111)

Auto-action after 2 seconds:
  Navigation mode transitions out
  Course card reappears with "달리기" button highlighted (glow shadow)
```

### 4.8 Navigation State Diagram

```
[Course Card Visible]
  -> Tap "코스로 안내" -> [Calculating Route]

[Calculating Route]
  -> Route found -> [Navigating]
  -> Route error -> Show error toast, stay in Normal Mode

[Navigating]
  -> User walks -> Update position, update turn card, update ETA
  -> Distance < 50m -> [Arriving]
  -> Tap cancel -> Confirmation dialog -> [Normal Mode]
  -> Tap recenter -> Re-center map on user

[Arriving]
  -> ArrivalBanner shown
  -> After 2s -> [Normal Mode] with course card pre-selected
  -> User taps "달리기" -> Navigate to RunningTab with courseId
```

---

## 5. Transition System (전환 시스템)

### 5.1 Normal -> Search Mode

```
Trigger: Tap SearchTriggerButton

OUT animations (simultaneous, 200ms):
  weatherWidget:    { opacity: 1 -> 0, scale: 1 -> 0.95 }
  markerCountBadge: { opacity: 1 -> 0, scale: 1 -> 0.95 }
  searchTrigger:    { opacity: 1 -> 0 }
  bottomCard:       { translateY: 0 -> 40, opacity: 1 -> 0 }
  rightControls:    { opacity: 1 -> 0 }
  mapOverlay:       { opacity: 0 -> 0.6 } (dark scrim)

IN animations (simultaneous, 280ms, delay 80ms):
  searchBar:        { translateY: -20 -> 0, opacity: 0 -> 1 }
  autocompleteList: { translateY: 20 -> 0, opacity: 0 -> 1, delay: 150ms }
  keyboard:         opens automatically (autoFocus on TextInput)
```

### 5.2 Search Mode -> Normal Mode

```
Trigger: Tap back arrow, or select a result

OUT animations (200ms):
  searchBar:        { translateY: 0 -> -20, opacity: 1 -> 0 }
  autocompleteList: { opacity: 1 -> 0 }
  keyboard:         dismisses
  mapOverlay:       { opacity: 0.6 -> 0 }

IN animations (280ms, delay 100ms):
  weatherWidget:    { opacity: 0 -> 1, scale: 0.95 -> 1 }
  markerCountBadge: { opacity: 0 -> 1, scale: 0.95 -> 1 }
  searchTrigger:    { opacity: 0 -> 1 }
  bottomCard:       { translateY: 40 -> 0, opacity: 0 -> 1 }
  rightControls:    { opacity: 0 -> 1 }

If place was selected:
  map.animateToRegion(selectedLocation, 600ms)
  SearchResultPin drops in after camera move completes
```

### 5.3 Normal -> Navigation Mode

```
Trigger: Tap "코스로 안내" on course card

Phase 1 - Clear UI (200ms):
  selectedCard:     { translateY: 0 -> 100, opacity: 1 -> 0 }
  weatherWidget:    { opacity: 1 -> 0 }
  searchTrigger:    { opacity: 1 -> 0 }
  markerCountBadge: transforms to navBadge (morphs shape/color)
  rightControls:    { opacity: 1 -> 0 }
  otherMarkers:     { opacity: 1 -> 0.3 } (dim non-relevant markers)

Phase 2 - Route Draw (300ms):
  walkingRoute:     draws from user position to course start (animated stroke)
  destinationPin:   { scale: 0 -> 1.1 -> 1.0 } (spring)
  map:              fitToCoordinates([userPos, courseStart], padding 80px)

Phase 3 - Navigation UI In (250ms):
  navHeader:        { translateY: -80 -> 0, opacity: 0 -> 1 }
  turnCard:         { translateY: 80 -> 0, opacity: 0 -> 1 }
  navControls:      { opacity: 0 -> 1, scale: 0.8 -> 1 }
```

### 5.4 Navigation Mode -> Normal Mode

```
Trigger: Cancel navigation or arrive at destination

Phase 1 - Navigation UI Out (200ms):
  navHeader:        { translateY: 0 -> -80, opacity: 1 -> 0 }
  turnCard:         { translateY: 0 -> 80, opacity: 1 -> 0 }
  navControls:      { opacity: 1 -> 0 }
  walkingRoute:     { opacity: 1 -> 0 }
  destinationPin:   { scale: 1 -> 0, opacity: 1 -> 0 }

Phase 2 - Normal UI Restore (280ms):
  weatherWidget:    { opacity: 0 -> 1 }
  searchTrigger:    { opacity: 0 -> 1 }
  markerCountBadge: restore from navBadge
  rightControls:    { opacity: 0 -> 1 }
  otherMarkers:     { opacity: 0.3 -> 1 }

If arrived:
  selectedCard appears with "달리기" button glowing (SHADOWS.glow)
  Small celebration: confetti particles from primary color (300ms)
```

---

## 6. Detailed Component Specifications (컴포넌트 명세)

### 6.1 New Files to Create

```
src/
  components/
    world/
      SearchTriggerButton.tsx      -- Search icon button for top bar
      SearchOverlay.tsx            -- Full search mode (bar + autocomplete)
      SearchBar.tsx                -- Search input component
      AutocompleteDropdown.tsx     -- Results dropdown
      AutocompleteRow.tsx          -- Individual result row
      SearchResultPin.tsx          -- Custom map marker for search results
      NavigationHeader.tsx         -- Top ETA/distance header
      TurnInstructionCard.tsx      -- Bottom turn direction card
      NavigationControls.tsx       -- Right-side nav control buttons
      ArrivalBanner.tsx            -- "You have arrived" notification
      WalkingRouteLine.tsx         -- Dashed route polyline component
      DestinationPulseMarker.tsx   -- Pulsing start point marker

  hooks/
    useWalkingNavigation.ts        -- Navigation logic (route calculation, position tracking)
    useSearchAutocomplete.ts       -- Search debouncing, API calls, result merging

  services/
    navigationService.ts           -- Walking route API integration
    geocodingService.ts            -- Place search / geocoding API integration

  stores/
    worldStore.ts                  -- WorldScreen state (mode, search, navigation)
```

### 6.2 WorldScreen State Management (Zustand)

```typescript
// worldStore.ts

type WorldMode = 'normal' | 'search' | 'navigation';

interface NavigationState {
  destinationCourseId: string;
  startPoint: { latitude: number; longitude: number };
  routeSteps: Array<{
    instruction: string;     // "좌회전", "직진", "우회전"
    streetName: string;      // "올림픽대로 방면"
    distance: number;        // meters to next turn
    maneuver: TurnManeuver;  // 'left' | 'right' | 'straight' | 'slight-left' | ...
  }>;
  routePolyline: Array<{ latitude: number; longitude: number }>;
  totalDistance: number;      // total walking distance in meters
  remainingDistance: number;  // updates in real-time
  estimatedMinutes: number;   // ETA in minutes
  currentStepIndex: number;   // which step user is on
  walkedPolyline: Array<{ latitude: number; longitude: number }>;
}

interface SearchState {
  query: string;
  recentSearches: string[];
  courseResults: CourseMarkerData[];
  placeResults: Array<{
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }>;
  isLoading: boolean;
  searchPin: { latitude: number; longitude: number } | null;
}

interface WorldStore {
  mode: WorldMode;
  search: SearchState;
  navigation: NavigationState | null;

  // Actions
  enterSearchMode: () => void;
  exitSearchMode: () => void;
  updateSearchQuery: (query: string) => void;
  selectSearchResult: (lat: number, lng: number) => void;

  startNavigation: (courseId: string, startLat: number, startLng: number) => Promise<void>;
  updateNavigationPosition: (lat: number, lng: number) => void;
  cancelNavigation: () => void;

  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
}
```

### 6.3 SearchTriggerButton Component

```typescript
// SearchTriggerButton.tsx

// Props
interface SearchTriggerButtonProps {
  onPress: () => void;
  visible: boolean;  // controls fade animation
}

// Render
<Animated.View style={[styles.trigger, { opacity: fadeAnim }]}>
  <TouchableOpacity
    style={styles.button}
    onPress={onPress}
    activeOpacity={0.7}
    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
  >
    <Ionicons name="search" size={18} color={COLORS.text} />
  </TouchableOpacity>
</Animated.View>

// Styles
trigger: {
  // positioned in topBar row via parent flex
}
button: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: COLORS.white,
  alignItems: 'center',
  justifyContent: 'center',
  ...SHADOWS.sm,
}
```

### 6.4 SearchBar Component

```typescript
// SearchBar.tsx

// Props
interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onBack: () => void;
  onClear: () => void;
  onSubmit: () => void;
  autoFocus?: boolean;
}

// Render
<Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }], opacity: fadeAnim }]}>
  <TouchableOpacity onPress={onBack} style={styles.backButton}>
    <Ionicons name="arrow-back" size={20} color={COLORS.text} />
  </TouchableOpacity>

  <TextInput
    style={styles.input}
    value={value}
    onChangeText={onChangeText}
    onSubmitEditing={onSubmit}
    placeholder="장소, 주소, 코스 검색"
    placeholderTextColor={COLORS.textTertiary}
    autoFocus={autoFocus}
    returnKeyType="search"
    autoCorrect={false}
    clearButtonMode="never"  // we use custom clear
  />

  {value.length > 0 ? (
    <TouchableOpacity onPress={onClear} style={styles.actionButton}>
      <Ionicons name="close-circle" size={20} color={COLORS.textTertiary} />
    </TouchableOpacity>
  ) : (
    <TouchableOpacity style={styles.actionButton}>
      <Ionicons name="mic-outline" size={20} color={COLORS.textTertiary} />
    </TouchableOpacity>
  )}
</Animated.View>

// Styles
container: {
  flexDirection: 'row',
  alignItems: 'center',
  height: 52,
  backgroundColor: COLORS.white,
  borderWidth: 2,
  borderColor: COLORS.text,
  borderRadius: BORDER_RADIUS.full,  // 999
  paddingHorizontal: SPACING.lg,     // 16
  marginHorizontal: SPACING.xxl,     // 24
  ...SHADOWS.md,
}
backButton: {
  width: 44,
  height: 44,
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: -SPACING.sm,  // offset for touch target
}
input: {
  flex: 1,
  fontSize: FONT_SIZES.md,   // 15
  fontWeight: '500',
  color: COLORS.text,
  paddingVertical: 0,
}
actionButton: {
  width: 44,
  height: 44,
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: -SPACING.sm,
}
```

### 6.5 NavigationHeader Component

```typescript
// NavigationHeader.tsx

// Props
interface NavigationHeaderProps {
  estimatedMinutes: number;
  remainingDistance: number;
  progress: number;  // 0 to 1
  visible: boolean;
}

// Render
<Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
  <SafeAreaView>
    <View style={styles.content}>
      <View style={styles.column}>
        <Text style={styles.label}>도착 예정</Text>
        <Text style={styles.etaValue}>{estimatedMinutes}분</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.column}>
        <Text style={styles.label}>남은 거리</Text>
        <Text style={styles.distanceValue}>
          {remainingDistance >= 1000
            ? `${(remainingDistance / 1000).toFixed(1)}km`
            : `${Math.round(remainingDistance)}m`}
        </Text>
      </View>
    </View>

    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
    </View>
  </SafeAreaView>
</Animated.View>

// Styles
container: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  backgroundColor: COLORS.text,           // #111111
  borderBottomLeftRadius: BORDER_RADIUS.lg,  // 16
  borderBottomRightRadius: BORDER_RADIUS.lg, // 16
  ...SHADOWS.lg,
}
content: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: SPACING.xxl,  // 24
  paddingTop: SPACING.md,          // 12
  paddingBottom: SPACING.md,       // 12
}
column: {
  flex: 1,
}
label: {
  fontSize: FONT_SIZES.xs,    // 11
  fontWeight: '500',
  color: COLORS.runTextSecondary,  // #999999
  letterSpacing: 1,
  textTransform: 'uppercase',
  marginBottom: 2,
}
etaValue: {
  fontSize: FONT_SIZES.xxl,   // 24
  fontWeight: '900',
  color: COLORS.primary,      // #C8FF00
  fontVariant: ['tabular-nums'],
}
distanceValue: {
  fontSize: FONT_SIZES.xxl,   // 24
  fontWeight: '900',
  color: COLORS.runText,       // #FFFFFF
  fontVariant: ['tabular-nums'],
}
divider: {
  width: 1,
  height: 36,
  backgroundColor: COLORS.runCard,  // #222222
  marginHorizontal: SPACING.xl,     // 20
}
progressTrack: {
  height: 3,
  backgroundColor: COLORS.runCard,  // #222222
  marginHorizontal: SPACING.xxl,    // 24
  marginBottom: SPACING.md,         // 12
  borderRadius: 1.5,
  overflow: 'hidden',
}
progressFill: {
  height: '100%',
  backgroundColor: COLORS.primary,  // #C8FF00
  borderRadius: 1.5,
}
```

### 6.6 TurnInstructionCard Component

```typescript
// TurnInstructionCard.tsx

// Props
interface TurnInstructionCardProps {
  maneuver: TurnManeuver;
  instruction: string;      // "좌회전", "직진"
  streetName: string;        // "올림픽대로 방면"
  distanceToTurn: number;    // meters
  visible: boolean;
}

// TurnManeuver type
type TurnManeuver =
  | 'straight' | 'left' | 'right'
  | 'slight-left' | 'slight-right'
  | 'u-turn' | 'arrive';

// Icon mapping
const TURN_ICONS: Record<TurnManeuver, { name: IoniconsName; rotation?: number }> = {
  'straight':     { name: 'arrow-up', rotation: 0 },
  'left':         { name: 'arrow-undo', rotation: 0 },
  'right':        { name: 'arrow-redo', rotation: 0 },
  'slight-left':  { name: 'arrow-up', rotation: -30 },
  'slight-right': { name: 'arrow-up', rotation: 30 },
  'u-turn':       { name: 'return-down-back', rotation: 0 },
  'arrive':       { name: 'flag', rotation: 0 },
};

// Render
<Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
  <View style={styles.iconBox}>
    <Ionicons
      name={iconConfig.name}
      size={24}
      color={maneuver === 'arrive' ? COLORS.primary : COLORS.text}
      style={iconConfig.rotation ? { transform: [{ rotate: `${iconConfig.rotation}deg` }] } : undefined}
    />
  </View>

  <View style={styles.textColumn}>
    <Text style={styles.instruction}>{instruction}</Text>
    <Text style={styles.streetName} numberOfLines={1}>{streetName}</Text>
  </View>

  <Text style={styles.distance}>
    {distanceToTurn >= 1000
      ? `${(distanceToTurn / 1000).toFixed(1)}km`
      : `${Math.round(distanceToTurn)}m`}
  </Text>
</Animated.View>

// Styles
container: {
  position: 'absolute',
  bottom: 100,                       // above tab bar
  left: SPACING.xxl,                 // 24
  right: SPACING.xxl,                // 24
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.white,
  borderRadius: BORDER_RADIUS.lg,    // 16
  padding: SPACING.xl,               // 20
  ...SHADOWS.lg,
}
iconBox: {
  width: 48,
  height: 48,
  borderRadius: BORDER_RADIUS.md,    // 12
  backgroundColor: COLORS.surface,   // #F7F8FA
  alignItems: 'center',
  justifyContent: 'center',
}
textColumn: {
  flex: 1,
  marginLeft: SPACING.lg,           // 16
}
instruction: {
  fontSize: FONT_SIZES.lg,          // 17
  fontWeight: '800',
  color: COLORS.text,               // #111111
}
streetName: {
  fontSize: FONT_SIZES.sm,          // 13
  fontWeight: '500',
  color: COLORS.textSecondary,      // #666666
  marginTop: 2,
}
distance: {
  fontSize: FONT_SIZES.md,          // 15
  fontWeight: '800',
  color: COLORS.text,               // #111111
  fontVariant: ['tabular-nums'],
  marginLeft: SPACING.md,           // 12
}
```

### 6.7 ArrivalBanner Component

```typescript
// ArrivalBanner.tsx

// Props
interface ArrivalBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

// Render
<Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }], opacity: fadeAnim }]}>
  <Ionicons name="flag" size={20} color={COLORS.text} />
  <Text style={styles.text}>출발 지점에 도착했습니다!</Text>
</Animated.View>

// Styles
banner: {
  position: 'absolute',
  top: 140,  // below NavigationHeader (72 + safeArea ~60 + gap 8)
  left: SPACING.xxl,    // 24
  right: SPACING.xxl,   // 24
  height: 56,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACING.sm,       // 8
  backgroundColor: COLORS.primary,    // #C8FF00
  borderRadius: BORDER_RADIUS.md,     // 12
  ...SHADOWS.glow,
}
text: {
  fontSize: FONT_SIZES.md,   // 15
  fontWeight: '800',
  color: COLORS.text,        // #111111
}
```

---

## 7. Accessibility (접근성)

### 7.1 Search Components
- SearchBar: `accessibilityRole="search"`, `accessibilityLabel="지도에서 장소, 주소, 코스 검색"`
- AutocompleteRow: `accessibilityRole="button"`, `accessibilityLabel` includes full place name and address
- Clear button: `accessibilityLabel="검색어 지우기"`
- Back button: `accessibilityLabel="검색 닫기"`

### 7.2 Navigation Components
- NavigationHeader: `accessibilityLiveRegion="polite"` for dynamic ETA updates
- TurnInstructionCard: `accessibilityLiveRegion="assertive"` for turn changes
- ArrivalBanner: `accessibilityLiveRegion="assertive"`, auto-announces arrival
- Cancel button: `accessibilityLabel="네비게이션 취소"`

### 7.3 Color Contrast
- NavigationHeader: white text (#FFFFFF) on dark bg (#111111) = contrast ratio 18.5:1 (AAA)
- Primary lime (#C8FF00) on dark bg (#111111) = contrast ratio 12.8:1 (AAA)
- Primary lime (#C8FF00) on white bg (#FFFFFF) = contrast ratio 1.3:1 (FAIL for text)
  - Mitigation: Lime is never used as text on white; always on dark backgrounds or as background with dark text
- Turn instruction dark text (#111111) on white card (#FFFFFF) = contrast ratio 18.5:1 (AAA)

### 7.4 Touch Targets
- All interactive elements: minimum 44 x 44px touch target (WCAG 2.5.5)
- SearchTriggerButton: 36px visual, 44px touch via hitSlop
- Navigation control buttons: 44px visual

---

## 8. Responsive & Edge Cases (반응형 및 엣지 케이스)

### 8.1 Screen Sizes
- Small screens (iPhone SE, 375pt width):
  - SearchBar margin reduces to SPACING.lg (16px)
  - NavigationHeader font sizes reduce by 2px
  - TurnInstructionCard iconBox reduces to 40x40
- Large screens (iPhone Pro Max, 430pt width):
  - No changes needed; current specs work well
- iPad: Not targeted for v1; map fills screen with same overlays

### 8.2 Edge Cases

| Scenario | Behavior |
|----------|----------|
| No search results | Show empty state: "검색 결과가 없습니다" with illustration |
| Network error during search | Show inline error: "검색 중 오류가 발생했습니다. 다시 시도해주세요." with retry button |
| Route calculation fails | Toast: "경로를 찾을 수 없습니다", return to Normal Mode |
| GPS signal lost during navigation | Show warning banner: "GPS 신호가 약합니다", pause ETA updates |
| User deviates from route | Recalculate route after 30m deviation, show "경로를 재탐색합니다" toast |
| Very long walking distance (> 30 min) | Show confirmation dialog: "도보 약 32분 거리입니다. 안내를 시작할까요?" |
| App backgrounded during navigation | Continue location tracking, show persistent notification (iOS: background location) |
| Course start point unreachable | Show error: "도보로 접근할 수 없는 코스입니다" |
| Search query too short (< 2 chars) | Show only recent searches, no API call |
| Rapid typing in search | Debounce 300ms before API call |

---

## 9. Updated WorldScreen Top Bar Layout

### Current Layout
```
[WeatherWidget] --------- spacer --------- [MarkerCountBadge]
```

### New Layout (Normal Mode)
```
[WeatherWidget] --- spacer --- [SearchTriggerButton] [gap 8px] [MarkerCountBadge]
```

### Implementation Change in WorldScreen.tsx

The `topBar` style and JSX need updating to accommodate the new search button between weather and marker count:

```typescript
// In the topBar View, add SearchTriggerButton between weather and badge:
<View style={styles.topBar}>
  {/* Weather widget -- unchanged */}
  {weather && <View style={styles.weatherWidget}>...</View>}

  {/* Spacer */}
  <View style={{ flex: 1 }} />

  {/* NEW: Search trigger */}
  <SearchTriggerButton
    onPress={handleEnterSearch}
    visible={mode === 'normal'}
  />

  {/* Marker count badge -- add marginLeft */}
  <View style={[styles.markerCountBadge, { marginLeft: SPACING.sm }]}>
    ...
  </View>
</View>
```

---

## 10. Implementation Priority (구현 우선순위)

### Phase 1: Search (Week 1-2)
1. Create `worldStore.ts` with mode management
2. Implement `SearchTriggerButton` + integrate into WorldScreen top bar
3. Implement `SearchBar` component
4. Implement `AutocompleteDropdown` with recent searches (local only)
5. Integrate geocoding API for place search
6. Integrate course search (filter existing mapMarkers by name)
7. Implement search -> map animation flow
8. Implement `SearchResultPin` on map

### Phase 2: Navigation (Week 3-4)
1. Set up walking route API (Kakao/Naver directions API)
2. Create `useWalkingNavigation` hook
3. Implement `NavigationHeader` component
4. Implement `TurnInstructionCard` component
5. Add "코스로 안내" button to selected course card
6. Implement route drawing on map (dashed polyline + walked portion)
7. Implement `DestinationPulseMarker`
8. Implement `ArrivalBanner` and arrival flow
9. Implement `NavigationControls` (recenter + cancel)

### Phase 3: Polish (Week 5)
1. All transition animations between modes
2. Route recalculation on deviation
3. Background location tracking + persistent notification
4. Voice search integration (optional, stretch goal)
5. Haptic feedback on turn instructions
6. Edge case handling and error states

---

## 11. Design Rationale Summary (디자인 근거 요약)

| Decision | Rationale |
|----------|-----------|
| Search icon instead of always-visible search bar | Preserves the immersive "open world" map experience. Korean map apps show search bars always, but RunCrew is a running app first -- map discovery is the primary action, search is secondary. |
| Full-screen search overlay with dim | Follows Kakao Map / Naver Map Korean UX conventions that users expect. Provides focus and eliminates map interaction distractions during search. |
| Dark navigation header | Consistent with RunCrew's running HUD dark mode aesthetic (COLORS.runBg). Creates visual continuity between "navigating to course" and "running the course". |
| Dashed walking route line | Differentiates walking navigation route from the solid course route lines. Users can visually distinguish "how to get there" vs "the actual course". |
| Lime green ETA text | Uses RunCrew's primary color for the most important navigation data point. Creates energy and urgency consistent with the competitive racing theme. |
| "START" label with pulse animation | Racing metaphor -- the pulsing start point feels like a checkpoint waiting for the runner. Inspired by racing game waypoints (Forza Horizon). |
| Three-phase transitions | Prevents visual chaos by sequencing UI changes. Clear phases (out -> route draw -> UI in) give users time to understand each change. |
| Course results in search autocomplete | Unique RunCrew differentiator. No map app shows running courses in their search results. This connects map search directly to the core product value. |

---

## Sources

Research references used in this analysis:
- [NRC App Design on Mobbin](https://mobbin.com/explore/screens/cad197b1-73aa-4b2f-bcc8-66e1b2f79fcf)
- [Strava Feature Updates 2025](https://press.strava.com/articles/strava-updates-features-to-help-users-easily-plan-and-share-their-activities)
- [Strava AI Routes - GearJunkie](https://gearjunkie.com/technology/strava-updates-2025-ai-routes)
- [Strava Points of Interest](https://support.strava.com/hc/en-us/articles/4420443741453-Points-of-Interest-and-Start-Points)
- [Map UI Design Best Practices - Eleken](https://www.eleken.co/blog-posts/map-ui-design)
- [Mobile Search UX Best Practices - Algolia](https://www.algolia.com/blog/ux/mobile-search-ux-best-practices)
- [Map UI Patterns](https://mapuipatterns.com/)
- [Maps on Mobile Devices - NN/g](https://www.nngroup.com/articles/mobile-maps-locations/)
- [Gemini in Google Maps Walking Navigation](https://auto-post.io/blog/gemini-guides-walking-and-cycling-in-google-maps)
- [KakaoMap - Korea No.1 Map](https://apps.apple.com/us/app/kakaomap-korea-no-1-map/id304608425)
- [Naver Map iOS SDK UI](https://navermaps.github.io/ios-map-sdk/guide-en/4-1.html)
