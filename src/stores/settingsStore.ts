import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type DistanceUnit = 'km' | 'mi';
type PaceUnit = 'min/km' | 'min/mi';
export type RunEnvironment = 'outdoor' | 'indoor';
export type VoiceGender = 'female' | 'male';
export type ScreenOrientation = 'portrait' | 'landscape';

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
  runEnvironment: RunEnvironment;
  voiceGender: VoiceGender;
  screenOrientation: ScreenOrientation;
  showHeartRate: boolean;
  showLevelColor: boolean;

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
  setRunEnvironment: (env: RunEnvironment) => void;
  setVoiceGender: (gender: VoiceGender) => void;
  setScreenOrientation: (orientation: ScreenOrientation) => void;
  setShowHeartRate: (show: boolean) => void;
  setShowLevelColor: (show: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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
      runEnvironment: 'outdoor',
      voiceGender: 'female',
      screenOrientation: 'portrait',
      showHeartRate: true,
      showLevelColor: true,

      setDistanceUnit: (unit) => set({ distanceUnit: unit }),
      setPaceUnit: (unit) => set({ paceUnit: unit }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setDarkMode: (enabled) => set({ darkMode: enabled }),
      setHapticFeedback: (enabled) => set({ hapticFeedback: enabled }),
      setAutoLockDisabled: (disabled) => set({ autoLockDisabled: disabled }),
      setAutoPause: (enabled) => set({ autoPause: enabled }),
      setCountdownSeconds: (seconds) => {
        // Validate: countdown must be between 0 and 10 seconds
        const validated = Math.max(0, Math.min(10, Math.round(seconds)));
        set({ countdownSeconds: validated });
      },
      setSplitAlertEnabled: (enabled) => set({ splitAlertEnabled: enabled }),
      setVoiceGuidance: (enabled) => set({ voiceGuidance: enabled }),
      setBackgroundImageUri: (uri) => set({ backgroundImageUri: uri }),
      setMap3DStyle: (enabled) => set({ map3DStyle: enabled }),
      setRunEnvironment: (env) => set({ runEnvironment: env }),
      setVoiceGender: (gender) => set({ voiceGender: gender }),
      setScreenOrientation: (orientation) => set({ screenOrientation: orientation }),
      setShowHeartRate: (show) => set({ showHeartRate: show }),
      setShowLevelColor: (show) => set({ showLevelColor: show }),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        distanceUnit: state.distanceUnit,
        paceUnit: state.paceUnit,
        notificationsEnabled: state.notificationsEnabled,
        darkMode: state.darkMode,
        hapticFeedback: state.hapticFeedback,
        autoLockDisabled: state.autoLockDisabled,
        backgroundImageUri: state.backgroundImageUri,
        map3DStyle: state.map3DStyle,
        autoPause: state.autoPause,
        countdownSeconds: state.countdownSeconds,
        splitAlertEnabled: state.splitAlertEnabled,
        voiceGuidance: state.voiceGuidance,
        runEnvironment: state.runEnvironment,
        voiceGender: state.voiceGender,
        screenOrientation: state.screenOrientation,
        showHeartRate: state.showHeartRate,
        showLevelColor: state.showLevelColor,
      }),
    },
  ),
);
