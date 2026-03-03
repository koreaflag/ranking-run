import { useEffect } from 'react';
import { NativeModules, NativeEventEmitter, Platform, Alert } from 'react-native';
import { runService } from '../services/runService';
import { useRunningStore } from '../stores/runningStore';
import { formatDistance, formatDuration } from '../utils/format';
import i18n from '../i18n';

const { WatchBridgeModule } = NativeModules;
const STANDALONE_RUN_EVENT = 'Watch_onStandaloneRun';

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

    const subscription = emitter.addListener(STANDALONE_RUN_EVENT, async (data: WatchRunData) => {
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
        const coordinates: [number, number, number][] = (data.routePoints || []).map((p) => [p.lng, p.lat, p.alt ?? 0] as [number, number, number]);
        const routeGeometry = {
          type: 'LineString' as const,
          coordinates: coordinates.length >= 2 ? coordinates : [[0, 0, 0], [0, 0, 0]] as [number, number, number][],
        };

        // 3. Build raw GPS points for chunk upload
        // Watch sends timestamps in seconds (timeIntervalSince1970), backend expects milliseconds int
        const rawPoints = (data.routePoints || []).map((p) => ({
          lat: p.lat,
          lng: p.lng,
          alt: p.alt ?? 0,
          speed: p.speed ?? 0,
          bearing: 0,
          accuracy: p.accuracy ?? 10,
          timestamp: Math.round(p.timestamp * 1000),
        }));

        // 4. Upload single chunk with all points
        if (rawPoints.length > 0) {
          await runService.uploadChunk(session.session_id, {
            session_id: session.session_id,
            sequence: 0,
            chunk_type: 'final',
            raw_gps_points: rawPoints,
            chunk_summary: {
              distance_meters: data.distanceMeters,
              duration_seconds: Math.round(data.durationSeconds),
              avg_pace_seconds_per_km: Math.round(data.avgPace),
              elevation_change_meters: 0,
              point_count: rawPoints.length,
              start_timestamp: Math.round(data.startedAt * 1000),
              end_timestamp: Math.round(data.finishedAt * 1000),
            },
            cumulative: {
              total_distance_meters: data.distanceMeters,
              total_duration_seconds: Math.round(data.durationSeconds),
              avg_pace_seconds_per_km: Math.round(data.avgPace),
            },
            completed_splits: [],
            pause_intervals: [],
          });
          console.log('[WatchRunSync] Chunk uploaded');
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
          route_geometry: routeGeometry,
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
          total_chunks: 1,
          uploaded_chunk_sequences: [0],
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

        useRunningStore.setState({
          sessionId: session.session_id,
          courseId: null,
          phase: 'completed',
          distanceMeters: data.distanceMeters,
          durationSeconds: data.durationSeconds,
          avgPaceSecondsPerKm: data.avgPace,
          currentPaceSecondsPerKm: data.avgPace,
          routePoints,
          splits: [],
          elevationGainMeters: 0,
          elevationLossMeters: 0,
          calories: 0,
          heartRate: 0,
          cadence: 0,
          stopLocation: routePoints.length > 0 ? routePoints[routePoints.length - 1] : null,
        });
      } catch (error) {
        console.warn('[WatchRunSync] Failed to save watch run:', error);
        Alert.alert(i18n.t('common.errorTitle'), i18n.t('watch.checkNetwork'));
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
