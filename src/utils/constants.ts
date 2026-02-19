// ============================================================
// App-wide Constants
// ============================================================

// API base URL — centralized in src/config/env.ts, re-exported for convenience
export { API_BASE_URL } from '../config/env';

export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'runcrew_access_token',
  REFRESH_TOKEN: 'runcrew_refresh_token',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  HOME_NEARBY_LIMIT: 5,
  HOME_RECENT_LIMIT: 3,
  RANKING_PREVIEW_LIMIT: 10,
} as const;

export const RUNNING = {
  CHUNK_DISTANCE_THRESHOLD_METERS: 1000,
  CHUNK_TIME_THRESHOLD_MS: 5 * 60 * 1000,
  LOCATION_UPDATE_INTERVAL_MS: 1000,
} as const;

// Obsidian × Signature Orange — Warm energy, clean, sporty
export const COLORS = {
  // Primary: Signature Orange (warm, energetic)
  primary: '#FF7A33',
  primaryDark: '#E86820',
  primaryLight: '#FFB088',

  // Secondary: Cool Slate
  secondary: '#64748B',
  secondaryDark: '#475569',

  // Accent: Gold (achievements, highlights)
  accent: '#FFD166',
  accentLight: '#FFE5A0',

  // Backgrounds (clean, minimal)
  background: '#FAFAFA',
  surface: '#F1F1F1',
  surfaceLight: '#E5E5E5',
  card: '#FFFFFF',

  // Running HUD (obsidian black)
  runBg: '#050505',
  runSurface: '#121212',
  runCard: '#1E1E1E',
  runText: '#F5F5F5',
  runTextSecondary: '#8A8A8A',

  // Text (crisp blacks)
  text: '#111111',
  textSecondary: '#636363',
  textTertiary: '#9A9A9A',

  // Status
  success: '#10B981',
  warning: '#FFB84D',
  error: '#EF4444',

  // Borders
  border: '#E5E5E5',
  divider: '#F1F1F1',

  // Ranking medals
  gold: '#FFD700',
  silver: '#9CA3AF',
  bronze: '#CD7F32',

  // Base
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // Social
  kakaoYellow: '#FEE500',
  kakaoBlack: '#191919',
  appleWhite: '#FFFFFF',

  // Rival / Competition
  rival: '#8B5CF6',
} as const;

// ============================================================
// Competition Design Tokens
// ============================================================

/** Course difficulty color coding (muted, sophisticated) */
export const DIFFICULTY_COLORS = {
  easy: '#34D399',
  normal: '#60A5FA',
  hard: '#FBBF24',
  expert: '#F87171',
  legend: '#A78BFA',
} as const;

export type DifficultyLevel = keyof typeof DIFFICULTY_COLORS;

/** Badge / achievement category colors */
export const BADGE_COLORS = {
  speed: '#F87171',
  distance: '#60A5FA',
  victory: '#F59E0B',
  streak: '#FB923C',
  explorer: '#34D399',
  rival: '#A78BFA',
} as const;

/** Map marker sizes */
export const MARKER_SIZES = {
  default: { width: 40, height: 48 },
  selected: { width: 48, height: 56 },
  cluster: { width: 44, height: 44 },
} as const;

/** Animation timings */
export const ANIMATION = {
  fast: 100,
  normal: 200,
  slow: 300,
  spring: { damping: 15, stiffness: 150 },
} as const;

/** Difficulty label mapping (Korean) */
export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: '입문',
  normal: '보통',
  hard: '도전',
  expert: '고급',
  legend: '전설',
} as const;

// Shadows (warm, subtle, premium)
export const SHADOWS = {
  sm: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#1C1917',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  glow: {
    shadowColor: '#FF7A33',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

export const FONT_SIZES = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  title: 28,
  display: 34,
  hero: 56,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const BORDER_RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
} as const;

// ============================================================
// Theme Colors (light / dark)
// ============================================================

export interface ThemeColors {
  // Branded (shared across themes)
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryDark: string;
  accent: string;
  accentLight: string;

  // Surfaces
  background: string;
  surface: string;
  surfaceLight: string;
  card: string;

  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;

  // Borders
  border: string;
  divider: string;

  // Status (shared)
  success: string;
  warning: string;
  error: string;

  // Medals (shared)
  gold: string;
  silver: string;
  bronze: string;

  // Base
  white: string;
  black: string;
  transparent: string;

  // Glass
  glassBackground: string;
  glassBorder: string;
  glassOverlay: string;

  // StatusBar
  statusBar: 'dark-content' | 'light-content';
}

export const LIGHT_THEME: ThemeColors = {
  primary: '#FF7A33',
  primaryDark: '#E86820',
  primaryLight: '#FFB088',
  secondary: '#64748B',
  secondaryDark: '#475569',
  accent: '#FFD166',
  accentLight: '#FFE5A0',

  background: '#FAFAFA',
  surface: '#F1F1F1',
  surfaceLight: '#E5E5E5',
  card: '#FFFFFF',

  text: '#111111',
  textSecondary: '#636363',
  textTertiary: '#9A9A9A',

  border: '#E5E5E5',
  divider: '#F1F1F1',

  success: '#10B981',
  warning: '#FFB84D',
  error: '#EF4444',

  gold: '#FFD700',
  silver: '#9CA3AF',
  bronze: '#CD7F32',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  glassBackground: 'rgba(255, 255, 255, 0.65)',
  glassBorder: 'rgba(17, 17, 17, 0.05)',
  glassOverlay: 'rgba(250, 250, 250, 0.7)',

  statusBar: 'dark-content',
};

export const DARK_THEME: ThemeColors = {
  primary: '#FF7A33',
  primaryDark: '#E86820',
  primaryLight: '#FFB088',
  secondary: '#94A3B8',
  secondaryDark: '#64748B',
  accent: '#FFD98A',
  accentLight: '#FFE5A0',

  background: '#050505',
  surface: '#121212',
  surfaceLight: '#1E1E1E',
  card: '#121212',

  text: '#F5F5F5',
  textSecondary: '#8A8A8A',
  textTertiary: '#636363',

  border: '#1E1E1E',
  divider: '#121212',

  success: '#34D399',
  warning: '#FFB84D',
  error: '#F87171',

  gold: '#FFD700',
  silver: '#9CA3AF',
  bronze: '#D4956B',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  glassBackground: 'rgba(18, 18, 18, 0.7)',
  glassBorder: 'rgba(255, 122, 51, 0.08)',
  glassOverlay: 'rgba(5, 5, 5, 0.8)',

  statusBar: 'light-content',
};
