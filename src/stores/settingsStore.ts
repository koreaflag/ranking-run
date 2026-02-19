import { create } from 'zustand';

type DistanceUnit = 'km' | 'mi';
type PaceUnit = 'min/km' | 'min/mi';

interface SettingsState {
  // Units
  distanceUnit: DistanceUnit;
  paceUnit: PaceUnit;

  // Preferences
  notificationsEnabled: boolean;
  darkMode: boolean;
  hapticFeedback: boolean;
  autoLockDisabled: boolean;

  // Appearance
  backgroundImageUri: string | null;

  // Map
  map3DStyle: boolean; // true = custom 3D style, false = basic 2D flat style

  // Running preferences
  autoPause: boolean;
  countdownSeconds: number;
  splitAlertEnabled: boolean;
  voiceGuidance: boolean;

  // Actions
  setDistanceUnit: (unit: DistanceUnit) => void;
  setPaceUnit: (unit: PaceUnit) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDarkMode: (enabled: boolean) => void;
  setHapticFeedback: (enabled: boolean) => void;
  setAutoLockDisabled: (disabled: boolean) => void;
  setAutoPause: (enabled: boolean) => void;
  setCountdownSeconds: (seconds: number) => void;
  setSplitAlertEnabled: (enabled: boolean) => void;
  setVoiceGuidance: (enabled: boolean) => void;
  setBackgroundImageUri: (uri: string | null) => void;
  setMap3DStyle: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  distanceUnit: 'km',
  paceUnit: 'min/km',

  notificationsEnabled: true,
  darkMode: true,
  hapticFeedback: true,
  autoLockDisabled: true,

  backgroundImageUri: null,

  map3DStyle: true,

  autoPause: true,
  countdownSeconds: 3,
  splitAlertEnabled: true,
  voiceGuidance: true,

  setDistanceUnit: (unit) => set({ distanceUnit: unit }),
  setPaceUnit: (unit) => set({ paceUnit: unit }),
  setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
  setDarkMode: (enabled) => set({ darkMode: enabled }),
  setHapticFeedback: (enabled) => set({ hapticFeedback: enabled }),
  setAutoLockDisabled: (disabled) => set({ autoLockDisabled: disabled }),
  setAutoPause: (enabled) => set({ autoPause: enabled }),
  setCountdownSeconds: (seconds) => set({ countdownSeconds: seconds }),
  setSplitAlertEnabled: (enabled) => set({ splitAlertEnabled: enabled }),
  setVoiceGuidance: (enabled) => set({ voiceGuidance: enabled }),
  setBackgroundImageUri: (uri) => set({ backgroundImageUri: uri }),
  setMap3DStyle: (enabled) => set({ map3DStyle: enabled }),
}));
