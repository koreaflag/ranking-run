import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
  NativeModules,
  Animated,
  LayoutAnimation,
  Image,
  InteractionManager,
  Dimensions,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCourseListStore } from '../../stores/courseListStore';
import { useRunningStore } from '../../stores/runningStore';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../stores/settingsStore';
import { courseService } from '../../services/courseService';
import { rankingService } from '../../services/rankingService';
import { runService } from '../../services/runService';
import RouteMapView from '../../components/map/RouteMapView';
import type { RouteMapViewHandle, CourseMarkerData, Region } from '../../components/map/RouteMapView';
import type { WorldStackParamList } from '../../types/navigation';
import type { GeoJSONLineString, CourseCheckpoint, RankingEntry } from '../../types/api';
import type { CheckpointMarkerData } from '../../components/map/RouteMapView';
import { RunStartOverlay, RunGoalSheet, RunSettingsSheet, WelcomeOverlay } from '../../components/running';
import type { RunGoal } from '../../components/running/RunGoalSheet';

// Running hooks
import { useGPSTracker } from '../../hooks/useGPSTracker';
import { useRunTimer } from '../../hooks/useRunTimer';
import { useWatchCompanion } from '../../hooks/useWatchCompanion';
import { useCourseNavigation } from '../../hooks/useCourseNavigation';
import { useCheckpointTracker } from '../../hooks/useCheckpointTracker';
import { usePaceCoaching } from '../../hooks/usePaceCoaching';
import { useVoiceGuidance } from '../../hooks/useVoiceGuidance';
import { useLiveActivity } from '../../hooks/useLiveActivity';
import { useIntervalTraining } from '../../hooks/useIntervalTraining';

import * as Location from 'expo-location';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { formatDistance, metersToKm, formatDuration, formatPace } from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import { useCompassHeading } from '../../hooks/useCompassHeading';
import { haversineDistance, bearing as geoBearing } from '../../utils/geo';
import { savePendingRunRecord, removePendingRunRecord } from '../../services/pendingSyncService';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { MAPBOX_ACCESS_TOKEN } from '../../config/env';

type WorldNav = NativeStackNavigationProp<WorldStackParamList, 'World'>;

// ============================================================
// Weather types & helpers
// ============================================================

interface WeatherData {
  temp: number;
  feels_like: number;
  humidity: number;
  wind_speed: number;
  description: string;
  icon: string;
  aqi?: number;
  aqi_label?: string;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function getWeatherIconName(iconCode: string): IoniconsName {
  const base = iconCode.slice(0, 2);
  const isNight = iconCode.endsWith('n');

  switch (base) {
    case '01':
      return isNight ? 'moon' : 'sunny';
    case '02':
      return isNight ? 'cloudy-night' : 'partly-sunny';
    case '03':
    case '04':
      return 'cloudy';
    case '09':
    case '10':
      return 'rainy';
    case '11':
      return 'thunderstorm';
    case '13':
      return 'snow';
    case '50':
      return 'water';
    default:
      return 'cloud';
  }
}

function getAqiColor(aqi?: number): string {
    switch (aqi) {
        case 1: return COLORS.success;
        case 2: return COLORS.success;
        case 3: return COLORS.warning;
        case 4: return COLORS.accent;
        case 5: return COLORS.error;
        default: return COLORS.textTertiary;
    }
}

// ============================================================
// Constants
// ============================================================

const SEOUL_REGION: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

// ============================================================
// Geo helpers
// ============================================================

type LatLng = { latitude: number; longitude: number };

/** Convert GeoJSON [lng, lat, alt] to { latitude, longitude }[] */
function geoJsonToLatLng(geo: GeoJSONLineString): LatLng[] {
  return geo.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

/** Calculate bearing (heading) from point A to point B in degrees */
function calcBearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ============================================================
// Interval summary helper
// ============================================================

function formatIntervalSummaryTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0 && s > 0) return `${m}분${s}초`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

// ============================================================
// Goal helpers
// ============================================================

function formatGoalLabel(goal: RunGoal, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!goal.type || goal.value === null) return t('world.goalSetting');
  switch (goal.type) {
    case 'distance':
      return t('world.distanceGoalLabel', { value: (goal.value / 1000).toFixed(1) });
    case 'time': {
      const mins = Math.floor(goal.value / 60);
      if (mins >= 60) {
        const hours = Math.floor(mins / 60);
        const remainder = mins % 60;
        return remainder > 0
          ? t('world.timeGoalLabelHM', { hours, minutes: remainder })
          : t('world.timeGoalLabelH', { hours });
      }
      return t('world.timeGoalLabelM', { minutes: mins });
    }
    case 'pace':
      return t('world.paceGoalLabel', { pace: `${Math.floor(goal.value / 60)}'${String(Math.floor(goal.value % 60)).padStart(2, '0')}"` });
    case 'program': {
      const km = (goal.value / 1000).toFixed(1);
      const targetMins = goal.targetTime ? Math.floor(goal.targetTime / 60) : 0;
      return `${km}km · ${targetMins}분`;
    }
    case 'interval': {
      const runMins = Math.floor((goal.intervalRunSeconds ?? 0) / 60);
      const runSecs = (goal.intervalRunSeconds ?? 0) % 60;
      const walkMins = Math.floor((goal.intervalWalkSeconds ?? 0) / 60);
      const walkSecs = (goal.intervalWalkSeconds ?? 0) % 60;
      const sets = goal.intervalSets ?? 0;
      const runStr = runMins > 0 ? `${runMins}m${runSecs > 0 ? String(runSecs).padStart(2, '0') + 's' : ''}` : `${runSecs}s`;
      const walkStr = walkMins > 0 ? `${walkMins}m${walkSecs > 0 ? String(walkSecs).padStart(2, '0') + 's' : ''}` : `${walkSecs}s`;
      return `${runStr}/${walkStr} ×${sets}`;
    }
    default:
      return t('world.goalSetting');
  }
}

function getGoalProgress(
  goal: { type: 'distance' | 'time' | 'pace' | 'program' | 'interval' | null; value: number | null; targetTime?: number | null; intervalRunSeconds?: number; intervalWalkSeconds?: number; intervalSets?: number },
  distanceMeters: number,
  durationSeconds: number,
  avgPace: number,
): { percent: number; label: string; reached: boolean } | null {
  if (!goal.type || goal.value === null || goal.value <= 0) return null;

  switch (goal.type) {
    case 'distance': {
      const pct = Math.min(100, (distanceMeters / goal.value) * 100);
      const targetKm = (goal.value / 1000).toFixed(1);
      return { percent: pct, label: `${metersToKm(distanceMeters)} / ${targetKm} km`, reached: pct >= 100 };
    }
    case 'time': {
      const pct = Math.min(100, (durationSeconds / goal.value) * 100);
      return { percent: pct, label: `${formatDuration(durationSeconds)} / ${formatDuration(goal.value)}`, reached: pct >= 100 };
    }
    case 'pace': {
      if (avgPace <= 0 || distanceMeters < 100) return { percent: 0, label: `-- / ${formatPace(goal.value)}`, reached: false };
      const pct = Math.min(100, (goal.value / avgPace) * 100);
      return { percent: pct, label: `${formatPace(avgPace)} / ${formatPace(goal.value)}`, reached: avgPace <= goal.value };
    }
    case 'program': {
      const targetTime = goal.targetTime ?? 0;
      const pct = Math.min(100, (distanceMeters / goal.value) * 100);
      const targetKm = (goal.value / 1000).toFixed(1);
      let deltaLabel = '';
      if (distanceMeters > 0 && targetTime > 0) {
        const projectedFinish = (goal.value / distanceMeters) * durationSeconds;
        const timeDelta = targetTime - projectedFinish;
        const absDelta = Math.abs(Math.round(timeDelta));
        deltaLabel = timeDelta >= 0 ? ` (+${absDelta}s)` : ` (-${absDelta}s)`;
      }
      return {
        percent: pct,
        label: `${metersToKm(distanceMeters)} / ${targetKm} km${deltaLabel}`,
        reached: distanceMeters >= goal.value,
      };
    }
    case 'interval': {
      const totalSecs = goal.value ?? 0;
      if (totalSecs <= 0) return null;
      const pct = Math.min(100, (durationSeconds / totalSecs) * 100);
      const sets = goal.intervalSets ?? 0;
      const cycleDur = (goal.intervalRunSeconds ?? 0) + (goal.intervalWalkSeconds ?? 0);
      const currentSet = cycleDur > 0 ? Math.min(Math.floor(durationSeconds / cycleDur) + 1, sets) : 0;
      return { percent: pct, label: `${currentSet}/${sets} 세트`, reached: pct >= 100 };
    }
    default:
      return null;
  }
}

// ============================================================
// WorldScreen
// ============================================================

