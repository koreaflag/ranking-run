// ============================================================
// Apple Watch Companion Type Definitions
// Matches the WatchBridgeModule native module interface
// ============================================================

// ---- Watch Status ----

export interface WatchStatus {
  isPaired: boolean;
  isReachable: boolean;
  isAppInstalled: boolean;
}

// ---- Native -> JS Events ----

export interface WatchCommandEvent {
  type: 'command';
  command: 'pause' | 'resume' | 'stop';
  timestamp: number;
}

export interface WatchHeartRateEvent {
  type: 'heartRate';
  bpm: number;
  timestamp: number;
}

export interface WatchReachabilityEvent {
  isReachable: boolean;
}

// ---- JS -> Native Run State ----

export interface WatchRunState {
  phase: string;
  distanceMeters: number;
  durationSeconds: number;
  currentPace: number;
  avgPace: number;
  gpsStatus: string;
  calories: number;
}

// ---- Event Names ----

export const WATCH_EVENTS = {
  COMMAND: 'Watch_onCommand',
  HEART_RATE: 'Watch_onHeartRate',
  REACHABILITY_CHANGE: 'Watch_onReachabilityChange',
} as const;
