import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRunningStore } from '../../stores/runningStore';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import { metersToKm, formatDuration, formatPace } from '../../utils/format';
import type { CourseNavigation, TurnDirection } from '../../hooks/useCourseNavigation';
import { turnDirectionIcon, formatTurnInstruction } from '../../utils/navigationHelpers';

// ---- Types ----

interface RunningHUDProps {
  /** Current phase of the run lifecycle. */
  phase: 'countdown' | 'running' | 'paused';
  /** Countdown value (shown only during 'countdown' phase). */
  countdownValue?: number;
  /** Total seconds for the countdown (used for progress bar). */
  countdownTotal?: number;
  /** Pause the current run. */
  onPause: () => void;
  /** Resume a paused run. */
  onResume: () => void;
  /** Stop/end the run (shows confirmation). */
  onStop: () => void;
  /** Course ID if running a course, undefined for free running. */
  courseId?: string;
  /** Course title for display. */
  courseTitle?: string;
  /** Course navigation data for turn instructions and progress. */
  courseNavigation?: CourseNavigation | null;
  /** Voice guidance toggle state + setter (course running only). */
  voiceGuidance?: boolean;
  onToggleVoiceGuidance?: () => void;
  /** Checkpoint just-passed data for toast. */
  checkpointJustPassed?: { order: number; total: number } | null;
}

// ---- Component ----

