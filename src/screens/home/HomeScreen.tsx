import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../stores/authStore';
import { useCourseStore } from '../../stores/courseStore';
import Card from '../../components/common/Card';
import StatItem from '../../components/common/StatItem';
import EmptyState from '../../components/common/EmptyState';
import type { HomeStackParamList } from '../../types/navigation';
import type { NearbyCourse, RecentRun, WeeklySummary } from '../../types/api';
import { userService } from '../../services/userService';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatRelativeTime,
} from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type HomeNav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { user } = useAuthStore();
  const { nearbyCourses, fetchNearbyCourses } = useCourseStore();

  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadHomeData = useCallback(async () => {
    try {
      const [runs, summary] = await Promise.all([
        userService.getRecentRuns(3).catch(() => [] as RecentRun[]),
        userService.getWeeklySummary().catch(() => null),
      ]);
      setRecentRuns(runs);
      setWeeklySummary(summary);

      // Fetch nearby courses with a mock location (Seoul city center)
      // In production, this would use the device's actual location
      await fetchNearbyCourses(37.5665, 126.978);
    } catch {
      // Partial failures are acceptable on the home screen
    }
  }, [fetchNearbyCourses]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHomeData();
    setRefreshing(false);
  }, [loadHomeData]);

  const handleStartRun = () => {
    // Navigate to the RunningTab
    // Using the parent navigator to switch tabs
    navigation.getParent()?.navigate('RunningTab');
  };

  const handleCoursePress = (courseId: string) => {
    navigation.navigate('CourseDetail', { courseId });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greeting}>
            안녕하세요, {user?.nickname ?? '러너'}님
          </Text>
          <Text style={styles.greetingSub}>오늘도 함께 달려볼까요?</Text>
        </View>

        {/* Weekly Summary */}
        {weeklySummary && (
          <Card style={styles.weeklySummaryCard}>
            <Text style={styles.sectionLabel}>이번 주 요약</Text>
            <View style={styles.weeklyStats}>
              <StatItem
                label="거리"
                value={formatDistance(weeklySummary.total_distance_meters)}
              />
              <StatItem
                label="시간"
                value={formatDuration(weeklySummary.total_duration_seconds)}
              />
              <StatItem
                label="횟수"
                value={`${weeklySummary.run_count}회`}
              />
              <StatItem
                label="평균 페이스"
                value={formatPace(weeklySummary.avg_pace_seconds_per_km)}
              />
            </View>
            {weeklySummary.compared_to_last_week_percent !== 0 && (
              <Text
                style={[
                  styles.weeklyCompare,
                  {
                    color:
                      weeklySummary.compared_to_last_week_percent > 0
                        ? COLORS.success
                        : COLORS.error,
                  },
                ]}
              >
                지난주 대비{' '}
                {weeklySummary.compared_to_last_week_percent > 0 ? '+' : ''}
                {weeklySummary.compared_to_last_week_percent}%
              </Text>
            )}
          </Card>
        )}

        {/* Recommended Courses */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>추천 코스</Text>
            <TouchableOpacity
              onPress={() => navigation.getParent()?.navigate('CourseTab')}
            >
              <Text style={styles.seeAll}>더보기</Text>
            </TouchableOpacity>
          </View>

          {nearbyCourses.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {nearbyCourses.map((course: NearbyCourse) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onPress={() => handleCoursePress(course.id)}
                />
              ))}
            </ScrollView>
          ) : (
            <Card>
              <EmptyState
                title="주변에 등록된 코스가 없습니다"
                description="직접 달리고 코스를 등록해 보세요!"
              />
            </Card>
          )}
        </View>

        {/* Recent Runs */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>최근 활동</Text>
          </View>

          {recentRuns.length > 0 ? (
            <View style={styles.runsList}>
              {recentRuns.map((run) => (
                <RecentRunCard key={run.id} run={run} />
              ))}
            </View>
          ) : (
            <Card>
              <EmptyState
                title="아직 런닝 기록이 없습니다"
                description="첫 런닝을 시작해 보세요!"
              />
            </Card>
          )}
        </View>
      </ScrollView>

      {/* FAB - Start Running */}
      <TouchableOpacity style={styles.fab} onPress={handleStartRun} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>🏃</Text>
        <Text style={styles.fabText}>런닝 시작</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---- Sub-components ----

function CourseCard({
  course,
  onPress,
}: {
  course: NearbyCourse;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.courseCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.courseThumbnail}>
        <Text style={styles.courseEmoji}>🗺</Text>
      </View>
      <View style={styles.courseInfo}>
        <Text style={styles.courseTitle} numberOfLines={1}>
          {course.title}
        </Text>
        <Text style={styles.courseDistance}>
          {formatDistance(course.distance_meters)}
        </Text>
        <View style={styles.courseMetaRow}>
          <Text style={styles.courseMeta}>
            {course.total_runs}회 달림
          </Text>
          <Text style={styles.courseMeta}>
            {formatDistance(course.distance_from_user_meters)} 거리
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function RecentRunCard({ run }: { run: RecentRun }) {
  return (
    <Card style={styles.runCard}>
      <View style={styles.runCardHeader}>
        <View>
          <Text style={styles.runTitle}>
            {run.course ? run.course.title : '자유 런닝'}
          </Text>
          <Text style={styles.runTime}>
            {formatRelativeTime(run.finished_at)}
          </Text>
        </View>
      </View>
      <View style={styles.runStats}>
        <StatItem label="거리" value={formatDistance(run.distance_meters)} />
        <StatItem
          label="시간"
          value={formatDuration(run.duration_seconds)}
        />
        <StatItem
          label="페이스"
          value={formatPace(run.avg_pace_seconds_per_km)}
        />
      </View>
    </Card>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100,
  },
  greetingSection: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  greeting: {
    fontSize: FONT_SIZES.title,
    fontWeight: '800',
    color: COLORS.text,
  },
  greetingSub: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  weeklySummaryCard: {
    marginHorizontal: SPACING.xxl,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  weeklyStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weeklyCompare: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  section: {
    paddingTop: SPACING.lg,
    gap: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
  },
  seeAll: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  horizontalList: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  courseCard: {
    width: 180,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  courseThumbnail: {
    height: 100,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  courseEmoji: {
    fontSize: 32,
  },
  courseInfo: {
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  courseTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  courseDistance: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  courseMetaRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  courseMeta: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary,
  },
  runsList: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  runCard: {
    gap: SPACING.md,
  },
  runCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  runTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  runTime: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  runStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: SPACING.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.sm,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 20,
  },
  fabText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
});
