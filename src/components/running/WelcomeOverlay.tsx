import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { COLORS } from '../../utils/constants';
import { getDailyQuote } from '../../data/runningQuotes';
import { useAuthStore } from '../../stores/authStore';
import type { RunGoal } from './RunGoalSheet';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface WelcomeOverlayProps {
  visible: boolean;
  nickname?: string;
  runGoal: RunGoal;
  onTour?: () => void;
}

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 6) return t('world.welcome.greetingNight');
  if (hour < 12) return t('world.welcome.greetingMorning');
  if (hour < 18) return t('world.welcome.greetingAfternoon');
  return t('world.welcome.greetingEvening');
}

/** Format seconds as M'SS" pace string */
function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

/** Format seconds as human time */
function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  if (m > 0 && s > 0) return `${m}분 ${s}초`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

/** Goal type display info */
function getGoalTypeInfo(type: string): { icon: IoniconsName; label: string } {
  switch (type) {
    case 'distance': return { icon: 'flag-outline', label: '거리 목표' };
    case 'time': return { icon: 'timer-outline', label: '시간 목표' };
    case 'pace': return { icon: 'speedometer-outline', label: '페이스 목표' };
    case 'program': return { icon: 'trophy-outline', label: '목표 러닝' };
    case 'interval': return { icon: 'repeat-outline', label: '인터벌' };
    default: return { icon: 'flag-outline', label: '목표' };
  }
}

/** Format seconds as human-readable time for interval display */
function formatIntervalTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0 && s > 0) return `${m}분${s}초`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

/** Format goal main value */
function formatGoalValue(goal: RunGoal): string {
  if (!goal.type || goal.value === null) return '';
  switch (goal.type) {
    case 'distance':
      return `${(goal.value / 1000).toFixed(1)} km`;
    case 'time':
      return formatTime(goal.value);
    case 'pace':
      return `${formatPace(goal.value)} /km`;
    case 'program':
      return `${(goal.value / 1000).toFixed(1)} km`;
    case 'interval': {
      const runLabel = formatIntervalTime(goal.intervalRunSeconds ?? 0);
      const walkLabel = formatIntervalTime(goal.intervalWalkSeconds ?? 0);
      return `달리기 ${runLabel}\n걷기 ${walkLabel}`;
    }
    default:
      return '';
  }
}

