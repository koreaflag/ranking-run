import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { useRunningStore } from '../stores/runningStore';
import type {
  WatchHeartRateEvent,
  WatchCommandEvent,
  WatchReachabilityEvent,
} from '../types/watch';
import { WATCH_EVENTS } from '../types/watch';
import type { CourseNavigation } from './useCourseNavigation';

const { WatchBridgeModule } = NativeModules;

/**
 * Hook to interact with the Apple Watch companion.
 * Subscribes to heart rate updates and Watch commands,
 * and pushes run state to the Watch.
 *
 * iOS-only; no-op on Android.
 */
export function useWatchCompanion(
  callbacks?: {
    onPauseCommand?: () => void;
    onResumeCommand?: () => void;
    onStopCommand?: () => void;
  },
  navigation?: CourseNavigation | null,
) {
  const subscriptionsRef = useRef<Array<{ remove: () => void }>>([]);
  const {
    phase,
    distanceMeters,
    durationSeconds,
    currentPaceSecondsPerKm,
    avgPaceSecondsPerKm,
    gpsStatus,
    calories,
    updateHeartRate,
    setWatchConnected,
  } = useRunningStore();

  // Keep callbacks ref up to date without causing re-subscriptions
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Push run state to Watch when it changes (including idle for reset)
  useEffect(() => {
    if (Platform.OS !== 'ios' || !WatchBridgeModule) return;

    WatchBridgeModule.sendRunState({
      phase,
      distanceMeters,
      durationSeconds,
      currentPace: currentPaceSecondsPerKm,
      avgPace: avgPaceSecondsPerKm,
      gpsStatus,
      calories,
      // Course navigation data
      isCourseRun: !!navigation,
      navBearing: navigation?.bearingToNext ?? -1,
      navRemainingDistance: navigation?.remainingDistanceMeters ?? -1,
      navDeviation: navigation?.deviationMeters ?? -1,
      navDirection: navigation?.nextDirection ?? '',
      navProgress: navigation?.progressPercent ?? -1,
      navIsOffCourse: navigation?.isOffCourse ?? false,
      // Turn-point navigation
      navNextTurnDirection: navigation?.nextTurnDirection ?? '',
      navDistanceToNextTurn: navigation?.distanceToNextTurn ?? -1,
    }).catch(() => {
      // Silently ignore send failures (Watch may be unreachable)
    });
  }, [phase, distanceMeters, durationSeconds, currentPaceSecondsPerKm,
      avgPaceSecondsPerKm, gpsStatus, calories, navigation]);

  // Subscribe to Watch events during active running
  useEffect(() => {
    if (Platform.OS !== 'ios' || !WatchBridgeModule) return;
    if (phase !== 'running' && phase !== 'paused') return;

    const emitter = new NativeEventEmitter(WatchBridgeModule);

    const hrSub = emitter.addListener(
      WATCH_EVENTS.HEART_RATE,
      (event: WatchHeartRateEvent) => {
        updateHeartRate(event.bpm);
      },
    );

    const cmdSub = emitter.addListener(
      WATCH_EVENTS.COMMAND,
      (event: WatchCommandEvent) => {
        switch (event.command) {
          case 'pause':
            callbacksRef.current?.onPauseCommand?.();
            break;
          case 'resume':
            callbacksRef.current?.onResumeCommand?.();
            break;
          case 'stop':
            callbacksRef.current?.onStopCommand?.();
            break;
        }
      },
    );

    const reachabilitySub = emitter.addListener(
      WATCH_EVENTS.REACHABILITY_CHANGE,
      (event: WatchReachabilityEvent) => {
        setWatchConnected(event.isReachable);
      },
    );

    // Check initial Watch reachability
    WatchBridgeModule.getWatchStatus()
      .then((status: { isPaired: boolean; isReachable: boolean; isAppInstalled: boolean }) => {
        setWatchConnected(status.isReachable);
      })
      .catch(() => {});

    subscriptionsRef.current = [hrSub, cmdSub, reachabilitySub];

    return () => {
      subscriptionsRef.current.forEach((sub) => sub.remove());
      subscriptionsRef.current = [];
    };
  }, [phase, updateHeartRate, setWatchConnected]);

  return {
    isAvailable: Platform.OS === 'ios' && !!WatchBridgeModule,
  };
}
