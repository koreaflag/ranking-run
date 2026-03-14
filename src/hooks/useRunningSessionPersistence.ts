/**
 * Hook that periodically persists running session state to AsyncStorage.
 *
 * Strategy:
 * 1. Every 10 GPS updates (≈10s), save full session to disk
 * 2. On AppState → 'background'/'inactive', save immediately
 * 3. On session complete/reset, clear persisted data
 *
 * This ensures that even if iOS kills the app in the background,
 * we lose at most ~10 seconds of GPS data. The rest is on disk.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRunningStore } from '../stores/runningStore';
import {
  persistRunningSession,
  clearPersistedSession,
  type PersistedRunningSession,
} from '../services/runningSessionPersistence';

const PERSIST_INTERVAL = 10; // Save every N GPS updates

function buildSnapshot(): PersistedRunningSession | null {
  const s = useRunningStore.getState();
  if (!s.sessionId || s.phase === 'idle') return null;

  return {
    sessionId: s.sessionId,
    courseId: s.courseId,
    phase: s.phase,
    startTime: s.startTime,
    elapsedBeforePause: s.elapsedBeforePause,
    durationSeconds: s.durationSeconds,
    isPaused: s.isPaused,
    isAutoPaused: s.isAutoPaused,
    distanceMeters: s.distanceMeters,
    currentPaceSecondsPerKm: s.currentPaceSecondsPerKm,
    avgPaceSecondsPerKm: s.avgPaceSecondsPerKm,
    elevationGainMeters: s.elevationGainMeters,
    elevationLossMeters: s.elevationLossMeters,
    calories: s.calories,
    filteredLocations: s.filteredLocations.slice(-5000),
    // Keep last 500 route points for map display
    routePoints: s.routePoints.slice(-500),
    splits: s.splits,
    pauseIntervals: s.pauseIntervals,
    chunkSequence: s.chunkSequence,
    lastChunkDistance: s.lastChunkDistance,
    lastChunkTimestamp: s.lastChunkTimestamp,
    lastChunkPointIndex: s.lastChunkPointIndex,
    uploadedChunkSequences: s.uploadedChunkSequences,
    snappedRoutePoints: s.snappedRoutePoints,
    deviationLog: s.deviationLog,
    startPoint: s.startPoint,
    runGoal: s.runGoal,
    savedAt: Date.now(),
  };
}

export function useRunningSessionPersistence() {
  const updateCountRef = useRef(0);
  const phase = useRunningStore((s) => s.phase);
  const distanceMeters = useRunningStore((s) => s.distanceMeters);

  // Track GPS updates via distance changes and persist periodically
  useEffect(() => {
    if (phase !== 'running' && phase !== 'paused') return;

    updateCountRef.current++;
    if (updateCountRef.current % PERSIST_INTERVAL === 0) {
      const snapshot = buildSnapshot();
      if (snapshot) {
        persistRunningSession(snapshot);
      }
    }
  }, [distanceMeters, phase]);

  // Persist immediately when app goes to background
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        const snapshot = buildSnapshot();
        if (snapshot) {
          // Fire-and-forget — AsyncStorage.setItem is fast enough
          persistRunningSession(snapshot);
          console.log('[SessionPersist] Saved on background transition');
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  // Clear persisted data when session completes or resets
  useEffect(() => {
    if (phase === 'completed' || phase === 'idle') {
      clearPersistedSession();
    }
  }, [phase]);

  // Also persist on pause/resume (important state transitions)
  const isPaused = useRunningStore((s) => s.isPaused);
  useEffect(() => {
    if (phase === 'running' || phase === 'paused') {
      const snapshot = buildSnapshot();
      if (snapshot) {
        persistRunningSession(snapshot);
      }
    }
  }, [isPaused, phase]);
}