export default function WorldScreen() {
  const navigation = useNavigation<WorldNav>();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { mapMarkers, fetchMapMarkers, pendingFocusCourseId, pendingStartCourseId } = useCourseListStore();
  const map3DStyle = useSettingsStore((s) => s.map3DStyle);
  const countdownSeconds = useSettingsStore((s) => s.countdownSeconds);
  const hapticFeedback = useSettingsStore((s) => s.hapticFeedback);
  const voiceGuidance = useSettingsStore((s) => s.voiceGuidance);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<RouteMapViewHandle>(null);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const myLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  useEffect(() => { myLocationRef.current = myLocation; }, [myLocation]);
  const [followUser, setFollowUser] = useState(true);
  const hasInitializedRef = useRef(false);

  // Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);
  // Heading — use shared compass hook for smooth rotation
  const { heading: headingAnim } = useCompassHeading();

  // Selected marker state
  const [selectedMarker, setSelectedMarker] = useState<CourseMarkerData | null>(null);
  const [hudRankings, setHudRankings] = useState<RankingEntry[]>([]);
  const [hudRankingVisible, setHudRankingVisible] = useState(true);
  const [distanceToMarkerM, setDistanceToMarkerM] = useState<number | null>(null);
  const rankingAnim = useRef(new Animated.Value(1)).current;

  // Welcome overlay & tour mode
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [touring, setTouring] = useState(false);
  const userNickname = useAuthStore((s) => s.user?.nickname);

  // Run start controls
  const [runGoal, setRunGoal] = useState<RunGoal>({ type: null, value: null });
  const [goalSheetVisible, setGoalSheetVisible] = useState(false);
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);

  // 3D preview state
  const [previewRoute, setPreviewRoute] = useState<LatLng[]>([]);
  const [previewCheckpoints, setPreviewCheckpoints] = useState<CheckpointMarkerData[]>([]);
  const [is3DMode, setIs3DMode] = useState(false);
  const animTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const markerPressedRef = useRef(false);

  // ============================================================
  // RUNNING STATE & HOOKS
  // ============================================================

  const {
    phase,
    distanceMeters,
    durationSeconds,
    avgPaceSecondsPerKm,
    gpsStatus,
    runRoutePoints,
    calories,
    heartRate,
    cadence,
    elevationGainMeters,
    watchConnected,
    currentLocation,
    isAutoPaused,
    isApproachingStart,
    isNearStart,
    loopDetected,
    distanceToStart,
    runCourseId,
    storeRunGoal,
    splits,
  } = useRunningStore(useShallow((s) => ({
    phase: s.phase,
    distanceMeters: s.distanceMeters,
    durationSeconds: s.durationSeconds,
    avgPaceSecondsPerKm: s.avgPaceSecondsPerKm,
    gpsStatus: s.gpsStatus,
    runRoutePoints: s.routePoints,
    calories: s.calories,
    heartRate: s.heartRate,
    cadence: s.cadence,
    elevationGainMeters: s.elevationGainMeters,
    watchConnected: s.watchConnected,
    currentLocation: s.currentLocation,
    isAutoPaused: s.isAutoPaused,
    isApproachingStart: s.isApproachingStart,
    isNearStart: s.isNearStart,
    loopDetected: s.loopDetected,
    distanceToStart: s.distanceToStart,
    runCourseId: s.courseId,
    storeRunGoal: s.runGoal,
    splits: s.splits,
  })));

  // Actions don't change — subscribe outside useShallow to avoid object recreation
  const startSession = useRunningStore((s) => s.startSession);
  const updateSessionId = useRunningStore((s) => s.updateSessionId);
  const storePause = useRunningStore((s) => s.pause);
  const storeResume = useRunningStore((s) => s.resume);
  const complete = useRunningStore((s) => s.complete);
  const reset = useRunningStore((s) => s.reset);
  const setPhase = useRunningStore((s) => s.setPhase);
  const setStoreRunGoal = useRunningStore((s) => s.setRunGoal);
  const addDeviationPoint = useRunningStore((s) => s.addDeviationPoint);

  const isInRun = phase !== 'idle';  // includes completed to keep route visible

  // GPS & timer hooks (always mounted, only active when phase is running/paused)
  const { startTracking, stopTracking, pauseTracking, resumeTracking } = useGPSTracker();
  useRunTimer();
  useLiveActivity();

  // Pace coaching (program goal only)
  const paceCoachingEnabled = storeRunGoal?.type === 'program';
  const paceCoachingTargetDist = paceCoachingEnabled ? (storeRunGoal.value ?? 0) : 0;
  const paceCoachingTargetTime = paceCoachingEnabled ? (storeRunGoal.targetTime ?? 0) : 0;
  const paceCoaching = usePaceCoaching({
    enabled: paceCoachingEnabled,
    targetDistance: paceCoachingTargetDist,
    targetTime: paceCoachingTargetTime,
    currentDistance: distanceMeters,
    elapsedTime: durationSeconds,
    avgPace: avgPaceSecondsPerKm,
    phase,
    splits,
  });

  // DEBUG: remove after confirming pace coaching works
  useEffect(() => {
    if (phase === 'running' && paceCoachingEnabled) {
      if (__DEV__) console.log('[PaceCoaching] enabled:', paceCoachingEnabled,
        'targetDist:', paceCoachingTargetDist, 'targetTime:', paceCoachingTargetTime,
        'dist:', distanceMeters, 'result:', paceCoaching ? paceCoaching.status : 'null');
    }
  }, [phase, distanceMeters, paceCoaching, paceCoachingEnabled, paceCoachingTargetDist, paceCoachingTargetTime]);

  // Metronome auto-start/stop
  const [metronomeMuted, setMetronomeMuted] = useState(false);
  const MetronomeModule = NativeModules.MetronomeModule;
  useEffect(() => {
    if (!MetronomeModule) return;
    const bpm = storeRunGoal?.type === 'program' ? (storeRunGoal.cadenceBPM ?? 0) : 0;

    if (phase === 'running' && bpm > 0 && !metronomeMuted) {
      MetronomeModule.start(bpm);
    } else {
      MetronomeModule.stop();
    }
    return () => { MetronomeModule.stop(); };
  }, [phase, storeRunGoal?.type, storeRunGoal?.cadenceBPM, metronomeMuted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Interval training
  const intervalState = useIntervalTraining({
    enabled: storeRunGoal?.type === 'interval',
    runSeconds: storeRunGoal?.intervalRunSeconds ?? 0,
    walkSeconds: storeRunGoal?.intervalWalkSeconds ?? 0,
    sets: storeRunGoal?.intervalSets ?? 0,
    elapsedSeconds: durationSeconds,
    phase,
  });

  // Countdown state
  const [countdown, setCountdown] = useState<number | null>(null);
  const lastCountdownRef = useRef(countdownSeconds);
  const [showCountdownOverlay, setShowCountdownOverlay] = useState(false);

  // Goal reached banner
  const [goalReachedShown, setGoalReachedShown] = useState(false);

  // Course running state
  const [courseRoute, setCourseRoute] = useState<Array<{ latitude: number; longitude: number }> | null>(null);
  const [courseCheckpoints, setCourseCheckpoints] = useState<CourseCheckpoint[] | null>(null);
  const [courseElevationProfile, setCourseElevationProfile] = useState<number[] | null>(null);

  // Course navigation & checkpoint tracking hooks
  const courseNavigation = useCourseNavigation(
    courseRoute,
    currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : null,
    currentLocation?.bearing ?? 0,
  );
  const {
    checkpointPasses,
    passedCount: cpPassedCount,
    totalCount: cpTotalCount,
    markerData: cpMarkerData,
    justPassed: cpJustPassed,
    competitionStartTime,
    finishReached,
    updateLocation: updateCheckpointLocation,
    resetTracker,
  } = useCheckpointTracker(courseCheckpoints);

  // Panel height for map bottom inset
  const [panelHeight, setPanelHeight] = useState(0);

  // Screen lock
  const [screenLocked, setScreenLocked] = useState(false);
  const lockProgressAnim = useRef(new Animated.Value(0)).current;
  const trackingStartedRef = useRef(false);

  // Refs to avoid stale closures in finishRun callback
  const finishReachedRef = useRef(finishReached);
  finishReachedRef.current = finishReached;
  const runCourseIdRef = useRef(runCourseId);
  runCourseIdRef.current = runCourseId;

  // Track course deviation stats for fair ranking
  const maxDeviationRef = useRef(0);
  const deviationSamplesRef = useRef(0);
  const offCourseSamplesRef = useRef(0);
  const offCourseStartRef = useRef<number | null>(null);
  // 0=on-course, 1=just off (grace), 2=grace expired (penalty counting)
  const [offCourseLevel, setOffCourseLevel] = useState(0);

  const OFF_COURSE_GRACE_SECONDS = 15;

  useEffect(() => {
    if (!courseNavigation || phase !== 'running') return;
    deviationSamplesRef.current += 1;
    if (courseNavigation.deviationMeters > maxDeviationRef.current) {
      maxDeviationRef.current = courseNavigation.deviationMeters;
    }

    // Log deviation for result screen visualization
    if (runCourseId) {
      addDeviationPoint(runRoutePoints.length - 1, courseNavigation.deviationMeters);
    }

    if (courseNavigation.isOffCourse) {
      const now = Date.now();
      if (offCourseStartRef.current === null) {
        offCourseStartRef.current = now;
        setOffCourseLevel(1);
      }
      const elapsed = (now - offCourseStartRef.current) / 1000;
      if (elapsed >= OFF_COURSE_GRACE_SECONDS) {
        // Grace expired — count as penalty sample
        offCourseSamplesRef.current += 1;
        setOffCourseLevel(2);
      }
    } else {
      // Back on course — reset grace timer
      offCourseStartRef.current = null;
      if (offCourseLevel !== 0) setOffCourseLevel(0);
    }
  }, [courseNavigation, phase, offCourseLevel]);

  // Reset deviation tracking on new run
  useEffect(() => {
    if (phase === 'idle') {
      maxDeviationRef.current = 0;
      deviationSamplesRef.current = 0;
      offCourseSamplesRef.current = 0;
      offCourseStartRef.current = null;
      setOffCourseLevel(0);
    }
  }, [phase]);

  // Haptic escalation: strong vibration when off-course grace expires
  const prevOffCourseLevelRef = useRef(0);
  useEffect(() => {
    if (offCourseLevel === 2 && prevOffCourseLevelRef.current < 2 && hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (offCourseLevel === 1 && prevOffCourseLevelRef.current === 0 && hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    prevOffCourseLevelRef.current = offCourseLevel;
  }, [offCourseLevel, hapticFeedback]);

  // Voice guidance for course navigation + pace coaching
  const paceCoachingTTSMessage: string | null = paceCoaching
    ? (() => {
        const absDelta = Math.abs(Math.round(paceCoaching.timeDelta));
        switch (paceCoaching.status) {
          case 'ahead': return String(t('voice.paceAhead', { seconds: absDelta }));
          case 'on_pace': return String(t('voice.paceOnTrack'));
          case 'behind': return String(t('voice.paceBehind', { seconds: absDelta }));
          case 'critical': return String(t('voice.paceCritical'));
        }
      })()
    : null;

  useVoiceGuidance({
    navigation: courseNavigation,
    distanceMeters,
    phase,
    enabled: voiceGuidance && (!!runCourseId || storeRunGoal?.type === 'program'),
    paceCoachingMessage: paceCoachingTTSMessage,
    offCourseLevel,
    elevationProfile: courseElevationProfile,
  });

  const lockHapticTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockListenerId = useRef<string | null>(null);
  const lockUnlockedRef = useRef(false);

  const cleanupLockTimers = useCallback(() => {
    if (lockHapticTimer.current) {
      clearInterval(lockHapticTimer.current);
      lockHapticTimer.current = null;
    }
    if (lockListenerId.current) {
      lockProgressAnim.removeListener(lockListenerId.current);
      lockListenerId.current = null;
    }
  }, [lockProgressAnim]);

  const handleLockPressIn = useCallback(() => {
    lockUnlockedRef.current = false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    lockProgressAnim.setValue(0);
    // Tick haptic every 400ms while holding (4 ticks across 2s)
    lockHapticTimer.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 400);
    // Listen for progress reaching ~95% — unlock slightly before visual fill
    // to eliminate perceived delay between gauge full and actual unlock
    lockListenerId.current = lockProgressAnim.addListener(({ value }) => {
      if (value >= 0.95 && !lockUnlockedRef.current) {
        lockUnlockedRef.current = true;
        cleanupLockTimers();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScreenLocked(false);
        lockProgressAnim.setValue(0);
      }
    });
    Animated.timing(lockProgressAnim, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false,
    }).start();
  }, [lockProgressAnim, cleanupLockTimers]);

  const handleLockPressOut = useCallback(() => {
    if (lockUnlockedRef.current) return; // already unlocked
    cleanupLockTimers();
    lockProgressAnim.stopAnimation();
    lockProgressAnim.setValue(0);
  }, [lockProgressAnim, cleanupLockTimers]);

  // Navigate-to-start state (shown when user is far from course start checkpoint)
  const [navigatingToStart, setNavigatingToStart] = useState(false);
  const [startCheckpoint, setStartCheckpoint] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceToStartCP, setDistanceToStartCP] = useState(0);
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [readyToStart, setReadyToStart] = useState(false);
  const [navRoute, setNavRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);

  // Result upload state (for completed phase)
  const [resultUploading, setResultUploading] = useState(false);
  const [resultRunRecordId, setResultRunRecordId] = useState<string | null>(null);
  const [resultSavedLocally, setResultSavedLocally] = useState(false);
  const [courseRegistrationStarted, setCourseRegistrationStarted] = useState(false);

  // Transition animations
  const worldOverlayOpacity = useRef(new Animated.Value(1)).current;
  const runPanelTranslateY = useRef(new Animated.Value(500)).current;
  const countdownOpacity = useRef(new Animated.Value(0)).current;
  const countdownTranslateY = useRef(new Animated.Value(0)).current;

  // Animate world overlays out / running panel in based on phase
  useEffect(() => {
    if (phase === 'idle') {
      Animated.parallel([
        Animated.timing(worldOverlayOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(runPanelTranslateY, { toValue: 500, duration: 350, useNativeDriver: true }),
        Animated.timing(countdownOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      countdownTranslateY.setValue(0);
      setShowCountdownOverlay(false);
      // Reset running panel padding so GPS centers properly
      setPanelHeight(0);
      // Re-center map on user location when returning to idle (e.g. after RunResult dismiss)
      const loc = myLocationRef.current ?? useSettingsStore.getState().lastKnownLocation;
      if (loc) {
        setTimeout(() => {
          mapRef.current?.recenterOnUser(loc);
          setFollowUser(true);
        }, 500);
      }
    } else if (phase === 'completed') {
      // Keep panel visible — content morphs to result summary
      Animated.parallel([
        Animated.timing(countdownOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(runPanelTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (phase === 'countdown') {
      countdownTranslateY.setValue(0);
      setShowCountdownOverlay(true);
      Animated.parallel([
        Animated.timing(worldOverlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(countdownOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else if (phase === 'running' || phase === 'paused') {
      // Fade out countdown, then smoothly slide in run panel
      Animated.parallel([
        Animated.timing(countdownTranslateY, {
          toValue: -300,
          duration: 350,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(countdownOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
      // Slide up run panel after countdown fades
      setTimeout(() => {
        Animated.spring(runPanelTranslateY, {
          toValue: 0,
          damping: 20,
          stiffness: 180,
          useNativeDriver: true,
        }).start();
      }, 200);
      setTimeout(() => setShowCountdownOverlay(false), 350);
    }
  }, [phase, worldOverlayOpacity, runPanelTranslateY, countdownOpacity, countdownTranslateY]);

  // Close result and return to world mode
  const handleCloseResult = useCallback(() => {
    setWelcomeVisible(true); // Show welcome overlay again
    setRunGoal({ type: null, value: null }); // Reset goal settings
    setResultUploading(false);
    setResultRunRecordId(null);
    setResultSavedLocally(false);
    setGoalReachedShown(false);
    setCourseRegistrationStarted(false);
    setCourseRoute(null);
    setCourseCheckpoints(null);
    resetTracker();
    setPanelHeight(0);
    // Notify watch to dismiss result screen
    if (Platform.OS === 'ios' && NativeModules.WatchBridgeModule) {
      NativeModules.WatchBridgeModule.sendResultDismissed().catch((err: any) => {
        console.warn('[WorldScreen] 워치 결과 닫기 전송 실패:', err);
      });
    }
    // Clear navigate-to-start state
    setNavigatingToStart(false);
    setStartCheckpoint(null);
    setPendingCourseId(null);
    setReadyToStart(false);
    setNavRoute([]);
    trackingStartedRef.current = false;
    // Clear 3D preview state so course focus is fully released
    if (animTimerRef.current) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
    }
    setPreviewRoute([]);
    setPreviewCheckpoints([]);
    setIs3DMode(false);
    setSelectedMarker(null);
    // Smoothly transition camera BEFORE resetting state to avoid flicker.
    // recenterOnUser zeros padding and re-enables internalFollow.
    const loc = myLocationRef.current ?? myLocation ?? useSettingsStore.getState().lastKnownLocation;
    if (loc) {
      mapRef.current?.recenterOnUser(loc);
    }
    // Delay reset so the camera animation (500ms) finishes before props change
    setTimeout(() => {
      setFollowUser(false);
      reset();
      // Re-enable follow after reset completes
      requestAnimationFrame(() => setFollowUser(true));
    }, 500);
  }, [reset, myLocation]);


  // Request location permission on mount, then immediately center map on current location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (loc?.coords) {
          const { latitude, longitude } = loc.coords;
          setMyLocation({ latitude, longitude });
          useSettingsStore.getState().setLastKnownLocation({ latitude, longitude });
          mapRef.current?.recenterOnUser({ latitude, longitude });
        }
      } catch (err) {
        console.warn('[WorldScreen] 초기 위치 가져오기 실패:', err);
      }
    })();
  }, []);

  // Feed GPS to checkpoint tracker during course running
  useEffect(() => {
    if (phase === 'running' && runCourseId && currentLocation) {
      updateCheckpointLocation(currentLocation.latitude, currentLocation.longitude);
    }
  }, [phase, runCourseId, currentLocation, updateCheckpointLocation]);

  // Competition start toast when start checkpoint (order=0) is passed
  const [competitionStartShown, setCompetitionStartShown] = useState(false);
  useEffect(() => {
    if (competitionStartTime && !competitionStartShown && phase === 'running') {
      setCompetitionStartShown(true);
      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => setCompetitionStartShown(false), 3000);
    }
    if (phase === 'idle') {
      setCompetitionStartShown(false);
    }
  }, [competitionStartTime, competitionStartShown, phase, hapticFeedback]);

  // Track user location from store for custom map marker during running
  useEffect(() => {
    if (currentLocation && isInRun) {
      setMyLocation({ latitude: currentLocation.latitude, longitude: currentLocation.longitude });
    }
  }, [currentLocation, isInRun]);

  // Re-enable follow when auto-pause ends (moving again)
  // This ensures the map resumes tracking after auto-pause, even if follow
  // was somehow disengaged during the pause period.
  const prevAutoPausedRef = useRef(isAutoPaused);
  useEffect(() => {
    if (prevAutoPausedRef.current && !isAutoPaused && phase === 'running') {
      setFollowUser(true);
    }
    prevAutoPausedRef.current = isAutoPaused;
  }, [isAutoPaused, phase]);

  // Use GPS course heading when moving during running
  const isMoving = isInRun && (currentLocation?.speed ?? 0) > 0.5;
  const { heading: runHeadingValue } = useCompassHeading(100, isMoving ? (currentLocation?.bearing ?? null) : null);

  // ============================================================
  // RUNNING HANDLERS
  // ============================================================

  // Begin countdown + start running (extracted so it can be called after navigating to start)
  const beginCountdownAndRun = useCallback(async (courseId?: string | null) => {
    // Clear any 3D preview first — don't block on permission check
    if (selectedMarker) {
      setSelectedMarker(null);
      setIs3DMode(false);
      setPreviewRoute([]);
      setPreviewCheckpoints([]);
    }

    // Center map on current location and begin smooth zoom-in during countdown.
    // BOTH platforms use smoothZoomIn (keeps internalFollow alive).
    // animateCamera calls runCameraAction which sets internalFollow=false permanently
    // because the followsUserLocation prop doesn't re-trigger the sync useEffect.
    const persistedLoc = myLocationRef.current ?? useSettingsStore.getState().lastKnownLocation;
    if (persistedLoc) {
      const targetZoom = courseId ? 17 : 16;
      const targetPitch = courseId ? 45 : 30;
      mapRef.current?.smoothZoomIn({
        center: { latitude: persistedLoc.latitude, longitude: persistedLoc.longitude },
        zoom: targetZoom,
        pitch: targetPitch,
        heading: 0,
      }, 1500);
    }

    setPhase('countdown');
    setCountdown(countdownSeconds);

    // Ensure location permission during countdown (runs in parallel, not blocking)
    const permissionCheck = (async () => {
      try {
        const permResult = await Location.getForegroundPermissionsAsync();
        if (permResult.status !== 'granted') {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(t('common.error'), '위치 권한이 필요합니다. 설정에서 위치 권한을 허용해주세요.');
          }
        }
      } catch (err) {
        console.warn('[WorldScreen] 위치 권한 확인 실패:', err);
      }
    })();

    // Notify native for Watch countdown sync
    const countdownStartedAt = Date.now();
    try {
      if (Platform.OS === 'ios' && NativeModules.GPSTrackerModule?.notifyCountdownStart) {
        NativeModules.GPSTrackerModule.notifyCountdownStart(countdownSeconds, countdownStartedAt).catch((err: any) => {
          console.warn('[WorldScreen] 카운트다운 알림 실패:', err);
        });
      }
    } catch (err) {
      console.warn('[WorldScreen] 카운트다운 네이티브 호출 실패:', err);
    }

    for (let i = countdownSeconds; i > 0; i--) {
      lastCountdownRef.current = i;
      setCountdown(i);
      if (hapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Wait for permission check to complete before proceeding
    await permissionCheck;

    setCountdown(null);

    // Capture current position before session reset (for seeding first route point)
    const initialLocation = myLocationRef.current;

    // Start GPS tracking with local session ID
    const localSessionId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    startSession(localSessionId, courseId ?? null);

    // Seed the first route point from last known position so there's no gap
    // (especially important when user is already moving at start)
    if (initialLocation && useRunningStore.getState().routePoints.length === 0) {
      useRunningStore.setState({
        routePoints: [initialLocation],
        startPoint: initialLocation,
      });
    }

    // Switch map to follow user immediately (before GPS init to avoid freeze)
    setFollowUser(true);

    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Start GPS tracking in background — don't await to prevent UI freeze
    if (!trackingStartedRef.current) {
      startTracking().catch((err) => {
        console.warn('[WorldScreen] GPS 트래킹 시작 실패:', err);
      });
    } else {
      // Tracking already started (e.g. navigate-to-start flow) — startTracking() skipped,
      // but Watch needs the "running" phase notification that startTracking() normally sends.
      try {
        if (Platform.OS === 'ios' && NativeModules.GPSTrackerModule?.notifyRunningPhase) {
          NativeModules.GPSTrackerModule.notifyRunningPhase().catch((err: any) => {
            console.warn('[WorldScreen] 런닝 페이즈 알림 실패:', err);
          });
        }
      } catch (err) {
        console.warn('[WorldScreen] 런닝 페이즈 네이티브 호출 실패:', err);
      }
    }
    trackingStartedRef.current = true;

    // Register session on server in background
    runService.createSession({
      course_id: courseId ?? null,
      started_at: new Date().toISOString(),
      device_info: {
        platform: Platform.OS as 'android' | 'ios',
        os_version: Platform.Version.toString(),
        device_model: 'Unknown',
        app_version: '1.0.0',
      },
    }).then((response) => {
      if (response?.session_id) {
        updateSessionId(response.session_id);
      }
    }).catch((err) => {
      console.warn('[WorldScreen] 세션 생성 실패:', err);
    });
  }, [
    countdownSeconds, hapticFeedback, selectedMarker,
    setPhase, startSession, updateSessionId, startTracking,
  ]);

  const NAVIGATE_TO_START_THRESHOLD = 30; // meters — same as checkpoint pass radius

  // Fetch walking directions from Mapbox Directions API
  const fetchWalkingRoute = useCallback(async (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) => {
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?geometries=geojson&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const res = await fetch(url);
      const json = await res.json();
      const coords = json?.routes?.[0]?.geometry?.coordinates;
      if (coords?.length) {
        setNavRoute(coords.map((c: [number, number]) => ({ latitude: c[1], longitude: c[0] })));
      }
    } catch {
      // Fallback: straight line (navRoute stays empty, previewPolyline will draw straight)
    }
  }, []);

  const handleStartRun = useCallback(async (courseId?: string | null) => {
    // Block start if Low Power Mode is enabled (GPS accuracy degrades significantly)
    // Use a timeout to prevent native bridge delays from blocking the start button
    if (Platform.OS === 'ios') {
      try {
        const lowPowerCheck = NativeModules.GPSTrackerModule?.isLowPowerModeEnabled?.();
        if (lowPowerCheck) {
          const isLowPower = await Promise.race([
            lowPowerCheck,
            new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
          ]);
          if (isLowPower) {
            Alert.alert(
              t('running.lowPowerTitle'),
              t('running.lowPowerMessage'),
              [{ text: t('common.confirm'), style: 'default' }],
            );
            return;
          }
        }
      } catch {
        // Unavailable — allow start
      }
    }

    // Save goal to store
    setStoreRunGoal(runGoal);
    setGoalReachedShown(false);

    // Load course route & checkpoints for course running navigation
    if (courseId) {
      try {
        const detail = await courseService.getCourseDetail(courseId);
        if (detail.route_geometry?.coordinates?.length) {
          setCourseRoute(geoJsonToLatLng(detail.route_geometry));
        }
        const cps = (detail as any).checkpoints as CourseCheckpoint[] | null | undefined;
        if (cps?.length) {
          setCourseCheckpoints(cps);
        }
        setCourseElevationProfile(detail.elevation_profile?.length ? detail.elevation_profile : null);

        // Always enter navigate-to-start mode for course runs
        const startCp = cps?.find((cp) => cp.order === 0);
        // Use checkpoint or fallback to first route coordinate
        const startLat = startCp?.lat ?? detail.route_geometry?.coordinates?.[0]?.[1];
        const startLng = startCp?.lng ?? detail.route_geometry?.coordinates?.[0]?.[0];
        if (startLat != null && startLng != null) {
          let initialDist = 999;
          let userLat: number | null = null;
          let userLng: number | null = null;
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              userLat = loc.coords.latitude;
              userLng = loc.coords.longitude;
              initialDist = haversineDistance(
                { latitude: userLat, longitude: userLng },
                { latitude: startLat, longitude: startLng },
              );
            }
          } catch {
            // Location unavailable — will show distance once GPS starts
          }
          setStartCheckpoint({ lat: startLat, lng: startLng });
          setDistanceToStartCP(initialDist);
          setPendingCourseId(courseId);
          setReadyToStart(initialDist <= NAVIGATE_TO_START_THRESHOLD);
          setNavigatingToStart(true);
          resetTracker();
          // Clear 3D preview, hide course route until arrival
          if (selectedMarker) {
            setSelectedMarker(null);
            setIs3DMode(false);
          }
          setPreviewRoute([]);
          setNavRoute([]);
          // Show only start checkpoint marker during navigation
          setPreviewCheckpoints([{ id: 0, order: 0, lat: startLat, lng: startLng }]);
          // Follow user location while navigating to start
          setFollowUser(true);
          // Zoom to user location so the map is centered before GPS tracking starts
          if (userLat != null && userLng != null) {
            mapRef.current?.animateToRegion({
              latitude: userLat,
              longitude: userLng,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }, 600);
          }
          trackingStartedRef.current = true;
          await startTracking();
          // Fetch walking directions in background
          if (initialDist > NAVIGATE_TO_START_THRESHOLD && userLat != null && userLng != null) {
            fetchWalkingRoute(
              { latitude: userLat, longitude: userLng },
              { latitude: startLat, longitude: startLng },
            );
          }
          return;
        }
      } catch {
        // Course nav will be unavailable but run can still proceed
      }
    } else {
      setCourseRoute(null);
      setCourseCheckpoints(null);
    }
    resetTracker();

    await beginCountdownAndRun(courseId);
  }, [
    runGoal, setStoreRunGoal, beginCountdownAndRun, startTracking,
  ]);

  const handleStartFreeRun = useCallback(() => {
    handleStartRun(null);
  }, [handleStartRun]);

  // Cancel navigate-to-start mode
  const handleCancelNavigating = useCallback(() => {
    setNavigatingToStart(false);
    setStartCheckpoint(null);
    setPendingCourseId(null);
    setReadyToStart(false);
    stopTracking();
    trackingStartedRef.current = false;
    setCourseRoute(null);
    setCourseCheckpoints(null);
    setSelectedMarker(null);
    setIs3DMode(false);
    setPreviewRoute([]);
    setPreviewCheckpoints([]);
    setNavRoute([]);
    // Reset watch to idle
    if (Platform.OS === 'ios' && NativeModules.WatchBridgeModule) {
      NativeModules.WatchBridgeModule.sendRunState({ phase: 'idle' }).catch((err: any) => {
        console.warn('[WorldScreen] 워치 상태 전송 실패:', err);
      });
    }
    // Stop follow first so camera animation isn't overridden
    setFollowUser(false);
    // Reset camera to top-down view
    const target = myLocation ?? { latitude: 37.5665, longitude: 126.978 };
    setTimeout(() => {
      mapRef.current?.animateCamera(
        { center: target, pitch: 0, heading: 0, zoom: 13 },
        800,
      );
    }, 100);
  }, [stopTracking, myLocation]);

  // Watch GPS during navigate-to-start — enable "경쟁 시작하기" when close enough
  useEffect(() => {
    if (!navigatingToStart || !startCheckpoint || !currentLocation) return;
    const dist = haversineDistance(
      { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      { latitude: startCheckpoint.lat, longitude: startCheckpoint.lng },
    );
    setDistanceToStartCP(dist);
    const wasReady = readyToStart;
    const nowReady = dist <= NAVIGATE_TO_START_THRESHOLD;
    setReadyToStart(nowReady);
    if (nowReady && !wasReady) {
      // Arrived at start — show full course route & checkpoints
      setNavRoute([]);
      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      if (courseRoute) {
        setPreviewRoute(courseRoute);
      }
      if (courseCheckpoints?.length) {
        setPreviewCheckpoints(
          courseCheckpoints.map((cp) => ({ id: cp.id, order: cp.order, lat: cp.lat, lng: cp.lng })),
        );
      }
    } else if (!nowReady && wasReady) {
      // Moved away from start — hide course route, show only start marker
      setPreviewRoute([]);
      setPreviewCheckpoints([{ id: 0, order: 0, lat: startCheckpoint.lat, lng: startCheckpoint.lng }]);
    }
  }, [navigatingToStart, startCheckpoint, currentLocation, readyToStart, hapticFeedback, courseRoute, courseCheckpoints]);

  // Sync navigate-to-start state to Apple Watch
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const { WatchBridgeModule } = NativeModules;
    if (!WatchBridgeModule) return;
    if (!navigatingToStart || !startCheckpoint) {
      // Send idle when navigation cancelled
      return;
    }
    const bearing = currentLocation
      ? geoBearing(
          { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
          { latitude: startCheckpoint.lat, longitude: startCheckpoint.lng },
        )
      : -1;
    WatchBridgeModule.sendRunState({
      phase: 'navigating',
      navToStartBearing: bearing,
      navToStartDistance: distanceToStartCP,
      navToStartReady: readyToStart,
    }).catch((err: any) => {
      console.warn('[WorldScreen] 워치 네비게이션 상태 전송 실패:', err);
    });
  }, [navigatingToStart, startCheckpoint, currentLocation, distanceToStartCP, readyToStart]);

  // Handle "경쟁 시작하기" button press
  const handleStartCompetition = useCallback(() => {
    if (!readyToStart) return;
    setNavigatingToStart(false);
    setStartCheckpoint(null);
    setReadyToStart(false);
    setNavRoute([]);
    beginCountdownAndRun(pendingCourseId);
  }, [readyToStart, pendingCourseId, beginCountdownAndRun]);

  const handleStartCourseRun = useCallback(() => {
    if (selectedMarker) {
      handleStartRun(selectedMarker.id);
    }
  }, [selectedMarker, handleStartRun]);

  const handlePause = useCallback(async () => {
    storePause();
    await pauseTracking();
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [storePause, pauseTracking, hapticFeedback]);

  const handleResume = useCallback(async () => {
    storeResume();
    await resumeTracking();
    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [storeResume, resumeTracking, hapticFeedback]);

  // Complete run inline — no navigation, show result summary in-place
  const finishRun = useCallback(async () => {
    const store = useRunningStore.getState();
    const sid = store.sessionId;
    // Save checkpoint passes before completing
    if (checkpointPasses.length > 0) {
      useRunningStore.getState().setCheckpointPasses(checkpointPasses);
    }
    await stopTracking();
    trackingStartedRef.current = false;
    setScreenLocked(false);
    complete();

    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Fit map to completed route after UI settles
    if (store.routePoints.length >= 2) {
      InteractionManager.runAfterInteractions(() => {
        mapRef.current?.animateCamera({ pitch: 0, heading: 0 }, 800);
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(store.routePoints, {
            top: 120, right: 60, bottom: 380, left: 60,
          }, true);
        }, 900);
      });
    }

    if (!sid) return;

    // Build payload (same as RunResultScreen)
    const runPayload = {
      distance_meters: Math.round(store.distanceMeters),
      duration_seconds: Math.round(store.durationSeconds),
      total_elapsed_seconds: Math.round(store.durationSeconds),
      avg_pace_seconds_per_km: Math.round(store.avgPaceSecondsPerKm),
      best_pace_seconds_per_km: Math.round(
        store.splits.length > 0
          ? Math.min(...store.splits.map((s) => s.pace_seconds_per_km))
          : store.avgPaceSecondsPerKm,
      ),
      avg_speed_ms: store.distanceMeters / (store.durationSeconds || 1),
      max_speed_ms: 0,
      calories: Math.round(store.calories),
      finished_at: new Date().toISOString(),
      route_geometry: {
        type: 'LineString' as const,
        coordinates: (store.routePoints.length >= 2
          ? store.routePoints.map((p) => [p.longitude, p.latitude, 0])
          : [[127.0, 37.5, 0], [127.0001, 37.5001, 0]]) as [number, number, number][],
      },
      elevation_gain_meters: Math.round(store.elevationGainMeters),
      elevation_loss_meters: Math.round(store.elevationLossMeters),
      elevation_profile: store.filteredLocations.map(loc => Math.round(loc.altitude)),
      splits: store.splits,
      pause_intervals: [] as { paused_at: string; resumed_at: string }[],
      filter_config: {
        kalman_q: 3.0,
        kalman_r_base: 10.0,
        outlier_speed_threshold: 12.0,
        outlier_accuracy_threshold: 50.0,
      },
      total_chunks: 0,
      uploaded_chunk_sequences: [] as number[],
      ...(store.checkpointPasses.length > 0 ? { checkpoint_passes: store.checkpointPasses } : {}),
      ...(runCourseIdRef.current && finishReachedRef.current ? {
        course_completion: {
          is_completed: true,
          max_deviation_meters: Math.round(maxDeviationRef.current),
          deviation_points: offCourseSamplesRef.current,
          route_match_percent: deviationSamplesRef.current > 0
            ? Math.round((1 - offCourseSamplesRef.current / deviationSamplesRef.current) * 100)
            : 100,
        },
      } : {}),
    };

    // Save locally first
    const pendingId = `local-run-${Date.now()}`;
    setResultUploading(true);
    try {
      await savePendingRunRecord({
        id: pendingId,
        sessionId: sid,
        payload: runPayload,
        createdAt: new Date().toISOString(),
      });
      setResultSavedLocally(true);
    } catch {
      // Local save failed — continue with server attempt
    }

    // Upload to server
    try {
      const response = await runService.completeRun(sid, runPayload);
      setResultRunRecordId(response?.run_record_id ?? null);
      await removePendingRunRecord(pendingId).catch((err) => {
        console.warn('[WorldScreen] 로컬 대기 기록 삭제 실패:', err);
      });
    } catch {
      // Server failed — local data is safe
    } finally {
      setResultUploading(false);
    }
  }, [stopTracking, complete, hapticFeedback]);

  // Auto-finish when finish checkpoint (last) is reached
  const finishTriggeredRef = useRef(false);
  useEffect(() => {
    if (finishReached && phase === 'running' && runCourseId && !finishTriggeredRef.current) {
      finishTriggeredRef.current = true;
      finishRun();
    }
    if (phase === 'idle') {
      finishTriggeredRef.current = false;
    }
  }, [finishReached, phase, runCourseId, finishRun]);

  // Fallback auto-finish for courses without checkpoints (progress-based)
  useEffect(() => {
    if (phase !== 'running' || !runCourseId || !courseNavigation || finishReached) return;
    if (cpTotalCount > 0) return; // checkpoint-based detection takes priority

    // Guard: prevent immediate completion on round-trip courses where
    // start === finish. Must have actually run (>200m) and been running
    // for at least 30 seconds.
    if (distanceMeters < 200 || durationSeconds < 30) return;

    if (courseNavigation.progressPercent > 95 && courseNavigation.remainingDistanceMeters < 40) {
      finishReachedRef.current = true;
      finishTriggeredRef.current = true;
      finishRun();
    }
  }, [phase, runCourseId, courseNavigation, finishReached, cpTotalCount, finishRun, distanceMeters, durationSeconds]);

  // Long-press stop: hold for 1.5s to end run (no Alert confirmation)
  const [stopProgressAnim] = useState(() => new Animated.Value(0));
  const [stopProgressVisible, setStopProgressVisible] = useState(false);
  const stopHapticTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopUnlockedRef = useRef(false);
  const stopPressStart = useRef(0);
  const [showStopHint, setShowStopHint] = useState(false);
  const stopHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopFinishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupStopTimers = useCallback(() => {
    if (stopHapticTimer.current) {
      clearInterval(stopHapticTimer.current);
      stopHapticTimer.current = null;
    }
    if (stopFinishTimer.current) {
      clearTimeout(stopFinishTimer.current);
      stopFinishTimer.current = null;
    }
  }, []);

  const handleStopPressIn = useCallback(() => {
    stopUnlockedRef.current = false;
    stopPressStart.current = Date.now();
    if (stopHintTimer.current) clearTimeout(stopHintTimer.current);
    setShowStopHint(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    stopProgressAnim.setValue(0);
    setStopProgressVisible(true);
    stopHapticTimer.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 400);
    // Timer-based finish — no JS-thread listener needed
    stopFinishTimer.current = setTimeout(() => {
      if (!stopUnlockedRef.current) {
        stopUnlockedRef.current = true;
        cleanupStopTimers();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        finishRun();
      }
    }, 1500);
    Animated.timing(stopProgressAnim, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: true,
    }).start();
  }, [stopProgressAnim, cleanupStopTimers, finishRun]);

  const handleStopPressOut = useCallback(() => {
    if (stopUnlockedRef.current) return;
    cleanupStopTimers();
    stopProgressAnim.stopAnimation();
    stopProgressAnim.setValue(0);
    setStopProgressVisible(false);
    // 짧게 탭한 경우 힌트 표시
    if (Date.now() - stopPressStart.current < 300) {
      setShowStopHint(true);
      stopHintTimer.current = setTimeout(() => setShowStopHint(false), 2500);
    }
  }, [stopProgressAnim, cleanupStopTimers]);

  // Watch stop (no confirmation)
  const handleWatchStop = useCallback(async () => {
    await finishRun();
  }, [finishRun]);

  // Watch companion
  useWatchCompanion({
    onPauseCommand: handlePause,
    onResumeCommand: handleResume,
    onStopCommand: handleWatchStop,
  }, courseNavigation, {
    passedCount: cpPassedCount,
    totalCount: cpTotalCount,
    justPassed: !!cpJustPassed,
  }, intervalState);

  // Cleanup on unmount
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const stopTrackingRef = useRef(stopTracking);
  stopTrackingRef.current = stopTracking;

  useEffect(() => {
    return () => {
      if (phaseRef.current === 'running' || phaseRef.current === 'paused') {
        stopTrackingRef.current();
      }
    };
  }, []);

  // Goal reached check
  const goalProgress = useMemo(
    () => getGoalProgress(storeRunGoal, distanceMeters, durationSeconds, avgPaceSecondsPerKm),
    [storeRunGoal, distanceMeters, durationSeconds, avgPaceSecondsPerKm],
  );

  useEffect(() => {
    if (goalProgress?.reached && !goalReachedShown && phase === 'running') {
      setGoalReachedShown(true);
      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [goalProgress?.reached, goalReachedShown, phase, hapticFeedback]);

  // Auto-finish when interval training completes
  const intervalFinishRef = useRef(false);
  useEffect(() => {
    if (intervalState?.isCompleted && phase === 'running' && !intervalFinishRef.current) {
      intervalFinishRef.current = true;
      // Wait for completion TTS ("인터벌 훈련 완료") to finish before auto-ending
      setTimeout(() => finishRun(), 2500);
    }
    if (phase === 'idle') {
      intervalFinishRef.current = false;
    }
  }, [intervalState?.isCompleted, phase, finishRun]);

  // ============================================================
  // WORLD MAP HANDLERS
  // ============================================================

  useEffect(() => {
    // Load all course markers globally on mount
    fetchMapMarkers(-90, -180, 90, 180);

    const fallbackTimeout = setTimeout(() => {
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        setFollowUser(false);
      }
    }, 3000);

    return () => {
      clearTimeout(fallbackTimeout);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, [fetchMapMarkers]);

  // Fetch weather data
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const data = await api.get<WeatherData>(
          '/weather/current?lat=37.5665&lng=126.978',
        );
        setWeather(data);
      } catch {
        setWeather({
          temp: 4,
          feels_like: 1,
          humidity: 45,
          wind_speed: 3.2,
          description: '맑음',
          icon: '01d',
          aqi: 2,
          aqi_label: '보통',
        });
      }
    };
    fetchWeather();
  }, []);

  const handleRegionChange = useCallback(
    (_region: Region) => {
      // Region tracking removed — no longer needed for rendering
    },
    [],
  );

  const cancelRouteAnimation = useCallback(() => {
    if (animTimerRef.current) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
    }
  }, []);

  const animateRouteDraw = useCallback((fullRoute: LatLng[]) => {
    cancelRouteAnimation();
    setPreviewRoute(fullRoute);
  }, [cancelRouteAnimation]);

  // Handle pendingFocusCourseId
  useEffect(() => {
    if (!pendingFocusCourseId) return;
    const targetId = pendingFocusCourseId;

    const focusOnCourse = async () => {
      try {
        // Disable follow so camera stays on the course, not the user
        setFollowUser(false);

        const [detail, rankings] = await Promise.all([
          courseService.getCourseDetail(targetId),
          rankingService.getCourseRankings(targetId, 10).catch(() => [] as RankingEntry[]),
        ]);
        setHudRankings(rankings);
        if (!detail.route_geometry?.coordinates?.length) return;

        const routePoints = geoJsonToLatLng(detail.route_geometry);

        const cps = (detail as any).checkpoints as CourseCheckpoint[] | null | undefined;
        setPreviewCheckpoints(
          cps?.map((cp) => ({ id: cp.id, order: cp.order, lat: cp.lat, lng: cp.lng })) ?? [],
        );

        const startCoord = routePoints[0];
        setSelectedMarker({
          id: detail.id,
          title: detail.title,
          start_lat: startCoord.latitude,
          start_lng: startCoord.longitude,
          distance_meters: detail.distance_meters,
          elevation_gain_meters: detail.elevation_gain_meters,
          total_runs: 0,
          difficulty: null,
          avg_rating: null,
          dominion: detail.dominion ?? null,
        } as CourseMarkerData);
        setIs3DMode(true);

        // Calculate distance from user to course start
        const loc = myLocationRef.current;
        if (loc) {
          const dist = haversineDistance(
            { latitude: loc.latitude, longitude: loc.longitude },
            { latitude: startCoord.latitude, longitude: startCoord.longitude },
          );
          setDistanceToMarkerM(dist);
        } else {
          setDistanceToMarkerM(null);
        }

        // Wait until mapRef is ready (may be lazy-loaded)
        const waitForMap = () =>
          new Promise<void>((resolve) => {
            if (mapRef.current) { resolve(); return; }
            let tries = 0;
            const interval = setInterval(() => {
              tries++;
              if (mapRef.current || tries > 20) {
                clearInterval(interval);
                resolve();
              }
            }, 100);
          });
        await waitForMap();

        // Fit bounds first, then apply 3D pitch/heading after bounds settle.
        // fitBounds resets pitch to 0, so pitch must come AFTER.
        const heading = routePoints.length >= 2
          ? calcBearing(routePoints[0], routePoints[Math.floor(routePoints.length / 2)])
          : 0;

        mapRef.current?.fitToCoordinates(routePoints, {
          top: 200, right: 60, bottom: 280, left: 60,
        }, true);

        setTimeout(() => {
          mapRef.current?.animateCamera({ pitch: 55, heading }, 800);
          animateRouteDraw(routePoints);
        }, 600);

        fetchMapMarkers(-90, -180, 90, 180);
      } catch {
        // Silent fail
      } finally {
        useCourseListStore.getState().setPendingFocusCourseId(null);
      }
    };

    // Wait for tab transition animation to finish, then allow map to settle
    const interaction = InteractionManager.runAfterInteractions(() => {
      setTimeout(focusOnCourse, 300);
    });
    return () => interaction.cancel();
  }, [pendingFocusCourseId, animateRouteDraw, fetchMapMarkers]);

  // Handle pendingStartCourseId (auto-start course run from outside, e.g. crew raid)
  useEffect(() => {
    if (!pendingStartCourseId) return;
    const courseId = pendingStartCourseId;
    useCourseListStore.getState().setPendingStartCourseId(null);

    // Wait for tab transition, then start the run flow (navigate-to-start)
    const interaction = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        handleStartRun(courseId);
      }, 300);
    });
    return () => interaction.cancel();
  }, [pendingStartCourseId, handleStartRun]);

  const resetTo2D = useCallback(() => {
    cancelRouteAnimation();
    setPreviewRoute([]);
    setPreviewCheckpoints([]);
    setIs3DMode(false);

    // Reset pitch/heading to flat north-up without moving camera position
    mapRef.current?.animateCamera(
      { pitch: 0, heading: 0 },
      500,
    );
  }, [cancelRouteAnimation]);

  const handleMarkerPress = useCallback(
    async (courseId: string) => {
      const marker = mapMarkers.find((m) => m.id === courseId) ?? null;
      if (!marker) return;

      markerPressedRef.current = true;
      setTimeout(() => { markerPressedRef.current = false; }, 300);

      cancelRouteAnimation();
      setPreviewRoute([]);
      setPreviewCheckpoints([]);
      setHudRankings([]);
      setFollowUser(false);
      setSelectedMarker(marker);
      setIs3DMode(true);

      // Calculate distance from user to course start
      const loc = myLocationRef.current;
      if (loc) {
        const dist = haversineDistance(
          { latitude: loc.latitude, longitude: loc.longitude },
          { latitude: marker.start_lat, longitude: marker.start_lng },
        );
        setDistanceToMarkerM(dist);
      } else {
        setDistanceToMarkerM(null);
      }

      try {
        const [detail, rankings] = await Promise.all([
          courseService.getCourseDetail(courseId),
          rankingService.getCourseRankings(courseId, 10).catch(() => [] as RankingEntry[]),
        ]);
        setHudRankings(rankings);

        if (!detail.route_geometry?.coordinates?.length) {
          mapRef.current?.animateCamera(
            { center: { latitude: marker.start_lat, longitude: marker.start_lng }, pitch: 50, heading: 0, zoom: 15.5 },
            1200,
          );
          return;
        }

        const routePoints = geoJsonToLatLng(detail.route_geometry);

        const cps = (detail as any).checkpoints as CourseCheckpoint[] | null | undefined;
        setPreviewCheckpoints(
          cps?.map((cp) => ({ id: cp.id, order: cp.order, lat: cp.lat, lng: cp.lng })) ?? [],
        );

        mapRef.current?.fitToCoordinates(routePoints, {
          top: 160, right: 40, bottom: 140, left: 40,
        }, true);

        setTimeout(() => {
          const heading = routePoints.length >= 2
            ? calcBearing(routePoints[0], routePoints[Math.floor(routePoints.length / 2)])
            : 0;
          mapRef.current?.animateCamera(
            { pitch: 55, heading },
            1000,
          );
          animateRouteDraw(routePoints);
        }, 800);
      } catch {
        mapRef.current?.animateCamera(
          { center: { latitude: marker.start_lat, longitude: marker.start_lng }, pitch: 50, heading: 0, zoom: 15.5 },
          1200,
        );
      }
    },
    [mapMarkers, cancelRouteAnimation, animateRouteDraw],
  );

  const handleMapPress = useCallback(() => {
    if (markerPressedRef.current) return;
    if (selectedMarker) {
      resetTo2D();
      setSelectedMarker(null);
      setHudRankings([]);
      setDistanceToMarkerM(null);
    }
  }, [selectedMarker, resetTo2D]);

  const handleGoDetail = useCallback(() => {
    if (selectedMarker) {
      navigation.navigate('CourseDetail', { courseId: selectedMarker.id });
    }
  }, [navigation, selectedMarker]);

  const handleRecenter = useCallback(async () => {
    let loc = myLocation;
    if (!loc) {
      // Try to get current location if we don't have one yet
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setMyLocation(loc);
        }
      } catch (err) {
        console.warn('[WorldScreen] 위치 재조회 실패:', err);
      }
    }
    // Move camera to current location and re-engage follow mode
    mapRef.current?.recenterOnUser(loc ?? undefined);
    setFollowUser(true);
  }, [myLocation]);

  const getDifficultyLabel = (d?: string | null) => {
    switch (d) {
      case 'easy': return 'Lv.1';
      case 'medium': return 'Lv.2';
      case 'hard': return 'Lv.3';
      default: return '';
    }
  };
  const getDifficultyColor = (d?: string | null) => {
    switch (d) {
      case 'easy': return COLORS.success;
      case 'medium': return COLORS.warning;
      case 'hard': return COLORS.accent;
      default: return COLORS.primary;
    }
  };

  // GPS status for running HUD
  const gpsDisabled = gpsStatus === 'disabled';
  const runGpsLabel = gpsDisabled ? '위치 권한 필요' : 'GPS 연결됨';
  const runGpsColor = gpsDisabled ? colors.error : colors.success;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} />

      {/* ===== FULL-SCREEN MAP (always visible) ===== */}
      <RouteMapView
        ref={mapRef}
        markers={isInRun || navigatingToStart || is3DMode ? [] : mapMarkers}
        routePoints={isInRun && !runCourseId ? runRoutePoints : undefined}
        previewPolyline={
          isInRun
            ? undefined
            : navigatingToStart && !readyToStart
              ? (navRoute.length > 0 ? navRoute : (currentLocation && startCheckpoint ? [
                  { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
                  { latitude: startCheckpoint.lat, longitude: startCheckpoint.lng },
                ] : undefined))
              : previewRoute
        }
        checkpoints={isInRun ? (cpMarkerData.length > 0 ? cpMarkerData : undefined) : (previewCheckpoints.length > 0 ? previewCheckpoints : undefined)}
        onMarkerPress={isInRun ? undefined : handleMarkerPress}
        onMapPress={isInRun ? undefined : handleMapPress}
        onRegionChange={isInRun ? undefined : handleRegionChange}
        onUserMapInteraction={() => setFollowUser(false)}
        onUserLocationChange={(coord) => {
          setMyLocation({ latitude: coord.latitude, longitude: coord.longitude });
          // Persist for instant map centering on screen transitions (e.g. RunningScreen)
          useSettingsStore.getState().setLastKnownLocation({ latitude: coord.latitude, longitude: coord.longitude });
          if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            fetchMapMarkers(-90, -180, 90, 180);
            // First GPS fix: fly camera to user location immediately
            mapRef.current?.recenterOnUser({ latitude: coord.latitude, longitude: coord.longitude });
          }
        }}
        followsUserLocation={followUser && phase !== 'completed'}
        followZoomLevel={isInRun ? (runCourseId ? 17 : 16) : undefined}
        followUserMode={undefined}
        followPitch={isInRun ? (runCourseId ? 45 : 30) : undefined}
        followPadding={panelHeight > 0 ? {
          paddingTop: 0,
          paddingBottom: Math.max(panelHeight - 40, 0),
        } : undefined}
        showUserLocation={true}
        hideRouteMarkers={isInRun}
        lastKnownLocation={myLocation ?? useSettingsStore.getState().lastKnownLocation ?? undefined}
        customUserLocation={myLocation ?? undefined}
        customUserHeading={runHeadingValue ?? undefined}
        interactive={touring || isInRun}
        pitchEnabled={map3DStyle || is3DMode || isInRun}
        use3DStyle={map3DStyle}
        style={styles.map}
      />

      {/* Weather + Tour back — always visible above WelcomeOverlay */}
      {!selectedMarker && !isInRun && (weather || (touring && phase === 'idle')) && (
        <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.topBar}>
            {weather ? (
              <View style={styles.weatherWidget}>
                <Ionicons
                  name={getWeatherIconName(weather.icon)}
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={styles.weatherTemp}>{Math.round(weather.temp)}°</Text>
                <Text style={styles.weatherDesc}>{weather.description}</Text>
                <View style={styles.weatherDivider} />
                <Ionicons name="water" size={12} color={colors.textTertiary} />
                <Text style={styles.weatherDetail}>{weather.humidity}%</Text>
                {weather.aqi_label && (
                    <>
                        <View style={styles.weatherDivider} />
                        <Ionicons name="leaf" size={12} color={getAqiColor(weather.aqi)} />
                        <Text style={[styles.weatherDetail, { color: getAqiColor(weather.aqi) }]}>{weather.aqi_label}</Text>
                    </>
                )}
              </View>
            ) : <View />}
            {/* Empty spacer — tourBack button removed */}
            <View />
          </View>
        </SafeAreaView>
      )}

      {/* ===== WORLD MODE OVERLAYS (individual elements, no absoluteFill wrapper) ===== */}

        {/* ===== Unified recenter button (always visible) ===== */}
        <Animated.View style={[styles.recenterContainer, { opacity: worldOverlayOpacity }]} pointerEvents={isInRun ? 'none' : 'auto'}>
          <TouchableOpacity style={styles.recenterBtn} onPress={handleRecenter} activeOpacity={0.7}>
            <Ionicons name="locate" size={20} color={colors.text} />
          </TouchableOpacity>
        </Animated.View>

        {/* Run FAB — visible during tour mode to quickly start running */}
        {touring && phase === 'idle' && (
          <Animated.View style={{ opacity: worldOverlayOpacity }} pointerEvents="auto">
          <TouchableOpacity
            style={styles.fabRun}
            onPress={() => { setTouring(false); setWelcomeVisible(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="walk" size={20} color={COLORS.white} />
          </TouchableOpacity>
          </Animated.View>
        )}

        {/* ===== HUD overlay when marker selected ===== */}
        {selectedMarker && (
          <>
            <SafeAreaView style={styles.hudTopOverlay} pointerEvents="box-none">
              <View style={styles.hudTop}>
                <TouchableOpacity
                  style={styles.hudBackBtn}
                  onPress={() => { resetTo2D(); setSelectedMarker(null); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-back" size={20} color={COLORS.white} />
                </TouchableOpacity>
                <View style={styles.hudTitleArea}>
                  <View style={styles.hudTitleRow}>
                    {selectedMarker.difficulty && (
                      <View style={[styles.hudDiffBadge, { backgroundColor: getDifficultyColor(selectedMarker.difficulty) }]}>
                        <Text style={styles.hudDiffText}>{getDifficultyLabel(selectedMarker.difficulty)}</Text>
                      </View>
                    )}
                    <Text style={styles.hudTitle} numberOfLines={1}>{selectedMarker.title}</Text>
                  </View>
                  <View style={styles.hudStats}>
                    <View style={styles.hudStatItem}>
                      <Ionicons name="navigate" size={12} color={COLORS.primary} />
                      <Text style={styles.hudStatValue}>{formatDistance(selectedMarker.distance_meters)}</Text>
                    </View>
                    {(selectedMarker.elevation_gain_meters ?? 0) > 0 && (
                      <View style={styles.hudStatItem}>
                        <Ionicons name="trending-up" size={12} color={COLORS.success} />
                        <Text style={styles.hudStatValue}>{selectedMarker.elevation_gain_meters}m</Text>
                      </View>
                    )}
                    <View style={styles.hudStatItem}>
                      <Ionicons name="people" size={12} color={COLORS.secondary} />
                      <Text style={styles.hudStatValue}>{selectedMarker.total_runs}회</Text>
                    </View>
                    {selectedMarker.avg_rating != null && (
                      <View style={styles.hudStatItem}>
                        <Ionicons name="star" size={12} color={COLORS.warning} />
                        <Text style={styles.hudStatValue}>{selectedMarker.avg_rating.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                  {selectedMarker.dominion && (
                    <View style={styles.hudDominionRow}>
                      <Ionicons name="flag" size={13} color={selectedMarker.dominion.crew_badge_color || COLORS.primary} />
                      {selectedMarker.dominion.crew_logo_url ? (
                        <Image source={{ uri: selectedMarker.dominion.crew_logo_url }} style={styles.hudDominionLogo} />
                      ) : (
                        <View style={[styles.hudDominionLogo, { backgroundColor: selectedMarker.dominion.crew_badge_color || COLORS.primary, alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="shield" size={10} color={COLORS.white} />
                        </View>
                      )}
                      <Text style={[styles.hudDominionText, { color: selectedMarker.dominion.crew_badge_color || COLORS.primary }]}>
                        <Text style={styles.hudDominionCrew}>{selectedMarker.dominion.crew_name}</Text>
                        {' 점령 중'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </SafeAreaView>

            {hudRankings.length > 0 && (
              <View style={styles.hudRankingOverlay} pointerEvents="box-none">
                <View style={styles.hudRankingBox}>
                  <TouchableOpacity
                    style={styles.hudRankingHeader}
                    onPress={() => {
                      const next = !hudRankingVisible;
                      setHudRankingVisible(next);
                      Animated.timing(rankingAnim, {
                        toValue: next ? 1 : 0,
                        duration: 250,
                        useNativeDriver: false,
                      }).start();
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trophy" size={12} color={colors.gold} />
                    <Text style={styles.hudRankingTitle}>TOP {hudRankings.length}</Text>
                    <Ionicons
                      name={hudRankingVisible ? 'chevron-down' : 'chevron-up'}
                      size={14}
                      color="rgba(255,255,255,0.5)"
                    />
                  </TouchableOpacity>
                  <Animated.View style={{
                    opacity: rankingAnim,
                    maxHeight: rankingAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }),
                    overflow: 'hidden' as const,
                  }}>
                    <View style={styles.hudRankingColHeader}>
                      <Text style={[styles.hudRankColLabel, styles.colBadge]} />
                      <Text style={[styles.hudRankColLabel, styles.colName]}>이름</Text>
                      <Text style={[styles.hudRankColLabel, styles.colCrew]}>크루</Text>
                      <Text style={[styles.hudRankColLabel, styles.colPace]}>페이스</Text>
                      <Text style={[styles.hudRankColLabel, styles.colTime]}>시간</Text>
                    </View>
                    {hudRankings.map((entry) => {
                      const RANK_COLORS = [colors.gold, colors.silver, colors.bronze];
                      const rankColor = entry.rank <= 3 ? RANK_COLORS[entry.rank - 1] : 'rgba(255,255,255,0.35)';
                      return (
                        <View key={`${entry.rank}-${entry.user.id}`} style={styles.hudRankingRow}>
                          <Text style={[styles.hudRankNum, styles.colBadge, { color: rankColor }]}>{entry.rank}</Text>
                          {entry.user.avatar_url ? (
                            <Image source={{ uri: entry.user.avatar_url }} style={styles.hudRankAvatar} />
                          ) : (
                            <View style={[styles.hudRankAvatar, styles.hudRankAvatarPlaceholder]}>
                              <Ionicons name="person" size={10} color="rgba(255,255,255,0.4)" />
                            </View>
                          )}
                          <Text style={[styles.hudRankNickname, styles.colName]} numberOfLines={1}>{entry.user.nickname}</Text>
                          <Text style={[styles.hudRankCrew, styles.colCrew]} numberOfLines={1}>{entry.user.crew_name || '-'}</Text>
                          <Text style={[styles.hudRankPace, styles.colPace]}>{formatPace(entry.best_pace_seconds_per_km)}</Text>
                          <Text style={[styles.hudRankDuration, styles.colTime]}>{formatDuration(entry.best_duration_seconds)}</Text>
                        </View>
                      );
                    })}
                  </Animated.View>
                </View>
              </View>
            )}

            <View style={styles.hudBottomOverlay} pointerEvents="box-none">
              {distanceToMarkerM !== null && distanceToMarkerM > 5000 && (
                <View style={styles.hudDistanceBanner}>
                  <Ionicons name="location-outline" size={14} color="#FF9500" />
                  <Text style={styles.hudDistanceText}>
                    {t('world.distanceToStart', { distance: (distanceToMarkerM / 1000).toFixed(1) })}
                  </Text>
                </View>
              )}
              <View style={styles.hudActions}>
                <TouchableOpacity style={styles.hudDetailBtn} onPress={handleGoDetail} activeOpacity={0.7}>
                  <Ionicons name="information-circle" size={16} color={COLORS.black} />
                  <Text style={styles.hudDetailText}>{t('course.detail.details')}</Text>
                </TouchableOpacity>
                {distanceToMarkerM === null || distanceToMarkerM > 5000 ? (
                  <View style={styles.hudRunBtnDisabled}>
                    <Ionicons name="navigate" size={16} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.hudRunTextDisabled}>{t('world.goToStart')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.hudRunBtn} onPress={handleStartCourseRun} activeOpacity={0.85}>
                    <Ionicons name="navigate" size={16} color={COLORS.white} />
                    <Text style={styles.hudRunText}>{t('world.goToStart')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}

      {/* Welcome overlay — rendered BEFORE RunStartOverlay so buttons are on top (Android uses JSX order for touch priority) */}
      <WelcomeOverlay
        visible={welcomeVisible && phase === 'idle' && !selectedMarker && !navigatingToStart && !touring}
        nickname={userNickname ?? undefined}
        runGoal={runGoal}
        onTour={() => { setTouring(true); setWelcomeVisible(false); setFollowUser(false); }}
      />

      {/* Run Start Overlay — must render AFTER WelcomeOverlay for Android touch priority */}
      <RunStartOverlay
        visible={phase === 'idle' && !selectedMarker && !is3DMode && !navigatingToStart && !touring}
        onStart={handleStartFreeRun}
        onGoalPress={() => setGoalSheetVisible(true)}
        onSettingsPress={() => setSettingsSheetVisible(true)}
        goalLabel={formatGoalLabel(runGoal, t)}
      />


      {/* ===== COUNTDOWN OVERLAY ===== */}
      {showCountdownOverlay && (
        <Animated.View style={[styles.countdownOverlay, { opacity: countdownOpacity, transform: [{ translateY: countdownTranslateY }] }]} pointerEvents="none">
          <View style={styles.countdownContent}>
            <Text style={styles.countdownLabel}>준비하세요</Text>
            <Text style={styles.countdownNumber}>{countdown ?? lastCountdownRef.current}</Text>
            <View style={styles.countdownBarTrack}>
              <View
                style={[
                  styles.countdownBarFill,
                  { width: `${((countdownSeconds - (countdown ?? lastCountdownRef.current) + 1) / countdownSeconds) * 100}%` },
                ]}
              />
            </View>
          </View>
        </Animated.View>
      )}

      {/* ===== RUNNING / PAUSED / COMPLETED OVERLAYS — Top status bar ===== */}
      {(phase === 'running' || phase === 'paused') && (
            <>
              <SafeAreaView style={styles.runTopOverlay} pointerEvents="box-none">
                <View style={styles.runTopBar}>
                  <View style={styles.gpsChip}>
                    <View style={[styles.gpsDot, { backgroundColor: runGpsColor }]} />
                    <Text style={styles.gpsChipText}>{runGpsLabel}</Text>
                  </View>
                  <View style={styles.modeChip}>
                    <Text style={styles.modeChipText}>{runCourseId ? '코스 러닝' : '자유 러닝'}</Text>
                  </View>
                  {watchConnected && (
                    <View style={styles.watchChip}>
                      <Ionicons name="watch-outline" size={12} color={colors.success} />
                    </View>
                  )}
                  {storeRunGoal?.type === 'program' && (storeRunGoal.cadenceBPM ?? 0) > 0 && (
                    <TouchableOpacity
                      style={[styles.modeChip, !metronomeMuted && { borderColor: colors.primary }]}
                      onPress={() => setMetronomeMuted(!metronomeMuted)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={metronomeMuted ? 'musical-note' : 'musical-notes'}
                        size={11}
                        color={metronomeMuted ? colors.textTertiary : colors.primary}
                      />
                      <Text style={[styles.modeChipText, !metronomeMuted && { color: colors.primary }]}>
                        {storeRunGoal.cadenceBPM}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </SafeAreaView>

              {/* Banners */}
              {(phase === 'paused' || isAutoPaused) && (
                <View style={styles.pausedBanner}>
                  <Ionicons name="pause" size={14} color="#000" />
                  <Text style={styles.pausedText}>
                    {isAutoPaused && phase !== 'paused' ? 'AUTO PAUSED' : 'PAUSED'}
                  </Text>
                </View>
              )}
              {competitionStartShown && (
                <View style={styles.goalReachedBanner}>
                  <Ionicons name="flag" size={16} color={COLORS.white} />
                  <Text style={styles.goalReachedText}>경쟁 시작!</Text>
                </View>
              )}
              {goalReachedShown && (
                <View style={styles.goalReachedBanner}>
                  <Ionicons name="trophy" size={16} color={COLORS.white} />
                  <Text style={styles.goalReachedText}>목표 달성!</Text>
                </View>
              )}
              {/* Interval training banner — moved to runPanel */}
{/* Floating pace coaching banner removed — now shown inside runPanel */}
              {loopDetected && distanceMeters >= 300 && (
                <View style={styles.loopBanner}>
                  <Ionicons name="flag" size={16} color={COLORS.white} />
                  <Text style={styles.loopBannerText}>Finish! Loop complete</Text>
                </View>
              )}
              {isApproachingStart && !isNearStart && !loopDetected && distanceMeters >= 300 && (
                <View style={styles.approachBanner}>
                  <Ionicons name="navigate" size={16} color={colors.text} />
                  <Text style={styles.approachBannerText}>
                    Approaching start ~{Math.round(distanceToStart)}m
                  </Text>
                </View>
              )}

            </>
          )}

      {/* Stop hint toast — floating above the bottom panel */}
      {showStopHint && (
        <View style={styles.stopHintContainer}>
          <Text style={styles.stopHintText}>종료 버튼을 꾹 눌러주세요</Text>
        </View>
      )}

      {/* Recenter button during running — visible when user panned away */}
      {isInRun && !followUser && (
        <TouchableOpacity
          style={[styles.runRecenterBtn, { bottom: panelHeight + SPACING.md }]}
          onPress={() => {
            const loc = myLocation ?? useSettingsStore.getState().lastKnownLocation;
            if (loc) mapRef.current?.recenterOnUser(loc);
            setFollowUser(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="navigate" size={20} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* Bottom panel — always rendered (starts offscreen at translateY:500), content conditional */}
      <Animated.View
        style={[styles.runPanel, { transform: [{ translateY: runPanelTranslateY }] }]}
        pointerEvents={phase === 'idle' || phase === 'countdown' ? 'none' : 'auto'}
        onLayout={(e) => {
          if (phase === 'idle' || phase === 'countdown') return;
          const h = e.nativeEvent.layout.height;
          if (Math.abs(h - panelHeight) > 2) {
            // LayoutAnimation on Android interferes with Mapbox GL surface,
            // causing the map to visually reload/flash. Only use on iOS.
            if (Platform.OS === 'ios') {
              LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));
            }
            setPanelHeight(h);
          }
        }}
      >
        {(phase === 'running' || phase === 'paused' || phase === 'completed') && (<>

            {/* Lock button — top-right corner of panel */}
            {!navigatingToStart && (phase === 'running' || phase === 'paused') && (
              <TouchableOpacity
                style={styles.lockBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setScreenLocked(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="lock-closed" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}

            {/* Completed header */}
            {!navigatingToStart && phase === 'completed' && (
              <View style={styles.resultHeader}>
                <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                <Text style={styles.resultTitle}>러닝 완료!</Text>
              </View>
            )}

            {/* Interval training banner — compact horizontal inside panel */}
            {intervalState && !intervalState.isCompleted && (phase === 'running' || phase === 'paused') && (
              <View style={[
                styles.intervalBanner,
                { backgroundColor: intervalState.currentPhase === 'run' ? colors.primary : colors.success },
                phase === 'paused' && { opacity: 0.6 },
              ]}>
                <Text style={styles.intervalPhaseLabel}>
                  {intervalState.currentPhase === 'run' ? 'RUN' : 'WALK'}
                </Text>
                <Text style={styles.intervalTimer}>
                  {formatDuration(intervalState.phaseRemainingSeconds)}
                </Text>
                <Text style={styles.intervalSetInfo}>
                  {intervalState.currentSet}/{intervalState.totalSets}
                </Text>
              </View>
            )}

            {/* Hero distance */}
            {!navigatingToStart && (
            <View style={styles.runHeroRow}>
              <Text style={styles.runHeroValue}>{metersToKm(distanceMeters)}</Text>
              <Text style={styles.runHeroUnit}>km</Text>
            </View>
            )}

            {/* Course progress — only during course run */}
            {phase !== 'completed' && courseNavigation && courseRoute && (
              <View style={styles.goalProgressContainer}>
                <View style={styles.goalProgressBarTrack}>
                  <View
                    style={[
                      styles.goalProgressBarFill,
                      {
                        width: `${courseNavigation.progressPercent}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.goalProgressLabel}>
                  코스 진행 · {metersToKm(courseNavigation.remainingDistanceMeters)} km 남음
                </Text>
                {/* Course nav chips — horizontal row below progress bar */}
                <View style={styles.courseNavRow}>
                  {courseNavigation.distanceToNextTurn >= 0 && courseNavigation.distanceToNextTurn <= 300 && (
                    <View style={styles.navStripTurn}>
                      <Ionicons
                        name={courseNavigation.nextTurnDirection.includes('left') ? 'arrow-back' : courseNavigation.nextTurnDirection.includes('right') ? 'arrow-forward' : 'arrow-up'}
                        size={12}
                        color={COLORS.white}
                      />
                      <Text style={styles.navStripTurnText}>
                        {Math.round(courseNavigation.distanceToNextTurn)}m {
                          courseNavigation.nextTurnDirection.includes('left') ? '좌회전' :
                          courseNavigation.nextTurnDirection.includes('right') ? '우회전' : '직진'
                        }
                      </Text>
                    </View>
                  )}
                  {courseNavigation.isOffCourse && (
                    <View style={[styles.navStripOffCourse, offCourseLevel >= 2 && { backgroundColor: '#CC0000' }]}>
                      <Ionicons name="warning" size={12} color={COLORS.white} />
                      <Text style={styles.navStripOffCourseText}>
                        {offCourseLevel >= 2
                          ? '코스 이탈 — 랭킹 미반영 중'
                          : offCourseLevel === 1
                            ? `코스 이탈 ${Math.round(courseNavigation.deviationMeters)}m · 코스로 복귀하세요`
                            : `코스 이탈 ${Math.round(courseNavigation.deviationMeters)}m`}
                      </Text>
                    </View>
                  )}
                  {cpJustPassed && (
                    <View style={styles.navStripCheckpoint}>
                      <Ionicons name="flag" size={12} color={COLORS.white} />
                      <Text style={styles.navStripCheckpointText}>
                        체크포인트 {cpJustPassed.order}/{cpJustPassed.total} 통과!
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Goal progress — only during active run */}
            {phase !== 'completed' && !runCourseId && goalProgress && (
              <View style={styles.goalProgressContainer}>
                <View style={styles.goalProgressBarTrack}>
                  <View
                    style={[
                      styles.goalProgressBarFill,
                      {
                        width: `${goalProgress.percent}%`,
                        backgroundColor: goalProgress.reached ? colors.success : colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.goalProgressLabel}>{goalProgress.label}</Text>
              </View>
            )}

            {/* Pace coaching card — inside panel for visibility */}
            {paceCoaching && (phase === 'running' || phase === 'paused') && !goalReachedShown && (
              <View style={[
                styles.paceCoachingCard,
                paceCoaching.status === 'ahead' && { backgroundColor: colors.success + '18', borderColor: colors.success + '55' },
                paceCoaching.status === 'on_pace' && { backgroundColor: colors.primary + '18', borderColor: colors.primary + '55' },
                paceCoaching.status === 'behind' && { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' },
                paceCoaching.status === 'critical' && { backgroundColor: colors.error + '18', borderColor: colors.error + '55' },
              ]}>
                <View style={styles.paceCoachingTop}>
                  <Ionicons
                    name={paceCoaching.timeDelta >= 0 ? 'caret-up' : 'caret-down'}
                    size={18}
                    color={
                      paceCoaching.status === 'ahead' ? colors.success :
                      paceCoaching.status === 'on_pace' ? colors.primary :
                      paceCoaching.status === 'behind' ? colors.warning : colors.error
                    }
                  />
                  <Text style={[
                    styles.paceCoachingDelta,
                    paceCoaching.status === 'ahead' && { color: colors.success },
                    paceCoaching.status === 'on_pace' && { color: colors.primary },
                    paceCoaching.status === 'behind' && { color: colors.warning },
                    paceCoaching.status === 'critical' && { color: colors.error },
                  ]}>
                    {paceCoaching.timeDelta >= 0 ? '+' : '-'}{Math.abs(Math.round(paceCoaching.timeDelta))}초
                  </Text>
                  <Text style={styles.paceCoachingStatus}>
                    {paceCoaching.status === 'ahead' ? '여유' :
                     paceCoaching.status === 'on_pace' ? '유지 중' :
                     paceCoaching.status === 'behind' ? '느림' : '위험'}
                  </Text>
                </View>
                <View style={styles.paceCoachingBottom}>
                  <Text style={styles.paceCoachingPaceLabel}>목표</Text>
                  <Text style={styles.paceCoachingPaceValue}>{formatPace(paceCoaching.requiredPace)}</Text>
                  <View style={styles.paceCoachingPaceDivider} />
                  <Text style={styles.paceCoachingPaceLabel}>현재</Text>
                  <Text style={[
                    styles.paceCoachingPaceValue,
                    (paceCoaching.status === 'behind' || paceCoaching.status === 'critical') && { color: colors.error },
                  ]}>{formatPace(paceCoaching.currentPace)}</Text>
                </View>
              </View>
            )}

            {/* Metrics grid */}
            <View style={styles.runMetricsGrid}>
              <View style={styles.runMetricRow}>
                <View style={styles.runMetricCell}>
                  <Text style={styles.runMetricLabel}>
                    {intervalState && !intervalState.isCompleted ? '남은 시간' : '시간'}
                  </Text>
                  <Text style={[styles.runMetricValue, (phase === 'paused' || isAutoPaused) && { color: '#FFD60A' }]}>
                    {intervalState && !intervalState.isCompleted
                      ? formatDuration(intervalState.totalRemainingSeconds)
                      : formatDuration(durationSeconds)}
                  </Text>
                </View>
                <View style={styles.runMetricDivider} />
                <View style={styles.runMetricCell}>
                  <Text style={styles.runMetricLabel}>평균 페이스</Text>
                  <Text style={styles.runMetricValue}>{formatPace(avgPaceSecondsPerKm)}</Text>
                </View>
                <View style={styles.runMetricDivider} />
                <View style={styles.runMetricCell}>
                  <Text style={styles.runMetricLabel}>칼로리</Text>
                  <Text style={styles.runMetricValue}>{calories}</Text>
                </View>
              </View>
              <View style={styles.runMetricRowDivider} />
              <View style={styles.runMetricRow}>
                <View style={styles.runMetricCell}>
                  <Text style={styles.runMetricLabel}>심박수</Text>
                  <Text style={[styles.runMetricValue, heartRate > 0 && { color: colors.error }]}>
                    {heartRate > 0 ? Math.round(heartRate) : '--'}
                  </Text>
                </View>
                <View style={styles.runMetricDivider} />
                <View style={styles.runMetricCell}>
                  <Text style={styles.runMetricLabel}>케이던스</Text>
                  <Text style={styles.runMetricValue}>{cadence > 0 ? cadence : '--'}</Text>
                </View>
                <View style={styles.runMetricDivider} />
                <View style={styles.runMetricCell}>
                  <Text style={styles.runMetricLabel}>고도(m)</Text>
                  <Text style={styles.runMetricValue}>
                    {elevationGainMeters > 0 ? `+${Math.round(elevationGainMeters)}` : '--'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Interval summary — after completion */}
            {phase === 'completed' && storeRunGoal?.type === 'interval' && (() => {
              const runSec = storeRunGoal.intervalRunSeconds ?? 0;
              const walkSec = storeRunGoal.intervalWalkSeconds ?? 0;
              const sets = storeRunGoal.intervalSets ?? 0;
              const totalRunSec = runSec * sets;
              const totalWalkSec = walkSec * sets;
              return (
                <View style={styles.intervalSummary}>
                  <Text style={styles.intervalSummaryTitle}>인터벌 완료</Text>
                  <View style={styles.intervalSummaryRow}>
                    <View style={[styles.intervalSummaryDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.intervalSummaryLabel}>달리기</Text>
                    <Text style={styles.intervalSummaryValue}>
                      {formatIntervalSummaryTime(runSec)} × {sets} = {formatIntervalSummaryTime(totalRunSec)}
                    </Text>
                  </View>
                  <View style={styles.intervalSummaryRow}>
                    <View style={[styles.intervalSummaryDot, { backgroundColor: colors.success }]} />
                    <Text style={styles.intervalSummaryLabel}>걷기</Text>
                    <Text style={styles.intervalSummaryValue}>
                      {formatIntervalSummaryTime(walkSec)} × {sets} = {formatIntervalSummaryTime(totalWalkSec)}
                    </Text>
                  </View>
                  <View style={styles.intervalSummaryDivider} />
                  <View style={styles.intervalSummaryRow}>
                    <Text style={styles.intervalSummaryLabel}>총 운동</Text>
                    <Text style={[styles.intervalSummaryValue, { color: colors.primary }]}>
                      {sets}세트 · {formatIntervalSummaryTime(totalRunSec + totalWalkSec)}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Controls — during active run */}
            {(phase === 'running' || phase === 'paused') && (
              <View style={styles.runControls}>
                {phase === 'paused' ? (
                  <>
                    <TouchableOpacity
                      style={styles.runResumeBtn}
                      onPress={handleResume}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="play" size={28} color={colors.white} />
                      <Text style={styles.runResumeBtnLabel}>재개</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.runStopBtn}
                      onPressIn={handleStopPressIn}
                      onPressOut={handleStopPressOut}
                      activeOpacity={0.9}
                    >
                      {stopProgressVisible && (
                        <Animated.View style={[styles.stopProgress, {
                          transform: [{ scaleX: stopProgressAnim }],
                        }]} />
                      )}
                      <Ionicons name="stop" size={28} color={colors.white} />
                      <Text style={styles.runStopBtnLabel}>종료</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={styles.runPauseBtn} onPress={handlePause} activeOpacity={0.7}>
                      <Ionicons name="pause" size={28} color={colors.text} />
                      <Text style={styles.runPauseBtnLabel}>일시정지</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.runStopBtn}
                      onPressIn={handleStopPressIn}
                      onPressOut={handleStopPressOut}
                      activeOpacity={0.9}
                    >
                      {stopProgressVisible && (
                        <Animated.View style={[styles.stopProgress, {
                          transform: [{ scaleX: stopProgressAnim }],
                        }]} />
                      )}
                      <Ionicons name="stop" size={28} color={colors.white} />
                      <Text style={styles.runStopBtnLabel}>종료</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
            {/* Result actions — after completion */}
            {phase === 'completed' && (
              <>
                {resultUploading && (
                  <View style={styles.resultUploadStatus}>
                    <Text style={styles.resultUploadText}>기록 업로드 중...</Text>
                  </View>
                )}
                <View style={styles.resultActions}>
                  {!runCourseId && !courseRegistrationStarted && (
                    <TouchableOpacity
                      style={styles.resultCourseBtn}
                      onPress={() => {
                        if (distanceMeters < 500) {
                          Alert.alert('알림', '500m 이상 달려야 코스 등록이 가능합니다.');
                          return;
                        }
                        if (!resultRunRecordId) {
                          Alert.alert('알림', resultSavedLocally
                            ? '서버 업로드가 완료되지 않았습니다. 잠시 후 다시 시도해주세요.'
                            : '기록 업로드 중입니다. 잠시만 기다려주세요.');
                          return;
                        }
                        setCourseRegistrationStarted(true);
                        // Close result panel before navigating to course creation
                        handleCloseResult();
                        (navigation as any).navigate('CourseTab', {
                          screen: 'CourseCreate',
                          params: {
                            runRecordId: resultRunRecordId,
                            routePoints: runRoutePoints,
                            distanceMeters: Math.round(distanceMeters),
                            durationSeconds: Math.round(durationSeconds),
                            elevationGainMeters: Math.round(elevationGainMeters),
                            isLoop: loopDetected,
                          },
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="flag" size={18} color={colors.primary} />
                      <Text style={styles.resultCourseBtnText}>코스 등록</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.resultCloseBtn} onPress={handleCloseResult} activeOpacity={0.7}>
                    <Text style={styles.resultCloseBtnText}>닫기</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
        </>)}
      </Animated.View>

      {/* ===== Navigate-to-start floating card ===== */}
      {navigatingToStart && startCheckpoint && (
        <View style={styles.navFloatingCard}>
          <View style={styles.navFloatingTop}>
            <Ionicons
              name="flag"
              size={20}
              color={readyToStart ? colors.success : colors.primary}
            />
            <Text style={styles.navFloatingTitle}>
              {readyToStart ? t('world.arrivedAtStart') : t('world.navigateToStart')}
            </Text>
          </View>

          {!readyToStart && (
            <View style={styles.navFloatingBody}>
              {currentLocation && (
                <View style={{
                  transform: [{
                    rotate: `${((geoBearing(
                      { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
                      { latitude: startCheckpoint.lat, longitude: startCheckpoint.lng },
                    ) - (headingAnim ?? 0)) + 360) % 360}deg`,
                  }],
                }}>
                  <Ionicons name="navigate" size={28} color={colors.primary} />
                </View>
              )}
              <Text style={styles.navFloatingDistance}>
                {formatDistance(distanceToStartCP)}
              </Text>
            </View>
          )}

          <View style={styles.navFloatingActions}>
            <TouchableOpacity
              style={[
                styles.navFloatingStartBtn,
                { backgroundColor: readyToStart ? colors.primary : colors.border },
              ]}
              onPress={handleStartCompetition}
              disabled={!readyToStart}
              activeOpacity={0.85}
            >
              <Ionicons name="play" size={16} color={readyToStart ? COLORS.white : colors.textTertiary} />
              <Text style={[
                styles.navFloatingStartText,
                { color: readyToStart ? COLORS.white : colors.textTertiary },
              ]}>
                {t('world.startCompetition')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navFloatingCancelBtn}
              onPress={handleCancelNavigating}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ===== Screen lock overlay — blocks touches, centered unlock button ===== */}
      {screenLocked && (
        <View style={styles.lockOverlay}>
          <View style={styles.lockCenterArea}>
            <Ionicons name="lock-closed" size={32} color="rgba(255,255,255,0.7)" style={{ marginBottom: 16 }} />
            <Text style={styles.lockTitle}>화면 잠금</Text>
            <Text style={styles.lockSubtitle}>터치 오작동을 방지합니다</Text>
            <TouchableOpacity
              style={styles.lockUnlockBtn}
              onPressIn={handleLockPressIn}
              onPressOut={handleLockPressOut}
              activeOpacity={0.9}
            >
              <Animated.View
                style={[
                  styles.lockUnlockProgress,
                  {
                    width: lockProgressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
              <Ionicons name="lock-open-outline" size={18} color="#FFFFFF" />
              <Text style={styles.lockUnlockText}>꾹 눌러서 잠금 해제</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Recenter button removed — map always follows user */}

      {/* ===== SHEETS (always available) ===== */}
      <RunGoalSheet
        visible={goalSheetVisible}
        onClose={() => setGoalSheetVisible(false)}
        goal={runGoal}
        onGoalChange={setRunGoal}
      />
      <RunSettingsSheet
        visible={settingsSheetVisible}
        onClose={() => setSettingsSheetVisible(false)}
        onNavigateWatch={() => navigation.navigate('WatchSettings')}
        onNavigateHeartRate={() => navigation.navigate('HeartRateSettings')}
      />
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
  },

  // -- Top overlay --
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xxl,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 40) + SPACING.sm : SPACING.md,
    paddingBottom: SPACING.md,
  },
  // -- Weather widget --
  weatherWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    gap: 6,
    ...SHADOWS.sm,
  },
  weatherTemp: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
  },
  weatherDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: c.textSecondary,
  },
  weatherDivider: {
    width: 1,
    height: 12,
    backgroundColor: c.divider,
  },
  weatherDetail: {
    fontSize: 12,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // -- HUD overlay (top: course info) --
  hudTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  hudTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  hudBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudTitleArea: {
    flex: 1,
    gap: 6,
  },
  hudTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  hudDiffBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.full,
  },
  hudDiffText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.black,
  },
  hudTitle: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  hudStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  hudStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hudStatValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    fontVariant: ['tabular-nums'],
  },

  hudDominionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  hudDominionLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  hudDominionText: {
    fontSize: FONT_SIZES.sm,
  },
  hudDominionCrew: {
    fontWeight: '800',
  },

  // -- HUD overlay (ranking) --
  hudRankingOverlay: {
    position: 'absolute' as const,
    bottom: Platform.OS === 'android' ? 160 : 115,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    zIndex: 50,
  },
  hudRankingBox: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: 6,
  },
  hudRankingHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingBottom: 4,
  },
  hudRankingTitle: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    fontWeight: '800' as const,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
  hudRankingColHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 2,
  },
  hudRankColLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center' as const,
  },
  // -- shared column widths --
  colBadge: { width: 22 },
  colName: { flex: 3 },
  colCrew: { flex: 2, textAlign: 'center' as const },
  colPace: { width: 48, textAlign: 'right' as const },
  colTime: { width: 48, textAlign: 'right' as const },
  // --
  hudRankingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 2,
  },
  hudRankNum: {
    fontSize: 13,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  hudRankAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  hudRankAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  hudRankNickname: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600' as const,
    color: COLORS.white,
  },
  hudRankCrew: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500' as const,
    color: 'rgba(255,255,255,0.5)',
  },
  hudRankPace: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700' as const,
    color: COLORS.primary,
    fontVariant: ['tabular-nums' as const],
  },
  hudRankDuration: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.6)',
    fontVariant: ['tabular-nums' as const],
  },

  // -- HUD overlay (bottom: actions) --
  hudBottomOverlay: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 64 : 24,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    zIndex: 50,
  },
  hudActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  hudDistanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    marginBottom: SPACING.sm,
  },
  hudDistanceText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#FF9500',
  },
  hudDetailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.55)',
    gap: SPACING.xs,
  },
  hudDetailText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.black,
  },
  hudRunBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    gap: SPACING.xs,
  },
  hudRunBtnDisabled: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    gap: SPACING.xs,
  },
  hudRunText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  hudRunTextDisabled: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
  },

  // -- Right controls --
  // (rightControls / myLocationButton removed — unified into recenterContainer)

  // -- Nearest course pill --

  // ============================================================
  // COUNTDOWN OVERLAY
  // ============================================================
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 100,
  },
  countdownContent: {
    alignItems: 'center',
    gap: SPACING.xl,
  },
  countdownLabel: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.white,
  },
  countdownNumber: {
    fontSize: 160,
    fontWeight: '900',
    color: COLORS.white,
    fontVariant: ['tabular-nums'],
    lineHeight: 180,
  },
  countdownBarTrack: {
    width: 220,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: SPACING.lg,
  },
  countdownBarFill: {
    height: '100%',
    backgroundColor: c.primary,
    borderRadius: 2,
  },

  // ============================================================
  // RUNNING HUD
  // ============================================================
  runTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 60,
  },
  runTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  gpsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    ...SHADOWS.sm,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gpsChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textSecondary,
  },
  modeChip: {
    backgroundColor: c.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    ...SHADOWS.sm,
  },
  modeChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textSecondary,
  },
  watchChip: {
    padding: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: c.card,
    ...SHADOWS.sm,
  },

  // Re-center button
  recenterContainer: {
    position: 'absolute',
    top: 160,
    right: SPACING.xl,
    zIndex: 60,
  },
  recenterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },

  // Run FAB (below recenter)
  fabRun: {
    position: 'absolute',
    top: 210,
    right: SPACING.xl,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 95,
    ...SHADOWS.md,
  },

  // Banners
  pausedBanner: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFD60A',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 60,
  },
  pausedText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },
  intervalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
    marginBottom: SPACING.sm,
  },
  intervalPhaseLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: Platform.OS === 'android' ? 0.8 : 1.5,
  },
  intervalTimer: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.white,
    fontVariant: ['tabular-nums'] as const,
  },
  intervalSetInfo: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  intervalSummary: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    gap: 10,
  },
  intervalSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: c.text,
    marginBottom: 2,
  },
  intervalSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  intervalSummaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  intervalSummaryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: c.textSecondary,
    flex: 1,
  },
  intervalSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
  },
  intervalSummaryDivider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 2,
  },
  goalReachedBanner: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: c.success,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    zIndex: 60,
    ...SHADOWS.md,
  },
  goalReachedText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  paceCoachingCard: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  paceCoachingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  paceCoachingDelta: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '900',
  },
  paceCoachingStatus: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  paceCoachingBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  paceCoachingPaceLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  paceCoachingPaceValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.text,
  },
  paceCoachingPaceDivider: {
    width: 1,
    height: 14,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.xs,
  },
  loopBanner: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: c.success,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    zIndex: 60,
  },
  loopBannerText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  approachBanner: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: c.card,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: c.primary,
    zIndex: 60,
  },
  approachBannerText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
    fontVariant: ['tabular-nums'] as const,
  },

  // Course nav row — horizontal chips below progress bar in panel
  courseNavRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  navStripOffCourse: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: c.error,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  navStripOffCourseText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  navStripTurn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: c.primary,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  navStripTurnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  navStripProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    paddingVertical: 4,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    ...SHADOWS.sm,
  },
  navStripProgressText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textSecondary,
  },
  navStripCheckpoint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: COLORS.success,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  navStripCheckpointText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
  },

  // -- Bottom running panel --
  runPanel: {
    position: 'absolute',
    bottom: -40,
    left: 0,
    right: 0,
    backgroundColor: c.card,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingBottom: (Platform.OS === 'ios' ? 24 : SPACING.lg) + 40,
    paddingHorizontal: SPACING.xl,
    ...SHADOWS.lg,
    zIndex: 60,
    minHeight: 340,
  },
  runHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
  },
  runHeroValue: {
    fontSize: 56,
    fontWeight: '900',
    color: c.text,
    fontVariant: ['tabular-nums'],
    lineHeight: 64,
  },
  runHeroUnit: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: c.textSecondary,
  },

  // Goal progress
  goalProgressContainer: {
    marginTop: SPACING.sm,
    gap: 4,
  },
  goalProgressBarTrack: {
    height: 6,
    backgroundColor: c.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  goalProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  goalProgressLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textSecondary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // Metrics grid
  runMetricsGrid: {
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    marginTop: SPACING.md,
  },
  runMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  runMetricRowDivider: {
    height: 1,
    backgroundColor: c.divider,
    marginHorizontal: SPACING.md,
  },
  runMetricCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  runMetricLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textSecondary,
  },
  runMetricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  runMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: c.divider,
  },

  // Controls
  runControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xxl,
    marginTop: SPACING.lg,
    minHeight: 90,
  },
  runPauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  runPauseBtnLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
    fontWeight: '600',
  },
  runResumeBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.primary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  runResumeBtnLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.white,
    fontWeight: '700',
  },
  runStopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    gap: SPACING.xs,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  runStopBtnLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.white,
    fontWeight: '700',
  },
  stopProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    transformOrigin: 'left',
  },
  stopHintContainer: {
    position: 'absolute',
    bottom: 280,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 24,
    zIndex: 999,
  },
  stopHintText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },

  // Screen lock
  lockBtn: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockCenterArea: {
    alignItems: 'center',
  },
  lockTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  lockSubtitle: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 28,
  },
  lockUnlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    overflow: 'hidden',
    minWidth: 200,
  },
  lockUnlockProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: c.primary,
    borderRadius: 28,
  },
  lockUnlockText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },

  // Recenter button during running
  runRecenterBtn: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    ...SHADOWS.md,
  },

  // ============================================================
  // RESULT SUMMARY (completed phase)
  // ============================================================
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  resultTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '900',
    color: c.text,
  },
  resultUploadStatus: {
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  resultUploadText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
  },
  resultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    minHeight: 90,
  },
  resultCourseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.primary,
  },
  resultCourseBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.primary,
  },
  resultCloseBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: c.primary,
  },
  resultCloseBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Navigate-to-start floating card
  navFloatingCard: {
    position: 'absolute',
    bottom: 100,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.lg,
    zIndex: 70,
  },
  navFloatingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  navFloatingTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    flex: 1,
  },
  navFloatingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  navFloatingDistance: {
    fontSize: 32,
    fontWeight: '900',
    color: c.text,
    fontVariant: ['tabular-nums'] as any,
  },
  navFloatingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  navFloatingStartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  navFloatingStartText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  navFloatingCancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tourBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: c.card,
    ...SHADOWS.sm,
  },
  tourBackText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
});

