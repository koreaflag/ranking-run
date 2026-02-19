import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'RUNVS',
  slug: 'runcrew',
  scheme: 'runcrew',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1A1A2E',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.runcrew',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        '런닝 경로를 기록하기 위해 위치 정보가 필요합니다.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        '백그라운드에서 런닝을 계속 기록하기 위해 항상 위치 접근이 필요합니다.',
      UIBackgroundModes: ['location', 'location'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1A1A2E',
    },
    package: 'app.runcrew',
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
    ],
  },
  plugins: ['expo-secure-store', 'expo-asset', 'expo-font'],
  extra: {
    eas: {
      projectId: '7aad7550-6886-4154-affa-f92894d374dd',
    },
    // External resource env vars (override via EAS build / .env)
    API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    MAPBOX_ACCESS_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
    MAPBOX_DARK_STYLE: process.env.EXPO_PUBLIC_MAPBOX_DARK_STYLE,
    MAPBOX_LIGHT_STYLE: process.env.EXPO_PUBLIC_MAPBOX_LIGHT_STYLE,
  },
  owner: 'flagproject',
});
