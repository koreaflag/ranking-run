import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Image,
  NativeModules,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../stores/authStore';
import { useCourseStore } from '../../stores/courseStore';
import Card from '../../components/common/Card';
import StatItem from '../../components/common/StatItem';
import EmptyState from '../../components/common/EmptyState';
import BlurredBackground from '../../components/common/BlurredBackground';
import GlassCard from '../../components/common/GlassCard';
import type { HomeStackParamList } from '../../types/navigation';
import type { RecentRun, WeeklySummary, FavoriteCourseItem, ActivityFeedItem } from '../../types/api';
import { userService } from '../../services/userService';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatRelativeTime,
} from '../../utils/format';
import { API_BASE_URL, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

type HomeNav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

// DEV mode mock data (shown when backend is unavailable)
const DEV_WEEKLY_SUMMARY: WeeklySummary = {
  total_distance_meters: 23450,
  total_duration_seconds: 7860,
  run_count: 4,
  avg_pace_seconds_per_km: 335,
  compared_to_last_week_percent: 12,
};

const DEV_RECENT_RUNS: RecentRun[] = [
  {
    id: 'dev-run-1',
    distance_meters: 5230,
    duration_seconds: 1740,
    avg_pace_seconds_per_km: 333,
    started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    course: { id: 'dev-course-1', title: '한강 반포 코스' },
  },
  {
    id: 'dev-run-2',
    distance_meters: 10120,
    duration_seconds: 3450,
    avg_pace_seconds_per_km: 341,
    started_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    course: null,
  },
  {
    id: 'dev-run-3',
    distance_meters: 3050,
    duration_seconds: 1080,
    avg_pace_seconds_per_km: 354,
    started_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 71.5 * 60 * 60 * 1000).toISOString(),
    course: { id: 'dev-course-2', title: '올림픽공원 순환' },
  },
];

