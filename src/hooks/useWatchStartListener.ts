import { useEffect } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useRunningStore } from '../stores/runningStore';
import type { MainTabParamList } from '../types/navigation';

const { GPSTrackerModule } = NativeModules;
const WATCH_START_EVENT = 'GPSTracker_onWatchStartRun';

/**
 * Global listener for Watch-initiated run start.
 * Place in a component that's always mounted (e.g., TabNavigator).
 *
 * When the Watch sends a "start" command:
 * 1. Native GPSTrackerModule starts GPS tracking
 * 2. Native emits GPSTracker_onWatchStartRun event
 * 3. This hook receives the event → starts session in store → navigates to WorldTab → RunningMain
 */
export function useWatchStartListener() {
  const navigation = useNavigation<NavigationProp<MainTabParamList>>();

  useEffect(() => {
    if (Platform.OS !== 'ios' || !GPSTrackerModule) return;

    const emitter = new NativeEventEmitter(GPSTrackerModule);

    const subscription = emitter.addListener(WATCH_START_EVENT, () => {
      const { phase, startSession } = useRunningStore.getState();

      // Avoid double-start if already running or in countdown
      if (phase === 'running' || phase === 'paused' || phase === 'countdown') return;

      // Generate local session ID and start a free run (no course)
      const sessionId = `watch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      startSession(sessionId, null);

      // Navigate to WorldTab → RunningMain (GPS tracking already started natively)
      navigation.navigate('WorldTab', { screen: 'RunningMain' } as any);
    });

    return () => {
      subscription.remove();
    };
  }, [navigation]);
}
