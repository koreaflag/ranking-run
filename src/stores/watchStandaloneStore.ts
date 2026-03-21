import { create } from 'zustand';

interface WatchStandaloneState {
  /** Whether the watch is currently in a standalone run */
  isActive: boolean;
  phase: string;
  distanceMeters: number;
  durationSeconds: number;
  currentPace: number;
  avgPace: number;
  heartRate: number;
  /** Unix ms timestamp of last update — used for staleness detection */
  lastUpdateAt: number;
}

interface WatchStandaloneActions {
  updateStatus: (data: {
    phase: string;
    distanceMeters?: number;
    durationSeconds?: number;
    currentPace?: number;
    avgPace?: number;
    heartRate?: number;
    timestamp: number;
  }) => void;
  clear: () => void;
}

const initialState: WatchStandaloneState = {
  isActive: false,
  phase: 'idle',
  distanceMeters: 0,
  durationSeconds: 0,
  currentPace: 0,
  avgPace: 0,
  heartRate: 0,
  lastUpdateAt: 0,
};

export const useWatchStandaloneStore = create<WatchStandaloneState & WatchStandaloneActions>(
  (set) => ({
    ...initialState,

    updateStatus: (data) => {
      const isRunning = data.phase === 'running' || data.phase === 'paused';
      set({
        isActive: isRunning,
        phase: data.phase,
        distanceMeters: data.distanceMeters ?? 0,
        durationSeconds: data.durationSeconds ?? 0,
        currentPace: data.currentPace ?? 0,
        avgPace: data.avgPace ?? 0,
        heartRate: data.heartRate ?? 0,
        lastUpdateAt: data.timestamp,
      });
    },

    clear: () => set(initialState),
  }),
);
