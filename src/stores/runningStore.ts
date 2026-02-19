import { create } from 'zustand';
import type { LocationUpdateEvent, GPSStatus, FilteredLocation } from '../types/gps';
import type { Split, PauseInterval } from '../types/api';
import { haversineDistance } from '../utils/geo';

// Loop detection constants
const LOOP_MIN_DISTANCE_M = 300;      // Min distance before checking (avoid false positive at start)
const LOOP_PROXIMITY_RADIUS_M = 30;   // "Near start" radius
const LOOP_APPROACH_RADIUS_M = 100;   // "Approaching start" radius (pre-warning)
const LOOP_COOLDOWN_MS = 60_000;      // Don't re-trigger for 60s after detection

export type RunningPhase = 'idle' | 'countdown' | 'running' | 'paused' | 'completed';

interface RunningState {
  // Session
  sessionId: string | null;
  courseId: string | null;
  phase: RunningPhase;

  // Live metrics
  distanceMeters: number;
  durationSeconds: number;
  currentPaceSecondsPerKm: number;
  avgPaceSecondsPerKm: number;
  currentSpeedMs: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  calories: number;
  cadence: number; // steps per minute

  // GPS
  gpsStatus: GPSStatus;
  currentLocation: LocationUpdateEvent | null;
  routePoints: Array<{ latitude: number; longitude: number }>;
  filteredLocations: FilteredLocation[];

  // Splits
  splits: Split[];
  currentSplitDistance: number;

  // Pause
  pauseIntervals: PauseInterval[];
  isPaused: boolean;

  // Watch
  heartRate: number;
  watchConnected: boolean;

  // Chunk tracking
  chunkSequence: number;
  lastChunkTimestamp: number;

  // Loop detection (free running only)
  startPoint: { latitude: number; longitude: number } | null;
  distanceToStart: number;       // live distance to start point (meters)
  isApproachingStart: boolean;   // within 100m of start
  isNearStart: boolean;          // within 30m of start
  loopDetected: boolean;         // confirmed round-trip
  loopDetectedAt: number | null; // timestamp of detection (for cooldown)

  // Stop location (captured when user taps stop)
  stopLocation: { latitude: number; longitude: number } | null;

  // Timer
  startTime: number | null;
  elapsedBeforePause: number;

  // Actions
  startSession: (sessionId: string, courseId: string | null) => void;
  updateSessionId: (serverSessionId: string) => void;
  updateLocation: (event: LocationUpdateEvent) => void;
  updateGPSStatus: (status: GPSStatus) => void;
  updateDuration: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  reset: () => void;
  addSplit: (split: Split) => void;
  incrementChunkSequence: () => void;
  setPhase: (phase: RunningPhase) => void;
  updateHeartRate: (bpm: number) => void;
  setWatchConnected: (connected: boolean) => void;
}

