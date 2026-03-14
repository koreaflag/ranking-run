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
  checkpointData?: {
    passedCount: number;
    totalCount: number;
    justPassed: boolean;
  },
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
    isAutoPaused,
    runGoal,
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
      isAutoPaused,
      // Countdown sync is handled natively by GPSTrackerModule.notifyCountdownStart()
      // which captures the exact start timestamp. Do NOT send countdownStartedAt here —
      // useEffect runs later than the native call, so Date.now() would be stale and
      // cause the watch countdown to desync.
      // Run goal
      goalType: runGoal.type ?? '',
      goalValue: runGoal.value ?? 0,
      // Program running (pace target) data — always send explicitly to prevent
      // carryForwardKeys from reusing stale values from a previous session
      programTargetDistance: runGoal.type === 'program' ? (runGoal.value ?? 0) : 0,
      programTargetTime: runGoal.type === 'program' ? (runGoal.targetTime ?? 0) : 0,
      programTimeDelta: runGoal.type === 'program' ? (() => {
        if (!runGoal.value || !runGoal.targetTime || distanceMeters < 200) return 0;
        const projectedFinish = (runGoal.value / distanceMeters) * durationSeconds;
        return runGoal.targetTime - projectedFinish;
      })() : 0,
      programRequiredPace: runGoal.type === 'program' && runGoal.value && runGoal.targetTime
        ? Math.round(runGoal.targetTime / (runGoal.value / 1000))
        : 0,
      programStatus: runGoal.type === 'program' ? (() => {
        if (!runGoal.value || !runGoal.targetTime || distanceMeters < 200) return '';
        const projectedFinish = (runGoal.value / distanceMeters) * durationSeconds;
        const delta = runGoal.targetTime - projectedFinish;
        if (delta > 30) return 'ahead';
        if (delta >= -30) return 'on_pace';
        if (delta >= -60) return 'behind';
        return 'critical';
      })() : '',
      metronomeBPM: runGoal.type === 'program' ? (runGoal.cadenceBPM ?? 0) : 0,
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
      // Checkpoint progress
      cpPassed: checkpointData?.passedCount ?? 0,
      cpTotal: checkpointData?.totalCount ?? 0,
      cpJustPassed: checkpointData?.justPassed ?? false,
    }).catch(() => {
      // Silently ignore send failures (Watch may be unreachable)
    });
  }, [phase, distanceMeters, durationSeconds, currentPaceSecondsPerKm,
      avgPaceSecondsPerKm, gpsStatus, calories, isAutoPaused, runGoal,
      navigation, checkpointData]);

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
      .catch((err: any) => {
        console.warn('[useWatchCompanion] 워치 상태 조회 실패:', err);
      });

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
