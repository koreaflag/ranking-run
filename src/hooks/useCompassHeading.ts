/**
 * Compass heading hook — GPS bearing priority with native heading fallback.
 *
 * iOS: CLHeading.trueHeading (calibrated magnetometer)
 * Android: Rotation vector sensor (magnetometer + gyro fusion)
 *
 * Returns a plain number (degrees 0-360) that updates via useState.
 * No Animated.Value — Mapbox.MarkerView does not support Animated transforms.
 */

import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { GPSTrackerModule } = NativeModules;

/** Low-pass smoothing: 0 = no smoothing, 1 = frozen */
const NATIVE_ALPHA = 0.25;
const GPS_ALPHA = 0.2;

/** Circular low-pass filter (handles 0/360 wraparound) */
function smoothHeading(
  smoothedRef: React.MutableRefObject<number>,
  rawHeading: number,
  alpha: number,
): number {
  let delta = rawHeading - smoothedRef.current;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  // Skip tiny changes to avoid excessive re-renders
  if (Math.abs(delta) < 0.5) return -1;

  const smoothed = (smoothedRef.current + (1 - alpha) * delta + 360) % 360;
  smoothedRef.current = smoothed;
  return smoothed;
}

export interface CompassDebug {
  accuracy: number;
  trueHeading: number;
  magneticHeading: number;
}

export function useCompassHeading(
  updateInterval = 100,
  /** GPS course/bearing in degrees (0-360). Pass when moving for best accuracy. */
  gpsBearing?: number | null,
): { heading: number; debug: CompassDebug } {
  const [heading, setHeading] = useState(0);
  const [debug, setDebug] = useState<CompassDebug>({ accuracy: -1, trueHeading: -1, magneticHeading: -1 });
  const smoothedRef = useRef(0);
  const useGpsRef = useRef(false);

  // ---- GPS bearing override ----
  useEffect(() => {
    if (gpsBearing != null && gpsBearing >= 0) {
      useGpsRef.current = true;
      const result = smoothHeading(smoothedRef, gpsBearing, GPS_ALPHA);
      if (result >= 0) setHeading(result);
    } else {
      useGpsRef.current = false;
    }
  }, [gpsBearing]);

  // ---- Native heading (iOS: CLHeading, Android: rotation vector sensor) ----
  useEffect(() => {
    if (!GPSTrackerModule) return;

    let subscription: { remove: () => void } | null = null;

    try {
      const emitter = new NativeEventEmitter(
        Platform.OS === 'ios' ? GPSTrackerModule : undefined,
      );

      // Register listener FIRST so hasListeners=true before events fire
      subscription = emitter.addListener(
        'GPSTracker_onHeadingUpdate',
        (event: { heading: number; accuracy?: number; trueHeading?: number; magneticHeading?: number }) => {
          // Update debug info
          if (event.accuracy != null) {
            setDebug({
              accuracy: event.accuracy ?? -1,
              trueHeading: event.trueHeading ?? -1,
              magneticHeading: event.magneticHeading ?? -1,
            });
          }
          if (useGpsRef.current) return;
          if (event.heading >= 0) {
            const result = smoothHeading(smoothedRef, event.heading, NATIVE_ALPHA);
            if (result >= 0) setHeading(result);
          }
        },
      );

      GPSTrackerModule.startHeadingUpdates().catch((err: any) => {
        console.warn('[useCompassHeading] startHeadingUpdates failed:', err);
      });
    } catch (err) {
      // Compass sensor unavailable or NativeEventEmitter failed — return null heading gracefully
      console.warn('[useCompassHeading] Sensor subscription failed, heading will be null:', err);
    }

    return () => {
      try {
        subscription?.remove();
        GPSTrackerModule.stopHeadingUpdates().catch((err: any) => {
          console.warn('[useCompassHeading] stopHeadingUpdates failed:', err);
        });
      } catch (err) {
        console.warn('[useCompassHeading] Cleanup failed:', err);
      }
    };
  }, []);

  return { heading, debug };
}
