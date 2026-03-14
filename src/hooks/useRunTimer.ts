import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRunningStore } from '../stores/runningStore';

/**
 * Hook that manages the running timer.
 * Uses Date.now()-based elapsed calculation so background suspension
 * doesn't cause drift — when the app resumes, the timer instantly
 * catches up to the correct value.
 *
 * Also listens to AppState changes to force an immediate recalc
 * when the app returns to foreground (covers the scenario where
 * setInterval callbacks were suspended by iOS).
 */
export function useRunTimer() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { phase, isPaused, isAutoPaused, updateDuration, elapsedBeforePause, startTime } =
    useRunningStore();

  const isRunning = phase === 'running' && !isPaused && !isAutoPaused && !!startTime;

  // Recalculate elapsed time from absolute timestamps
  const recalcDuration = () => {
    const st = useRunningStore.getState();
    if (st.phase === 'running' && !st.isPaused && !st.isAutoPaused && st.startTime) {
      const now = Date.now();
      const elapsed = (now - st.startTime) / 1000 + st.elapsedBeforePause;
      st.updateDuration(Math.floor(elapsed));
    }
  };

  // Main interval — ticks every second
  useEffect(() => {
    if (isRunning) {
      // Immediately recalc on mount/resume (catches background gap)
      recalcDuration();
      intervalRef.current = setInterval(recalcDuration, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  // AppState listener — force recalc when returning from background
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        recalcDuration();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);
}
