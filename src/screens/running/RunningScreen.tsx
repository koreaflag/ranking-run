import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  StatusBar,
  Animated,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '../../lib/icons';
import * as Haptics from 'expo-haptics';
import { useRunningStore, RunningPhase } from '../../stores/runningStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useGPSTracker } from '../../hooks/useGPSTracker';
import { useRunTimer } from '../../hooks/useRunTimer';
import { useWatchCompanion } from '../../hooks/useWatchCompanion';
import { useCourseNavigation } from '../../hooks/useCourseNavigation';
import { useVoiceGuidance } from '../../hooks/useVoiceGuidance';
import { turnDirectionIcon, formatTurnInstruction } from '../../utils/navigationHelpers';
import { courseService } from '../../services/courseService';
import { runService } from '../../services/runService';
import RouteMapView from '../../components/map/RouteMapView';
import type { RouteMapViewHandle } from '../../components/map/RouteMapView';
import { useCompassHeading } from '../../hooks/useCompassHeading';
import { useCheckpointTracker } from '../../hooks/useCheckpointTracker';
import { useLiveActivity } from '../../hooks/useLiveActivity';
import { useRunningChunkUpload } from '../../hooks/useRunningChunkUpload';
import { useRunningSessionPersistence } from '../../hooks/useRunningSessionPersistence';
import { usePaceCoaching } from '../../hooks/usePaceCoaching';
import { useIntervalTraining } from '../../hooks/useIntervalTraining';
import { useTheme } from '../../hooks/useTheme';
import SplitHistoryPanel from '../../components/running/SplitHistoryPanel';
import i18n from '../../i18n';
import type { ThemeColors } from '../../utils/constants';
import type { WorldStackParamList } from '../../types/navigation';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { metersToKm, formatDuration, formatPace } from '../../utils/format';

type RunningNav = NativeStackNavigationProp<WorldStackParamList, 'RunningMain'>;
type RunningRoute = RouteProp<WorldStackParamList, 'RunningMain'>;

