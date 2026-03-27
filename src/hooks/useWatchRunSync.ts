import { useEffect } from 'react';
import { NativeModules, NativeEventEmitter, Platform, Alert } from 'react-native';
import { runService } from '../services/runService';
import { userService } from '../services/userService';
import { useRunningStore } from '../stores/runningStore';
import { useNetworkStore } from '../stores/networkStore';
import { savePendingRunRecord, savePendingChunk } from '../services/pendingSyncService';
import { formatDistance, formatDuration } from '../utils/format';
import { WATCH_EVENTS } from '../types/watch';
import type { WatchWeeklyGoalEvent, WatchStandaloneStatus } from '../types/watch';
import { useWatchStandaloneStore } from '../stores/watchStandaloneStore';
import i18n from '../i18n';

const { WatchBridgeModule } = NativeModules;

interface WatchRunData {
  type: string;
  distanceMeters: number;
  durationSeconds: number;
  avgPace: number;
  routePoints: Array<{
    lat: number;
    lng: number;
    alt: number;
    timestamp: number;
    accuracy: number;
    speed: number;
  }>;
  startedAt: number; // unix timestamp
  finishedAt: number;
  pointCount: number;
  isIndoor?: boolean; // pedometer-based indoor run (no GPS)
  totalSteps?: number;
  // Program goal data (from watch standalone runs)
  goalType?: string; // "free"/"distance"/"time"/"program"
  goalValue?: number; // meters (distance/program) or seconds (time)
  programTargetDistance?: number; // meters
  programTargetTime?: number; // seconds
  programStatus?: string; // "ahead"/"on_pace"/"behind"/"critical"
  programTimeDelta?: number; // seconds
  metronomeBPM?: number;
}

// Queue to process multiple watch runs sequentially (prevents concurrent uploads)
let processingQueue: Promise<void> = Promise.resolve();

