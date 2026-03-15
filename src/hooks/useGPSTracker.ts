import { useEffect, useRef, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { useRunningStore } from '../stores/runningStore';
import type {
  LocationUpdateEvent,
  GPSStatusChangeEvent,
  MilestoneReachedEvent,
} from '../types/gps';
import { GPS_EVENTS } from '../types/gps';

const { GPSTrackerModule } = NativeModules;

/**
 * Hook to interact with the native GPS tracking module.
 * Subscribes to location updates and GPS status changes,
 * forwarding them to the running store.
 *
 * The actual native module is implemented by the Android/iOS GPS agents.
 * This hook only handles the JS-side bridge.
 */
/** Heartbeat interval: if no GPS updates received for this duration while running, attempt restart */
const GPS_HEARTBEAT_TIMEOUT_MS = 30_000;

export function useGPSTracker() {
  const subscriptionsRef = useRef<Array<{ remove: () => void }>>([]);
  const gpsLockedRef = useRef(false);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use individual selectors for stable references (Zustand returns the same
  // function object across renders when selected individually, preventing
  // the useEffect from re-subscribing on every store update).
  const phase = useRunningStore(s => s.phase);
  const updateLocation = useRunningStore(s => s.updateLocation);
  const updateGPSStatus = useRunningStore(s => s.updateGPSStatus);
  const addSplit = useRunningStore(s => s.addSplit);
  const setAutoPaused = useRunningStore(s => s.setAutoPaused);

  const startTracking = useCallback(async () => {
    if (!GPSTrackerModule) {
      console.warn('[GPS] Native GPSTrackerModule not available');
      return;
    }
    try {
      await GPSTrackerModule.startTracking();
    } catch (error) {
      console.error('[GPS] Failed to start tracking:', error);
      throw error;
    }
  }, []);

  const stopTracking = useCallback(async () => {
    if (!GPSTrackerModule) return;
    try {
      await GPSTrackerModule.stopTracking();
    } catch (error) {
      console.error('[GPS] Failed to stop tracking:', error);
    }
  }, []);

  const pauseTracking = useCallback(async () => {
    if (!GPSTrackerModule) return;
    try {
      await GPSTrackerModule.pauseTracking();
    } catch (error) {
      console.error('[GPS] Failed to pause tracking:', error);
    }
  }, []);

  const resumeTracking = useCallback(async () => {
    if (!GPSTrackerModule) return;
    try {
      await GPSTrackerModule.resumeTracking();
    } catch (error) {
      console.error('[GPS] Failed to resume tracking:', error);
    }
  }, []);

  // Subscribe to native events when the running phase is active
  useEffect(() => {
    if (!GPSTrackerModule) return;
    if (phase !== 'running' && phase !== 'paused' && phase !== 'countdown') return;

    const emitter = new NativeEventEmitter(
      Platform.OS === 'ios' ? GPSTrackerModule : undefined,
    );

    const locationSub = emitter.addListener(
      GPS_EVENTS.LOCATION_UPDATE,
      (event: LocationUpdateEvent) => {
        lastUpdateTimeRef.current = Date.now();
        updateLocation(event);
      },
    );

    const statusSub = emitter.addListener(
      GPS_EVENTS.GPS_STATUS_CHANGE,
      (event: GPSStatusChangeEvent) => {
        updateGPSStatus(event.status, event.accuracy);
      },
    );

    const milestoneSub = emitter.addListener(
      GPS_EVENTS.MILESTONE_REACHED,
      (event: MilestoneReachedEvent) => {
        addSplit({
          split_number: event.km,
          distance_meters: 1000,
          duration_seconds: event.splitPaceSecondsPerKm,
          pace_seconds_per_km: event.splitPaceSecondsPerKm,
          elevation_change_meters: 0,
        });
      },
    );

    // Listen for native stationary/moving state changes.
    // This is critical for auto-pause resume: when the native StationaryDetector
    // transitions to "moving", we must immediately clear auto-pause even if
    // the next location update hasn't arrived yet (GPS may be slow to deliver
    // updates after BatteryOptimizer restores accuracy).
    const runningStateSub = emitter.addListener(
      GPS_EVENTS.RUNNING_STATE_CHANGE,
      (event: { state: string; duration: number }) => {
        if (event.state === 'moving') {
          const store = useRunningStore.getState();
          if (store.isAutoPaused) {
            setAutoPaused(false);
          }
        }
      },
    );

    subscriptionsRef.current = [locationSub, statusSub, milestoneSub, runningStateSub];

    // Fetch current GPS status in case we missed the initial event
    gpsLockedRef.current = false;
    const pollStatus = () => {
      if (gpsLockedRef.current) return; // Stop polling once locked
      GPSTrackerModule.getCurrentStatus()
        .then((status: string) => {
          if (status === 'locked' || status === 'searching' || status === 'lost' || status === 'disabled') {
            updateGPSStatus(status as any);
            if (status === 'locked') {
              gpsLockedRef.current = true;
            }
          }
        })
        .catch((err: any) => {
          console.warn('[useGPSTracker] GPS 상태 조회 실패:', err);
        });
    };

    // Initial check + poll every 3 seconds until locked
    pollStatus();
    const pollInterval = setInterval(() => {
      pollStatus();
    }, 3000);

    // Heartbeat: if no GPS updates for 30s while in 'running' phase, restart tracking
    lastUpdateTimeRef.current = Date.now();
    heartbeatIntervalRef.current = setInterval(() => {
      const currentPhase = useRunningStore.getState().phase;
      if (currentPhase !== 'running') return;
      const elapsed = Date.now() - lastUpdateTimeRef.current;
      if (elapsed > GPS_HEARTBEAT_TIMEOUT_MS) {
        console.warn(`[useGPSTracker] No GPS update for ${Math.round(elapsed / 1000)}s, attempting restart`);
        GPSTrackerModule.stopTracking()
          .then(() => GPSTrackerModule.startTracking())
          .then(() => {
            lastUpdateTimeRef.current = Date.now();
            console.log('[useGPSTracker] GPS tracking restarted via heartbeat');
          })
          .catch((err: any) => {
            console.error('[useGPSTracker] Heartbeat restart failed:', err);
          });
      }
    }, 10_000);

    return () => {
      subscriptionsRef.current.forEach((sub) => sub.remove());
      subscriptionsRef.current = [];
      clearInterval(pollInterval);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [phase, updateLocation, updateGPSStatus, addSplit, setAutoPaused]);

  return {
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    isAvailable: !!GPSTrackerModule,
  };
}
