import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import Card from '../../components/common/Card';
import StatItem from '../../components/common/StatItem';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import type {
  UserStats,
  RunHistoryItem,
  StatsPeriod,
} from '../../types/api';
import { userService } from '../../services/userService';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatNumber,
  formatRelativeTime,
  metersToKm,
} from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

const PERIOD_OPTIONS: Array<{ label: string; value: StatsPeriod }> = [
  { label: '이번 주', value: 'week' },
  { label: '이번 달', value: 'month' },
  { label: '올해', value: 'year' },
  { label: '전체', value: 'all' },
];

export default function MyPageScreen() {
  const { user, logout } = useAuthStore();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunHistoryItem[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [statsData, runsData] = await Promise.all([
        userService.getStats(selectedPeriod).catch(() => null),
        userService.getRunHistory(0, 5).catch(() => ({ data: [], total_count: 0, has_next: false })),
      ]);
      setStats(statsData);
      setRecentRuns(runsData.data);
    } catch {
      // Partial failures are acceptable
    } finally {
      setIsLoadingStats(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handlePeriodChange = (period: StatsPeriod) => {
    setSelectedPeriod(period);
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Profile Header */}
        <View style={styles.profileSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {user?.avatar_url ? '👤' : '🏃'}
            </Text>
          </View>
          <Text style={styles.nickname}>{user?.nickname ?? '러너'}</Text>
          <View style={styles.profileMeta}>
            <Text style={styles.profileStat}>
              총 {formatDistance(user?.total_distance_meters ?? 0)}
            </Text>
            <Text style={styles.profileDivider}>|</Text>
            <Text style={styles.profileStat}>
              {user?.total_runs ?? 0}회 런닝
            </Text>
          </View>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {PERIOD_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.periodChip,
                selectedPeriod === option.value && styles.periodChipActive,
              ]}
              onPress={() => handlePeriodChange(option.value)}
            >
              <Text
                style={[
                  styles.periodChipText,
                  selectedPeriod === option.value &&
                    styles.periodChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats Dashboard */}
        {stats && (
          <>
            <Card style={styles.mainStatsCard}>
              <View style={styles.statsGrid}>
                <StatItem
                  label="총 거리"
                  value={metersToKm(stats.total_distance_meters)}
                  unit="km"
                  large
                />
                <StatItem
                  label="총 시간"
                  value={formatDuration(stats.total_duration_seconds)}
                />
                <StatItem
                  label="총 횟수"
                  value={`${stats.total_runs}`}
                  unit="회"
                />
              </View>
            </Card>

            <Card style={styles.detailStatsCard}>
              <Text style={styles.cardTitle}>상세 통계</Text>
              <View style={styles.statsGrid}>
                <StatItem
                  label="평균 페이스"
                  value={formatPace(stats.avg_pace_seconds_per_km)}
                />
                <StatItem
                  label="최고 페이스"
                  value={formatPace(stats.best_pace_seconds_per_km)}
                />
                <StatItem
                  label="평균 거리"
                  value={formatDistance(stats.avg_distance_per_run_meters)}
                />
              </View>
              <View style={styles.statsGrid}>
                <StatItem
                  label="최장 거리"
                  value={formatDistance(stats.longest_run_meters)}
                />
                <StatItem
                  label="총 고도"
                  value={`${formatNumber(Math.round(stats.total_elevation_gain_meters))}`}
                  unit="m"
                />
                <StatItem
                  label="칼로리"
                  value={formatNumber(stats.estimated_calories)}
                  unit="kcal"
                />
              </View>
            </Card>

            {/* Streaks */}
            <Card style={styles.streakCard}>
              <Text style={styles.cardTitle}>연속 기록</Text>
              <View style={styles.streakRow}>
                <View style={styles.streakItem}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <Text style={styles.streakValue}>
                    {stats.current_streak_days}일
                  </Text>
                  <Text style={styles.streakLabel}>현재 연속</Text>
                </View>
                <View style={styles.streakItem}>
                  <Text style={styles.streakEmoji}>⭐</Text>
                  <Text style={styles.streakValue}>
                    {stats.best_streak_days}일
                  </Text>
                  <Text style={styles.streakLabel}>최고 연속</Text>
                </View>
              </View>
            </Card>

            {/* Course Stats */}
            <Card style={styles.courseStatsCard}>
              <Text style={styles.cardTitle}>코스</Text>
              <View style={styles.statsGrid}>
                <StatItem
                  label="등록한 코스"
                  value={`${stats.courses_created}`}
                />
                <StatItem
                  label="완주한 코스"
                  value={`${stats.courses_completed}`}
                />
                <StatItem
                  label="TOP 10"
                  value={`${stats.ranking_top10_count}`}
                />
              </View>
            </Card>

            {/* Monthly Distance Chart (simplified) */}
            {stats.monthly_distance.length > 0 && (
              <Card style={styles.monthlyCard}>
                <Text style={styles.cardTitle}>월별 거리</Text>
                <View style={styles.monthlyChart}>
                  {stats.monthly_distance.map((md) => {
                    const maxDist = Math.max(
                      ...stats.monthly_distance.map((m) => m.distance_meters),
                    );
                    const heightPercent =
                      maxDist > 0 ? (md.distance_meters / maxDist) * 100 : 0;

                    return (
                      <View key={md.month} style={styles.monthlyBarContainer}>
                        <View style={styles.monthlyBarTrack}>
                          <View
                            style={[
                              styles.monthlyBar,
                              { height: `${Math.max(heightPercent, 4)}%` },
                            ]}
                          />
                        </View>
                        <Text style={styles.monthlyLabel}>
                          {md.month.slice(5)}월
                        </Text>
                        <Text style={styles.monthlyValue}>
                          {metersToKm(md.distance_meters, 0)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}
          </>
        )}

        {/* Recent Runs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>최근 런닝</Text>
          {recentRuns.length > 0 ? (
            recentRuns.map((run) => (
              <RunHistoryRow key={run.id} run={run} />
            ))
          ) : (
            <EmptyState
              title="아직 런닝 기록이 없습니다"
              description="첫 런닝을 시작해 보세요!"
            />
          )}
        </View>

        {/* Settings / Logout */}
        <View style={styles.footerActions}>
          <Button
            title="로그아웃"
            variant="ghost"
            onPress={handleLogout}
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Sub-component ----

function RunHistoryRow({ run }: { run: RunHistoryItem }) {
  return (
    <Card style={styles.runCard}>
      <View style={styles.runHeader}>
        <Text style={styles.runTitle}>
          {run.course ? run.course.title : '자유 런닝'}
        </Text>
        <Text style={styles.runDate}>
          {formatRelativeTime(run.finished_at)}
        </Text>
      </View>
      <View style={styles.runStatsRow}>
        <Text style={styles.runStat}>
          {formatDistance(run.distance_meters)}
        </Text>
        <Text style={styles.runStatSep}>-</Text>
        <Text style={styles.runStat}>
          {formatDuration(run.duration_seconds)}
        </Text>
        <Text style={styles.runStatSep}>-</Text>
        <Text style={styles.runStat}>
          {formatPace(run.avg_pace_seconds_per_km)}
        </Text>
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
  content: {
    paddingBottom: SPACING.xxxl,
    gap: SPACING.lg,
  },

  // Profile
  profileSection: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  avatarText: {
    fontSize: 36,
  },
  nickname: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  profileStat: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  profileDivider: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textTertiary,
  },

  // Period Selector
  periodSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xxl,
  },
  periodChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  periodChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  periodChipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  periodChipTextActive: {
    color: COLORS.white,
  },

  // Cards
  mainStatsCard: {
    marginHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  detailStatsCard: {
    marginHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  streakCard: {
    marginHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  courseStatsCard: {
    marginHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  monthlyCard: {
    marginHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.sm,
  },

  // Streaks
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  streakItem: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  streakEmoji: {
    fontSize: 28,
  },
  streakValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
  },
  streakLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // Monthly Chart
  monthlyChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: SPACING.md,
  },
  monthlyBarContainer: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.xs,
  },
  monthlyBarTrack: {
    flex: 1,
    width: 24,
    justifyContent: 'flex-end',
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
  },
  monthlyBar: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.sm,
    width: '100%',
  },
  monthlyLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary,
    fontWeight: '600',
  },
  monthlyValue: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  // Section
  section: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Run History
  runCard: {
    gap: SPACING.sm,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  runTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  runDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
  },
  runStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  runStat: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  runStatSep: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
  },

  // Footer
  footerActions: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.lg,
  },
});