export const useRunningStore = create<RunningState>((set, get) => ({
  sessionId: null,
  courseId: null,
  phase: 'idle',

  distanceMeters: 0,
  durationSeconds: 0,
  currentPaceSecondsPerKm: 0,
  avgPaceSecondsPerKm: 0,
  currentSpeedMs: 0,
  elevationGainMeters: 0,
  elevationLossMeters: 0,
  calories: 0,
  cadence: 0,

  gpsStatus: 'searching',
  currentLocation: null,
  routePoints: [],
  filteredLocations: [],

  splits: [],
  currentSplitDistance: 0,

  pauseIntervals: [],
  isPaused: false,

  heartRate: 0,
  watchConnected: false,

  chunkSequence: 0,
  lastChunkTimestamp: 0,

  startPoint: null,
  distanceToStart: 0,
  isApproachingStart: false,
  isNearStart: false,
  loopDetected: false,
  loopDetectedAt: null,

  stopLocation: null,

  startTime: null,
  elapsedBeforePause: 0,

  startSession: (sessionId, courseId) => {
    set({
      sessionId,
      courseId,
      phase: 'running',
      distanceMeters: 0,
      durationSeconds: 0,
      currentPaceSecondsPerKm: 0,
      avgPaceSecondsPerKm: 0,
      currentSpeedMs: 0,
      elevationGainMeters: 0,
      elevationLossMeters: 0,
      calories: 0,
      cadence: 0,
      currentLocation: null,
      routePoints: [],
      filteredLocations: [],
      splits: [],
      currentSplitDistance: 0,
      pauseIntervals: [],
      isPaused: false,
      heartRate: 0,
      watchConnected: false,
      chunkSequence: 0,
      lastChunkTimestamp: Date.now(),
      startTime: Date.now(),
      elapsedBeforePause: 0,
      startPoint: null,
      distanceToStart: 0,
      isApproachingStart: false,
      isNearStart: false,
      loopDetected: false,
      loopDetectedAt: null,
      stopLocation: null,
    });
  },

  updateSessionId: (serverSessionId) => {
    set({ sessionId: serverSessionId });
  },

  updateLocation: (event) => {
    const state = get();
    if (state.phase !== 'running' || state.isPaused) return;

    const currentPos = { latitude: event.latitude, longitude: event.longitude };
    const newRoutePoints = [...state.routePoints, currentPos];

    // Save start point from first GPS fix
    const startPoint = state.startPoint ?? currentPos;

    // Calculate pace from speed (m/s)
    const currentPace =
      event.speed > 0.3 ? 1000 / event.speed : state.currentPaceSecondsPerKm;

    // Calculate average pace
    const distance = event.distanceFromStart;
    const elapsed = state.durationSeconds;
    const avgPace =
      distance > 0 ? (elapsed / distance) * 1000 : 0;

    // Estimate calories: ~60 kcal/km for ~65kg person
    const caloriesBurned = Math.round((distance / 1000) * 60);

    // --- Loop detection (free running only) ---
    let distanceToStart = 0;
    let isApproachingStart = state.isApproachingStart;
    let isNearStart = state.isNearStart;
    let loopDetected = state.loopDetected;
    let loopDetectedAt = state.loopDetectedAt;

    // Only run loop detection in free running (no courseId) and after traveling enough distance
    if (!state.courseId && distance > LOOP_MIN_DISTANCE_M) {
      distanceToStart = haversineDistance(currentPos, startPoint);

      // Check cooldown: don't re-trigger within 60s of last detection
      const cooldownActive = loopDetectedAt && (Date.now() - loopDetectedAt) < LOOP_COOLDOWN_MS;

      if (!cooldownActive) {
        isApproachingStart = distanceToStart <= LOOP_APPROACH_RADIUS_M;
        isNearStart = distanceToStart <= LOOP_PROXIMITY_RADIUS_M;

        if (isNearStart && !state.isNearStart) {
          // Just entered the proximity zone — confirm loop
          loopDetected = true;
          loopDetectedAt = Date.now();
        }
      } else {
        // During cooldown, clear flags if user moves away
        if (distanceToStart > LOOP_APPROACH_RADIUS_M) {
          isApproachingStart = false;
          isNearStart = false;
        }
      }
    }

    set({
      currentLocation: event,
      distanceMeters: distance,
      currentSpeedMs: event.speed,
      currentPaceSecondsPerKm: currentPace,
      avgPaceSecondsPerKm: avgPace,
      routePoints: newRoutePoints,
      calories: caloriesBurned,
      cadence: event.cadence ?? state.cadence,
      startPoint,
      distanceToStart,
      isApproachingStart,
      isNearStart,
      loopDetected,
      loopDetectedAt,
      // Auto-set GPS locked when we receive a location update
      ...(state.gpsStatus !== 'locked' ? { gpsStatus: 'locked' as const } : {}),
    });
  },

  updateGPSStatus: (status) => {
    set({ gpsStatus: status });
  },

  updateDuration: (seconds) => {
    set({ durationSeconds: seconds });
  },

  pause: () => {
    const state = get();
    if (state.phase !== 'running' || state.isPaused) return;

    set({
      isPaused: true,
      phase: 'paused',
      elapsedBeforePause: state.durationSeconds,
    });
  },

  resume: () => {
    const state = get();
    if (state.phase !== 'paused') return;

    const pauseIntervals = [...state.pauseIntervals];
    // The pause interval will be finalized when we have the resume timestamp
    set({
      isPaused: false,
      phase: 'running',
      pauseIntervals,
      startTime: Date.now(),
    });
  },

  complete: () => {
    const state = get();
    const stopLoc = state.currentLocation
      ? { latitude: state.currentLocation.latitude, longitude: state.currentLocation.longitude }
      : state.routePoints.length > 0
        ? state.routePoints[state.routePoints.length - 1]
        : null;
    set({ phase: 'completed', isPaused: false, stopLocation: stopLoc });
  },

  reset: () => {
    set({
      sessionId: null,
      courseId: null,
      phase: 'idle',
      distanceMeters: 0,
      durationSeconds: 0,
      currentPaceSecondsPerKm: 0,
      avgPaceSecondsPerKm: 0,
      currentSpeedMs: 0,
      elevationGainMeters: 0,
      elevationLossMeters: 0,
      calories: 0,
      cadence: 0,
      gpsStatus: 'searching',
      currentLocation: null,
      routePoints: [],
      filteredLocations: [],
      splits: [],
      currentSplitDistance: 0,
      pauseIntervals: [],
      isPaused: false,
      heartRate: 0,
      watchConnected: false,
      chunkSequence: 0,
      lastChunkTimestamp: 0,
      startPoint: null,
      distanceToStart: 0,
      isApproachingStart: false,
      isNearStart: false,
      loopDetected: false,
      loopDetectedAt: null,
      stopLocation: null,
      startTime: null,
      elapsedBeforePause: 0,
    });
  },

  addSplit: (split) => {
    set((state) => ({
      splits: [...state.splits, split],
      currentSplitDistance: 0,
    }));
  },

  incrementChunkSequence: () => {
    set((state) => ({
      chunkSequence: state.chunkSequence + 1,
      lastChunkTimestamp: Date.now(),
    }));
  },

  setPhase: (phase) => {
    set({ phase });
  },

  updateHeartRate: (bpm) => {
    set({ heartRate: bpm });
  },

  setWatchConnected: (connected) => {
    set({ watchConnected: connected });
  },
}));
