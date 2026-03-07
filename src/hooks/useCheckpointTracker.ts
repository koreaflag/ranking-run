import { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import type { CourseCheckpoint, CheckpointPass } from '../types/api';

interface CheckpointTrackerResult {
  /** Next checkpoint to reach (null if all passed) */
  nextCheckpoint: CourseCheckpoint | null;
  /** Number of checkpoints passed so far */
  passedCount: number;
  /** Total number of checkpoints */
  totalCount: number;
  /** All recorded checkpoint passes (for server submission) */
  checkpointPasses: CheckpointPass[];
  /** Map marker data with passed/isNext status */
  markerData: Array<{
    id: number;
    order: number;
    lat: number;
    lng: number;
    passed: boolean;
    isNext: boolean;
  }>;
  /** Just-passed checkpoint info (for toast display, auto-clears) */
  justPassed: { order: number; total: number } | null;
  /** Timestamp (ms) when the start checkpoint (order=0) was passed */
  competitionStartTime: number | null;
  /** True when the finish checkpoint (last) was passed */
  finishReached: boolean;
  /** Call on each GPS update */
  updateLocation: (lat: number, lng: number) => void;
  /** Reset tracker state */
  resetTracker: () => void;
}

const PASS_RADIUS_METERS = 30;
const FINISH_RADIUS_METERS = 50;

/** Haversine distance in meters between two lat/lng points */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Tracks checkpoint passage during a course run.
 * Checkpoints must be passed in order (1 → 2 → 3).
 * Triggers haptic feedback on each pass.
 */
export function useCheckpointTracker(
  checkpoints: CourseCheckpoint[] | null | undefined,
): CheckpointTrackerResult {
  const sorted = checkpoints
    ? [...checkpoints].sort((a, b) => a.order - b.order)
    : [];
  const total = sorted.length;

  const [passedSet, setPassedSet] = useState<Set<number>>(new Set());
  const [passes, setPasses] = useState<CheckpointPass[]>([]);
  const [justPassed, setJustPassed] = useState<{ order: number; total: number } | null>(null);
  const [competitionStartTime, setCompetitionStartTime] = useState<number | null>(null);
  const [finishReached, setFinishReached] = useState(false);
  const nextIndexRef = useRef(0);
  const justPassedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateLocation = useCallback(
    (lat: number, lng: number) => {
      if (total === 0) return;
      const idx = nextIndexRef.current;
      if (idx >= total) return;

      const cp = sorted[idx];
      const isFinish = idx === total - 1;
      const radius = isFinish ? FINISH_RADIUS_METERS : PASS_RADIUS_METERS;
      const dist = haversine(lat, lng, cp.lat, cp.lng);

      // Check if current checkpoint is within radius
      let passedCurrent = dist <= radius;

      // Skip tolerance: if next checkpoint is within radius AND skipped CP is nearby (GPS drift only)
      if (!passedCurrent && idx + 1 < total && dist <= PASS_RADIUS_METERS * 3) {
        const nextCp = sorted[idx + 1];
        const nextIsFinish = idx + 1 === total - 1;
        const nextRadius = nextIsFinish ? FINISH_RADIUS_METERS : PASS_RADIUS_METERS;
        const nextDist = haversine(lat, lng, nextCp.lat, nextCp.lng);
        if (nextDist <= nextRadius) {
          // Force-pass current checkpoint, then pass next
          const now = Date.now() / 1000;
          setPassedSet((prev) => {
            const s = new Set(prev);
            s.add(cp.id);
            s.add(nextCp.id);
            return s;
          });
          setPasses((prev) => [
            ...prev,
            { checkpoint_id: cp.id, timestamp: now, distance_from_checkpoint: Math.round(dist * 10) / 10 },
            { checkpoint_id: nextCp.id, timestamp: now, distance_from_checkpoint: Math.round(nextDist * 10) / 10 },
          ]);
          nextIndexRef.current = idx + 2;

          if (cp.order === 0) setCompetitionStartTime(Date.now());
          if (nextCp.order === 0) setCompetitionStartTime(Date.now());
          if (idx + 1 === total - 1) setFinishReached(true);

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setJustPassed({ order: nextCp.order, total });
          if (justPassedTimerRef.current) clearTimeout(justPassedTimerRef.current);
          justPassedTimerRef.current = setTimeout(() => setJustPassed(null), 3000);
          return;
        }
      }

      if (passedCurrent) {
        nextIndexRef.current = idx + 1;
        setPassedSet((prev) => new Set(prev).add(cp.id));
        setPasses((prev) => [
          ...prev,
          {
            checkpoint_id: cp.id,
            timestamp: Date.now() / 1000,
            distance_from_checkpoint: Math.round(dist * 10) / 10,
          },
        ]);

        if (cp.order === 0) {
          setCompetitionStartTime(Date.now());
        }

        if (isFinish) {
          setFinishReached(true);
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        setJustPassed({ order: cp.order, total });
        if (justPassedTimerRef.current) clearTimeout(justPassedTimerRef.current);
        justPassedTimerRef.current = setTimeout(() => setJustPassed(null), 3000);
      }
    },
    [sorted, total],
  );

  const resetTracker = useCallback(() => {
    setPassedSet(new Set());
    setPasses([]);
    setJustPassed(null);
    setCompetitionStartTime(null);
    setFinishReached(false);
    nextIndexRef.current = 0;
    if (justPassedTimerRef.current) clearTimeout(justPassedTimerRef.current);
  }, []);

  const nextCheckpoint = nextIndexRef.current < total ? sorted[nextIndexRef.current] : null;

  const markerData = sorted.map((cp) => ({
    id: cp.id,
    order: cp.order,
    lat: cp.lat,
    lng: cp.lng,
    passed: passedSet.has(cp.id),
    isNext: cp.id === nextCheckpoint?.id,
  }));

  return {
    nextCheckpoint,
    passedCount: passedSet.size,
    totalCount: total,
    checkpointPasses: passes,
    markerData,
    justPassed,
    competitionStartTime,
    finishReached,
    updateLocation,
    resetTracker,
  };
}
