import { useEffect } from 'react';
import { NativeModules, NativeEventEmitter, Platform, Alert } from 'react-native';
import { runService } from '../services/runService';
import { userService } from '../services/userService';
import { useRunningStore } from '../stores/runningStore';
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

/**
 * Global listener for standalone Apple Watch run completion.
 * When the watch finishes a standalone run and syncs to the phone,
 * this hook receives the data, saves it to the server, populates
 * the running store, and navigates to RunResult.
 *
 * Place in a component that's always mounted (e.g., TabNavigator).
 */
export function useWatchRunSync() {
  useEffect(() => {
    if (Platform.OS !== 'ios' || !WatchBridgeModule) return;

    const emitter = new NativeEventEmitter(WatchBridgeModule);

    const subscription = emitter.addListener(WATCH_EVENTS.STANDALONE_RUN, async (data: WatchRunData) => {
      console.log('[WatchRunSync] Received standalone run from watch:', {
        distance: data.distanceMeters,
        duration: data.durationSeconds,
        points: data.pointCount,
      });

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

        // 2. Build route geometry from watch GPS points
        // For indoor runs (pedometer-based), skip route geometry entirely
        const isIndoor = data.isIndoor === true;
        const coordinates: [number, number, number][] = isIndoor
          ? []
          : (data.routePoints || []).map((p) => [p.lng, p.lat, p.alt ?? 0] as [number, number, number]);
        const routeGeometry = coordinates.length >= 2
          ? { type: 'LineString' as const, coordinates }
          : null;

        // 3. Build raw GPS points for chunk upload
        // Watch sends timestamps in seconds (timeIntervalSince1970), backend expects milliseconds int
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

        // 4. Upload chunks — split large payloads into 200-point chunks to prevent
        // data loss from a single failed upload
        const CHUNK_SIZE = 200;
        const totalChunks = rawPoints.length > 0 ? Math.ceil(rawPoints.length / CHUNK_SIZE) : 0;
        const uploadedSequences: number[] = [];

        for (let seq = 0; seq < totalChunks; seq++) {
          const start = seq * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, rawPoints.length);
          const chunkPoints = rawPoints.slice(start, end);
          const isLast = seq === totalChunks - 1;

          // Use chunk-specific timestamps from actual GPS points
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

        // 5. Complete the run
        const distanceInt = Math.round(data.distanceMeters);
        const durationInt = Math.round(data.durationSeconds);
        const avgSpeedMs = durationInt > 0
          ? data.distanceMeters / durationInt
          : 0;

        await runService.completeRun(session.session_id, {
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
          elevation_profile: [],
          splits: [],
          pause_intervals: [],
          filter_config: {
            kalman_q: 0,
            kalman_r_base: 0,
            outlier_speed_threshold: 15,
            outlier_accuracy_threshold: 30,
          },
          total_chunks: totalChunks,
          uploaded_chunk_sequences: uploadedSequences,
        });

        console.log('[WatchRunSync] Run saved successfully:', session.session_id);

        // 6. Check if phone is currently in an active run — don't interrupt
        const { phase } = useRunningStore.getState();
        if (phase === 'running' || phase === 'paused') {
          // User is mid-run on phone — just show alert, don't navigate
          Alert.alert(
            i18n.t('watch.runSaved'),
            `${formatDistance(data.distanceMeters)} · ${formatDuration(data.durationSeconds)}`,
          );
          return;
        }

        // 7. Populate running store with watch data — WorldScreen inline panel
        //    will display the completion summary automatically when phase='completed'
        const routePoints = (data.routePoints || []).map((p) => ({
          latitude: p.lat,
          longitude: p.lng,
        }));

        // Build runGoal from watch data
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
          sessionId: session.session_id,
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
      } catch (error) {
        console.warn('[WatchRunSync] Failed to save watch run:', error);
        Alert.alert(i18n.t('common.errorTitle'), i18n.t('watch.checkNetwork'));
      }
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
