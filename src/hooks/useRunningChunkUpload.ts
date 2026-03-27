import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRunningStore } from '../stores/runningStore';
import { runService } from '../services/runService';
import { savePendingChunk } from '../services/pendingSyncService';
import { performTokenRefresh } from '../services/api';
import type { RawGPSPointAPI, UploadChunkRequest } from '../types/api';

const CHUNK_DISTANCE_THRESHOLD_M = 1000; // Upload every 1 km
const CHUNK_TIME_THRESHOLD_MS = 5 * 60 * 1000; // Upload every 5 minutes

/**
 * Background chunk uploader for phone runs.
 *
 * Monitors running state and triggers GPS data chunk uploads to the server
 * every 1 km of distance or 5 minutes of elapsed time (whichever comes first).
 *
 * - Never blocks the running experience (fire-and-forget)
 * - On upload failure, saves the chunk to AsyncStorage for later retry
 * - Tracks uploaded sequences in the running store for RunResult
 *
 * Place in RunningScreen so it's active during the run.
 */
export function useRunningChunkUpload() {
  const uploadingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phase = useRunningStore((s) => s.phase);
  const isPaused = useRunningStore((s) => s.isPaused);
  const isAutoPaused = useRunningStore((s) => s.isAutoPaused);
  const sessionId = useRunningStore((s) => s.sessionId);
  const distanceMeters = useRunningStore((s) => s.distanceMeters);
  const lastChunkDistance = useRunningStore((s) => s.lastChunkDistance);
  const lastChunkTimestamp = useRunningStore((s) => s.lastChunkTimestamp);
  const lastChunkPointIndex = useRunningStore((s) => s.lastChunkPointIndex);
  const chunkSequence = useRunningStore((s) => s.chunkSequence);
  const filteredLocations = useRunningStore((s) => s.filteredLocations);
  const durationSeconds = useRunningStore((s) => s.durationSeconds);
  const avgPaceSecondsPerKm = useRunningStore((s) => s.avgPaceSecondsPerKm);
  const elevationGainMeters = useRunningStore((s) => s.elevationGainMeters);
  const elevationLossMeters = useRunningStore((s) => s.elevationLossMeters);
  const splits = useRunningStore((s) => s.splits);
  const pauseIntervals = useRunningStore((s) => s.pauseIntervals);
  const incrementChunkSequence = useRunningStore((s) => s.incrementChunkSequence);
  const markChunkUploaded = useRunningStore((s) => s.markChunkUploaded);

  // Keep refs for values used in the upload function (avoid stale closures)
  const stateRef = useRef({
    sessionId,
    distanceMeters,
    lastChunkDistance,
    lastChunkTimestamp,
    lastChunkPointIndex,
    chunkSequence,
    filteredLocations,
    durationSeconds,
    avgPaceSecondsPerKm,
    elevationGainMeters,
    elevationLossMeters,
    splits,
    pauseIntervals,
  });
  stateRef.current = {
    sessionId,
    distanceMeters,
    lastChunkDistance,
    lastChunkTimestamp,
    lastChunkPointIndex,
    chunkSequence,
    filteredLocations,
    durationSeconds,
    avgPaceSecondsPerKm,
    elevationGainMeters,
    elevationLossMeters,
    splits,
    pauseIntervals,
  };

  // Core upload logic — extracted so it can be called from both distance trigger and timer
  const tryUploadChunk = async () => {
    if (uploadingRef.current) return;

    const s = stateRef.current;
    if (!s.sessionId || s.sessionId.startsWith('local_')) return; // No server session yet

    const newPoints = s.filteredLocations.slice(s.lastChunkPointIndex);
    if (newPoints.length === 0) return;

    uploadingRef.current = true;
    const seq = s.chunkSequence;
    const pointIndex = s.filteredLocations.length;

    // Build raw GPS points for the API
    const rawGPSPoints: RawGPSPointAPI[] = newPoints.map((p) => ({
      lat: p.latitude,
      lng: p.longitude,
      alt: p.altitude,
      speed: p.speed,
      bearing: p.bearing,
      accuracy: 10, // filtered points don't carry raw accuracy; use reasonable default
      timestamp: Math.round(p.timestamp),
    }));

    const startTs = newPoints[0].timestamp;
    const endTs = newPoints[newPoints.length - 1].timestamp;
    const chunkDistance = s.distanceMeters - s.lastChunkDistance;

    const chunkRequest: UploadChunkRequest = {
      session_id: s.sessionId,
      sequence: seq,
      chunk_type: 'intermediate',
      raw_gps_points: rawGPSPoints,
      chunk_summary: {
        distance_meters: Math.round(chunkDistance),
        duration_seconds: Math.round((endTs - startTs) / 1000),
        avg_pace_seconds_per_km: Math.round(s.avgPaceSecondsPerKm),
        elevation_change_meters: Math.round(s.elevationGainMeters - s.elevationLossMeters),
        point_count: rawGPSPoints.length,
        start_timestamp: Math.round(startTs),
        end_timestamp: Math.round(endTs),
      },
      cumulative: {
        total_distance_meters: Math.round(s.distanceMeters),
        total_duration_seconds: Math.round(s.durationSeconds),
        avg_pace_seconds_per_km: Math.round(s.avgPaceSecondsPerKm),
      },
      completed_splits: s.splits,
      pause_intervals: s.pauseIntervals.map((pi) => ({
        paused_at: pi.paused_at,
        resumed_at: pi.resumed_at,
      })),
    };

    // Increment sequence in store first (optimistic — next trigger uses seq+1)
    incrementChunkSequence();

    try {
      await runService.uploadChunk(s.sessionId, chunkRequest);
      markChunkUploaded(seq, pointIndex, s.distanceMeters);
      console.log(`[ChunkUpload] Chunk ${seq} uploaded (${rawGPSPoints.length} pts, ${Math.round(chunkDistance)}m)`);
    } catch (error) {
      console.warn(`[ChunkUpload] Chunk ${seq} failed, saving locally:`, error);
      // Save to local storage for retry on sync
      savePendingChunk({
        id: `chunk-${s.sessionId}-${seq}`,
        sessionId: s.sessionId,
        request: chunkRequest,
        createdAt: new Date().toISOString(),
      }).catch((err) => {
        console.warn('[ChunkUpload] 청크 로컬 저장 실패:', err);
      });
      // Still mark the point index/distance so we don't re-collect the same points
      markChunkUploaded(seq, pointIndex, s.distanceMeters);
    } finally {
      uploadingRef.current = false;
    }
  };

  // Distance-based trigger: upload when distance exceeds threshold since last chunk
  useEffect(() => {
    if (phase !== 'running') return;
    if (distanceMeters - lastChunkDistance < CHUNK_DISTANCE_THRESHOLD_M) return;

    tryUploadChunk();
  }, [phase, distanceMeters, lastChunkDistance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Time-based trigger: check every 30s if 5 minutes have elapsed since last chunk
  // Skip during pause/auto-pause — no new data to upload
  useEffect(() => {
    if (phase !== 'running' || isPaused || isAutoPaused) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      const s = stateRef.current;
      const elapsed = Date.now() - s.lastChunkTimestamp;
      if (elapsed >= CHUNK_TIME_THRESHOLD_MS) {
        tryUploadChunk();
      }
    }, 30_000); // Check every 30 seconds

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase, isPaused, isAutoPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactive token refresh during long runs — every 15 minutes
  // Ensures the token never expires even if chunk uploads are sparse
  useEffect(() => {
    if (phase !== 'running') return;

    const tokenRefreshInterval = setInterval(() => {
      performTokenRefresh().catch(() => {
        // Refresh failed — the 401 interceptor in api.ts will handle it
        // on the next actual API call
      });
    }, 15 * 60 * 1000); // Every 15 minutes

    return () => clearInterval(tokenRefreshInterval);
  }, [phase]);

  // Emergency chunk save when app is about to go to background
  // Ensures unsent GPS data is preserved even if iOS kills the app
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        const s = useRunningStore.getState();
        if (s.phase !== 'running' || !s.sessionId || s.sessionId.startsWith('local_')) return;

        const newPoints = s.filteredLocations.slice(s.lastChunkPointIndex);
        if (newPoints.length === 0) return;

        const rawGPSPoints: RawGPSPointAPI[] = newPoints.map((p) => ({
          lat: p.latitude,
          lng: p.longitude,
          alt: p.altitude,
          speed: p.speed,
          bearing: p.bearing,
          accuracy: 10,
          timestamp: Math.round(p.timestamp),
        }));

        const startTs = newPoints[0].timestamp;
        const endTs = newPoints[newPoints.length - 1].timestamp;

        // Use a unique emergency sequence to avoid collisions with normal chunks.
        // Prefix emergency sequences at 900000+ to keep them out of the normal range.
        const emergencySeq = 900000 + s.chunkSequence;

        const emergencyChunk: UploadChunkRequest = {
          session_id: s.sessionId,
          sequence: emergencySeq,
          chunk_type: 'emergency',
          raw_gps_points: rawGPSPoints,
          chunk_summary: {
            distance_meters: Math.round(s.distanceMeters - s.lastChunkDistance),
            duration_seconds: Math.round((endTs - startTs) / 1000),
            avg_pace_seconds_per_km: Math.round(s.avgPaceSecondsPerKm),
            elevation_change_meters: Math.round(s.elevationGainMeters - s.elevationLossMeters),
            point_count: rawGPSPoints.length,
            start_timestamp: Math.round(startTs),
            end_timestamp: Math.round(endTs),
          },
          cumulative: {
            total_distance_meters: Math.round(s.distanceMeters),
            total_duration_seconds: Math.round(s.durationSeconds),
            avg_pace_seconds_per_km: Math.round(s.avgPaceSecondsPerKm),
          },
          completed_splits: s.splits,
          pause_intervals: s.pauseIntervals.map((pi) => ({
            paused_at: pi.paused_at,
            resumed_at: pi.resumed_at,
          })),
        };

        // Save to AsyncStorage synchronously-ish (fire-and-forget)
        savePendingChunk({
          id: `chunk-emergency-${s.sessionId}-${emergencySeq}`,
          sessionId: s.sessionId,
          request: emergencyChunk,
          createdAt: new Date().toISOString(),
        }).catch((err) => {
          console.warn('[ChunkUpload] 긴급 청크 로컬 저장 실패:', err);
        });

        console.log(`[ChunkUpload] Emergency save on background (${rawGPSPoints.length} pts)`);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);
}
