import { useEffect, useRef, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { useRunningStore } from '../stores/runningStore';
import type {
  LocationUpdateEvent,
  GPSStatusChangeEvent,
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
export function useGPSTracker() {
  const subscriptionsRef = useRef<Array<{ remove: () => void }>>([]);
  const { updateLocation, updateGPSStatus, phase } = useRunningStore();

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
    if (phase !== 'running' && phase !== 'paused') return;

    const emitter = new NativeEventEmitter(
      Platform.OS === 'ios' ? GPSTrackerModule : undefined,
    );

    const locationSub = emitter.addListener(
      GPS_EVENTS.LOCATION_UPDATE,
      (event: LocationUpdateEvent) => {
        updateLocation(event);
      },
    );

    const statusSub = emitter.addListener(
      GPS_EVENTS.GPS_STATUS_CHANGE,
      (event: GPSStatusChangeEvent) => {
        updateGPSStatus(event.status);
      },
    );

    subscriptionsRef.current = [locationSub, statusSub];

    // Fetch current GPS status in case we missed the initial event
    const pollStatus = () => {
      GPSTrackerModule.getCurrentStatus()
        .then((status: string) => {
          if (status === 'locked' || status === 'searching' || status === 'lost' || status === 'disabled') {
            updateGPSStatus(status as any);
          }
        })
        .catch(() => {});
    };

    // Initial check + poll every 3 seconds until locked
    pollStatus();
    const pollInterval = setInterval(() => {
      pollStatus();
    }, 3000);

    return () => {
      subscriptionsRef.current.forEach((sub) => sub.remove());
      subscriptionsRef.current = [];
      clearInterval(pollInterval);
    };
  }, [phase, updateLocation, updateGPSStatus]);

  return {
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    isAvailable: !!GPSTrackerModule,
  };
}
