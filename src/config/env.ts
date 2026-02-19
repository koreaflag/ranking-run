// ============================================================
// Environment Configuration
//
// All external resource values centralized here.
// Values are loaded from app.config.ts → Constants.expoConfig.extra
// Set via EXPO_PUBLIC_* env vars or .env file
// ============================================================

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

// ---- API ----
export const API_BASE_URL: string =
  extra.API_BASE_URL ??
  (__DEV__
    ? 'http://13.125.244.10/api/v1'
    : 'https://api.runvs.run/api/v1');

// ---- Mapbox ----
// Token MUST be provided via EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN env var
export const MAPBOX_ACCESS_TOKEN: string =
  extra.MAPBOX_ACCESS_TOKEN ?? '';

export const MAPBOX_DARK_STYLE: string =
  extra.MAPBOX_DARK_STYLE || 'mapbox://styles/mapbox/dark-v11';

export const MAPBOX_LIGHT_STYLE: string =
  extra.MAPBOX_LIGHT_STYLE || 'mapbox://styles/mapbox/light-v11';
