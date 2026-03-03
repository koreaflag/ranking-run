import { useEffect, useRef } from 'react';
import { useRunningStore } from '../stores/runningStore';

/**
 * Hook that manages the running timer.
 * Increments duration every second while the run is in progress.
 * Automatically pauses/resumes with the running state.
 */
export function useRunTimer() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { phase, isPaused, isAutoPaused, updateDuration, elapsedBeforePause, startTime } =
    useRunningStore();

  useEffect(() => {
    if (phase === 'running' && !isPaused && !isAutoPaused && startTime) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = (now - startTime) / 1000 + elapsedBeforePause;
        updateDuration(Math.floor(elapsed));
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, isPaused, isAutoPaused, startTime, elapsedBeforePause, updateDuration]);
}
