import React, { useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useChallengeStore } from '../../stores/challengeStore';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { HomeStackParamList } from '../../types/navigation';
import type { GoalType } from '../../services/challengeService';
import {
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '../../utils/constants';

type DetailNav = NativeStackNavigationProp<HomeStackParamList, 'ChallengeDetail'>;
type DetailRoute = RouteProp<HomeStackParamList, 'ChallengeDetail'>;

const GOAL_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  total_distance: 'footsteps-outline',
  total_runs: 'repeat-outline',
  total_duration: 'time-outline',
  streak_days: 'flame-outline',
};

function formatGoalValue(goalType: GoalType, value: number): string {
  switch (goalType) {
    case 'total_distance':
      return `${(value / 1000).toFixed(1)} km`;
    case 'total_runs':
      return `${value}`;
    case 'total_duration':
      return `${Math.round(value / 60)}`;
    case 'streak_days':
      return `${value}`;
    default:
      return `${value}`;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function getDaysRemaining(endDate: string): number {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function ChallengeDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<DetailNav>();
  const route = useRoute<DetailRoute>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { challengeId } = route.params;

  const selectedChallenge = useChallengeStore((s) => s.selectedChallenge);
  const isLoadingDetail = useChallengeStore((s) => s.isLoadingDetail);
  const isJoining = useChallengeStore((s) => s.isJoining);
  const fetchChallengeDetail = useChallengeStore((s) => s.fetchChallengeDetail);
  const joinChallenge = useChallengeStore((s) => s.joinChallenge);

  useEffect(() => {
    fetchChallengeDetail(challengeId);
  }, [challengeId, fetchChallengeDetail]);

  const handleJoin = useCallback(() => {
    Alert.alert(
      t('challenge.joinTitle'),
      t('challenge.joinConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('challenge.joinBtn'),
          onPress: () => joinChallenge(challengeId),
        },
      ],
    );
  }, [t, challengeId, joinChallenge]);

  if (isLoadingDetail || !selectedChallenge) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const challenge = selectedChallenge;
  const daysLeft = getDaysRemaining(challenge.end_date);
  const goalIcon = GOAL_TYPE_ICONS[challenge.goal_type] ?? 'trophy-outline';
  const progress = challenge.my_progress;
  const progressRatio = progress
    ? Math.min(1, progress.current_value / challenge.goal_value)
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('challenge.detail')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Challenge Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.iconRow}>
            <View style={styles.goalIconBadge}>
              <Ionicons name={goalIcon} size={28} color={colors.primary} />
            </View>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>
                {challenge.challenge_type === 'individual'
                  ? t('challenge.individual')
                  : t('challenge.crew')}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.description}>{challenge.description}</Text>

          {/* Period */}
          <View style={styles.periodRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.textTertiary} />
            <Text style={styles.periodText}>
              {formatDate(challenge.start_date)} ~ {formatDate(challenge.end_date)}
            </Text>
            <View style={styles.daysLeftBadge}>
              <Text style={styles.daysLeftText}>
                {t('challenge.daysLeft', { count: daysLeft })}
              </Text>
            </View>
          </View>
        </View>

        {/* Goal Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('challenge.goalSection')}</Text>
          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>{t(`challenge.goalType.${challenge.goal_type}`)}</Text>
            <Text style={styles.goalValue}>
              {formatGoalValue(challenge.goal_type, challenge.goal_value)}
              {challenge.goal_type === 'total_duration' && ` ${t('challenge.minutes')}`}
              {challenge.goal_type === 'total_runs' && ` ${t('challenge.timesUnit')}`}
              {challenge.goal_type === 'streak_days' && ` ${t('challenge.daysUnit')}`}
            </Text>
          </View>
        </View>

        {/* Progress Section (if joined) */}
        {challenge.is_joined && progress && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t('challenge.myProgress')}</Text>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.round(progressRatio * 100)}%` },
                    progress.completed && styles.progressBarCompleted,
                  ]}
                />
              </View>
              <Text style={styles.progressPercent}>
                {Math.round(progressRatio * 100)}%
              </Text>
            </View>

            {/* Progress Values */}
            <View style={styles.progressValuesRow}>
              <Text style={styles.progressCurrent}>
                {formatGoalValue(challenge.goal_type, progress.current_value)}
              </Text>
              <Text style={styles.progressSeparator}>/</Text>
              <Text style={styles.progressGoal}>
                {formatGoalValue(challenge.goal_type, challenge.goal_value)}
              </Text>
            </View>

            {progress.completed && (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                <Text style={styles.completedText}>{t('challenge.completed')}</Text>
              </View>
            )}
          </View>
        )}

        {/* Stats Row */}
        <View style={styles.sectionCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={20} color={colors.textSecondary} />
              <Text style={styles.statValue}>{challenge.participant_count}</Text>
              <Text style={styles.statLabel}>{t('challenge.participantsLabel')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="star" size={20} color={colors.primary} />
              <Text style={styles.statValue}>{challenge.reward_points}P</Text>
              <Text style={styles.statLabel}>{t('challenge.rewardLabel')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Join Button (if not joined) */}
      {!challenge.is_joined && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.joinButton}
            onPress={handleJoin}
            activeOpacity={0.8}
            disabled={isJoining}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.joinButtonText}>{t('challenge.joinBtn')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },

    // -- Header --
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },

    // -- Loading --
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // -- Scroll --
    scrollContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 100,
      gap: SPACING.md,
    },

    // -- Info Card --
    infoCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.xl,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
      ...SHADOWS.sm,
    },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    goalIconBadge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeBadge: {
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
    },
    typeBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textSecondary,
    },
    title: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.5,
    },
    description: {
      fontSize: FONT_SIZES.md,
      fontWeight: '400',
      color: c.textSecondary,
      lineHeight: 22,
    },
    periodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    periodText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },
    daysLeftBadge: {
      marginLeft: 'auto',
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.primary + '18',
    },
    daysLeftText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.primary,
    },

    // -- Section Card --
    sectionCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.xl,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
      ...SHADOWS.sm,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },

    // -- Goal --
    goalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    goalLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.textSecondary,
    },
    goalValue: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },

    // -- Progress --
    progressBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    progressBarTrack: {
      flex: 1,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 5,
      backgroundColor: c.primary,
    },
    progressBarCompleted: {
      backgroundColor: '#34C759',
    },
    progressPercent: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
      width: 40,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    progressValuesRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: SPACING.xs,
    },
    progressCurrent: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '800',
      color: c.primary,
      fontVariant: ['tabular-nums'],
    },
    progressSeparator: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '400',
      color: c.textTertiary,
    },
    progressGoal: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    completedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: '#34C75918',
    },
    completedText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#34C759',
    },

    // -- Stats --
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    statValue: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: c.border,
    },

    // -- Bottom Bar --
    bottomBar: {
      paddingHorizontal: SPACING.xxl,
      paddingVertical: SPACING.lg,
      paddingBottom: SPACING.xl,
      backgroundColor: c.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    joinButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: c.primary,
    },
    joinButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // -- Bottom padding --
    bottomPadding: {
      height: SPACING.xxxl,
    },
  });
