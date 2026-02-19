// ============================================================
// GPS Module Type Definitions
// Matches the shared-interfaces.md for Native Module integration
// ============================================================

// ---- GPS Tracker Module (JS -> Native) ----

export interface GPSTrackerModule {
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
  pauseTracking(): Promise<void>;
  resumeTracking(): Promise<void>;
  getRawGPSPoints(): Promise<RawGPSPoint[]>;
  getFilteredRoute(): Promise<FilteredLocation[]>;
  getCurrentStatus(): Promise<GPSStatus>;
}

// ---- Native -> JS Events ----

export interface LocationUpdateEvent {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  bearing: number;
  accuracy: number;
  timestamp: number;
  distanceFromStart: number;
  isMoving: boolean;
  cadence?: number; // steps per minute
}

export interface GPSStatusChangeEvent {
  status: GPSStatus;
  accuracy: number | null;
  satelliteCount: number;
}

export interface RunningStateChangeEvent {
  state: 'moving' | 'stationary';
  duration: number;
}

// ---- Data Models ----

export interface RawGPSPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  bearing: number;
  horizontalAccuracy: number;
  verticalAccuracy: number;
  speedAccuracy: number;
  timestamp: number;
  provider: 'gps' | 'fused' | 'network';
}

export interface FilteredLocation {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  bearing: number;
  timestamp: number;
  distanceFromPrevious: number;
  cumulativeDistance: number;
  isInterpolated: boolean;
}

export type GPSStatus = 'searching' | 'locked' | 'lost' | 'disabled';

// ---- Error Codes ----

export enum GPSErrorCode {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  GPS_DISABLED = 'GPS_DISABLED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  COLD_START_TIMEOUT = 'COLD_START_TIMEOUT',
  BACKGROUND_RESTRICTED = 'BACKGROUND_RESTRICTED',
}

// ---- Event Names ----

export const GPS_EVENTS = {
  LOCATION_UPDATE: 'GPSTracker_onLocationUpdate',
  GPS_STATUS_CHANGE: 'GPSTracker_onGPSStatusChange',
  RUNNING_STATE_CHANGE: 'GPSTracker_onRunningStateChange',
} as const;
