import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useChallengeStore } from '../../stores/challengeStore';
import EmptyState from '../../components/common/EmptyState';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { HomeStackParamList } from '../../types/navigation';
import type { ChallengeListItem, ChallengeType } from '../../services/challengeService';
import {
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '../../utils/constants';

type ChallengeNav = NativeStackNavigationProp<HomeStackParamList, 'ChallengeList'>;

const GOAL_TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  total_distance: 'footsteps-outline',
  total_runs: 'repeat-outline',
  total_duration: 'time-outline',
  streak_days: 'flame-outline',
};

const FILTER_TABS: Array<{ key: ChallengeType | 'all'; labelKey: string }> = [
  { key: 'all', labelKey: 'challenge.filterAll' },
  { key: 'individual', labelKey: 'challenge.filterIndividual' },
  { key: 'crew', labelKey: 'challenge.filterCrew' },
];

function getDaysRemaining(endDate: string): number {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function ChallengeListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<ChallengeNav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);

  const challenges = useChallengeStore((s) => s.challenges);
  const isLoading = useChallengeStore((s) => s.isLoading);
  const filterType = useChallengeStore((s) => s.filterType);
  const setFilterType = useChallengeStore((s) => s.setFilterType);
  const fetchChallenges = useChallengeStore((s) => s.fetchChallenges);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchChallenges();
    setRefreshing(false);
  }, [fetchChallenges]);

  const filteredChallenges = useMemo(() => {
    if (filterType === 'all') return challenges;
    return challenges.filter((c) => c.challenge_type === filterType);
  }, [challenges, filterType]);

  const handleChallengePress = useCallback(
    (challengeId: string) => {
      navigation.navigate('ChallengeDetail', { challengeId });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChallengeListItem }) => (
      <ChallengeCard
        challenge={item}
        onPress={() => handleChallengePress(item.id)}
      />
    ),
    [handleChallengePress],
  );

  const keyExtractor = useCallback((item: ChallengeListItem) => item.id, []);

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
        <Text style={styles.headerTitle}>{t('challenge.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabRow}>
        {FILTER_TABS.map((tab) => {
          const isActive = filterType === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setFilterType(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {isLoading && challenges.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredChallenges}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            filteredChallenges.length === 0 && styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              ionicon="trophy-outline"
              title={t('challenge.empty')}
              description={t('challenge.emptyDesc')}
            />
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          windowSize={10}
        />
      )}
    </SafeAreaView>
  );
}

// ---- Challenge Card ----

const ChallengeCard = React.memo(function ChallengeCard({
  challenge,
  onPress,
}: {
  challenge: ChallengeListItem;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const daysLeft = getDaysRemaining(challenge.end_date);
  const goalIcon = GOAL_TYPE_ICONS[challenge.goal_type] ?? 'trophy-outline';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Top Row: Icon + Title + Joined Badge */}
      <View style={styles.cardTopRow}>
        <View style={styles.goalIconBadge}>
          <Ionicons name={goalIcon} size={18} color={colors.primary} />
        </View>
        <View style={styles.cardTitleArea}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {challenge.title}
          </Text>
          <Text style={styles.cardDesc} numberOfLines={2}>
            {challenge.description}
          </Text>
        </View>
        {challenge.is_joined && (
          <View style={styles.joinedBadge}>
            <Text style={styles.joinedBadgeText}>{t('challenge.joined')}</Text>
          </View>
        )}
      </View>

      {/* Bottom Row: Meta */}
      <View style={styles.cardMetaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="people-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.metaText}>
            {t('challenge.participants', { count: challenge.participant_count })}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.metaText}>
            {t('challenge.daysLeft', { count: daysLeft })}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="star-outline" size={14} color={colors.primary} />
          <Text style={[styles.metaText, { color: colors.primary }]}>
            {t('challenge.rewardPoints', { points: challenge.reward_points })}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

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
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.5,
    },

    // -- Tabs --
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    tab: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
    },
    tabActive: {
      backgroundColor: c.text,
    },
    tabText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tabTextActive: {
      color: c.background,
    },

    // -- Loading --
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // -- List --
    listContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.md,
    },
    emptyListContent: {
      flexGrow: 1,
    },

    // -- Card --
    card: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.lg,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
      ...SHADOWS.sm,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
    },
    goalIconBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitleArea: {
      flex: 1,
      gap: 4,
    },
    cardTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    cardDesc: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '400',
      color: c.textSecondary,
      lineHeight: 18,
    },
    joinedBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.primary + '18',
    },
    joinedBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: c.primary,
    },

    // -- Meta Row --
    cardMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
  });
