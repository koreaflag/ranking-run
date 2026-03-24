import { useSettingsStore } from '../settingsStore';

// Reset store to defaults before each test
beforeEach(() => {
  const { setState } = useSettingsStore;
  setState({
    language: 'ko',
    distanceUnit: 'km',
    paceUnit: 'min/km',
    notificationsEnabled: true,
    darkMode: true,
    hapticFeedback: true,
    autoLockDisabled: true,
    backgroundImageUri: null,
    map3DStyle: true,
    lastKnownLocation: null,
    autoPause: true,
    countdownSeconds: 3,
    splitAlertEnabled: true,
    voiceGuidance: true,
    runEnvironment: 'outdoor',
    voiceGender: 'female',
    screenOrientation: 'portrait',
    showHeartRate: true,
    showLevelColor: true,
  });
});

describe('settingsStore', () => {
  describe('default values', () => {
    it('has correct default language', () => {
      expect(useSettingsStore.getState().language).toBe('ko');
    });

    it('has correct default units', () => {
      const state = useSettingsStore.getState();
      expect(state.distanceUnit).toBe('km');
      expect(state.paceUnit).toBe('min/km');
    });

    it('has correct default preferences', () => {
      const state = useSettingsStore.getState();
      expect(state.notificationsEnabled).toBe(true);
      expect(state.darkMode).toBe(true);
      expect(state.hapticFeedback).toBe(true);
      expect(state.autoLockDisabled).toBe(true);
    });

    it('has correct default running preferences', () => {
      const state = useSettingsStore.getState();
      expect(state.autoPause).toBe(true);
      expect(state.countdownSeconds).toBe(3);
      expect(state.voiceGuidance).toBe(true);
      expect(state.runEnvironment).toBe('outdoor');
      expect(state.voiceGender).toBe('female');
      expect(state.screenOrientation).toBe('portrait');
    });

    it('has null defaults for optional fields', () => {
      const state = useSettingsStore.getState();
      expect(state.backgroundImageUri).toBeNull();
      expect(state.lastKnownLocation).toBeNull();
    });
  });

  describe('toggle actions', () => {
    it('toggles hapticFeedback', () => {
      useSettingsStore.getState().setHapticFeedback(false);
      expect(useSettingsStore.getState().hapticFeedback).toBe(false);

      useSettingsStore.getState().setHapticFeedback(true);
      expect(useSettingsStore.getState().hapticFeedback).toBe(true);
    });

    it('toggles darkMode', () => {
      useSettingsStore.getState().setDarkMode(false);
      expect(useSettingsStore.getState().darkMode).toBe(false);
    });

    it('toggles autoPause', () => {
      useSettingsStore.getState().setAutoPause(false);
      expect(useSettingsStore.getState().autoPause).toBe(false);
    });

    it('toggles voiceGuidance', () => {
      useSettingsStore.getState().setVoiceGuidance(false);
      expect(useSettingsStore.getState().voiceGuidance).toBe(false);
    });

    it('toggles showHeartRate', () => {
      useSettingsStore.getState().setShowHeartRate(false);
      expect(useSettingsStore.getState().showHeartRate).toBe(false);
    });
  });

  describe('setter actions', () => {
    it('sets language', () => {
      useSettingsStore.getState().setLanguage('en');
      expect(useSettingsStore.getState().language).toBe('en');

      useSettingsStore.getState().setLanguage('ja');
      expect(useSettingsStore.getState().language).toBe('ja');
    });

    it('sets distanceUnit and paceUnit', () => {
      useSettingsStore.getState().setDistanceUnit('mi');
      expect(useSettingsStore.getState().distanceUnit).toBe('mi');

      useSettingsStore.getState().setPaceUnit('min/mi');
      expect(useSettingsStore.getState().paceUnit).toBe('min/mi');
    });

    it('sets runEnvironment', () => {
      useSettingsStore.getState().setRunEnvironment('indoor');
      expect(useSettingsStore.getState().runEnvironment).toBe('indoor');
    });

    it('sets voiceGender', () => {
      useSettingsStore.getState().setVoiceGender('male');
      expect(useSettingsStore.getState().voiceGender).toBe('male');
    });

    it('sets screenOrientation', () => {
      useSettingsStore.getState().setScreenOrientation('landscape');
      expect(useSettingsStore.getState().screenOrientation).toBe('landscape');
    });

    it('sets backgroundImageUri', () => {
      useSettingsStore.getState().setBackgroundImageUri('file://photo.jpg');
      expect(useSettingsStore.getState().backgroundImageUri).toBe('file://photo.jpg');

      useSettingsStore.getState().setBackgroundImageUri(null);
      expect(useSettingsStore.getState().backgroundImageUri).toBeNull();
    });

    it('sets lastKnownLocation', () => {
      useSettingsStore.getState().setLastKnownLocation({ latitude: 37.5665, longitude: 126.978 });
      const loc = useSettingsStore.getState().lastKnownLocation;
      expect(loc).toEqual({ latitude: 37.5665, longitude: 126.978 });
    });
  });

  describe('countdownSeconds validation', () => {
    it('sets valid countdown seconds', () => {
      useSettingsStore.getState().setCountdownSeconds(5);
      expect(useSettingsStore.getState().countdownSeconds).toBe(5);
    });

    it('clamps countdown to minimum 0', () => {
      useSettingsStore.getState().setCountdownSeconds(-3);
      expect(useSettingsStore.getState().countdownSeconds).toBe(0);
    });

    it('clamps countdown to maximum 10', () => {
      useSettingsStore.getState().setCountdownSeconds(15);
      expect(useSettingsStore.getState().countdownSeconds).toBe(10);
    });

    it('rounds countdown to nearest integer', () => {
      useSettingsStore.getState().setCountdownSeconds(3.7);
      expect(useSettingsStore.getState().countdownSeconds).toBe(4);
    });
  });
});