const DEV_ACTIVITY_FEED: ActivityFeedItem[] = [
  {
    type: 'run_completed',
    user_id: 'dev-user-2',
    nickname: '달리는하마',
    avatar_url: null,
    run_id: 'dev-feed-run-1',
    distance_meters: 7500,
    duration_seconds: 2580,
    course_title: '여의도 한강공원',
    course_id: null,
    course_title_created: null,
    course_distance_meters: null,
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    type: 'course_created',
    user_id: 'dev-user-3',
    nickname: '런크루장',
    avatar_url: null,
    run_id: null,
    distance_meters: null,
    duration_seconds: null,
    course_title: null,
    course_id: 'dev-course-new',
    course_title_created: '남산 순환 코스',
    course_distance_meters: 4200,
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    type: 'run_completed',
    user_id: 'dev-user-4',
    nickname: '새벽러너',
    avatar_url: null,
    run_id: 'dev-feed-run-2',
    distance_meters: 12300,
    duration_seconds: 4020,
    course_title: null,
    course_id: null,
    course_title_created: null,
    course_distance_meters: null,
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
];

export default function HomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { user } = useAuthStore();
  const colors = useTheme();
  const { favoriteCourses, fetchFavoriteCourses } = useCourseStore();

  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [usingMockData, setUsingMockData] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [connectivityDetail, setConnectivityDetail] = useState<string>('확인중...');

  const styles = useMemo(() => createStyles(colors), [colors]);

  const loadHomeData = useCallback(async () => {
    try {
      const [runs, summary, feed] = await Promise.all([
        userService.getRecentRuns(3).catch((e) => { console.warn('[Home] getRecentRuns failed:', e); return [] as RecentRun[]; }),
        userService.getWeeklySummary().catch((e) => { console.warn('[Home] getWeeklySummary failed:', e); return null; }),
        userService.getActivityFeed(10).catch((e) => { console.warn('[Home] getActivityFeed failed:', e); return [] as ActivityFeedItem[]; }),
      ]);

      // Server responded — use real data (even if empty)
      setRecentRuns(runs);
      setWeeklySummary(summary);
      setActivityFeed(feed);
      setUsingMockData(false);
      setServerError(null);

      // Fetch favorite courses
      await fetchFavoriteCourses();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setServerError(msg);
      // In DEV mode, show mock data even on total failure
      if (__DEV__) {
        setRecentRuns(DEV_RECENT_RUNS);
        setWeeklySummary(DEV_WEEKLY_SUMMARY);
        setActivityFeed(DEV_ACTIVITY_FEED);
        setUsingMockData(true);
      }
    }
  }, [fetchFavoriteCourses]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  // Request location permission on mount
  useEffect(() => {
    if (Platform.OS === 'ios' && NativeModules.GPSTrackerModule) {
      NativeModules.GPSTrackerModule.requestLocationPermission?.();
    }
  }, []);

  // Direct connectivity test when mock data is detected
  useEffect(() => {
    if (!usingMockData) return;
    const testUrl = API_BASE_URL.replace('/api/v1', '/docs');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(testUrl, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout);
        setConnectivityDetail(`${testUrl} → HTTP ${res.status}`);
      })
      .catch((err) => {
        clearTimeout(timeout);
        const name = err?.name ?? '';
        const msg = err?.message ?? String(err);
        if (name === 'AbortError') {
          setConnectivityDetail(`타임아웃 (8초) — 서버 또는 포트 접근 불가`);
        } else {
          setConnectivityDetail(`${name}: ${msg}`);
        }
      });
  }, [usingMockData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHomeData();
    setRefreshing(false);
  }, [loadHomeData]);

  const handleCoursePress = (courseId: string) => {
    navigation.navigate('CourseDetail', { courseId });
  };

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* DEV: Server connection debug banner */}
        {__DEV__ && usingMockData && (
          <View style={styles.debugBanner}>
            <Text style={styles.debugBannerText}>
              서버 연결 안됨 — 테스트 데이터 표시중
            </Text>
            <Text style={styles.debugBannerDetail}>API: {API_BASE_URL}</Text>
            <Text style={styles.debugBannerDetail}>{connectivityDetail}</Text>
          </View>
        )}

        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greeting}>
            {'안녕, '}
            <Text style={styles.greetingName}>
              {user?.nickname ?? '러너'}
            </Text>
          </Text>
          <Text style={styles.greetingSub}>
            오늘도 달려볼까요?
          </Text>
        </View>

        {/* Weekly Summary */}
        {weeklySummary && (
          <View style={styles.weeklySection}>
            <Text style={styles.sectionTitle}>이번 주</Text>
            <GlassCard>
              <View style={styles.weeklyTopRow}>
                <View style={styles.weeklyHighlight}>
                  <Text style={styles.weeklyHighlightLabel}>총 거리</Text>
                  <Text style={styles.weeklyHighlightValue}>
                    {formatDistance(weeklySummary.total_distance_meters)}
                  </Text>
                </View>
                {weeklySummary.compared_to_last_week_percent !== 0 && (
                  <View
                    style={[
                      styles.weeklyBadge,
                      {
                        backgroundColor:
                          weeklySummary.compared_to_last_week_percent > 0
                            ? colors.success + '14'
                            : colors.error + '14',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.weeklyBadgeText,
                        {
                          color:
                            weeklySummary.compared_to_last_week_percent > 0
                              ? colors.success
                              : colors.error,
                        },
                      ]}
                    >
                      {weeklySummary.compared_to_last_week_percent > 0 ? '+' : ''}
                      {weeklySummary.compared_to_last_week_percent}%
                    </Text>
                    <Text style={styles.weeklyBadgeSub}>지난주 대비</Text>
                  </View>
                )}
              </View>

              <View style={styles.weeklyDivider} />

              <View style={styles.weeklyStatsRow}>
                <View style={styles.weeklyStatCell}>
                  <Text style={styles.weeklyStatLabel}>시간</Text>
                  <Text style={styles.weeklyStatValue}>
                    {formatDuration(weeklySummary.total_duration_seconds)}
                  </Text>
                </View>
                <View style={styles.weeklyStatSeparator} />
                <View style={styles.weeklyStatCell}>
                  <Text style={styles.weeklyStatLabel}>러닝</Text>
                  <Text style={styles.weeklyStatValue}>
                    {weeklySummary.run_count}
                    <Text style={styles.weeklyStatUnit}>회</Text>
                  </Text>
                </View>
                <View style={styles.weeklyStatSeparator} />
                <View style={styles.weeklyStatCell}>
                  <Text style={styles.weeklyStatLabel}>평균 페이스</Text>
                  <Text style={styles.weeklyStatValue}>
                    {formatPace(weeklySummary.avg_pace_seconds_per_km)}
                  </Text>
                </View>
              </View>
            </GlassCard>
          </View>
        )}

        {/* Friend Activity Feed */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>친구 활동</Text>
          </View>
          {activityFeed.length > 0 ? (
            <View style={styles.activityList}>
              {activityFeed.slice(0, 5).map((item, index) => (
                <ActivityItem key={`${item.type}-${item.run_id || item.course_id}-${index}`} item={item} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyCardWrapper}>
              <Card>
                <EmptyState
                  icon="—"
                  title="아직 친구 활동이 없습니다"
                  description="다른 러너를 팔로우해 보세요!"
                />
              </Card>
            </View>
          )}
        </View>

        {/* Favorite Courses */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>즐겨찾기 코스</Text>
          </View>
          {favoriteCourses.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {favoriteCourses.map((item: FavoriteCourseItem) => (
                <FavoriteCourseCard
                  key={item.id}
                  item={item}
                  onPress={() => handleCoursePress(item.id)}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyCardWrapper}>
              <Card>
                <EmptyState
                  icon="—"
                  title="즐겨찾기 코스가 없습니다"
                  description="마음에 드는 코스를 즐겨찾기에 추가해 보세요!"
                />
              </Card>
            </View>
          )}
        </View>

        {/* Recent Runs */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>최근 러닝</Text>
          </View>

          {recentRuns.length > 0 ? (
            <View style={styles.runsList}>
              {recentRuns.map((run) => (
                <RecentRunCard key={run.id} run={run} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyCardWrapper}>
              <Card>
                <EmptyState
                  icon="🏃"
                  title="아직 러닝 기록이 없습니다"
                  description="첫 러닝을 시작해 보세요!"
                />
              </Card>
            </View>
          )}
        </View>
      </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ---- Sub-components ----

function RecentRunCard({ run }: { run: RecentRun }) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.recentRunCard}>
      <View style={styles.recentRunHeader}>
        <View style={styles.recentRunTitleBlock}>
          <Text style={styles.recentRunTitle}>
            {run.course ? run.course.title : '자유 러닝'}
          </Text>
          <Text style={styles.recentRunTime}>
            {formatRelativeTime(run.finished_at)}
          </Text>
        </View>
        <View style={styles.recentRunHeroDistance}>
          <Text style={styles.recentRunHeroValue}>
            {formatDistance(run.distance_meters)}
          </Text>
        </View>
      </View>

      <View style={styles.recentRunDivider} />

      <View style={styles.recentRunStats}>
        <StatItem label="시간" value={formatDuration(run.duration_seconds)} />
        <StatItem
          label="페이스"
          value={formatPace(run.avg_pace_seconds_per_km)}
        />
      </View>
    </View>
  );
}

function FavoriteCourseCard({
  item,
  onPress,
}: {
  item: FavoriteCourseItem;
  onPress: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.courseCard} onPress={onPress} activeOpacity={0.7}>
      {/* Thumbnail */}
      {item.thumbnail_url ? (
        <View>
          <Image source={{ uri: item.thumbnail_url }} style={styles.courseThumbnailImage} />
          <View style={styles.favBadge}>
            <Ionicons name="heart" size={14} color={colors.primary} />
          </View>
        </View>
      ) : (
        <View style={styles.courseThumbnail}>
          <Ionicons name="heart" size={24} color={colors.primary} />
          <Text style={styles.thumbnailLabel}>즐겨찾기</Text>
        </View>
      )}

      {/* Course info */}
      <View style={styles.courseInfo}>
        <Text style={styles.courseDistance}>
          {formatDistance(item.distance_meters)}
        </Text>
        <Text style={styles.courseTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.courseMetaRow}>
          <Ionicons name="person-outline" size={12} color={colors.textTertiary} />
          <Text style={styles.courseMetaText}>
            {item.creator_nickname}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ActivityItem({ item }: { item: ActivityFeedItem }) {
    const colors = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const navigation = useNavigation<HomeNav>();

    const handlePress = () => {
        if (item.type === 'course_created' && item.course_id) {
            navigation.navigate('CourseDetail', { courseId: item.course_id });
        } else if (item.user_id) {
            navigation.navigate('UserProfile', { userId: item.user_id });
        }
    };

    return (
        <TouchableOpacity style={styles.activityCard} onPress={handlePress} activeOpacity={0.7}>
            <View style={styles.activityAvatar}>
                {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.activityAvatarImage} />
                ) : (
                    <View style={styles.activityAvatarPlaceholder}>
                        <Text style={styles.activityAvatarText}>
                            {(item.nickname ?? '?').charAt(0).toUpperCase()}
                        </Text>
                    </View>
                )}
            </View>
            <View style={styles.activityContent}>
                <Text style={styles.activityText} numberOfLines={2}>
                    <Text style={styles.activityNickname}>{item.nickname ?? '러너'}</Text>
                    {item.type === 'run_completed' ? (
                        <>{'님이 '}
                        {item.course_title ? (
                            <Text style={styles.activityHighlight}>{item.course_title}</Text>
                        ) : '자유 러닝'}
                        {`을 완주했어요 `}
                        <Text style={styles.activityDistance}>{formatDistance(item.distance_meters ?? 0)}</Text>
                        </>
                    ) : (
                        <>{'님이 새 코스 '}
                        <Text style={styles.activityHighlight}>{item.course_title_created}</Text>
                        {'을 등록했어요'}
                        </>
                    )}
                </Text>
                <Text style={styles.activityTime}>{formatRelativeTime(item.created_at)}</Text>
            </View>
            <Ionicons
                name={item.type === 'run_completed' ? 'footsteps' : 'flag'}
                size={16}
                color={colors.textTertiary}
            />
        </TouchableOpacity>
    );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  debugBanner: {
    backgroundColor: '#EF4444',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  debugBannerText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  debugBannerDetail: {
    color: '#FFFFFF99',
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  contentContainer: {
    paddingBottom: 120,
  },

  // --- Greeting ---
  greetingSection: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.huge,
    paddingBottom: SPACING.xl,
  },
  greeting: {
    fontSize: 34,
    fontWeight: '800',
    color: c.text,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  greetingName: {
    color: c.text,
    fontWeight: '800',
  },
  greetingSub: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '400',
    color: c.textTertiary,
    marginTop: SPACING.xs,
    lineHeight: 24,
  },

  // --- Section Title (bold black, no decorators) ---
  sectionTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
    letterSpacing: -0.3,
  },

  // --- Weekly Summary ---
  weeklySection: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  weeklyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  weeklyHighlight: {
    gap: SPACING.xs,
  },
  weeklyHighlightLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textTertiary,
  },
  weeklyHighlightValue: {
    fontSize: 36,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  weeklyBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    gap: 2,
  },
  weeklyBadgeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  weeklyBadgeSub: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
  },
  weeklyDivider: {
    height: 1,
    backgroundColor: c.divider,
    marginVertical: SPACING.lg,
  },
  weeklyStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weeklyStatCell: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  weeklyStatLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weeklyStatValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  weeklyStatUnit: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textTertiary,
  },
  weeklyStatSeparator: {
    width: 1,
    height: 28,
    backgroundColor: c.divider,
  },

  // --- Section ---
  section: {
    paddingTop: SPACING.xxxl,
    gap: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  // --- Horizontal List ---
  horizontalList: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  emptyCardWrapper: {
    paddingHorizontal: SPACING.xxl,
  },

  // --- Course Card (clean card bg, bold distance) ---
  courseCard: {
    width: 200,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },
  courseThumbnail: {
    height: 100,
    backgroundColor: c.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  courseThumbnailImage: {
    height: 100,
    width: '100%',
    resizeMode: 'cover',
  },
  thumbnailLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textTertiary,
  },
  favBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: c.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  courseInfo: {
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  courseDistance: {
    fontSize: FONT_SIZES.xl,
    color: c.text,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  courseTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textSecondary,
  },
  courseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    gap: 4,
  },
  courseMetaText: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontWeight: '400',
  },
  // --- Recent Runs (hero distance layout) ---
  runsList: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  recentRunCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: c.border,
  },
  recentRunHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentRunTitleBlock: {
    flex: 1,
    gap: 3,
  },
  recentRunTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
  recentRunTime: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontWeight: '400',
  },
  recentRunHeroDistance: {
    alignItems: 'flex-end',
  },
  recentRunHeroValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  recentRunDivider: {
    height: 1,
    backgroundColor: c.divider,
    marginVertical: SPACING.lg,
  },
  recentRunStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },

  // --- Activity Feed ---
  activityList: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  activityAvatar: {
    width: 36,
    height: 36,
  },
  activityAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  activityAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityAvatarText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: c.textSecondary,
  },
  activityContent: {
    flex: 1,
    gap: 2,
  },
  activityText: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    lineHeight: 18,
  },
  activityNickname: {
    fontWeight: '700',
    color: c.text,
  },
  activityHighlight: {
    fontWeight: '600',
    color: c.primary,
  },
  activityDistance: {
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  activityTime: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
  },

});
