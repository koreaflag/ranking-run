/**
 * Running Session Persistence — crash-safe local backup
 *
 * Periodically saves critical running state to AsyncStorage so that
 * if the app is killed (OOM, user force-quit, iOS background kill),
 * the session can be recovered on next launch.
 *
 * What we save:
 *  - Session metadata (sessionId, courseId, startTime, phase)
 *  - Accumulated metrics (distance, duration, pace, elevation, calories)
 *  - filteredLocations (GPS points not yet uploaded as chunks)
 *  - splits, pauseIntervals, chunkSequence, uploadedChunkSequences
 *  - routePoints (last 500 for map display on recovery)
 *
 * What we DON'T save (reconstructable / transient):
 *  - currentLocation (single GPS fix, refreshed immediately)
 *  - gpsStatus/gpsAccuracy (live sensor state)
 *  - heartRate, cadence (live sensor)
 *  - loop detection state (recalculated)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Split, PauseInterval } from '../types/api';
import type { FilteredLocation } from '../types/gps';

const KEY = '@running_session:active';

export interface PersistedRunningSession {
  // Session identity
  sessionId: string;
  courseId: string | null;
  phase: string;

  // Timer
  startTime: number | null;
  elapsedBeforePause: number;
  durationSeconds: number;
  isPaused: boolean;
  isAutoPaused: boolean;

  // Metrics
  distanceMeters: number;
  currentPaceSecondsPerKm: number;
  avgPaceSecondsPerKm: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  calories: number;

  // GPS data (the critical part — this is what gets lost on crash)
  filteredLocations: FilteredLocation[];

  // Route visualization (keep last N for map display)
  routePoints: Array<{ latitude: number; longitude: number }>;

  // Splits & pauses
  splits: Split[];
  pauseIntervals: PauseInterval[];

  // Chunk tracking
  chunkSequence: number;
  lastChunkDistance: number;
  lastChunkTimestamp: number;
  lastChunkPointIndex: number;
  uploadedChunkSequences: number[];

  // Snapped route (course running)
  snappedRoutePoints: Array<{ latitude: number; longitude: number }>;
  deviationLog: Array<{ index: number; deviation: number }>;

  // Start point (for loop detection reconstruction)
  startPoint: { latitude: number; longitude: number } | null;

  // Run goal
  runGoal: {
    type: 'distance' | 'time' | 'pace' | 'program' | 'interval' | null;
    value: number | null;
    targetTime?: number | null;
    cadenceBPM?: number | null;
    intervalRunSeconds?: number;
    intervalWalkSeconds?: number;
    intervalSets?: number;
  };

  // Metadata
  savedAt: number; // Date.now() when saved
}

/**
 * Save the current running session to AsyncStorage.
 * Designed to be called frequently (every GPS update or every 10s).
 * Uses JSON.stringify — fast enough for typical session sizes.
 */
export async function persistRunningSession(
  session: PersistedRunningSession,
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('[SessionPersist] Failed to save:', err);
  }
}

/**
 * Load a previously persisted running session.
 * Returns null if no session exists or data is corrupted.
 */
export async function loadPersistedSession(): Promise<PersistedRunningSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRunningSession;
    // Basic validation
    if (!parsed.sessionId || !parsed.phase) return null;
    return parsed;
  } catch (err) {
    console.warn('[SessionPersist] Failed to load:', err);
    return null;
  }
}

/**
 * Clear the persisted session (called after successful completion or discard).
 */
export async function clearPersistedSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (err) {
    console.warn('[SessionPersist] Failed to clear:', err);
  }
}

/**
 * Check if there's a persisted session that looks like a crash recovery candidate.
 * Returns true if session exists and was in 'running' or 'paused' phase.
 */
export async function hasRecoverableSession(): Promise<boolean> {
  const session = await loadPersistedSession();
  if (!session) return false;
  return session.phase === 'running' || session.phase === 'paused';
}