export default function RunningHUD({
  phase,
  countdownValue,
  countdownTotal = 3,
  onPause,
  onResume,
  onStop,
  courseId,
  courseTitle,
  courseNavigation,
  voiceGuidance,
  onToggleVoiceGuidance,
  checkpointJustPassed,
}: RunningHUDProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Read live metrics directly from the store
  const {
    distanceMeters,
    durationSeconds,
    avgPaceSecondsPerKm,
    gpsStatus,
    calories,
    heartRate,
    cadence,
    elevationGainMeters,
    watchConnected,
    isAutoPaused,
    isApproachingStart,
    isNearStart,
    loopDetected,
    distanceToStart,
  } = useRunningStore();

  // ---- Countdown Overlay ----

  if (phase === 'countdown') {
    const progress = countdownValue != null
      ? ((countdownTotal - countdownValue + 1) / countdownTotal) * 100
      : 0;

    return (
      <View style={styles.countdownContainer}>
        <Text style={styles.countdownLabel}>준비하세요</Text>
        <Text style={styles.countdownNumber}>
          {countdownValue ?? countdownTotal}
        </Text>
        <View style={styles.countdownBarTrack}>
          <View
            style={[
              styles.countdownBarFill,
              { width: `${Math.min(100, progress)}%` },
            ]}
          />
        </View>
      </View>
    );
  }

  // ---- Running / Paused HUD ----

  const gpsDisabled = gpsStatus === 'disabled';
  const gpsLabel = gpsDisabled ? '위치 권한 필요' : 'GPS 연결됨';
  const gpsColor = gpsDisabled ? colors.error : colors.success;

  return (
    <View style={styles.hudContainer}>
      {/* Top status bar */}
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
        {courseId && onToggleVoiceGuidance && (
          <TouchableOpacity
            style={styles.voiceChip}
            onPress={onToggleVoiceGuidance}
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

      {/* Banner area */}
      <BannerArea
        phase={phase}
        courseId={courseId}
        courseNavigation={courseNavigation}
        isAutoPaused={isAutoPaused}
        isApproachingStart={isApproachingStart}
        isNearStart={isNearStart}
        loopDetected={loopDetected}
        distanceToStart={distanceToStart}
        distanceMeters={distanceMeters}
        checkpointJustPassed={checkpointJustPassed}
        colors={colors}
        styles={styles}
      />

      {/* Hero distance */}
      <View style={styles.heroSection}>
        <View style={styles.heroValueRow}>
          <Text style={styles.heroValue}>{metersToKm(distanceMeters)}</Text>
          <Text style={styles.heroUnit}>km</Text>
        </View>
      </View>

      {/* Course progress bar */}
      {courseNavigation && courseId && (
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

      {/* Dashboard grid: 2 rows x 3 columns */}
      <View style={styles.dashboardGrid}>
        <View style={styles.dashboardRow}>
          <DashboardCell
            label="시간"
            value={formatDuration(durationSeconds)}
            styles={styles}
          />
          <View style={styles.dashboardDivider} />
          <DashboardCell
            label="평균 페이스"
            value={formatPace(avgPaceSecondsPerKm)}
            styles={styles}
          />
          <View style={styles.dashboardDivider} />
          <DashboardCell
            label="칼로리"
            value={String(calories)}
            styles={styles}
          />
        </View>
        <View style={styles.dashboardRowDivider} />
        <View style={styles.dashboardRow}>
          <DashboardCell
            label="심박수"
            value={heartRate > 0 ? String(Math.round(heartRate)) : '--'}
            valueColor={heartRate > 0 ? colors.error : undefined}
            styles={styles}
          />
          <View style={styles.dashboardDivider} />
          <DashboardCell
            label="케이던스"
            value={cadence > 0 ? String(cadence) : '--'}
            styles={styles}
          />
          <View style={styles.dashboardDivider} />
          <DashboardCell
            label="고도(m)"
            value={elevationGainMeters > 0 ? `+${Math.round(elevationGainMeters)}` : '--'}
            styles={styles}
          />
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {phase === 'paused' ? (
          <>
            <TouchableOpacity
              style={styles.resumeButton}
              onPress={onResume}
              activeOpacity={0.7}
            >
              <Ionicons name="play" size={28} color={colors.white} />
              <Text style={styles.resumeLabel}>재개</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stopButton}
              onPress={onStop}
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
              onPress={onPause}
              activeOpacity={0.7}
            >
              <Ionicons name="pause" size={28} color={colors.text} />
              <Text style={styles.pauseLabel}>일시정지</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stopButton}
              onPress={onStop}
              activeOpacity={0.7}
            >
              <Ionicons name="stop" size={28} color={colors.white} />
              <Text style={styles.stopLabel}>종료</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ---- Sub-components ----

/** Single metric cell inside the dashboard grid. */
function DashboardCell({
  label,
  value,
  valueColor,
  styles,
}: {
  label: string;
  value: string;
  valueColor?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.dashboardCell}>
      <Text style={styles.dashboardLabel}>{label}</Text>
      <Text
        style={[
          styles.dashboardValue,
          valueColor ? { color: valueColor } : undefined,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/** Contextual banners: turn instruction, paused, auto-pause, off-course, checkpoint, loop. */
function BannerArea({
  phase,
  courseId,
  courseNavigation,
  isAutoPaused,
  isApproachingStart,
  isNearStart,
  loopDetected,
  distanceToStart,
  distanceMeters,
  checkpointJustPassed,
  colors,
  styles,
}: {
  phase: 'running' | 'paused';
  courseId?: string;
  courseNavigation?: CourseNavigation | null;
  isAutoPaused: boolean;
  isApproachingStart: boolean;
  isNearStart: boolean;
  loopDetected: boolean;
  distanceToStart: number;
  distanceMeters: number;
  checkpointJustPassed?: { order: number; total: number } | null;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <>
      {/* Turn instruction bar (course running) */}
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

      {/* Paused banner */}
      {phase === 'paused' && (
        <View style={styles.pausedBanner}>
          <Ionicons name="pause" size={16} color={colors.background} />
          <Text style={styles.pausedText}>일시정지</Text>
        </View>
      )}

      {/* Auto-paused banner */}
      {isAutoPaused && phase === 'running' && (
        <View style={styles.autoPausedBanner}>
          <Ionicons name="pause-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.autoPausedText}>자동 일시정지</Text>
        </View>
      )}

      {/* Off-course warning */}
      {courseNavigation?.isOffCourse && (
        <View style={styles.offCourseBanner}>
          <Ionicons name="warning" size={16} color={colors.white} />
          <Text style={styles.offCourseText}>코스를 이탈했습니다</Text>
        </View>
      )}

      {/* Checkpoint pass toast */}
      {checkpointJustPassed && (
        <View style={styles.checkpointBanner}>
          <Ionicons name="flag" size={16} color={colors.background} />
          <Text style={styles.checkpointBannerText}>
            CP {checkpointJustPassed.order}/{checkpointJustPassed.total} 통과
          </Text>
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
    </>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Countdown
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

    // HUD container
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
    autoPausedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      backgroundColor: c.surface,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: SPACING.md,
      borderWidth: 1,
      borderColor: c.divider,
    },
    autoPausedText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textSecondary,
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

    // Hero distance
    heroSection: {
      alignItems: 'center',
      paddingVertical: SPACING.xs,
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
    dashboardDivider: {
      width: 1,
      height: 32,
      backgroundColor: c.divider,
    },

    // Controls
    controls: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.xxl,
      paddingVertical: SPACING.md,
    },
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
  });
