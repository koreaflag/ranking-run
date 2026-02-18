import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
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
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { RunningStackParamList } from '../../types/navigation';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import { metersToKm, formatDuration, formatPace } from '../../utils/format';

type RunningNav = NativeStackNavigationProp<RunningStackParamList, 'RunningMain'>;
type RunningRoute = RouteProp<RunningStackParamList, 'RunningMain'>;

export default function RunningScreen() {
  const navigation = useNavigation<RunningNav>();
  const route = useRoute<RunningRoute>();
  const [dismissedCourse, setDismissedCourse] = useState(false);
  const courseId = dismissedCourse ? null : (route.params?.courseId ?? null);
  const [courseRoute, setCourseRoute] = useState<Array<{ latitude: number; longitude: number }> | null>(null);

  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    phase,
    sessionId,
    distanceMeters,
    durationSeconds,
    currentPaceSecondsPerKm,
    avgPaceSecondsPerKm,
    gpsStatus,
    routePoints,
    calories,
    heartRate,
    watchConnected,
    currentLocation,
    isApproachingStart,
    isNearStart,
    loopDetected,
    distanceToStart,
    startSession,
    updateSessionId,
    pause,
    resume,
    complete,
    reset,
    setPhase,
  } = useRunningStore();

  const { hapticFeedback, countdownSeconds, voiceGuidance, setVoiceGuidance } = useSettingsStore();
  const { startTracking, stopTracking, pauseTracking, resumeTracking } =
    useGPSTracker();
  useRunTimer();

  const [countdown, setCountdown] = useState<number | null>(null);
  const [loopHapticFired, setLoopHapticFired] = useState(false);

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

  // Reset stale state from previous run on mount
  useEffect(() => {
    if (phase === 'completed') {
      reset();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch course route for navigation overlay
  useEffect(() => {
    if (!courseId) {
      setCourseRoute(null);
      return;
    }
    courseService.getCourseDetail(courseId).then((detail) => {
      const points = detail.route_geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));
      setCourseRoute(points);
    }).catch(() => {
      setCourseRoute(null);
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
  );

  // Countdown before starting
  const handleStart = useCallback(async () => {
    setPhase('countdown');
    setCountdown(countdownSeconds);

    for (let i = countdownSeconds; i > 0; i--) {
      setCountdown(i);
      if (hapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    setCountdown(null);

    // Start GPS tracking IMMEDIATELY with a local session ID.
    // The server session is created in the background — network latency
    // must never block the running experience.
    const localSessionId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    startSession(localSessionId, courseId);
    await startTracking();

    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Register session on server in background (non-blocking).
    // When successful, update the store with the real server session ID
    // so that completeRun uses the correct ID.
    runService.createSession({
      course_id: courseId,
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
    Alert.alert('러닝 종료', '러닝을 종료하시겠습니까?', [
      { text: '계속 달리기', style: 'cancel' },
      {
        text: '종료',
        style: 'destructive',
        onPress: async () => {
          await stopTracking();
          complete();

          if (hapticFeedback) {
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          }

          if (sessionId) {
            navigation.replace('RunResult', { sessionId });
          }
        },
      },
    ]);
  }, [stopTracking, complete, hapticFeedback, sessionId, navigation]);

  // Watch stop (no confirmation — user already tapped stop on Watch)
  const handleWatchStop = useCallback(async () => {
    await stopTracking();
    complete();
    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (sessionId) {
      navigation.replace('RunResult', { sessionId });
    }
  }, [stopTracking, complete, hapticFeedback, sessionId, navigation]);

  // Watch companion
  useWatchCompanion({
    onPauseCommand: handlePause,
    onResumeCommand: handleResume,
    onStopCommand: handleWatchStop,
  }, courseNavigation);

  // Voice guidance for course navigation
  useVoiceGuidance({
    navigation: courseNavigation,
    distanceMeters,
    phase,
    enabled: voiceGuidance && !!courseId,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (phase === 'running' || phase === 'paused') {
        stopTracking();
      }
    };
  }, [phase, stopTracking]);

  // ---- Render based on phase ----

  if (phase === 'idle') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={colors.statusBar} />
        <IdleView
          courseId={courseId}
          gpsStatus={gpsStatus}
          onStart={handleStart}
          onDismissCourse={() => setDismissedCourse(true)}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'countdown' && countdown !== null) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={colors.statusBar} />
        <View style={styles.countdownContainer}>
          <Text style={styles.countdownLabel}>준비하세요</Text>
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <View style={styles.countdownBarTrack}>
            <View
              style={[
                styles.countdownBarFill,
                { width: `${((countdownSeconds - countdown + 1) / countdownSeconds) * 100}%` },
              ]}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // During running, GPS is active — only show error for truly disabled state
  const gpsDisabled = gpsStatus === 'disabled';
  const gpsLabel = gpsDisabled ? '위치 권한 필요' : 'GPS 연결됨';
  const gpsColor = gpsDisabled ? colors.error : colors.success;

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
              {courseId ? '코스 러닝' : '자유 러닝'}
            </Text>
          </View>
          {watchConnected && (
            <View style={styles.watchChip}>
              <Ionicons name="watch-outline" size={12} color={colors.success} />
            </View>
          )}
          {courseId && (
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

        {/* Mini Map */}
        <RouteMapView
          routePoints={routePoints}
          previewPolyline={courseRoute ?? undefined}
          showUserLocation
          followsUserLocation
          interactive
          style={styles.miniMap}
        />

        {/* Turn instruction bar */}
        {courseNavigation && courseNavigation.distanceToNextTurn >= 0 && (
          <View style={styles.turnInstructionBar}>
            <Ionicons
              name={turnDirectionIcon(courseNavigation.nextTurnDirection) as any}
              size={24}
              color={colors.primary}
            />
            <Text style={styles.turnInstructionText}>
              {formatTurnInstruction(
                courseNavigation.distanceToNextTurn,
                courseNavigation.nextTurnDirection,
              )}
            </Text>
          </View>
        )}

        {/* Paused Banner */}
        {phase === 'paused' && (
          <View style={styles.pausedBanner}>
            <Ionicons name="pause" size={16} color={colors.background} />
            <Text style={styles.pausedText}>일시정지</Text>
          </View>
        )}

        {/* Off-course warning */}
        {courseNavigation?.isOffCourse && (
          <View style={styles.offCourseBanner}>
            <Ionicons name="warning" size={16} color={colors.white} />
            <Text style={styles.offCourseText}>코스를 이탈했습니다</Text>
          </View>
        )}

        {/* Loop detection banners (free running only, after 300m) */}
        {!courseId && loopDetected && distanceMeters >= 300 && (
          <View style={styles.loopArrivedBanner}>
            <Ionicons name="flag" size={16} color={colors.white} />
            <Text style={styles.loopArrivedText}>Finish! Loop complete</Text>
          </View>
        )}
        {!courseId && isApproachingStart && !isNearStart && !loopDetected && distanceMeters >= 300 && (
          <View style={styles.loopApproachBanner}>
            <Ionicons name="navigate" size={16} color={colors.text} />
            <Text style={styles.loopApproachText}>
              Approaching start ~{Math.round(distanceToStart)}m
            </Text>
          </View>
        )}

        {/* Hero Metric: Distance */}
        <View style={styles.heroSection}>
          <Text style={styles.heroLabel}>거리</Text>
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
            <Text style={styles.courseProgressLabel}>코스 진행</Text>
            <View style={styles.courseProgressBarTrack}>
              <View
                style={[
                  styles.courseProgressBarFill,
                  { width: `${Math.min(100, courseNavigation.progressPercent)}%` },
                ]}
              />
            </View>
            <Text style={styles.courseProgressText}>
              {metersToKm(courseNavigation.remainingDistanceMeters)} km 남음
            </Text>
          </View>
        )}

        {/* Dashboard row */}
        <View style={styles.dashboardRow}>
          <View style={styles.dashboardCell}>
            <Text style={styles.dashboardLabel}>시간</Text>
            <Text style={styles.dashboardValue}>
              {formatDuration(durationSeconds)}
            </Text>
          </View>

          <View style={styles.dashboardDivider} />

          <View style={styles.dashboardCell}>
            <Text style={styles.dashboardLabel}>페이스</Text>
            <Text style={styles.dashboardValue}>
              {formatPace(currentPaceSecondsPerKm)}
            </Text>
          </View>

          <View style={styles.dashboardDivider} />

          <View style={styles.dashboardCell}>
            <Text style={styles.dashboardLabel}>평균</Text>
            <Text style={styles.dashboardValue}>
              {formatPace(avgPaceSecondsPerKm)}
            </Text>
          </View>

          {heartRate > 0 && (
            <>
              <View style={styles.dashboardDivider} />
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardLabel}>심박수</Text>
                <Text style={[styles.dashboardValue, { color: colors.error }]}>
                  {Math.round(heartRate)}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Calories strip */}
        <View style={styles.caloriesStrip}>
          <Text style={styles.caloriesLabel}>칼로리</Text>
          <Text style={styles.caloriesValue}>{calories}</Text>
          <Text style={styles.caloriesUnit}>kcal</Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {phase === 'paused' ? (
            <>
              <TouchableOpacity
                style={styles.resumeButton}
                onPress={handleResume}
                activeOpacity={0.7}
              >
                <Ionicons name="play" size={28} color={colors.white} />
                <Text style={styles.resumeLabel}>재개</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStop}
                activeOpacity={0.7}
              >
                <Ionicons name="stop" size={28} color={colors.white} />
                <Text style={styles.stopLabel}>종료</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.pauseButton}
                onPress={handlePause}
                activeOpacity={0.7}
              >
                <Ionicons name="pause" size={28} color={colors.text} />
                <Text style={styles.pauseLabel}>일시정지</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStop}
                activeOpacity={0.7}
              >
                <Ionicons name="stop" size={28} color={colors.white} />
                <Text style={styles.stopLabel}>종료</Text>
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
  onStart,
  onDismissCourse,
}: {
  courseId: string | null;
  gpsStatus: string;
  onStart: () => void;
  onDismissCourse: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // On idle screen, show GPS ready if native module exists
  const gpsColor = gpsStatus === 'disabled' ? colors.error : colors.success;
  const gpsLabel = gpsStatus === 'disabled' ? '위치 권한 필요' : 'GPS 준비됨';

  const handleDismissCourse = () => {
    Alert.alert(
      '자유 러닝으로 전환',
      '코스 러닝을 취소하고 자유 러닝으로 전환할까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '전환', onPress: onDismissCourse },
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
            <Text style={styles.idleModeChipText}>코스 러닝</Text>
            <Ionicons name="close" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.idleModeLabel}>자유 러닝</Text>
        )}
        <Text style={styles.idleTitle}>
          {courseId
            ? '코스를 따라 달려보세요'
            : '자유롭게 달려보세요'}
        </Text>
      </View>

      {/* GPS status chip */}
      <View style={styles.gpsChipIdle}>
        <View style={[styles.gpsDot, { backgroundColor: gpsColor }]} />
        <Text style={styles.gpsChipText}>{gpsLabel}</Text>
      </View>

      {/* Large circular START button */}
      <TouchableOpacity
        style={styles.startButton}
        onPress={onStart}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>START</Text>
      </TouchableOpacity>

      <Text style={styles.idleTip}>
        버튼을 눌러 카운트다운을 시작하세요
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
  miniMap: {
    height: 260,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.md,
    overflow: 'hidden',
  },

  // Turn instruction bar
  turnInstructionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: c.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  turnInstructionText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    flex: 1,
  },

  // Paused banner
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: c.warning,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
  },
  pausedText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.background,
  },

  // Hero distance
  heroSection: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.lg,
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

  // Dashboard row
  dashboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
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
    fontSize: 24,
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
    height: 36,
    backgroundColor: c.divider,
  },

  // Calories strip
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
    paddingVertical: SPACING.xl,
    marginTop: 'auto',
    marginBottom: SPACING.xl,
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

  // Off-course banner
  offCourseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: c.warning,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.md,
  },
  offCourseText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
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
