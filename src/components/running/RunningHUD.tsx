import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
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
  /** Off-course warning level: 0=on-course, 1=grace period, 2=penalty active */
  offCourseLevel?: number;
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
  offCourseLevel = 0,
}: RunningHUDProps) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Read live metrics directly from the store
  const {
    distanceMeters,
    durationSeconds,
    avgPaceSecondsPerKm,
    gpsStatus,
    gpsAccuracy,
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
        <Text style={styles.countdownLabel}>{t('running.countdown.ready')}</Text>
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
  const gpsColor = gpsDisabled
    ? colors.error
    : gpsAccuracy != null && gpsAccuracy < 10
      ? colors.success
      : gpsAccuracy != null && gpsAccuracy < 25
        ? colors.warning
        : gpsAccuracy != null
          ? colors.error
          : colors.warning;
  const gpsLabel = gpsDisabled
    ? t('running.status.gpsPermissionNeeded')
    : gpsAccuracy != null
      ? `±${Math.round(gpsAccuracy)}m`
      : t('running.status.gpsInitializing');

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
            {courseId ? t('running.status.courseRunning') : t('running.status.freeRunning')}
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

      {/* Dead Reckoning banner */}
      {gpsStatus === 'lost' && phase === 'running' && (
        <DRBanner colors={colors} styles={styles} />
      )}

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
        offCourseLevel={offCourseLevel}
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

      {/* Dashboard grid: 2 rows x 3 columns */}
      <View style={styles.dashboardGrid}>
        <View style={styles.dashboardRow}>
          <DashboardCell
            label={t('running.metrics.time')}
            value={formatDuration(durationSeconds)}
            styles={styles}
          />
          <View style={styles.dashboardDivider} />
          <DashboardCell
            label={t('running.metrics.avgPace')}
            value={formatPace(avgPaceSecondsPerKm)}
            styles={styles}
          />
          <View style={styles.dashboardDivider} />
          <DashboardCell
            label={t('running.metrics.calories')}
            value={String(calories)}
            styles={styles}
          />
        </View>
        <View style={styles.dashboardRowDivider} />
        <View style={styles.dashboardRow}>
          <DashboardCell
            label={t('running.metrics.heartRate')}
            value={heartRate > 0 ? String(Math.round(heartRate)) : '--'}
            valueColor={heartRate > 0 ? colors.error : undefined}
            styles={styles}
          />
          <View style={styles.dashboardDivider} />
          <DashboardCell
            label={t('running.metrics.cadence')}
            value={cadence > 0 ? String(cadence) : '--'}
            styles={styles}
          />
          <View style={styles.dashboardDivider} />
          <DashboardCell
            label={t('running.metrics.elevation')}
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
              accessibilityRole="button"
              accessibilityLabel={t('running.controls.resume')}
            >
              <Ionicons name="play" size={28} color={colors.white} />
              <Text style={styles.resumeLabel}>{t('running.controls.resume')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stopButton}
              onPress={onStop}
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
              onPress={onPause}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('running.controls.pause')}
            >
              <Ionicons name="pause" size={28} color={colors.text} />
              <Text style={styles.pauseLabel}>{t('running.controls.pause')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stopButton}
              onPress={onStop}
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

/** GPS recovering (dead reckoning) banner with pulse animation. */
function DRBanner({ colors, styles }: { colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={[styles.drBanner, { opacity: pulseAnim }]}>
      <Ionicons name="navigate-outline" size={16} color={colors.warning} />
      <Text style={styles.drBannerText}>GPS Recovering</Text>
    </Animated.View>
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
  offCourseLevel = 0,
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
  offCourseLevel?: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* Paused banner */}
      {phase === 'paused' && (
        <View style={styles.pausedBanner}>
          <Ionicons name="pause" size={16} color={colors.background} />
          <Text style={styles.pausedText}>{t('running.status.paused')}</Text>
        </View>
      )}

      {/* Auto-paused banner */}
      {isAutoPaused && phase === 'running' && (
        <View style={styles.autoPausedBanner}>
          <Ionicons name="pause-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.autoPausedText}>{t('running.status.autoPaused')}</Text>
        </View>
      )}

      {/* Off-course warning with return arrow */}
      {courseNavigation?.isOffCourse && (
        <View style={[styles.offCourseBanner, offCourseLevel >= 2 && { backgroundColor: '#CC0000' }]}>
          <Ionicons name="navigate" size={20} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.offCourseText}>
              {offCourseLevel >= 2
                ? t('running.status.offCoursePenalty')
                : offCourseLevel === 1
                  ? t('running.status.offCourseReturn')
                  : t('running.status.offCourse')}
            </Text>
            <Text style={styles.offCourseDistText}>
              {Math.round(courseNavigation.deviationMeters)}m {t('running.status.fromCourse')}
            </Text>
          </View>
        </View>
      )}

      {/* Checkpoint pass toast */}
      {checkpointJustPassed && (
        <View style={styles.checkpointBanner}>
          <Ionicons name="flag" size={16} color={colors.background} />
          <Text style={styles.checkpointBannerText}>
            {t('running.status.checkpointPassed', { order: checkpointJustPassed.order, total: checkpointJustPassed.total })}
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

    // Dead Reckoning banner
    drBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      backgroundColor: c.surface,
      paddingVertical: SPACING.xs + 2,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: SPACING.sm,
      borderWidth: 1,
      borderColor: c.warning,
    },
    drBannerText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.warning,
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
