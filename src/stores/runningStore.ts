import { create } from 'zustand';
import type { LocationUpdateEvent, GPSStatus, FilteredLocation } from '../types/gps';
import type { Split, PauseInterval, CheckpointPass } from '../types/api';
import { haversineDistance } from '../utils/geo';
import { useSettingsStore } from './settingsStore';

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
  gpsAccuracy: number | null;
  currentLocation: LocationUpdateEvent | null;
  routePoints: Array<{ latitude: number; longitude: number }>;
  filteredLocations: FilteredLocation[];

  // Course deviation log (for result screen visualization)
  deviationLog: Array<{ index: number; deviation: number }>;

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
  lastChunkDistance: number;
  lastChunkPointIndex: number;
  uploadedChunkSequences: number[];

  // Loop detection (free running only)
  startPoint: { latitude: number; longitude: number } | null;
  distanceToStart: number;       // live distance to start point (meters)
  isApproachingStart: boolean;   // within 100m of start
  isNearStart: boolean;          // within 30m of start
  loopDetected: boolean;         // confirmed round-trip
  loopDetectedAt: number | null; // timestamp of detection (for cooldown)

  // Checkpoint passes (course running)
  checkpointPasses: CheckpointPass[];

  // Stop location (captured when user taps stop)
  stopLocation: { latitude: number; longitude: number } | null;

  // Timer
  startTime: number | null;
  elapsedBeforePause: number;

  // Auto-pause (timer frozen while stationary, phase stays "running")
  isAutoPaused: boolean;

  // Run goal
  runGoal: {
    type: 'distance' | 'time' | 'pace' | 'program' | null;
    value: number | null;
    targetTime?: number | null;
    cadenceBPM?: number | null;
  };

  // Actions
  startSession: (sessionId: string, courseId: string | null) => void;
  updateSessionId: (serverSessionId: string) => void;
  updateLocation: (event: LocationUpdateEvent) => void;
  updateGPSStatus: (status: GPSStatus, accuracy?: number | null) => void;
  addDeviationPoint: (index: number, deviation: number) => void;
  updateDuration: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  reset: () => void;
  addSplit: (split: Split) => void;
  incrementChunkSequence: () => void;
  markChunkUploaded: (sequence: number, pointIndex: number, distance: number) => void;
  setPhase: (phase: RunningPhase) => void;
  updateHeartRate: (bpm: number) => void;
  setWatchConnected: (connected: boolean) => void;
  setCheckpointPasses: (passes: CheckpointPass[]) => void;
  setAutoPaused: (paused: boolean) => void;
  setRunGoal: (goal: { type: 'distance' | 'time' | 'pace' | 'program' | null; value: number | null; targetTime?: number | null; cadenceBPM?: number | null }) => void;
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
  gpsAccuracy: null,
  currentLocation: null,
  routePoints: [],
  filteredLocations: [],
  deviationLog: [],

  splits: [],
  currentSplitDistance: 0,

  pauseIntervals: [],
  isPaused: false,

  heartRate: 0,
  watchConnected: false,

  chunkSequence: 0,
  lastChunkTimestamp: 0,
  lastChunkDistance: 0,
  lastChunkPointIndex: 0,
  uploadedChunkSequences: [],

  startPoint: null,
  distanceToStart: 0,
  isApproachingStart: false,
  isNearStart: false,
  loopDetected: false,
  loopDetectedAt: null,

  checkpointPasses: [],
  stopLocation: null,

  startTime: null,
  elapsedBeforePause: 0,
  isAutoPaused: false,
  runGoal: { type: null, value: null, targetTime: null, cadenceBPM: null },

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
      deviationLog: [],
      splits: [],
      currentSplitDistance: 0,
      pauseIntervals: [],
      isPaused: false,
      heartRate: 0,
      watchConnected: false,
      chunkSequence: 0,
      lastChunkTimestamp: Date.now(),
      lastChunkDistance: 0,
      lastChunkPointIndex: 0,
      uploadedChunkSequences: [],
      startTime: Date.now(),
      elapsedBeforePause: 0,
      startPoint: null,
      distanceToStart: 0,
      isApproachingStart: false,
      isNearStart: false,
      loopDetected: false,
      loopDetectedAt: null,
      checkpointPasses: [],
      stopLocation: null,
      isAutoPaused: false,
      // runGoal is intentionally NOT reset here — it's set before startSession
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

    // Build filtered location for chunk upload (rich GPS data for server)
    // After chunk upload trims filteredLocations, fall back to lastChunkDistance
    // so distanceFromPrevious stays incremental (not cumulative from 0).
    const prevDistance = state.filteredLocations.length > 0
      ? state.filteredLocations[state.filteredLocations.length - 1].cumulativeDistance
      : state.lastChunkDistance;
    const newFilteredLocation: FilteredLocation = {
      latitude: event.latitude,
      longitude: event.longitude,
      altitude: event.altitude,
      speed: event.speed,
      bearing: event.bearing,
      timestamp: event.timestamp,
      distanceFromPrevious: event.distanceFromStart - prevDistance,
      cumulativeDistance: event.distanceFromStart,
      isInterpolated: false,
    };
    const newFilteredLocations = [...state.filteredLocations, newFilteredLocation];

    // --- Auto-pause: freeze timer when stationary ---
    const { autoPause } = useSettingsStore.getState();
    let { isAutoPaused } = state;
    let startTime = state.startTime;
    let elapsedBeforePause = state.elapsedBeforePause;

    // Grace period: don't auto-pause within the first 15 seconds of a run.
    // Prevents immediate pause when standing still at start (common during testing
    // and real use — user may not be moving right after countdown ends).
    // Use startTime-based elapsed to avoid dependency on async durationSeconds updates.
    const elapsed = startTime ? (Date.now() - startTime) / 1000 + elapsedBeforePause : elapsedBeforePause;
    const gracePeriodOver = elapsed >= 15;

    if (autoPause && gracePeriodOver) {
      if (!event.isMoving && !isAutoPaused) {
        // Transition: moving → stationary — freeze timer
        isAutoPaused = true;
        elapsedBeforePause = state.durationSeconds;
        startTime = null;
      } else if (event.isMoving && isAutoPaused) {
        // Transition: stationary → moving — unfreeze timer
        isAutoPaused = false;
        startTime = Date.now();
      }
    } else if (isAutoPaused) {
      // Auto-pause was disabled mid-run — unfreeze
      isAutoPaused = false;
      startTime = Date.now();
    }

    // Save start point from first GPS fix
    const startPoint = state.startPoint ?? currentPos;

    // Calculate pace from speed (m/s)
    const currentPace =
      event.speed > 0.3 ? 1000 / event.speed : state.currentPaceSecondsPerKm;

    // Calculate average pace — only count time while actually moving.
    // When stationary, elapsed keeps ticking but distance stays the same,
    // which would inflate avgPace (show slower pace than reality).
    // Use distance / speed integral instead: track "moving time" separately
    // is complex, so use the simple fix: if not moving, keep previous avgPace.
    const distance = event.distanceFromStart;
    const elapsedDuration = state.durationSeconds;
    let avgPace = state.avgPaceSecondsPerKm;
    if (event.speed > 0.3 && distance > 0) {
      // Only update avg pace when actually moving
      avgPace = (elapsedDuration / distance) * 1000;
    } else if (distance <= 0) {
      avgPace = 0;
    }

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
      filteredLocations: newFilteredLocations,
      calories: caloriesBurned,
      cadence: event.cadence ?? state.cadence,
      elevationGainMeters: event.elevationGain ?? state.elevationGainMeters,
      elevationLossMeters: event.elevationLoss ?? state.elevationLossMeters,
      startPoint,
      distanceToStart,
      isApproachingStart,
      isNearStart,
      loopDetected,
      loopDetectedAt,
      // Auto-pause timer state
      isAutoPaused,
      startTime,
      elapsedBeforePause,
      // Auto-set GPS locked when we receive a location update
      ...(state.gpsStatus !== 'locked' ? { gpsStatus: 'locked' as const } : {}),
    });
  },

  updateGPSStatus: (status, accuracy) => {
    set({ gpsStatus: status, ...(accuracy !== undefined ? { gpsAccuracy: accuracy ?? null } : {}) });
  },

  addDeviationPoint: (index, deviation) => {
    const OFF_THRESHOLD = 30;
    const log = get().deviationLog;
    const isOff = deviation > OFF_THRESHOLD;
    const lastEntry = log.length > 0 ? log[log.length - 1] : null;
    const wasOff = lastEntry ? lastEntry.deviation > OFF_THRESHOLD : false;

    // RLE: only store state transitions (on↔off) or every 10th point
    if (isOff !== wasOff || index % 10 === 0) {
      set((state) => ({
        deviationLog: [...state.deviationLog, { index, deviation }],
      }));
    }
  },

  updateDuration: (seconds) => {
    set({ durationSeconds: seconds });
  },

  pause: () => {
    const state = get();
    if (state.phase !== 'running' || state.isPaused) return;

    // Record pause timestamp and freeze timer atomically
    const now = new Date().toISOString();
    set({
      isPaused: true,
      phase: 'paused',
      elapsedBeforePause: state.durationSeconds,
      startTime: null,
      // Start a new pause interval (resumed_at will be filled on resume)
      pauseIntervals: [...state.pauseIntervals, { paused_at: now, resumed_at: '' }],
    });
  },

  resume: () => {
    const state = get();
    if (state.phase !== 'paused') return;

    // Finalize the last pause interval with the resume timestamp
    const now = new Date().toISOString();
    const pauseIntervals = [...state.pauseIntervals];
    if (pauseIntervals.length > 0) {
      const last = pauseIntervals[pauseIntervals.length - 1];
      pauseIntervals[pauseIntervals.length - 1] = { ...last, resumed_at: now };
    }

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

    // Finalize any open pause interval (user stopped while paused)
    const pauseIntervals = [...state.pauseIntervals];
    if (pauseIntervals.length > 0) {
      const last = pauseIntervals[pauseIntervals.length - 1];
      if (!last.resumed_at) {
        pauseIntervals[pauseIntervals.length - 1] = { ...last, resumed_at: new Date().toISOString() };
      }
    }

    set({ phase: 'completed', isPaused: false, stopLocation: stopLoc, pauseIntervals });
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
      lastChunkDistance: 0,
      lastChunkPointIndex: 0,
      uploadedChunkSequences: [],
      startPoint: null,
      distanceToStart: 0,
      isApproachingStart: false,
      isNearStart: false,
      loopDetected: false,
      loopDetectedAt: null,
      checkpointPasses: [],
      stopLocation: null,
      startTime: null,
      elapsedBeforePause: 0,
      isAutoPaused: false,
      runGoal: { type: null, value: null, targetTime: null, cadenceBPM: null },
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

  markChunkUploaded: (sequence, pointIndex, distance) => {
    set((state) => ({
      uploadedChunkSequences: [...state.uploadedChunkSequences, sequence],
      // Trim already-uploaded points to prevent unbounded memory growth
      // on long runs. Reset index to 0 since the array is sliced.
      filteredLocations: state.filteredLocations.slice(pointIndex),
      lastChunkPointIndex: 0,
      lastChunkDistance: distance,
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

  setCheckpointPasses: (passes) => {
    set({ checkpointPasses: passes });
  },

  setAutoPaused: (paused) => {
    const state = get();
    if (paused && !state.isAutoPaused) {
      set({
        isAutoPaused: true,
        elapsedBeforePause: state.durationSeconds,
        startTime: null,
      });
    } else if (!paused && state.isAutoPaused) {
      set({
        isAutoPaused: false,
        startTime: Date.now(),
      });
    }
  },

  setRunGoal: (goal) => set({ runGoal: goal }),
}));