export default function WelcomeOverlay({
  visible,
  nickname,
  runGoal,
  onTour,
}: WelcomeOverlayProps) {
  const { t, i18n } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDark = colors.statusBar === 'light-content';
  const userId = useAuthStore((s) => s.user?.id);

  const hasGoal = runGoal.type !== null && runGoal.value !== null;

  const opacity = useRef(new Animated.Value(0)).current;

  // Staggered entrance animations
  const greetingSlide = useRef(new Animated.Value(30)).current;
  const nameSlide = useRef(new Animated.Value(40)).current;
  const quoteSlide = useRef(new Animated.Value(50)).current;
  const greetingFade = useRef(new Animated.Value(0)).current;
  const nameFade = useRef(new Animated.Value(0)).current;
  const quoteFade = useRef(new Animated.Value(0)).current;

  // Greeting ↔ goal crossfade
  const greetingGroupOpacity = useRef(new Animated.Value(1)).current;
  const goalOpacity = useRef(new Animated.Value(0)).current;
  const goalScale = useRef(new Animated.Value(0.9)).current;

  // Track if entrance animation already played (avoid glitch on tour return)
  const hasPlayedEntrance = useRef(false);

  // Fade in with staggered text entrance
  useEffect(() => {
    if (visible) {
      if (hasPlayedEntrance.current) {
        // Returning from tour — smooth fade-in without slide re-animation
        greetingSlide.setValue(0);
        nameSlide.setValue(0);
        quoteSlide.setValue(0);
        greetingFade.setValue(1);
        nameFade.setValue(1);
        quoteFade.setValue(1);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
        return;
      }

      hasPlayedEntrance.current = true;
      opacity.setValue(0);
      greetingSlide.setValue(30);
      nameSlide.setValue(40);
      quoteSlide.setValue(50);
      greetingFade.setValue(0);
      nameFade.setValue(0);
      quoteFade.setValue(0);

      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      // Stagger: greeting → name → quote
      Animated.stagger(150, [
        Animated.parallel([
          Animated.spring(greetingSlide, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: true }),
          Animated.timing(greetingFade, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(nameSlide, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: true }),
          Animated.timing(nameFade, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(quoteSlide, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: true }),
          Animated.timing(quoteFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, opacity, greetingSlide, nameSlide, quoteSlide, greetingFade, nameFade, quoteFade]);

  // Transition greeting → goal ONLY when hasGoal changes
  useEffect(() => {
    if (hasGoal) {
      goalScale.setValue(0.9);
      Animated.parallel([
        Animated.timing(greetingGroupOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(goalOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(goalScale, { toValue: 1, damping: 15, stiffness: 120, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(greetingGroupOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(goalOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [hasGoal, greetingGroupOpacity, goalOpacity, goalScale]);

  const greeting = getGreeting(t);
  const displayName = nickname || t('world.welcome.runner');
  const dailyQuote = useMemo(() => getDailyQuote(i18n.language, userId), [i18n.language, userId]);

  const overlayBg = isDark ? 'rgba(15,15,15,0.92)' : 'rgba(245,245,245,0.92)';
  const textColor = isDark ? COLORS.white : '#111';
  const accentColor = colors.primary;
  const quoteColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
  const tourBtnBg = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
  const tourBtnText = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const subTextColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  const detailBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  // Goal detail info
  const goalTypeInfo = hasGoal ? getGoalTypeInfo(runGoal.type!) : null;
  const goalValue = hasGoal ? formatGoalValue(runGoal) : '';

  // Program-specific: computed pace
  const programPace = runGoal.type === 'program' && runGoal.value && runGoal.targetTime
    ? runGoal.targetTime / (runGoal.value / 1000)
    : null;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      pointerEvents={visible ? 'box-none' : 'none'}
    >
      <View style={[styles.backdrop, { backgroundColor: overlayBg }]} pointerEvents="none" />

      {/* ===== Greeting phase ===== */}
      <Animated.View style={[styles.centerArea, { opacity: greetingGroupOpacity }]} pointerEvents="none">
        {/* Greeting label */}
        <Animated.Text
          style={[
            styles.greetingLabel,
            { color: accentColor, opacity: greetingFade, transform: [{ translateY: greetingSlide }] },
          ]}
        >
          {greeting}
        </Animated.Text>

        {/* Big name */}
        <Animated.Text
          style={[
            styles.greetingName,
            { color: textColor, opacity: nameFade, transform: [{ translateY: nameSlide }] },
          ]}
        >
          {displayName}
        </Animated.Text>

        {/* Divider line */}
        <Animated.View
          style={[
            styles.divider,
            { backgroundColor: dividerColor, opacity: quoteFade, transform: [{ translateY: quoteSlide }] },
          ]}
        />

        {/* Daily quote */}
        <Animated.Text
          style={[
            styles.dailyQuote,
            { color: quoteColor, opacity: quoteFade, transform: [{ translateY: quoteSlide }] },
          ]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          "{dailyQuote}"
        </Animated.Text>
      </Animated.View>

      {/* ===== Goal phase ===== */}
      <Animated.View style={[styles.centerArea, { opacity: goalOpacity, transform: [{ scale: goalScale }] }]} pointerEvents="none">
        {/* Goal type label with icon */}
        {goalTypeInfo && (
          <View style={styles.goalTypeRow}>
            <Ionicons name={goalTypeInfo.icon} size={16} color={accentColor} />
            <Text style={[styles.greetingLabel, { color: accentColor, marginBottom: 0 }]}>
              {goalTypeInfo.label}
            </Text>
          </View>
        )}

        {/* Big goal value — interval uses custom layout */}
        {runGoal.type === 'interval' ? (
          <View style={styles.intervalGoalCard}>
            <View style={styles.intervalGoalRow}>
              <View style={[styles.intervalGoalDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.intervalGoalPhase, { color: textColor }]}>달리기</Text>
              <Text style={[styles.intervalGoalTime, { color: accentColor }]}>
                {formatIntervalTime(runGoal.intervalRunSeconds ?? 0)}
              </Text>
            </View>
            <View style={[styles.intervalGoalDivider, { backgroundColor: dividerColor }]} />
            <View style={styles.intervalGoalRow}>
              <View style={[styles.intervalGoalDot, { backgroundColor: COLORS.success }]} />
              <Text style={[styles.intervalGoalPhase, { color: textColor }]}>걷기</Text>
              <Text style={[styles.intervalGoalTime, { color: COLORS.success }]}>
                {formatIntervalTime(runGoal.intervalWalkSeconds ?? 0)}
              </Text>
            </View>
            <View style={[styles.intervalGoalDivider, { backgroundColor: dividerColor }]} />
            <View style={styles.intervalGoalRow}>
              <Text style={[styles.intervalGoalSetLabel, { color: subTextColor }]}>
                ×{runGoal.intervalSets ?? 0}세트 · 총 {formatTime(((runGoal.intervalRunSeconds ?? 0) + (runGoal.intervalWalkSeconds ?? 0)) * (runGoal.intervalSets ?? 0))}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.greetingName, { color: textColor }]}>
            {goalValue}
          </Text>
        )}

        {/* Goal details row */}
        {runGoal.type === 'program' && (
          <View style={styles.goalDetailsContainer}>
            {/* Target time */}
            {runGoal.targetTime && runGoal.targetTime > 0 && (
              <View style={[styles.goalDetailChip, { backgroundColor: detailBg }]}>
                <Ionicons name="timer-outline" size={14} color={accentColor} />
                <Text style={[styles.goalDetailText, { color: subTextColor }]}>
                  {formatTime(runGoal.targetTime)}
                </Text>
              </View>
            )}

            {/* Required pace */}
            {programPace && (
              <View style={[styles.goalDetailChip, { backgroundColor: detailBg }]}>
                <Ionicons name="speedometer-outline" size={14} color={accentColor} />
                <Text style={[styles.goalDetailText, { color: subTextColor }]}>
                  {formatPace(programPace)} /km
                </Text>
              </View>
            )}

            {/* Metronome BPM */}
            <View style={[styles.goalDetailChip, { backgroundColor: detailBg }]}>
              <Ionicons
                name="musical-notes-outline"
                size={14}
                color={(runGoal.cadenceBPM ?? 0) > 0 ? accentColor : subTextColor}
              />
              <Text style={[styles.goalDetailText, { color: subTextColor }]}>
                {(runGoal.cadenceBPM ?? 0) > 0
                  ? `${runGoal.cadenceBPM} BPM`
                  : 'OFF'}
              </Text>
            </View>
          </View>
        )}

        {/* Interval details — integrated into card above */}

        {/* For simple goals (distance/time/pace), show "Ready" below */}
        {runGoal.type && runGoal.type !== 'program' && runGoal.type !== 'interval' && (
          <>
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
            <Text style={[styles.readyText, { color: subTextColor }]}>
              {t('world.welcome.readyToGo')}
            </Text>
          </>
        )}

        {/* For interval, show "Ready" after card */}
        {runGoal.type === 'interval' && (
          <Text style={[styles.readyText, { color: subTextColor, marginTop: 20 }]}>
            {t('world.welcome.readyToGo')}
          </Text>
        )}

        {/* For program, show "Ready" after details */}
        {runGoal.type === 'program' && (
          <Text style={[styles.readyText, { color: subTextColor, marginTop: 16 }]}>
            {t('world.welcome.readyToGo')}
          </Text>
        )}
      </Animated.View>

      {/* Tour button */}
      {onTour && (
        <TouchableOpacity
          style={[styles.tourButton, { backgroundColor: tourBtnBg }]}
          onPress={onTour}
          activeOpacity={0.7}
        >
          <Ionicons name="compass-outline" size={16} color={tourBtnText} />
          <Text style={[styles.tourText, { color: tourBtnText }]}>
            {t('world.welcome.tour')}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const createStyles = (_c: ThemeColors) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 90,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    centerArea: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      paddingBottom: 140,
    },
    greetingLabel: {
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    greetingName: {
      fontSize: 38,
      fontWeight: '900',
      letterSpacing: -0.5,
      marginBottom: 20,
      textAlign: 'center',
    },
    divider: {
      width: 40,
      height: 2,
      borderRadius: 1,
      marginBottom: 20,
    },
    dailyQuote: {
      fontSize: 17,
      fontWeight: '500',
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 26,
      paddingHorizontal: 20,
    },
    goalTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    goalDetailsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: 4,
    },
    goalDetailChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    goalDetailText: {
      fontSize: 14,
      fontWeight: '600',
    },
    readyText: {
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: 0.5,
    },
    intervalGoalCard: {
      width: '100%',
      maxWidth: 240,
      gap: 0,
      marginBottom: 12,
    },
    intervalGoalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
    },
    intervalGoalDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 10,
    },
    intervalGoalPhase: {
      fontSize: 17,
      fontWeight: '600',
      flex: 1,
    },
    intervalGoalTime: {
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    intervalGoalDivider: {
      height: 1,
      width: '100%',
    },
    intervalGoalSetLabel: {
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      flex: 1,
    },
    tourButton: {
      position: 'absolute',
      bottom: 200,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 20,
      paddingVertical: 11,
      borderRadius: 22,
    },
    tourText: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
