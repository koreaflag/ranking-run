import { useEffect, useRef, useState, useCallback } from 'react';
import { NativeModules, Platform } from 'react-native';
import { useRunningStore, RunningPhase } from '../stores/runningStore';

const { LiveActivityModule } = NativeModules;

/**
 * Manages iOS Live Activity (Lock Screen + Dynamic Island) during a run.
 *
 * - Starts when phase becomes 'running'
 * - Updates every 3 seconds with current stats
 * - Pauses/resumes display based on phase
 * - Ends when run completes or resets
 *
 * iOS 16.2+ only; no-op on Android or older iOS.
 */
export function useLiveActivity() {
  const [activityId, setActivityId] = useState<string | null>(null);
  const activityIdRef = useRef<string | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phase = useRunningStore((s) => s.phase);
  const courseId = useRunningStore((s) => s.courseId);
  const isPaused = useRunningStore((s) => s.isPaused);
  const isAutoPaused = useRunningStore((s) => s.isAutoPaused);

  // Start Live Activity when entering 'running' phase
  useEffect(() => {
    if (Platform.OS !== 'ios' || !LiveActivityModule) return;
    if (phase !== 'running' && phase !== 'paused') return;

    // Already active
    if (activityId) return;

    const startActivity = async () => {
      try {
        const state = useRunningStore.getState();
        const id = await LiveActivityModule.startActivity({
          courseName: '',
          isCourseRun: !!state.courseId,
          durationSeconds: state.durationSeconds,
        });
        activityIdRef.current = id;
        setActivityId(id);
        console.log('[LiveActivity] Started:', id);
      } catch (error) {
        // Live Activity not available — silently continue
        console.log('[LiveActivity] Start failed:', error);
      }
    };

    startActivity();
  }, [phase, activityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic updates every 3 seconds
  useEffect(() => {
    if (Platform.OS !== 'ios' || !LiveActivityModule) return;
    if (phase !== 'running' && phase !== 'paused') return;
    if (!activityId) return;

    // Push immediate update
    const pushUpdate = () => {
      const state = useRunningStore.getState();
      LiveActivityModule.updateActivity({
        distanceMeters: state.distanceMeters,
        durationSeconds: state.durationSeconds,
        currentPace: state.currentPaceSecondsPerKm,
        avgPace: state.avgPaceSecondsPerKm,
        calories: state.calories,
        heartRate: state.heartRate,
        cadence: state.cadence,
        isPaused: state.phase === 'paused' || state.isPaused || state.isAutoPaused,
      }).catch((err: any) => {
        console.warn('[useLiveActivity] 라이브 액티비티 업데이트 실패:', err);
      });
    };

    pushUpdate();
    // Defensive: clear any lingering timer before creating new one
    if (updateTimerRef.current) {
      clearInterval(updateTimerRef.current);
    }
    updateTimerRef.current = setInterval(pushUpdate, 1000);

    return () => {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, [phase, activityId, isPaused, isAutoPaused]);

  // End Live Activity when run completes or resets
  useEffect(() => {
    if (Platform.OS !== 'ios' || !LiveActivityModule) return;
    if (phase !== 'completed' && phase !== 'idle') return;
    if (!activityId) return;

    const endActivity = async () => {
      try {
        const state = useRunningStore.getState();
        await LiveActivityModule.endActivity({
          distanceMeters: state.distanceMeters,
          durationSeconds: state.durationSeconds,
          currentPace: state.currentPaceSecondsPerKm,
          avgPace: state.avgPaceSecondsPerKm,
          calories: state.calories,
          heartRate: state.heartRate,
          cadence: state.cadence,
        });
        console.log('[LiveActivity] Ended');
      } catch {
        // Ignore errors
      }
      activityIdRef.current = null;
      setActivityId(null);
    };

    endActivity();

    return () => {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, [phase, activityId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      // Use ref for cleanup — activityId state would be stale in this closure
      if (LiveActivityModule && activityIdRef.current) {
        const state = useRunningStore.getState();
        LiveActivityModule.endActivity({
          distanceMeters: state.distanceMeters,
          durationSeconds: state.durationSeconds,
          currentPace: state.currentPaceSecondsPerKm,
          avgPace: state.avgPaceSecondsPerKm,
          calories: state.calories,
          heartRate: state.heartRate,
          cadence: state.cadence,
        }).catch((err: any) => {
          console.warn('[useLiveActivity] 라이브 액티비티 종료 실패:', err);
        });
      }
    };
  }, []);
}
