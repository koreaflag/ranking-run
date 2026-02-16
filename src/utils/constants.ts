// ============================================================
// App-wide Constants
// ============================================================

export const API_BASE_URL = __DEV__
  ? 'http://localhost:8000/api/v1'
  : 'https://api.runcrew.app/api/v1';

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

export const COLORS = {
  primary: '#4A90D9',
  primaryDark: '#3A7BC8',
  primaryLight: '#6BA5E3',
  accent: '#FF6B35',
  accentLight: '#FF8A5C',

  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceLight: '#252540',
  card: '#1E1E35',

  text: '#FFFFFF',
  textSecondary: '#A0A0B8',
  textTertiary: '#6C6C80',

  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',

  border: '#2A2A45',
  divider: '#1F1F35',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  kakaoYellow: '#FEE500',
  kakaoBlack: '#191919',
  appleWhite: '#FFFFFF',
} as const;

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  title: 26,
  hero: 48,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BORDER_RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;
