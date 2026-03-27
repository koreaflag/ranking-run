import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type { ActivityFeedItem } from '../../types/api';
import { userService } from '../../services/userService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS, COLORS } from '../../utils/constants';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatRelativeTime,
} from '../../utils/format';
import { ListEndIndicator } from '../../components/common/Skeleton';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'ActivityFeed'>;

const AVATAR_SIZE = 44;

const FeedCard = React.memo(function FeedCard({
  item,
  colors,
  t,
  onPressUser,
  onPressRun,
  onPressCourse,
}: {
  item: ActivityFeedItem;
  colors: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onPressUser: (userId: string) => void;
  onPressRun: (runId: string) => void;
  onPressCourse: (courseId: string) => void;
}) {
  const isRun = item.type === 'run_completed';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {/* Header: avatar + name + time */}
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => onPressUser(item.user_id)}
        activeOpacity={0.7}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
            <Ionicons name="person" size={20} color={colors.textSecondary} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={[styles.nickname, { color: colors.text }]} numberOfLines={1}>
            {item.nickname ?? t('common.anonymous')}
          </Text>
          <Text style={[styles.timeText, { color: colors.textSecondary }]}>
            {formatRelativeTime(item.created_at)}
          </Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: isRun ? COLORS.primary + '20' : '#3B82F620' }]}>
          <Ionicons
            name={isRun ? 'footsteps' : 'map'}
            size={14}
            color={isRun ? COLORS.primary : '#3B82F6'}
          />
        </View>
      </TouchableOpacity>

      {/* Content */}
      {isRun ? (
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => item.run_id && onPressRun(item.run_id)}
          activeOpacity={0.7}
        >
          <Text style={[styles.activityLabel, { color: colors.textSecondary }]}>
            {item.course_title
              ? `📍 ${item.course_title}`
              : t('feed.freeRun')}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatDistance(item.distance_meters ?? 0)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                {t('feed.distance')}
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatDuration(item.duration_seconds ?? 0)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                {t('feed.time')}
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatPace(item.avg_pace_seconds_per_km)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                {t('feed.pace')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => item.course_id && onPressCourse(item.course_id)}
          activeOpacity={0.7}
        >
          <View style={styles.courseCreatedRow}>
            <Ionicons name="add-circle" size={20} color="#3B82F6" />
            <Text style={[styles.courseCreatedText, { color: colors.text }]} numberOfLines={2}>
              {t('feed.courseCreated', { title: item.course_title_created ?? '' })}
            </Text>
          </View>
          {item.course_distance_meters != null && (
            <Text style={[styles.courseDistanceText, { color: colors.textSecondary }]}>
              {formatDistance(item.course_distance_meters)}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

export default function ActivityFeedScreen() {
  const colors = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();

  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      const data = await userService.getActivityFeed(50);
      setItems(data);
    } catch (error) {
      console.warn('[ActivityFeed] fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed();
  }, [fetchFeed]);

  const handlePressUser = useCallback((userId: string) => {
    navigation.push('UserProfile', { userId });
  }, [navigation]);

  const handlePressRun = useCallback((runId: string) => {
    navigation.push('RunDetail', { runId });
  }, [navigation]);

  const handlePressCourse = useCallback((courseId: string) => {
    navigation.push('CourseDetail', { courseId });
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: ActivityFeedItem }) => (
    <FeedCard
      item={item}
      colors={colors}
      t={t}
      onPressUser={handlePressUser}
      onPressRun={handlePressRun}
      onPressCourse={handlePressCourse}
    />
  ), [colors, t, handlePressUser, handlePressRun, handlePressCourse]);

  const keyExtractor = useCallback((item: ActivityFeedItem, index: number) =>
    `${item.type}_${item.run_id ?? item.course_id ?? index}`,
  []);

  const emptyComponent = useMemo(() => (
    <View style={styles.emptyContainer}>
      <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {t('feed.emptyTitle')}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {t('feed.emptySubtitle')}
      </Text>
    </View>
  ), [colors, t]);

  return (
    <BlurredBackground>
      {/* StatusBar handled by BlurredBackground */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('feed.title')}
          </Text>
          <View style={{ width: 26 }} />
        </View>

        {/* Feed List */}
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            items.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          ListEmptyComponent={loading ? null : emptyComponent}
          ListFooterComponent={items.length > 0 ? <ListEndIndicator text={t('common.endOfList')} /> : null}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={12}
        />
      </SafeAreaView>
    </BlurredBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // Card
  card: {
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  nickname: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  timeText: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  typeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Content
  cardContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xs,
  },
  activityLabel: {
    fontSize: FONT_SIZES.xs,
    marginBottom: SPACING.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    marginHorizontal: SPACING.xs,
  },

  // Course created
  courseCreatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  courseCreatedText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
  },
  courseDistanceText: {
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
    marginLeft: 28,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
});
