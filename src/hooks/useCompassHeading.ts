/**
 * Compass heading hook — GPS bearing priority with native iOS heading fallback.
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
  if (Math.abs(delta) < 2) return -1;

  const smoothed = (smoothedRef.current + (1 - alpha) * delta + 360) % 360;
  smoothedRef.current = smoothed;
  return smoothed;
}

export function useCompassHeading(
  updateInterval = 100,
  /** GPS course/bearing in degrees (0-360). Pass when moving for best accuracy. */
  gpsBearing?: number | null,
): number {
  const [heading, setHeading] = useState(0);
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

  // ---- Native iOS heading (calibrated CLHeading.trueHeading) ----
  useEffect(() => {
    if (Platform.OS !== 'ios' || !GPSTrackerModule) return;

    const emitter = new NativeEventEmitter(GPSTrackerModule);

    // Register listener FIRST so hasListeners=true before events fire
    const subscription = emitter.addListener(
      'GPSTracker_onHeadingUpdate',
      (event: { heading: number }) => {
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

    return () => {
      subscription.remove();
      GPSTrackerModule.stopHeadingUpdates().catch(() => {});
    };
  }, []);

  return heading;
}
