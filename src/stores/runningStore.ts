import { create } from 'zustand';
import type { LocationUpdateEvent, GPSStatus, FilteredLocation } from '../types/gps';
import type { Split, PauseInterval } from '../types/api';

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

  // Timer
  startTime: number | null;
  elapsedBeforePause: number;

  // Actions
  startSession: (sessionId: string, courseId: string | null) => void;
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
    });
  },

  updateLocation: (event) => {
    const state = get();
    if (state.phase !== 'running' || state.isPaused) return;

    const newRoutePoints = [
      ...state.routePoints,
      { latitude: event.latitude, longitude: event.longitude },
    ];

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

    set({
      currentLocation: event,
      distanceMeters: distance,
      currentSpeedMs: event.speed,
      currentPaceSecondsPerKm: currentPace,
      avgPaceSecondsPerKm: avgPace,
      routePoints: newRoutePoints,
      calories: caloriesBurned,
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
    set({ phase: 'completed', isPaused: false });
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
