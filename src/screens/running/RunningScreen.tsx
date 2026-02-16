import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useRunningStore, RunningPhase } from '../../stores/runningStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useGPSTracker } from '../../hooks/useGPSTracker';
import { useRunTimer } from '../../hooks/useRunTimer';
import { runService } from '../../services/runService';
import DistanceDisplay from '../../components/running/DistanceDisplay';
import PaceDisplay from '../../components/running/PaceDisplay';
import Timer from '../../components/running/Timer';
import RouteMapView from '../../components/map/RouteMapView';
import type { RunningStackParamList } from '../../types/navigation';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type RunningNav = NativeStackNavigationProp<RunningStackParamList, 'RunningMain'>;
type RunningRoute = RouteProp<RunningStackParamList, 'RunningMain'>;

export default function RunningScreen() {
  const navigation = useNavigation<RunningNav>();
  const route = useRoute<RunningRoute>();
  const courseId = route.params?.courseId ?? null;

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
    startSession,
    pause,
    resume,
    complete,
    reset,
    setPhase,
  } = useRunningStore();

  const { hapticFeedback, countdownSeconds } = useSettingsStore();
  const { startTracking, stopTracking, pauseTracking, resumeTracking } =
    useGPSTracker();
  useRunTimer();

  const [countdown, setCountdown] = useState<number | null>(null);

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

    try {
      // Create session on server
      const response = await runService.createSession({
        course_id: courseId,
        started_at: new Date().toISOString(),
        device_info: {
          platform: Platform.OS as 'android' | 'ios',
          os_version: Platform.Version.toString(),
          device_model: 'Unknown',
          app_version: '1.0.0',
        },
      });

      startSession(response.session_id, courseId);
      await startTracking();

      if (hapticFeedback) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      // Network failure: generate local session ID
      const localSessionId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      startSession(localSessionId, courseId);
      await startTracking();
    }
  }, [
    courseId,
    countdownSeconds,
    hapticFeedback,
    setPhase,
    startSession,
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
    Alert.alert('런닝 종료', '런닝을 종료하시겠습니까?', [
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
        <IdleView
          courseId={courseId}
          gpsStatus={gpsStatus}
          onStart={handleStart}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'countdown' && countdown !== null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.countdownContainer}>
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <Text style={styles.countdownLabel}>준비하세요</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Running or Paused
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.runningContainer}>
        {/* Mini Map */}
        <RouteMapView
          routePoints={routePoints}
          showUserLocation
          style={styles.miniMap}
        />

        {/* GPS Status indicator */}
        <View style={styles.gpsIndicator}>
          <View
            style={[
              styles.gpsStatusDot,
              {
                backgroundColor:
                  gpsStatus === 'locked'
                    ? COLORS.success
                    : gpsStatus === 'searching'
                    ? COLORS.warning
                    : COLORS.error,
              },
            ]}
          />
          <Text style={styles.gpsStatusText}>
            GPS{' '}
            {gpsStatus === 'locked'
              ? '연결됨'
              : gpsStatus === 'searching'
              ? '검색 중'
              : '끊김'}
          </Text>
        </View>

        {/* Primary Metric: Distance */}
        <View style={styles.primaryMetric}>
          <DistanceDisplay distanceMeters={distanceMeters} />
        </View>

        {/* Secondary Metrics */}
        <View style={styles.secondaryMetrics}>
          <Timer durationSeconds={durationSeconds} />
          <PaceDisplay
            paceSecondsPerKm={currentPaceSecondsPerKm}
            label="현재 페이스"
          />
          <PaceDisplay
            paceSecondsPerKm={avgPaceSecondsPerKm}
            label="평균 페이스"
          />
        </View>

        {/* Calories */}
        <View style={styles.caloriesRow}>
          <Text style={styles.caloriesLabel}>칼로리</Text>
          <Text style={styles.caloriesValue}>{calories} kcal</Text>
        </View>

        {/* Paused Banner */}
        {phase === 'paused' && (
          <View style={styles.pausedBanner}>
            <Text style={styles.pausedText}>일시정지</Text>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {phase === 'running' ? (
            <>
              <TouchableOpacity
                style={styles.pauseButton}
                onPress={handlePause}
                activeOpacity={0.7}
              >
                <Text style={styles.controlIcon}>⏸</Text>
                <Text style={styles.controlLabel}>일시정지</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStop}
                activeOpacity={0.7}
              >
                <Text style={styles.controlIcon}>⏹</Text>
                <Text style={styles.controlLabel}>종료</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.resumeButton}
                onPress={handleResume}
                activeOpacity={0.7}
              >
                <Text style={styles.controlIcon}>▶</Text>
                <Text style={styles.controlLabel}>계속</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStop}
                activeOpacity={0.7}
              >
                <Text style={styles.controlIcon}>⏹</Text>
                <Text style={styles.controlLabel}>종료</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---- Idle View (before run starts) ----

function IdleView({
  courseId,
  gpsStatus,
  onStart,
}: {
  courseId: string | null;
  gpsStatus: string;
  onStart: () => void;
}) {
  return (
    <View style={styles.idleContainer}>
      <View style={styles.idleHeader}>
        <Text style={styles.idleTitle}>
          {courseId ? '코스 런닝' : '자유 런닝'}
        </Text>
        <Text style={styles.idleSubtitle}>
          {courseId
            ? '선택한 코스를 따라 달려보세요'
            : '자유롭게 달려보세요'}
        </Text>
      </View>

      <View style={styles.gpsSection}>
        <View
          style={[
            styles.gpsStatusDot,
            {
              backgroundColor:
                gpsStatus === 'locked'
                  ? COLORS.success
                  : gpsStatus === 'searching'
                  ? COLORS.warning
                  : COLORS.error,
            },
          ]}
        />
        <Text style={styles.gpsStatusText}>
          GPS{' '}
          {gpsStatus === 'locked'
            ? '신호 양호'
            : gpsStatus === 'searching'
            ? '신호 검색 중...'
            : '신호 없음'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.startButton}
        onPress={onStart}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>시작</Text>
      </TouchableOpacity>

      <Text style={styles.idleTip}>
        버튼을 누르면 카운트다운 후 런닝이 시작됩니다
      </Text>
    </View>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Idle
  idleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.xxxl,
  },
  idleHeader: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  idleTitle: {
    fontSize: FONT_SIZES.title,
    fontWeight: '800',
    color: COLORS.text,
  },
  idleSubtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  gpsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  startButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  startButtonText: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 2,
  },
  idleTip: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
    textAlign: 'center',
  },

  // Countdown
  countdownContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  countdownNumber: {
    fontSize: 120,
    fontWeight: '900',
    color: COLORS.accent,
  },
  countdownLabel: {
    fontSize: FONT_SIZES.xxl,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  // Running
  runningContainer: {
    flex: 1,
    paddingHorizontal: SPACING.xxl,
  },
  miniMap: {
    height: 150,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.sm,
  },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  gpsStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  gpsStatusText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  primaryMetric: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  secondaryMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  caloriesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  caloriesLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  caloriesValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  pausedBanner: {
    backgroundColor: COLORS.warning,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  pausedText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.black,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xxl,
    paddingVertical: SPACING.xl,
    marginTop: 'auto',
    marginBottom: SPACING.xxxl,
  },
  pauseButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  resumeButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  controlIcon: {
    fontSize: 24,
  },
  controlLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.white,
    fontWeight: '600',
  },
});