async function processWatchRun(data: WatchRunData): Promise<void> {
  const isOnline = useNetworkStore.getState().isOnline;

  console.log('[WatchRunSync] Received standalone run from watch:', {
    distance: data.distanceMeters,
    duration: data.durationSeconds,
    points: data.pointCount,
    online: isOnline,
  });

  // Build common data
  const isIndoor = data.isIndoor === true;
  const coordinates: [number, number, number][] = isIndoor
    ? []
    : (data.routePoints || []).map((p) => [p.lng, p.lat, p.alt ?? 0] as [number, number, number]);
  const routeGeometry = coordinates.length >= 2
    ? { type: 'LineString' as const, coordinates }
    : null;

  const rawPoints = isIndoor
    ? []
    : (data.routePoints || []).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        alt: p.alt ?? 0,
        speed: p.speed ?? 0,
        bearing: 0,
        accuracy: p.accuracy ?? 10,
        timestamp: Math.round(p.timestamp * 1000),
      }));

  const distanceInt = Math.round(data.distanceMeters);
  const durationInt = Math.round(data.durationSeconds);
  const avgSpeedMs = durationInt > 0 ? data.distanceMeters / durationInt : 0;

  const CHUNK_SIZE = 200;
  const totalChunks = rawPoints.length > 0 ? Math.ceil(rawPoints.length / CHUNK_SIZE) : 0;

  const completePayload = {
    distance_meters: distanceInt,
    duration_seconds: durationInt,
    total_elapsed_seconds: durationInt,
    avg_pace_seconds_per_km: Math.round(data.avgPace),
    best_pace_seconds_per_km: Math.round(data.avgPace),
    avg_speed_ms: avgSpeedMs,
    max_speed_ms: avgSpeedMs,
    calories: null,
    finished_at: new Date(data.finishedAt * 1000).toISOString(),
    route_geometry: routeGeometry ?? {
      type: 'LineString' as const,
      coordinates: [[0, 0, 0], [0, 0, 0]] as [number, number, number][],
    },
    elevation_gain_meters: 0,
    elevation_loss_meters: 0,
    elevation_profile: [] as number[],
    splits: [] as any[],
    pause_intervals: [] as any[],
    filter_config: {
      kalman_q: 0,
      kalman_r_base: 0,
      outlier_speed_threshold: 15,
      outlier_accuracy_threshold: 30,
    },
    total_chunks: totalChunks,
    uploaded_chunk_sequences: [] as number[],
  };

  try {
    // 1. Create session
    const session = await runService.createSession({
      course_id: null,
      started_at: new Date(data.startedAt * 1000).toISOString(),
      device_info: {
        platform: 'ios',
        os_version: 'watchOS',
        device_model: 'Apple Watch',
        app_version: '1.0.0',
      },
    });

    console.log('[WatchRunSync] Session created:', session.session_id);

    // 2. Upload chunks
    const uploadedSequences: number[] = [];
    for (let seq = 0; seq < totalChunks; seq++) {
      const start = seq * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, rawPoints.length);
      const chunkPoints = rawPoints.slice(start, end);
      const isLast = seq === totalChunks - 1;
      const chunkStartTs = chunkPoints[0].timestamp;
      const chunkEndTs = chunkPoints[chunkPoints.length - 1].timestamp;

      await runService.uploadChunk(session.session_id, {
        session_id: session.session_id,
        sequence: seq,
        chunk_type: isLast ? 'final' : 'intermediate',
        raw_gps_points: chunkPoints,
        chunk_summary: {
          distance_meters: isLast ? data.distanceMeters : Math.round(data.distanceMeters * (end / rawPoints.length)),
          duration_seconds: Math.round((chunkEndTs - chunkStartTs) / 1000),
          avg_pace_seconds_per_km: Math.round(data.avgPace),
          elevation_change_meters: 0,
          point_count: chunkPoints.length,
          start_timestamp: chunkStartTs,
          end_timestamp: chunkEndTs,
        },
        cumulative: {
          total_distance_meters: data.distanceMeters,
          total_duration_seconds: Math.round(data.durationSeconds),
          avg_pace_seconds_per_km: Math.round(data.avgPace),
        },
        completed_splits: [],
        pause_intervals: [],
      });
      uploadedSequences.push(seq);
      console.log(`[WatchRunSync] Chunk ${seq + 1}/${totalChunks} uploaded`);
    }

    // 3. Complete the run
    completePayload.uploaded_chunk_sequences = uploadedSequences;
    await runService.completeRun(session.session_id, completePayload);

    console.log('[WatchRunSync] Run saved successfully:', session.session_id);
    showWatchRunResult(data, session.session_id);
  } catch (error) {
    console.warn('[WatchRunSync] Server upload failed, saving to pending sync:', error);

    // Save to pendingSyncService for later upload when online
    const localSessionId = `watch_${data.startedAt}_${Date.now().toString(36)}`;

    // Save chunks as pending
    for (let seq = 0; seq < totalChunks; seq++) {
      const start = seq * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, rawPoints.length);
      const chunkPoints = rawPoints.slice(start, end);
      const isLast = seq === totalChunks - 1;
      const chunkStartTs = chunkPoints[0].timestamp;
      const chunkEndTs = chunkPoints[chunkPoints.length - 1].timestamp;

      await savePendingChunk({
        id: `${localSessionId}_chunk_${seq}`,
        sessionId: localSessionId,
        request: {
          session_id: localSessionId,
          sequence: seq,
          chunk_type: isLast ? 'final' : 'intermediate',
          raw_gps_points: chunkPoints,
          chunk_summary: {
            distance_meters: isLast ? data.distanceMeters : Math.round(data.distanceMeters * (end / rawPoints.length)),
            duration_seconds: Math.round((chunkEndTs - chunkStartTs) / 1000),
            avg_pace_seconds_per_km: Math.round(data.avgPace),
            elevation_change_meters: 0,
            point_count: chunkPoints.length,
            start_timestamp: chunkStartTs,
            end_timestamp: chunkEndTs,
          },
          cumulative: {
            total_distance_meters: data.distanceMeters,
            total_duration_seconds: Math.round(data.durationSeconds),
            avg_pace_seconds_per_km: Math.round(data.avgPace),
          },
          completed_splits: [],
          pause_intervals: [],
        },
        createdAt: new Date().toISOString(),
      });
    }

    // Save run completion as pending
    completePayload.uploaded_chunk_sequences = Array.from({ length: totalChunks }, (_, i) => i);
    await savePendingRunRecord({
      id: localSessionId,
      sessionId: localSessionId,
      payload: completePayload,
      createdAt: new Date().toISOString(),
    });

    // Update pending count and trigger sync when online
    await useNetworkStore.getState().refreshPendingCount();

    Alert.alert(
      i18n.t('watch.runSaved'),
      `${formatDistance(data.distanceMeters)} · ${formatDuration(data.durationSeconds)}\n${i18n.t('common.offlineSyncLater') || '온라인 시 자동 업로드됩니다'}`,
    );
  }
}