export default function RunningScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RunningNav>();
  const route = useRoute<RunningRoute>();
  const [dismissedCourse, setDismissedCourse] = useState(false);
  const courseId = dismissedCourse ? null : (route.params?.courseId ?? null);
  const [courseRoute, setCourseRoute] = useState<Array<{ latitude: number; longitude: number }> | null>(null);
  const [courseElevationProfile, setCourseElevationProfile] = useState<number[] | null>(null);
  const [courseCheckpoints, setCourseCheckpoints] = useState<import('../../types/api').CourseCheckpoint[] | null>(null);

  const {
    phase,
    sessionId,
    distanceMeters,
    durationSeconds,
    currentPaceSecondsPerKm,
    avgPaceSecondsPerKm,
    gpsStatus,
    gpsAccuracy,
    distanceSource,
    routePoints,
    calories,
    heartRate,
    cadence,
    elevationGainMeters,
    watchConnected,
    currentLocation,
    isApproachingStart,
    isNearStart,
    loopDetected,
    distanceToStart,
    isAutoPaused,
    speedAnomalyDetected,
    runGoal,
    splits,
    startSession,
    updateSessionId,
    pause,
    resume,
    complete,
    reset,
    setPhase,
    setCheckpointPasses,
    addDeviationPoint,
    snappedRoutePoints,
    addSnappedPoint,
  } = useRunningStore();

  // Only use GPS course heading when actually moving. When stationary, magnetometer
  // heading shows PHONE direction (not user direction), so hide the cone entirely.
  const isMoving = (currentLocation?.speed ?? 0) > 0.5; // > 0.5 m/s
  const { heading: headingValue } = useCompassHeading(100, isMoving ? (currentLocation?.bearing ?? null) : null);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  // Read persisted location synchronously — available instantly at mount time,
  // unlike getLastKnownPositionAsync which is async and arrives too late.
  const persistedLocation = useSettingsStore((s) => s.lastKnownLocation);

  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mapRef = useRef<RouteMapViewHandle>(null);
  const [followUser, setFollowUser] = useState(true);

  const { hapticFeedback, countdownSeconds, voiceGuidance, setVoiceGuidance } = useSettingsStore();
  const { startTracking, stopTracking, pauseTracking, resumeTracking } =
    useGPSTracker();
  useRunTimer();
  useLiveActivity();
  useRunningChunkUpload();
  useRunningSessionPersistence();

  // Pace coaching (program goal only)
  const paceCoaching = usePaceCoaching({
    enabled: runGoal?.type === 'program',
    targetDistance: runGoal?.type === 'program' ? (runGoal.value ?? 0) : 0,
    targetTime: runGoal?.type === 'program' ? (runGoal.targetTime ?? 0) : 0,
    currentDistance: distanceMeters,
    elapsedTime: durationSeconds,
    avgPace: avgPaceSecondsPerKm,
    phase,
    splits,
  });

  // Interval training
  const intervalState = useIntervalTraining({
    enabled: runGoal?.type === 'interval',
    runSeconds: runGoal?.intervalRunSeconds ?? 0,
    walkSeconds: runGoal?.intervalWalkSeconds ?? 0,
    sets: runGoal?.intervalSets ?? 0,
    elapsedSeconds: durationSeconds,
    phase,
  });

  // Metronome auto-start/stop
  const [metronomeMuted, setMetronomeMuted] = useState(false);
  const MetronomeModule = NativeModules.MetronomeModule;

  useEffect(() => {
    if (!MetronomeModule) return;
    const bpm = runGoal?.type === 'program' ? (runGoal.cadenceBPM ?? 0) : 0;

    if (phase === 'running' && bpm > 0 && !metronomeMuted) {
      MetronomeModule.start(bpm);
    } else {
      MetronomeModule.stop();
    }
    return () => { MetronomeModule.stop(); };
  }, [phase, runGoal?.type, runGoal?.cadenceBPM, metronomeMuted]); // eslint-disable-line react-hooks/exhaustive-deps

  const [countdown, setCountdown] = useState<number | null>(null);
  const [loopHapticFired, setLoopHapticFired] = useState(false);
  const [splitPanelExpanded, setSplitPanelExpanded] = useState(false);

  // Haptic feedback on loop detection (free running only)
  useEffect(() => {
    if (loopDetected && !loopHapticFired && !courseId && hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLoopHapticFired(true);
    }
    if (!loopDetected && loopHapticFired) {
      setLoopHapticFired(false);
    }
  }, [loopDetected, loopHapticFired, courseId, hapticFeedback]);

  // Reset stale state from previous run on mount — but only when this screen
  // is actually focused. When watch sync navigates directly to RunResult,
  // RunningMain mounts in the background; resetting here would wipe the data
  // that RunResult is displaying.
  useEffect(() => {
    if (phase === 'completed') {
      const timer = setTimeout(() => {
        const { phase: currentPhase } = useRunningStore.getState();
        if (currentPhase === 'completed' && navigation.isFocused()) {
          reset();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register server session for watch-initiated runs (GPS already started natively)
  useEffect(() => {
    if (phase === 'running' && sessionId?.startsWith('watch-')) {
      runService.createSession({
        course_id: null,
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
        console.warn('[RunningScreen] 세션 생성 실패:', err);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Speed anomaly: warn user and stop the run
  const speedAnomalyHandledRef = useRef(false);
  useEffect(() => {
    if (!speedAnomalyDetected || speedAnomalyHandledRef.current) return;
    speedAnomalyHandledRef.current = true;

    Alert.alert(
      t('running.speedAnomaly.title'),
      t('running.speedAnomaly.message'),
      [
        {
          text: t('running.speedAnomaly.stop'),
          style: 'destructive',
          onPress: async () => {
            await stopTracking();
            complete();
            const currentSessionId = useRunningStore.getState().sessionId;
            if (currentSessionId) {
              navigation.replace('RunResult', { sessionId: currentSessionId });
            }
          },
        },
      ],
      { cancelable: false },
    );
  }, [speedAnomalyDetected, stopTracking, complete, navigation, t]);

  // Prevent accidental back navigation during active running
  const isRunActive = phase === 'running' || phase === 'paused' || phase === 'countdown';
  useEffect(() => {
    if (!isRunActive) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert(
        t('running.exitTitle'),
        t('running.exitMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('running.exitConfirm'),
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, isRunActive, t]);

  // Track user location from store for custom map marker
  useEffect(() => {
    if (currentLocation) {
      setMyLocation({ latitude: currentLocation.latitude, longitude: currentLocation.longitude });
    }
  }, [currentLocation]);

  // Fetch course route + checkpoints for navigation overlay
  useEffect(() => {
    if (!courseId) {
      setCourseRoute(null);
      setCourseCheckpoints(null);
      return;
    }
    courseService.getCourseDetail(courseId).then((detail) => {
      const points = detail.route_geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));
      setCourseRoute(points);
      setCourseCheckpoints((detail as any).checkpoints ?? null);
      setCourseElevationProfile(detail.elevation_profile?.length ? detail.elevation_profile : null);
    }).catch(() => {
      setCourseRoute(null);
      setCourseCheckpoints(null);
      setCourseElevationProfile(null);
    });
  }, [courseId]);

  // Course navigation hook
  const navLocation = currentLocation
    ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude }
    : null;
  const courseNavigation = useCourseNavigation(
    courseRoute,
    navLocation,
    currentLocation?.bearing ?? 0,
    gpsAccuracy,
  );

  // Checkpoint tracker
  const {
    passedCount: cpPassedCount,
    totalCount: cpTotalCount,
    checkpointPasses,
    markerData: cpMarkerData,
    justPassed: cpJustPassed,
    updateLocation: cpUpdateLocation,
  } = useCheckpointTracker(courseCheckpoints);

  // Feed GPS updates to checkpoint tracker
  useEffect(() => {
    if (currentLocation && phase === 'running' && courseId) {
      cpUpdateLocation(currentLocation.latitude, currentLocation.longitude);
    }
  }, [currentLocation, phase, courseId, cpUpdateLocation]);

  // Log deviation for result screen visualization
  useEffect(() => {
    if (courseNavigation && courseId && phase === 'running') {
      addDeviationPoint(routePoints.length - 1, courseNavigation.deviationMeters);
    }
  }, [courseNavigation, routePoints.length, courseId, phase, addDeviationPoint]);

  // Collect snapped route points during course running
  useEffect(() => {
    if (courseNavigation && courseId && phase === 'running') {
      const pos = courseNavigation.snappedPosition;
      if (pos) {
        // On-course: use snapped position
        addSnappedPoint(pos);
      } else if (currentLocation) {
        // Off-course: fall back to real GPS
        addSnappedPoint({ latitude: currentLocation.latitude, longitude: currentLocation.longitude });
      }
    }
  }, [courseNavigation, currentLocation, courseId, phase, addSnappedPoint]);

  // Countdown before starting
  const handleStart = useCallback(async () => {
    setPhase('countdown');
    setCountdown(countdownSeconds);

    // Capture timestamp in JS — exactly when the phone starts showing "3".
    // Pass to native so the watch calculates from this same moment,
    // eliminating RN bridge latency from the sync equation.
    const countdownStartedAt = Date.now();
    try {
      if (Platform.OS === 'ios' && NativeModules.GPSTrackerModule?.notifyCountdownStart) {
        NativeModules.GPSTrackerModule.notifyCountdownStart(countdownSeconds, countdownStartedAt).catch((err: any) => {
          console.warn('[RunningScreen] 카운트다운 알림 실패:', err);
        });
      }
    } catch (err) {
      console.warn('[RunningScreen] 카운트다운 네이티브 호출 실패:', err);
    }

    await new Promise<void>((resolve) => {
      let remaining = countdownSeconds;
      setCountdown(remaining);
      if (hapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const timer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(timer);
          setCountdown(null);
          resolve();
        } else {
          setCountdown(remaining);
          if (hapticFeedback) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }
      }, 1000);
    });

    // Start GPS tracking with a local session ID first, then try to get
    // a server session ID with a 3-second timeout. Network latency must
    // never block the running experience.
    const localSessionId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    startSession(localSessionId, courseId);
    await startTracking();

    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Register session on server with timeout — update session ID if successful.
    // This ensures chunks and completion use the same (server) ID when possible.
    const sessionPromise = runService.createSession({
      course_id: courseId,
      started_at: new Date().toISOString(),
      device_info: {
        platform: Platform.OS as 'android' | 'ios',
        os_version: Platform.Version.toString(),
        device_model: 'Unknown',
        app_version: '1.0.0',
      },
    });
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));

    Promise.race([sessionPromise, timeoutPromise]).then((response) => {
      if (response?.session_id) {
        updateSessionId(response.session_id);
      }
    }).catch(() => {
      // Server unreachable — local session ID stays as fallback
    });
  }, [
    courseId,
    countdownSeconds,
    hapticFeedback,
    setPhase,
    startSession,
    updateSessionId,
    startTracking,
  ]);

  const handlePause = useCallback(async () => {
    pause();
    await pauseTracking();
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [pause, pauseTracking, hapticFeedback]);

  const handleResume = useCallback(async () => {
    resume();
    await resumeTracking();
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [resume, resumeTracking, hapticFeedback]);

  const handleStop = useCallback(() => {
    Alert.alert(t('running.alerts.stopTitle'), t('running.alerts.stopMsg'), [
      { text: t('running.alerts.continueRunning'), style: 'cancel' },
      {
        text: t('running.controls.stop'),
        style: 'destructive',
        onPress: async () => {
          // Save checkpoint passes before completing
          if (checkpointPasses.length > 0) {
            setCheckpointPasses(checkpointPasses);
          }
          await stopTracking();

          // Read sessionId BEFORE complete() to navigate immediately
          // and avoid a flash from phase→completed re-render
          const currentSessionId = useRunningStore.getState().sessionId;
          complete();

          if (hapticFeedback) {
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          }

          if (currentSessionId) {
            navigation.replace('RunResult', { sessionId: currentSessionId });
          }
        },
      },
    ]);
  }, [stopTracking, complete, hapticFeedback, navigation, checkpointPasses, setCheckpointPasses, t]);

  // Watch stop (no confirmation — user already tapped stop on Watch)
  const handleWatchStop = useCallback(async () => {
    if (checkpointPasses.length > 0) {
      setCheckpointPasses(checkpointPasses);
    }
    await stopTracking();
    complete();
    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    // Read sessionId from store at action time to avoid stale closure
    const currentSessionId = useRunningStore.getState().sessionId;
    if (currentSessionId) {
      navigation.replace('RunResult', { sessionId: currentSessionId });
    }
  }, [stopTracking, complete, hapticFeedback, navigation, checkpointPasses, setCheckpointPasses]);

  // Watch companion
  useWatchCompanion({
    onPauseCommand: handlePause,
    onResumeCommand: handleResume,
    onStopCommand: handleWatchStop,
  }, courseNavigation, {
    passedCount: cpPassedCount,
    totalCount: cpTotalCount,
    justPassed: !!cpJustPassed,
  });

  // Auto-finish when goal is reached (distance or time)
  const goalAutoFinishedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'running' || goalAutoFinishedRef.current) return;
    if (!runGoal?.type || !runGoal?.value) return;

    let reached = false;
    if (runGoal.type === 'distance' && distanceMeters >= runGoal.value) {
      reached = true;
    } else if (runGoal.type === 'time' && durationSeconds >= runGoal.value) {
      reached = true;
    } else if (runGoal.type === 'program' && distanceMeters >= runGoal.value) {
      reached = true;
    } else if (runGoal.type === 'interval' && intervalState?.isCompleted) {
      reached = true;
    }

    if (reached) {
      goalAutoFinishedRef.current = true;
      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Goal running: auto-finish immediately (no "continue" option)
      (async () => {
        if (checkpointPasses.length > 0) {
          setCheckpointPasses(checkpointPasses);
        }
        await stopTracking();
        complete();
        const currentSessionId = useRunningStore.getState().sessionId;
        if (currentSessionId) {
          navigation.replace('RunResult', { sessionId: currentSessionId });
        }
      })();
    }
  }, [phase, runGoal, distanceMeters, durationSeconds, hapticFeedback, stopTracking, complete, navigation, checkpointPasses, setCheckpointPasses, t, intervalState?.isCompleted]);

  // Voice guidance for course navigation + program goal pace coaching
  const paceCoachingTTSMessage: string | null = paceCoaching
    ? (() => {
        const absDelta = Math.abs(Math.round(paceCoaching.timeDelta));
        switch (paceCoaching.status) {
          case 'ahead': return String(i18n.t('voice.paceAhead', { seconds: absDelta }));
          case 'on_pace': return String(i18n.t('voice.paceOnTrack'));
          case 'behind': return String(i18n.t('voice.paceBehind', { seconds: absDelta }));
          case 'critical': return String(i18n.t('voice.paceCritical'));
        }
      })()
    : null;

  useVoiceGuidance({
    navigation: courseNavigation,
    distanceMeters,
    phase,
    enabled: voiceGuidance && (!!courseId || runGoal?.type === 'program'),
    paceCoachingMessage: paceCoachingTTSMessage,
    offCourseLevel: 0,
    elevationProfile: courseElevationProfile,
  });

  // Cleanup on unmount only — stop GPS if still running when user navigates away.
  // IMPORTANT: Must use refs, NOT state in deps. With phase in the dependency array,
  // the cleanup fires on every phase change (e.g. running→paused), which calls
  // stopTracking() and sends "completed" to the watch mid-run.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const stopTrackingRef = useRef(stopTracking);
  stopTrackingRef.current = stopTracking;

  // No pre-warm on tab entry — startWatchApp(with:) turns on the watch screen.
  // Watch launches when START is pressed (countdown phase triggers launchWatchApp).
  // Timestamp-based CountdownView compensates for the ~1s launch delay.
  useEffect(() => {
    return () => {
      if (phaseRef.current === 'running' || phaseRef.current === 'paused') {
        stopTrackingRef.current();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Render based on phase ----

  if (phase === 'idle') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={colors.statusBar} />
        <IdleView
          courseId={courseId}
          gpsStatus={gpsStatus}
          gpsAccuracy={useRunningStore.getState().gpsAccuracy}
          onStart={handleStart}
          onDismissCourse={() => setDismissedCourse(true)}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'countdown') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={colors.statusBar} />
        <View style={styles.countdownContainer}>
          <Text style={styles.countdownLabel}>{t('running.countdown.ready')}</Text>
          <Text style={styles.countdownNumber}>{countdown ?? countdownSeconds}</Text>
          <View style={styles.countdownBarTrack}>
            <View
              style={[
                styles.countdownBarFill,
                { width: `${((countdownSeconds - (countdown ?? countdownSeconds) + 1) / countdownSeconds) * 100}%` },
              ]}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Memoize map props to prevent unnecessary RouteMapView re-renders
  const mapCustomUserLocation = useMemo(() => {
    if (courseId && courseNavigation?.snappedPosition) return courseNavigation.snappedPosition;
    return myLocation ?? persistedLocation ?? undefined;
  }, [courseId, courseNavigation?.snappedPosition, myLocation, persistedLocation]);

  const mapRoutePoints = useMemo(() => {
    return courseId && snappedRoutePoints.length > 0 ? snappedRoutePoints : routePoints;
  }, [courseId, snappedRoutePoints, routePoints]);

  const mapCheckpoints = useMemo(() => {
    return cpMarkerData.length > 0 ? cpMarkerData : undefined;
  }, [cpMarkerData]);

  // Don't change camera when phase='completed' — screen replaces immediately,
  // changing follow/pitch causes visible zoom/tilt jerk during transition.
  const mapFollowsUser = followUser;
  const mapFollowMode = "course" as const;
  const mapFollowPitch = 30;

  // During running, show live GPS accuracy instead of binary status
  const isIndoorMode = distanceSource === 'pedometer';
  const gpsDisabled = gpsStatus === 'disabled';
  const gpsColor = gpsDisabled
    ? colors.error
    : isIndoorMode
      ? colors.warning
      : gpsAccuracy != null && gpsAccuracy < 10
        ? colors.success
        : gpsAccuracy != null && gpsAccuracy < 25
          ? colors.warning
          : colors.error;
  const gpsLabel = gpsDisabled
    ? t('running.status.gpsPermissionNeeded')
    : isIndoorMode
      ? t('running.status.indoor')
      : gpsAccuracy != null
        ? `±${Math.round(gpsAccuracy)}m`
        : 'GPS';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={colors.statusBar} />
      <View style={styles.hudContainer}>
        {/* Top bar */}
        <View style={styles.hudTopBar}>
          <View style={styles.gpsChip}>
            <View style={[styles.gpsDot, { backgroundColor: gpsColor }]} />
            <Text style={styles.gpsChipText}>{gpsLabel}</Text>
          </View>
          <View style={styles.modeChip}>
            <Text style={styles.modeChipText}>
              {courseId ? t('running.status.courseRunning') : t('running.status.freeRunning')}
            </Text>
          </View>
          {watchConnected && (
            <View style={styles.watchChip}>
              <Ionicons name="watch-outline" size={12} color={colors.success} />
            </View>
          )}
          {runGoal?.type === 'program' && (runGoal.cadenceBPM ?? 0) > 0 && (
            <TouchableOpacity
              style={styles.metronomeChip}
              onPress={() => setMetronomeMuted(!metronomeMuted)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={metronomeMuted ? 'musical-note' : 'musical-notes'}
                size={12}
                color={metronomeMuted ? colors.textTertiary : colors.primary}
              />
              <Text style={[
                styles.metronomeChipText,
                !metronomeMuted && { color: colors.primary },
              ]}>
                {runGoal.cadenceBPM}
              </Text>
            </TouchableOpacity>
          )}
          {(courseId || runGoal?.type === 'program' || runGoal?.type === 'interval') && (
            <TouchableOpacity
              style={styles.voiceChip}
              onPress={() => setVoiceGuidance(!voiceGuidance)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={voiceGuidance ? 'volume-high' : 'volume-mute'}
                size={14}
                color={voiceGuidance ? colors.primary : colors.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Persistent course navigation bar — always visible during course running */}
        {courseNavigation && courseId && (
          <View style={styles.persistentNavBar}>
            <Ionicons
              name={turnDirectionIcon(courseNavigation.nextTurnDirection) as any}
              size={28}
              color={colors.primary}
            />
            <View style={styles.navBarCenter}>
              <Text style={styles.navBarDistance}>
                {courseNavigation.distanceToNextTurn >= 0
                  ? courseNavigation.distanceToNextTurn < 1000
                    ? `${Math.round(courseNavigation.distanceToNextTurn)}m`
                    : `${(courseNavigation.distanceToNextTurn / 1000).toFixed(1)}km`
                  : '--'}
              </Text>
              <Text style={styles.navBarInstruction} numberOfLines={1}>
                {courseNavigation.distanceToNextTurn >= 0
                  ? formatTurnInstruction(courseNavigation.distanceToNextTurn, courseNavigation.nextTurnDirection)
                  : t('running.nav.straightAhead')}
              </Text>
            </View>
            <Text style={styles.navBarRemaining}>
              {courseNavigation.instructionsRemaining}
            </Text>
          </View>
        )}

        {/* Mini Map — flex fills remaining space */}
        <View style={styles.miniMapContainer}>
          <RouteMapView
            ref={mapRef}
            routePoints={mapRoutePoints}
            hideRouteMarkers
            previewPolyline={courseRoute ?? undefined}
            checkpoints={mapCheckpoints}
            showUserLocation
            followsUserLocation={mapFollowsUser}
            followZoomLevel={16}
            followUserMode={mapFollowMode}
            followPitch={mapFollowPitch}
            interactive
            onUserMapInteraction={() => setFollowUser(false)}
            lastKnownLocation={persistedLocation ?? undefined}
            customUserLocation={mapCustomUserLocation}
            customUserHeading={headingValue}
            style={styles.miniMap}
          />

          {/* Paused Banner — absolute overlay to avoid resizing map */}
          {(phase === 'paused' || isAutoPaused) && (
            <View style={styles.pausedBanner}>
              <Ionicons name="pause" size={14} color="#000" />
              <Text style={styles.pausedText}>
                {isAutoPaused && phase !== 'paused' ? 'AUTO PAUSED' : 'PAUSED'}
              </Text>
            </View>
          )}

          {/* Recenter on my location button — visible when user pans away */}
          {!followUser && phase !== 'completed' && (
            <TouchableOpacity
              style={styles.miniMapLocateBtn}
              onPress={() => {
                const loc = myLocation ?? persistedLocation;
                if (loc) mapRef.current?.recenterOnUser(loc);
                setFollowUser(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="locate" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>

        {/* Off-course warning with return arrow */}
        {courseNavigation?.isOffCourse && (
          <View style={styles.offCourseBanner}>
            <View style={{
              transform: [{ rotate: `${((courseNavigation.bearingToCourse - (headingValue ?? 0) + 360) % 360)}deg` }],
            }}>
              <Ionicons name="navigate" size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1, marginLeft: 4 }}>
              <Text style={styles.offCourseText}>{t('running.status.offCourse')}</Text>
              <Text style={styles.offCourseDistText}>
                {Math.round(courseNavigation.deviationMeters)}m {t('running.status.fromCourse')}
              </Text>
            </View>
          </View>
        )}

        {/* Pace coaching banner (program goal) */}
        {paceCoaching && phase === 'running' && (
          <View style={[
            styles.paceCoachingBanner,
            paceCoaching.status === 'ahead' && { backgroundColor: colors.success + 'CC' },
            paceCoaching.status === 'on_pace' && { backgroundColor: colors.primary + 'CC' },
            paceCoaching.status === 'behind' && { backgroundColor: colors.warning + 'CC' },
            paceCoaching.status === 'critical' && { backgroundColor: colors.error + 'CC' },
          ]}>
            <Ionicons
              name={paceCoaching.timeDelta >= 0 ? 'arrow-up' : 'arrow-down'}
              size={16}
              color={colors.white}
            />
            <Text style={styles.paceCoachingText}>
              {paceCoaching.timeDelta >= 0
                ? `+${Math.abs(Math.round(paceCoaching.timeDelta))}s`
                : `-${Math.abs(Math.round(paceCoaching.timeDelta))}s`}
              {' · '}
              {formatPace(paceCoaching.requiredPace)} → {formatPace(paceCoaching.currentPace)}
            </Text>
          </View>
        )}

        {/* Interval training banner */}
        {intervalState && phase === 'running' && !intervalState.isCompleted && (
          <View style={[
            styles.paceCoachingBanner,
            { backgroundColor: intervalState.currentPhase === 'run' ? colors.primary + 'DD' : colors.success + 'DD' },
          ]}>
            <Ionicons
              name={intervalState.currentPhase === 'run' ? 'flash' : 'walk'}
              size={16}
              color={colors.white}
            />
            <Text style={styles.paceCoachingText}>
              {intervalState.currentPhase === 'run' ? t('running.interval.run') : t('running.interval.walk')}
              {' · '}
              {formatDuration(intervalState.phaseRemainingSeconds)}
            </Text>
            <Text style={[styles.paceCoachingText, { opacity: 0.8 }]}>
              {intervalState.currentSet}/{intervalState.totalSets}
            </Text>
          </View>
        )}

        {/* Checkpoint pass toast */}
        {cpJustPassed && (
          <View style={styles.checkpointBanner}>
            <Ionicons name="flag" size={16} color={colors.background} />
            <Text style={styles.checkpointBannerText}>
              {t('running.status.checkpointPassed', { order: cpJustPassed.order, total: cpJustPassed.total })}
            </Text>
          </View>
        )}

        {/* Loop detection banners (free running only, after 300m) */}
        {!courseId && loopDetected && distanceMeters >= 300 && (
          <View style={styles.loopArrivedBanner}>
            <Ionicons name="flag" size={16} color={colors.white} />
            <Text style={styles.loopArrivedText}>{t('running.status.loopComplete')}</Text>
          </View>
        )}
        {!courseId && isApproachingStart && !isNearStart && !loopDetected && distanceMeters >= 300 && (
          <View style={styles.loopApproachBanner}>
            <Ionicons name="navigate" size={16} color={colors.text} />
            <Text style={styles.loopApproachText}>
              {t('running.status.approachingStart', { distance: Math.round(distanceToStart) })}
            </Text>
          </View>
        )}

        {/* Hero Metric: Distance */}
        <View style={styles.heroSection}>
          <View style={styles.heroValueRow}>
            <Text style={styles.heroValue}>
              {metersToKm(distanceMeters)}
            </Text>
            <Text style={styles.heroUnit}>km</Text>
          </View>
        </View>

        {/* Course progress (course running only) */}
        {courseNavigation && courseRoute && (
          <View style={styles.courseProgressRow}>
            <Text style={styles.courseProgressLabel}>{t('running.status.courseProgressLabel')}</Text>
            <View style={styles.courseProgressBarTrack}>
              <View
                style={[
                  styles.courseProgressBarFill,
                  { width: `${Math.min(100, courseNavigation.progressPercent)}%` },
                ]}
              />
            </View>
            <Text style={styles.courseProgressText}>
              {t('running.status.courseProgress', { distance: metersToKm(courseNavigation.remainingDistanceMeters) })}
            </Text>
          </View>
        )}

        {/* Dashboard — 6 metrics in 2 rows */}
        <View style={styles.dashboardGrid}>
          <View style={styles.dashboardRow}>
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardLabel}>{t('running.metrics.time')}</Text>
              <Text style={[styles.dashboardValue, (phase === 'paused' || isAutoPaused) && { color: '#FFD60A' }]}>
                {formatDuration(durationSeconds)}
              </Text>
            </View>
            <View style={styles.dashboardDivider} />
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardLabel}>{t('running.metrics.avgPace')}</Text>
              <Text style={styles.dashboardValue}>
                {formatPace(avgPaceSecondsPerKm)}
              </Text>
            </View>
            <View style={styles.dashboardDivider} />
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardLabel}>{t('running.metrics.calories')}</Text>
              <Text style={styles.dashboardValue}>{calories}</Text>
            </View>
          </View>
          <View style={styles.dashboardRowDivider} />
          <View style={styles.dashboardRow}>
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardLabel}>{t('running.metrics.heartRate')}</Text>
              <Text style={[styles.dashboardValue, heartRate > 0 && { color: colors.error }]}>
                {heartRate > 0 ? Math.round(heartRate) : '--'}
              </Text>
            </View>
            <View style={styles.dashboardDivider} />
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardLabel}>{t('running.metrics.cadence')}</Text>
              <Text style={styles.dashboardValue}>
                {cadence > 0 ? cadence : '--'}
              </Text>
            </View>
            <View style={styles.dashboardDivider} />
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardLabel}>{t('running.metrics.elevation')}</Text>
              <Text style={styles.dashboardValue}>
                {elevationGainMeters > 0 ? `+${Math.round(elevationGainMeters)}` : '--'}
              </Text>
            </View>
          </View>
        </View>

        {/* Split history */}
        <SplitHistoryPanel
          splits={splits}
          expanded={splitPanelExpanded}
          onToggle={() => setSplitPanelExpanded(!splitPanelExpanded)}
        />

        {/* Controls */}
        <View style={styles.controls}>
          {phase === 'paused' ? (
            <>
              <TouchableOpacity
                style={styles.resumeButton}
                onPress={handleResume}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('running.controls.resume')}
              >
                <Ionicons name="play" size={28} color={colors.white} />
                <Text style={styles.resumeLabel}>{t('running.controls.resume')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStop}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('running.controls.stop')}
              >
                <Ionicons name="stop" size={28} color={colors.white} />
                <Text style={styles.stopLabel}>{t('running.controls.stop')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.pauseButton}
                onPress={handlePause}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('running.controls.pause')}
              >
                <Ionicons name="pause" size={28} color={colors.text} />
                <Text style={styles.pauseLabel}>{t('running.controls.pause')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStop}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('running.controls.stop')}
              >
                <Ionicons name="stop" size={28} color={colors.white} />
                <Text style={styles.stopLabel}>{t('running.controls.stop')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---- Idle View (Start screen) ----

function IdleView({
  courseId,
  gpsStatus,
  gpsAccuracy,
  onStart,
  onDismissCourse,
}: {
  courseId: string | null;
  gpsStatus: string;
  gpsAccuracy: number | null;
  onStart: () => void;
  onDismissCourse: () => void;
}) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // On idle screen, show GPS ready if native module exists
  const gpsColor = gpsStatus === 'disabled' ? colors.error
    : gpsAccuracy != null && gpsAccuracy < 10 ? colors.success
    : gpsAccuracy != null && gpsAccuracy < 25 ? colors.warning
    : colors.success;
  const gpsLabel = gpsStatus === 'disabled' ? t('running.status.gpsPermissionNeeded')
    : gpsAccuracy != null ? `GPS ±${Math.round(gpsAccuracy)}m`
    : t('running.status.gpsReady');

  const handleDismissCourse = () => {
    Alert.alert(
      t('running.alerts.switchToFreeTitle'),
      t('running.alerts.switchToFreeMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('running.alerts.switchBtn'), onPress: onDismissCourse },
      ],
    );
  };

  return (
    <View style={styles.idleContainer}>
      {/* Header */}
      <View style={styles.idleHeader}>
        {courseId ? (
          <TouchableOpacity
            style={styles.idleModeChip}
            onPress={handleDismissCourse}
            activeOpacity={0.7}
          >
            <Text style={styles.idleModeChipText}>{t('running.status.courseRunning')}</Text>
            <Ionicons name="close" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.idleModeLabel}>{t('running.status.freeRunning')}</Text>
        )}
        <Text style={styles.idleTitle}>
          {courseId
            ? t('running.idle.courseTitle')
            : t('running.idle.freeTitle')}
        </Text>
      </View>

      {/* GPS status chip + accuracy bar */}
      <View style={styles.gpsChipIdle}>
        <View style={[styles.gpsDot, { backgroundColor: gpsColor }]} />
        <Text style={styles.gpsChipText}>{gpsLabel}</Text>
      </View>
      {gpsAccuracy != null && (
        <View style={styles.gpsAccuracyRow}>
          <View style={styles.gpsAccuracyBarTrack}>
            <View style={[styles.gpsAccuracyBarFill, {
              width: `${Math.max(5, Math.min(100, (1 - gpsAccuracy / 50) * 100))}%`,
              backgroundColor: gpsAccuracy < 10 ? colors.success
                : gpsAccuracy < 25 ? colors.warning : colors.error,
            }]} />
          </View>
          <Text style={styles.gpsAccuracyLabel}>
            {gpsAccuracy < 10 ? t('running.gps.excellent')
              : gpsAccuracy < 25 ? t('running.gps.good')
              : t('running.gps.acquiring')}
          </Text>
        </View>
      )}

      {/* Large circular START button */}
      <TouchableOpacity
        style={styles.startButton}
        onPress={onStart}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('running.controls.start')}
      >
        <Text style={styles.startButtonText}>START</Text>
      </TouchableOpacity>

      <Text style={styles.idleTip}>
        {t('running.idle.tip')}
      </Text>
    </View>
  );
}

// ---- Styles (Theme-aware) ----

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },

  // ========================
  // IDLE SCREEN
  // ========================
  idleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.xxxl,
  },
  idleHeader: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  idleModeLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  idleModeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: c.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: c.divider,
  },
  idleModeChipText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  idleTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  gpsChipIdle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: c.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.full,
  },
  gpsAccuracyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    width: 200,
    marginTop: SPACING.xs,
  },
  gpsAccuracyBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.divider,
    overflow: 'hidden' as const,
  },
  gpsAccuracyBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  gpsAccuracyLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
    fontWeight: '600',
  },
  startButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: c.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
  },
  startButtonText: {
    fontSize: 36,
    fontWeight: '900',
    color: c.white,
    letterSpacing: 3,
  },
  idleTip: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    textAlign: 'center',
  },

  // ========================
  // COUNTDOWN
  // ========================
  countdownContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xl,
  },
  countdownLabel: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: c.textSecondary,
  },
  countdownNumber: {
    fontSize: 160,
    fontWeight: '900',
    color: c.text,
    fontVariant: ['tabular-nums'],
    lineHeight: 180,
  },
  countdownBarTrack: {
    width: 220,
    height: 4,
    backgroundColor: c.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: SPACING.lg,
  },
  countdownBarFill: {
    height: '100%',
    backgroundColor: c.primary,
    borderRadius: 2,
  },

  // ========================
  // RUNNING HUD
  // ========================
  hudContainer: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },

  // Top bar
  hudTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  gpsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
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
    backgroundColor: c.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
  },
  modeChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textSecondary,
  },
  watchChip: {
    padding: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: c.surface,
  },
  voiceChip: {
    padding: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: c.surface,
  },

  // Mini map
  miniMapContainer: {
    flex: 1,
    minHeight: 100,
    marginTop: SPACING.sm,
  },
  miniMap: {
    flex: 1,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  miniMapLocateBtn: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },

  // Paused banner
  pausedBanner: {
    position: 'absolute',
    bottom: SPACING.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFD60A',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pausedText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },

  // Hero distance
  heroSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  heroLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textSecondary,
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroValue: {
    fontSize: 72,
    fontWeight: '900',
    color: c.text,
    fontVariant: ['tabular-nums'],
    lineHeight: 80,
  },
  heroUnit: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: c.textSecondary,
  },

  // Dashboard grid (2 rows x 3 cols)
  dashboardGrid: {
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  dashboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  dashboardRowDivider: {
    height: 1,
    backgroundColor: c.divider,
    marginHorizontal: SPACING.lg,
  },
  dashboardCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  dashboardLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textSecondary,
  },
  dashboardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  dashboardUnit: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '400',
    color: c.textSecondary,
  },
  dashboardDivider: {
    width: 1,
    height: 32,
    backgroundColor: c.divider,
  },

  // Calories strip (unused, kept for compat)
  caloriesStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.md,
  },
  caloriesLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textSecondary,
  },
  caloriesValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  caloriesUnit: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '400',
    color: c.textSecondary,
  },

  // Controls
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xxl,
    paddingVertical: SPACING.md,
  },

  // Pause button
  pauseButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: c.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  pauseLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
    fontWeight: '600',
  },

  // Resume button
  resumeButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
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
  resumeLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.white,
    fontWeight: '700',
  },
  // Stop button
  stopButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: c.primary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  stopLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.white,
    fontWeight: '700',
  },

  // Persistent navigation bar
  persistentNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  navBarCenter: {
    flex: 1,
  },
  navBarDistance: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'] as const,
  },
  navBarInstruction: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    marginTop: 2,
  },
  navBarRemaining: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.textTertiary,
    minWidth: 20,
    textAlign: 'center',
  },

  // Off-course banner
  offCourseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: c.warning,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
  },
  offCourseText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
  },
  offCourseDistText: {
    fontSize: FONT_SIZES.xs,
    color: c.white + 'CC',
    marginTop: 1,
  },

  // Pace coaching banner
  paceCoachingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
  },
  paceCoachingText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
    fontVariant: ['tabular-nums'] as const,
  },

  // Metronome chip
  metronomeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: SPACING.xs + 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: c.surface,
  },
  metronomeChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: c.textSecondary,
    fontVariant: ['tabular-nums'] as const,
  },

  // Checkpoint pass banner
  checkpointBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: c.success,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
  },
  checkpointBannerText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: c.background,
    letterSpacing: 0.5,
  },

  // Loop detection banners
  loopArrivedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: c.success,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
  },
  loopArrivedText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
  },
  loopApproachBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: c.surface,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: c.primary,
  },
  loopApproachText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
    fontVariant: ['tabular-nums'] as const,
  },

  // Course progress
  courseProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.md,
  },
  courseProgressLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textSecondary,
  },
  courseProgressBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: c.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  courseProgressBarFill: {
    height: '100%',
    backgroundColor: c.primary,
    borderRadius: 2,
  },
  courseProgressText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textSecondary,
    fontVariant: ['tabular-nums'] as const,
  },
});