function showWatchRunResult(data: WatchRunData, sessionId: string): void {
  // Check if phone is currently in an active run — don't interrupt
  const { phase } = useRunningStore.getState();
  if (phase === 'running' || phase === 'paused') {
    Alert.alert(
      i18n.t('watch.runSaved'),
      `${formatDistance(data.distanceMeters)} · ${formatDuration(data.durationSeconds)}`,
    );
    return;
  }

  // Populate running store with watch data
  const routePoints = (data.routePoints || []).map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
  }));

  const validGoalTypes = ['distance', 'time', 'pace', 'program'] as const;
  const gt = data.goalType ?? '';
  const watchGoalType = validGoalTypes.includes(gt as any) ? (gt as typeof validGoalTypes[number]) : null;
  const watchRunGoal = {
    type: watchGoalType,
    value: data.goalValue ?? null,
    targetTime: data.programTargetTime ?? null,
    cadenceBPM: data.metronomeBPM ?? null,
  };

  useRunningStore.setState({
    sessionId,
    courseId: null,
    phase: 'completed',
    distanceMeters: data.distanceMeters,
    durationSeconds: data.durationSeconds,
    avgPaceSecondsPerKm: data.avgPace,
    currentPaceSecondsPerKm: data.avgPace,
    currentSpeedMs: 0,
    gpsStatus: 'locked',
    isPaused: false,
    routePoints,
    splits: [],
    elevationGainMeters: 0,
    elevationLossMeters: 0,
    calories: 0,
    heartRate: 0,
    cadence: 0,
    stopLocation: routePoints.length > 0 ? routePoints[routePoints.length - 1] : null,
    runGoal: watchRunGoal,
  });
}

/**
 * Global listener for standalone Apple Watch run completion.
 * When the watch finishes a standalone run and syncs to the phone,
 * this hook receives the data, saves it to the server, populates
 * the running store, and navigates to RunResult.
 *
 * Multiple runs arriving simultaneously are queued and processed sequentially.
 * If the server is unreachable, runs are saved to pendingSyncService for later upload.
 *
 * Place in a component that's always mounted (e.g., TabNavigator).
 */
export function useWatchRunSync() {
  useEffect(() => {
    if (Platform.OS !== 'ios' || !WatchBridgeModule) return;

    const emitter = new NativeEventEmitter(WatchBridgeModule);

    const subscription = emitter.addListener(WATCH_EVENTS.STANDALONE_RUN, (data: WatchRunData) => {
      // Queue processing to handle multiple runs arriving simultaneously
      processingQueue = processingQueue
        .then(() => processWatchRun(data))
        .catch((err) => console.warn('[WatchRunSync] Queue processing error:', err));
    });

    // Listen for weekly goal changes from the watch
    const goalSub = emitter.addListener(
      WATCH_EVENTS.WEEKLY_GOAL_UPDATE,
      async (data: WatchWeeklyGoalEvent) => {
        const goalKm = data.weeklyGoalKm;
        if (!goalKm || goalKm < 1 || goalKm > 500) return;

        console.log('[WatchRunSync] Weekly goal update from watch:', goalKm, 'km');
        try {
          await userService.updateWeeklyGoal(goalKm);
          console.log('[WatchRunSync] Weekly goal saved to server:', goalKm, 'km');
        } catch (error) {
          console.warn('[WatchRunSync] Failed to save weekly goal from watch:', error);
        }
      },
    );

    // Listen for watch standalone run status updates (live during run)
    const statusSub = emitter.addListener(
      WATCH_EVENTS.STANDALONE_STATUS,
      (data: WatchStandaloneStatus) => {
        useWatchStandaloneStore.getState().updateStatus(data);
      },
    );

    return () => {
      subscription.remove();
      goalSub.remove();
      statusSub.remove();
    };
  }, []);
}
