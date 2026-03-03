import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../stores/authStore';
import type { MyPageStackParamList } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import PaceTrendChart from '../../components/charts/PaceTrendChart';
import ActivityHeatmap from '../../components/charts/ActivityHeatmap';
import WeeklyGoalBar from '../../components/charts/WeeklyGoalBar';
import type {
  UserStats,
  RunHistoryItem,
  StatsPeriod,
  AnalyticsData,
} from '../../types/api';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatNumber,
  metersToKm,
} from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

// Period option values (labels resolved via t() inside component)
const PERIOD_VALUES: StatsPeriod[] = ['week', 'month', 'year', 'all'];
const PERIOD_KEYS: Record<StatsPeriod, string> = {
  week: 'mypage.periodWeek',
  month: 'mypage.periodMonth',
  year: 'mypage.periodYear',
  all: 'mypage.periodAll',
};

const WEEKDAY_KEYS = [
  'mypage.days.sun', 'mypage.days.mon', 'mypage.days.tue', 'mypage.days.wed',
  'mypage.days.thu', 'mypage.days.fri', 'mypage.days.sat',
];

function getRunLabel(run: RunHistoryItem, t: (key: string) => string): string {
  if (run.course) return run.course.title;
  if (run.device_model === 'Apple Watch') return t('mypage.watchRunning');
  return t('mypage.freeRunning');
}

function getTimeOfDay(iso: string, t: (key: string) => string): string {
  const h = new Date(iso).getHours();
  if (h < 6) return t('mypage.timeOfDay.dawn');
  if (h < 12) return t('mypage.timeOfDay.morning');
  if (h < 18) return t('mypage.timeOfDay.afternoon');
  return t('mypage.timeOfDay.evening');
}

type Nav = NativeStackNavigationProp<MyPageStackParamList, 'MyPage'>;

export default function MyPageScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [allRuns, setAllRuns] = useState<RunHistoryItem[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');
  const [refreshing, setRefreshing] = useState(false);
  const [socialCounts, setSocialCounts] = useState<{ following: number; followers: number; likes: number }>({ following: 0, followers: 0, likes: 0 });

  const loadData = useCallback(async () => {
    try {
      const [statsData, runsData, socialData, analyticsData] = await Promise.all([
        userService.getStats(selectedPeriod).catch(() => null),
        userService.getRunHistory(0, 200).catch(() => ({ data: [], total_count: 0, has_next: false })),
        userService.getSocialCounts().catch(() => ({ followers_count: 0, following_count: 0, total_likes_received: 0 })),
        userService.getAnalytics().catch(() => null),
      ]);
      setStats(statsData);
      setAllRuns(runsData.data);
      setSocialCounts({ following: socialData.following_count, followers: socialData.followers_count, likes: socialData.total_likes_received });
      setAnalytics(analyticsData);
    } catch {
      // Partial failures are acceptable
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

  const handleChangeAvatar = () => {
    Alert.alert(t('mypage.profilePhoto'), t('mypage.photoSource'), [
      { text: t('common.camera'), onPress: () => pickAvatarImage('camera') },
      { text: t('common.library'), onPress: () => pickAvatarImage('library') },
      ...(user?.avatar_url ? [{ text: t('common.defaultImage'), onPress: removeAvatar }] : []),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  const pickAvatarImage = async (source: 'camera' | 'library') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(t('common.permissionTitle'), t('common.permissionPhoto'));
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });

    if (!result.canceled && result.assets[0]) {
      try {
        const uploadResponse = await authService.uploadAvatar(result.assets[0].uri);
        const updated = await authService.updateProfile({ avatar_url: uploadResponse.url });
        useAuthStore.getState().setUser({
          ...user!,
          avatar_url: updated.avatar_url,
          nickname: updated.nickname,
        });
      } catch {
        Alert.alert(t('common.error'), t('mypage.avatarChangeFailed'));
      }
    }
  };

  const removeAvatar = async () => {
    try {
      const updated = await authService.updateProfile({ avatar_url: null });
      useAuthStore.getState().setUser({
        ...user!,
        avatar_url: updated.avatar_url,
        nickname: updated.nickname,
      });
    } catch {
      Alert.alert(t('common.error'), t('mypage.avatarRemoveFailed'));
    }
  };

  // ================================================================
  // Render
  // ================================================================
  // Layout follows eye-tracking F-pattern:
  //   1. Profile (identity anchor — "who am I")
  //   2. Hero stats (primary reward — "how much have I done")
  //   3. Chart (progress feel — "am I improving")
  //   4. Recent runs (recency bias — "what did I do lately")
  //   5. Records (achievement — "what's my best")
  //   6. Course stats (social proof — "how do I rank")
  //   7. Tools/Settings (utility — infrequent, bottom)

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          onPress={() => navigation.navigate('ProfileEdit')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerEditText}>{t('mypage.editProfile')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* ================================================================ */}
        {/* 1. Profile — Identity anchor (Gestalt: proximity)                */}
        {/*    Avatar + name grouped tightly, social counts below.           */}
        {/* ================================================================ */}
        <View style={styles.profileSection}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={handleChangeAvatar}
            activeOpacity={0.7}
          >
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={36} color={colors.textTertiary} />
              </View>
            )}
            <View style={[styles.avatarCameraBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.nickname}>{user?.nickname ?? t('mypage.defaultNickname')}</Text>
          {user?.crew_name ? (
            <View style={styles.crewTag}>
              <Ionicons name="people" size={12} color={colors.primary} />
              <Text style={styles.crewTagText}>{user.crew_name}</Text>
            </View>
          ) : null}
          <Text style={styles.userCodeText}>#{user?.user_code || '-----'}</Text>
          {user?.bio && <Text style={styles.bioText}>{user.bio}</Text>}
          {user?.instagram_username && (
            <TouchableOpacity
              style={styles.instagramRow}
              onPress={() => Linking.openURL(`https://instagram.com/${user.instagram_username}`)}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-instagram" size={14} color={colors.textSecondary} />
              <Text style={styles.instagramText}>@{user.instagram_username}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.profileStatsRow}>
            <TouchableOpacity
              style={styles.profileStatItem}
              onPress={() => user?.id && navigation.navigate('FollowList', { userId: user.id, type: 'following' })}
              activeOpacity={0.6}
            >
              <Text style={styles.profileStatValue}>{socialCounts.following}</Text>
              <Text style={styles.profileStatLabel}>{t('mypage.following')}</Text>
            </TouchableOpacity>
            <View style={styles.profileStatDivider} />
            <TouchableOpacity
              style={styles.profileStatItem}
              onPress={() => user?.id && navigation.navigate('FollowList', { userId: user.id, type: 'followers' })}
              activeOpacity={0.6}
            >
              <Text style={styles.profileStatValue}>{socialCounts.followers}</Text>
              <Text style={styles.profileStatLabel}>{t('mypage.followers')}</Text>
            </TouchableOpacity>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>{socialCounts.likes}</Text>
              <Text style={styles.profileStatLabel}>{t('mypage.likes')}</Text>
            </View>
          </View>
        </View>

        {stats && (
          <>
            {/* ============================================================ */}
            {/* 2. Activity Dashboard — Primary reward signal                 */}
            {/*    F-pattern: large number top-left → secondary metrics right */}
            {/*    Period tabs above card (direct manipulation affordance)    */}
            {/* ============================================================ */}
            <View style={styles.periodBar}>
              {PERIOD_VALUES.map((value) => {
                const isActive = selectedPeriod === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.periodChip, isActive && styles.periodChipActive]}
                    onPress={() => setSelectedPeriod(value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.periodChipText, isActive && styles.periodChipTextActive]}>
                      {t(PERIOD_KEYS[value])}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.heroCard}>
              {/* Left: hero distance (biggest visual weight = most important) */}
              {/* Right: secondary counters (횟수 + 시간)                     */}
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.heroDistance}>
                    {metersToKm(stats.total_distance_meters, 1)}
                  </Text>
                  <Text style={styles.heroUnit}>km</Text>
                </View>
                <View style={styles.heroSide}>
                  <View style={styles.heroSideItem}>
                    <Text style={styles.heroSideValue}>{stats.total_runs ?? 0}</Text>
                    <Text style={styles.heroSideLabel}>{t('mypage.times')}</Text>
                  </View>
                  <View style={styles.heroSideDivider} />
                  <View style={styles.heroSideItem}>
                    <Text style={styles.heroSideValue}>{formatDuration(stats.total_duration_seconds)}</Text>
                    <Text style={styles.heroSideLabel}>{t('running.metrics.time')}</Text>
                  </View>
                </View>
              </View>

              {/* 2x2 stat cells (Miller: 4 items, easy chunking)           */}
              {/* Icon left → value → label: icon draws eye, value anchors  */}
              <View style={styles.statGrid}>
                <View style={styles.statGridCell}>
                  <Ionicons name="speedometer-outline" size={16} color={colors.primary} />
                  <Text style={styles.statGridValue}>{formatPace(stats.avg_pace_seconds_per_km)}</Text>
                  <Text style={styles.statGridLabel}>{t('running.metrics.avgPace')}</Text>
                </View>
                <View style={styles.statGridCell}>
                  <Ionicons name="flash-outline" size={16} color={colors.primary} />
                  <Text style={styles.statGridValue}>{formatPace(stats.best_pace_seconds_per_km)}</Text>
                  <Text style={styles.statGridLabel}>{t('mypage.bestPace')}</Text>
                </View>
                <View style={styles.statGridCell}>
                  <Ionicons name="bonfire-outline" size={16} color={colors.primary} />
                  <Text style={styles.statGridValue}>{formatNumber(stats.estimated_calories)}</Text>
                  <Text style={styles.statGridLabel}>{t('running.metrics.kcal')}</Text>
                </View>
                <View style={styles.statGridCell}>
                  <Ionicons name="trending-up-outline" size={16} color={colors.primary} />
                  <Text style={styles.statGridValue}>+{formatNumber(Math.round(stats.total_elevation_gain_meters))}</Text>
                  <Text style={styles.statGridLabel}>{t('running.metrics.elevation')}</Text>
                </View>
              </View>
            </View>

            {/* ============================================================ */}
            {/* 2b. Weekly Goal — Progress feel (endowed progress effect)     */}
            {/*     Shows this week's distance vs goal target                 */}
            {/* ============================================================ */}
            {analytics && (
              <View style={styles.card}>
                <View style={styles.cardTitleWithIcon}>
                  <Ionicons name="flag" size={14} color={colors.primary} />
                  <Text style={styles.cardTitle}>{t('mypage.weeklyGoal')}</Text>
                </View>
                <WeeklyGoalBar
                  currentKm={analytics.weekly_current_km}
                  goalKm={analytics.weekly_goal_km}
                />
              </View>
            )}

            {/* ============================================================ */}
            {/* 3. Chart — Monthly distance overview                          */}
            {/*    Orange bars = brand color association                       */}
            {/* ============================================================ */}
            {stats.monthly_distance.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.cardTitleWithIcon}>
                    <Ionicons name="bar-chart" size={14} color={colors.primary} />
                    <Text style={styles.cardTitle}>{t('mypage.runningTrend')}</Text>
                  </View>
                  <Text style={styles.cardSubtitle}>km</Text>
                </View>
                <View style={styles.monthlyChart}>
                  {stats.monthly_distance.map((md) => {
                    const maxDist = Math.max(
                      ...stats.monthly_distance.map((m) => m.distance_meters),
                    );
                    const heightPercent =
                      maxDist > 0 ? (md.distance_meters / maxDist) * 100 : 0;

                    return (
                      <View key={md.month} style={styles.monthlyBarContainer}>
                        <Text style={styles.monthlyValue}>
                          {metersToKm(md.distance_meters, 0)}
                        </Text>
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
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ============================================================ */}
            {/* 3b. Pace Trend — Line chart showing pace evolution            */}
            {/*     Downward line = getting faster → motivation               */}
            {/* ============================================================ */}
            {analytics && analytics.pace_trend.length >= 2 && (
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.cardTitleWithIcon}>
                    <Ionicons name="analytics" size={14} color={colors.primary} />
                    <Text style={styles.cardTitle}>{t('mypage.paceTrend')}</Text>
                  </View>
                  <Text style={styles.cardSubtitle}>min/km</Text>
                </View>
                <PaceTrendChart data={analytics.pace_trend} />
              </View>
            )}

            {/* ============================================================ */}
            {/* 3c. Activity Heatmap — GitHub-style calendar                  */}
            {/*     Visual consistency tracker → habit formation              */}
            {/* ============================================================ */}
            {analytics && analytics.activity_calendar.length > 0 && (
              <View style={styles.card}>
                <View style={[styles.cardTitleWithIcon, { marginBottom: SPACING.sm }]}>
                  <Ionicons name="grid" size={14} color={colors.primary} />
                  <Text style={styles.cardTitle}>{t('mypage.activityCalendar')}</Text>
                </View>
                <ActivityHeatmap data={analytics.activity_calendar} />
              </View>
            )}

            {/* ============================================================ */}
            {/* 4. Recent Activity — Recency bias (Kahneman peak-end)         */}
            {/*    Most recent first → feels "alive". Left accent bar guides  */}
            {/*    the scanning eye downward. Tap → RunDetail (clear CTA).    */}
            {/* ============================================================ */}
            {allRuns.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.cardTitleWithIcon}>
                    <Ionicons name="time" size={14} color={colors.primary} />
                    <Text style={styles.cardTitle}>{t('mypage.recentActivity')}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('RunHistory')}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.seeAllText}>{t('common.viewAll')}</Text>
                  </TouchableOpacity>
                </View>
                {allRuns.slice(0, 5).map((run, idx) => {
                  const d = new Date(run.finished_at);
                  const dayLabel = t(WEEKDAY_KEYS[d.getDay()]);
                  const timeLabel = `${dayLabel} ${getTimeOfDay(run.finished_at, t)}`;

                  return (
                    <TouchableOpacity
                      key={run.id}
                      style={[styles.recentRunCard, idx > 0 && styles.recentRunCardBorder]}
                      onPress={() => navigation.navigate('RunDetail', { runId: run.id })}
                      activeOpacity={0.7}
                    >
                      <View style={styles.recentRunInner}>
                        <View style={[styles.recentRunAccent, { backgroundColor: colors.primary }]} />
                        <View style={styles.recentRunBody}>
                          <View style={styles.recentRunHeader}>
                            <Text style={styles.recentRunTitle} numberOfLines={1}>
                              {getRunLabel(run, t)}
                            </Text>
                            <Text style={styles.recentRunDate}>
                              {(d.getMonth() + 1)}/{d.getDate()}
                            </Text>
                          </View>
                          <Text style={styles.recentRunTimeLabel}>{timeLabel}</Text>
                          <View style={styles.recentRunStatsRow}>
                            <Text style={styles.recentRunStatText}>
                              {formatDistance(run.distance_meters)}
                            </Text>
                            <View style={styles.recentRunDot} />
                            <Text style={styles.recentRunStatText}>
                              {formatPace(run.avg_pace_seconds_per_km)}
                            </Text>
                            <View style={styles.recentRunDot} />
                            <Text style={styles.recentRunStatText}>
                              {formatDuration(run.duration_seconds)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ============================================================ */}
            {/* 5. Personal Records — Achievement unlocks (Zeigarnik effect)  */}
            {/*    2x2 tiles with tinted bg → each feels like a "badge".     */}
            {/* ============================================================ */}
            <View style={styles.card}>
              <View style={styles.cardTitleWithIcon}>
                <Ionicons name="ribbon" size={14} color={colors.primary} />
                <Text style={styles.cardTitle}>{t('mypage.personalRecords')}</Text>
              </View>
              <View style={styles.recordsRow}>
                <View style={[styles.recordTile, { backgroundColor: colors.primary + '0D' }]}>
                  <View style={[styles.recordIconBadge, { backgroundColor: colors.primary + '1A' }]}>
                    <Ionicons name="trophy" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.recordTileValue}>
                    {formatDistance(stats.longest_run_meters)}
                  </Text>
                  <Text style={styles.recordTileLabel}>{t('mypage.longestDistance')}</Text>
                </View>
                <View style={[styles.recordTile, { backgroundColor: colors.accent + '18' }]}>
                  <View style={[styles.recordIconBadge, { backgroundColor: colors.accent + '20' }]}>
                    <Ionicons name="flash" size={18} color={colors.accent} />
                  </View>
                  <Text style={styles.recordTileValue}>
                    {formatPace(stats.best_pace_seconds_per_km)}
                  </Text>
                  <Text style={styles.recordTileLabel}>{t('mypage.recordBestPace')}</Text>
                </View>
              </View>
              <View style={styles.recordsRow}>
                <View style={[styles.recordTile, { backgroundColor: colors.success + '10' }]}>
                  <View style={[styles.recordIconBadge, { backgroundColor: colors.success + '1A' }]}>
                    <Ionicons name="flame" size={18} color={colors.success} />
                  </View>
                  <Text style={styles.recordTileValue}>{stats.best_streak_days}{t('mypage.daysUnit')}</Text>
                  <Text style={styles.recordTileLabel}>{t('mypage.longestStreak')}</Text>
                </View>
                <View style={[styles.recordTile, { backgroundColor: colors.secondary + '12' }]}>
                  <View style={[styles.recordIconBadge, { backgroundColor: colors.secondary + '18' }]}>
                    <Ionicons name="calendar" size={16} color={colors.secondary} />
                  </View>
                  <Text style={styles.recordTileValue}>{stats.current_streak_days}{t('mypage.daysUnit')}</Text>
                  <Text style={styles.recordTileLabel}>{t('mypage.currentStreak')}</Text>
                </View>
              </View>
            </View>

            {/* ============================================================ */}
            {/* 5b. Best Efforts — Fastest times at standard distances        */}
            {/*     Key competitive element for runners                       */}
            {/* ============================================================ */}
            {analytics && analytics.best_efforts.some(e => e.best_time_seconds != null) && (
              <View style={styles.card}>
                <View style={styles.cardTitleWithIcon}>
                  <Ionicons name="medal" size={14} color={colors.primary} />
                  <Text style={styles.cardTitle}>{t('mypage.bestEfforts')}</Text>
                </View>
                <View style={styles.effortsGrid}>
                  {analytics.best_efforts.map((effort) => (
                    <View
                      key={effort.distance_label}
                      style={[styles.effortItem, {
                        backgroundColor: effort.best_time_seconds ? colors.primary + '0A' : colors.surfaceLight,
                      }]}
                    >
                      <View style={[styles.effortIconBadge, {
                        backgroundColor: effort.best_time_seconds ? colors.primary + '18' : colors.surfaceLight,
                      }]}>
                        <Ionicons
                          name={effort.best_time_seconds ? 'medal' : 'lock-closed-outline'}
                          size={14}
                          color={effort.best_time_seconds ? colors.primary : colors.textTertiary}
                        />
                      </View>
                      <Text style={[styles.effortDistance, {
                        color: effort.best_time_seconds ? colors.primary : colors.textTertiary,
                      }]}>
                        {effort.distance_label}
                      </Text>
                      <Text style={[styles.effortTime, {
                        color: effort.best_time_seconds ? colors.text : colors.textTertiary,
                      }]}>
                        {effort.best_time_seconds ? formatDuration(effort.best_time_seconds) : '--:--'}
                      </Text>
                      {effort.best_pace && (
                        <Text style={styles.effortPace}>
                          {formatPace(effort.best_pace)}/km
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ============================================================ */}
            {/* 6. Course Stats — Social proof + goal-setting                 */}
            {/*    TOP 10 highlight uses accent color → draws attention to    */}
            {/*    competitive element. Chevron → navigation affordance.      */}
            {/* ============================================================ */}
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('MyCourses')}
              activeOpacity={0.7}
            >
              <View style={styles.cardTitleRow}>
                <View style={styles.cardTitleWithIcon}>
                  <Ionicons name="map" size={14} color={colors.primary} />
                  <Text style={styles.cardTitle}>{t('mypage.courseStatus')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </View>
              <View style={styles.courseStatsRow}>
                <View style={styles.courseStatItem}>
                  <Text style={styles.courseStatValue}>{stats.courses_created}</Text>
                  <Text style={styles.courseStatLabel}>{t('mypage.created')}</Text>
                </View>
                <View style={styles.courseStatItem}>
                  <Text style={styles.courseStatValue}>{stats.courses_completed}</Text>
                  <Text style={styles.courseStatLabel}>{t('mypage.completed')}</Text>
                </View>
                <View style={styles.courseStatItemHighlight}>
                  <Text style={styles.courseStatValueAccent}>{stats.ranking_top10_count}</Text>
                  <Text style={styles.courseStatLabelAccent}>TOP 10</Text>
                </View>
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* ================================================================ */}
        {/* 7. Tools — Utility zone (low frequency, bottom placement)        */}
        {/*    Fitts: large tap targets. Icon → Title → Desc → Chevron.      */}
        {/*    Grouped by function proximity.                                 */}
        {/* ================================================================ */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.navigate('RunHistory')}
            activeOpacity={0.7}
          >
            <View style={styles.menuButtonLeft}>
              <View style={styles.menuIconCircle}>
                <Ionicons name="timer-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.menuButtonTitle}>{t('mypage.runHistory')}</Text>
                <Text style={styles.menuButtonDesc}>{t('mypage.menuRunHistoryDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.navigate('GearManage')}
            activeOpacity={0.7}
          >
            <View style={styles.menuButtonLeft}>
              <View style={styles.menuIconCircle}>
                <Ionicons name="footsteps-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.menuButtonTitle}>{t('mypage.menuGear')}</Text>
                <Text style={styles.menuButtonDesc}>{t('mypage.menuGearDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.navigate('ImportActivity')}
            activeOpacity={0.7}
          >
            <View style={styles.menuButtonLeft}>
              <View style={styles.menuIconCircle}>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.menuButtonTitle}>{t('mypage.menuImport')}</Text>
                <Text style={styles.menuButtonDesc}>{t('mypage.menuImportDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.navigate('StravaConnect')}
            activeOpacity={0.7}
          >
            <View style={styles.menuButtonLeft}>
              <View style={[styles.menuIconCircle, { backgroundColor: '#FC4C0220' }]}>
                <Text style={{ color: '#FC4C02', fontWeight: '900', fontSize: 10 }}>STR</Text>
              </View>
              <View>
                <Text style={styles.menuButtonTitle}>{t('mypage.menuStrava')}</Text>
                <Text style={styles.menuButtonDesc}>{t('mypage.menuStravaDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.7}
          >
            <View style={styles.menuButtonLeft}>
              <View style={styles.menuIconCircle}>
                <Ionicons name="settings-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.menuButtonTitle}>{t('mypage.menuSettings')}</Text>
                <Text style={styles.menuButtonDesc}>{t('mypage.menuSettingsDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ============================================================
// Styles
// ============================================================

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: {
    paddingBottom: SPACING.xxxl + SPACING.xl,
    gap: SPACING.lg,
  },

  // -- Header --
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.sm,
  },
  headerSpacer: { flex: 1 },
  headerEditText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.primary,
  },

  // -- Profile --
  profileSection: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  avatarWrapper: { width: 88, height: 88, borderRadius: 44 },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: c.border,
    backgroundColor: c.surfaceLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarImage: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: c.border,
  },
  avatarCameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  nickname: {
    fontSize: FONT_SIZES.title, fontWeight: '800',
    color: c.text, letterSpacing: -0.3,
  },
  bioText: {
    fontSize: FONT_SIZES.sm, color: c.textSecondary,
    textAlign: 'center', lineHeight: 20, maxWidth: 280,
  },
  instagramRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  instagramText: { fontSize: FONT_SIZES.sm, color: c.textSecondary, fontWeight: '500' },
  profileStatsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xl, paddingVertical: SPACING.sm,
  },
  profileStatItem: { alignItems: 'center', gap: 2 },
  profileStatValue: {
    fontSize: FONT_SIZES.xl, fontWeight: '800', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  profileStatLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: c.textTertiary },
  profileStatDivider: { width: 1, height: 24, backgroundColor: c.divider },
  userCodeText: {
    fontSize: FONT_SIZES.sm, fontWeight: '700', color: c.textTertiary,
    fontVariant: ['tabular-nums'], marginTop: -4,
  },
  crewTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: c.primary + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.xs,
    marginTop: -2,
  },
  crewTagText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: c.primary,
  },

  // -- Period Bar --
  periodBar: {
    flexDirection: 'row', marginHorizontal: SPACING.xxl,
    gap: SPACING.xs, backgroundColor: c.surfaceLight,
    borderRadius: BORDER_RADIUS.md, padding: 3,
  },
  periodChip: {
    flex: 1, paddingVertical: SPACING.sm - 2,
    alignItems: 'center', borderRadius: BORDER_RADIUS.md - 2,
  },
  periodChipActive: { backgroundColor: c.primary },
  periodChipText: { fontSize: FONT_SIZES.xs, color: c.textTertiary, fontWeight: '600' },
  periodChipTextActive: { color: c.white, fontWeight: '700' },

  // -- Hero Card --
  heroCard: {
    marginHorizontal: SPACING.xxl, backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl,
    gap: SPACING.lg, borderWidth: 1, borderColor: c.border,
  },
  heroTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  heroDistance: {
    fontSize: 48, fontWeight: '900', color: c.text,
    fontVariant: ['tabular-nums'], letterSpacing: -2, lineHeight: 52,
  },
  heroUnit: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: c.textTertiary, marginTop: 2 },
  heroSide: { alignItems: 'flex-end', gap: SPACING.sm },
  heroSideItem: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  heroSideValue: {
    fontSize: FONT_SIZES.lg, fontWeight: '800', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  heroSideLabel: { fontSize: FONT_SIZES.xs, fontWeight: '500', color: c.textTertiary },
  heroSideDivider: { width: 40, height: 1, backgroundColor: c.divider, alignSelf: 'flex-end' },

  // 2x2 stat grid
  statGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderTopWidth: 1, borderTopColor: c.divider,
    paddingTop: SPACING.md, gap: SPACING.sm,
  },
  statGridCell: {
    width: '47%', flexDirection: 'row', alignItems: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.xs,
  },
  statGridValue: {
    fontSize: FONT_SIZES.md, fontWeight: '800', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  statGridLabel: { fontSize: FONT_SIZES.xs, fontWeight: '500', color: c.textTertiary },

  // -- Cards --
  card: {
    marginHorizontal: SPACING.xxl, backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl,
    gap: SPACING.md, borderWidth: 1, borderColor: c.border,
  },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleWithIcon: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
  },
  cardTitle: {
    fontSize: FONT_SIZES.sm, fontWeight: '700', color: c.textTertiary,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  cardSubtitle: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: c.textTertiary },
  seeAllText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: c.primary },

  // -- Monthly Chart --
  monthlyChart: {
    flexDirection: 'row', justifyContent: 'space-around',
    alignItems: 'flex-end', height: 120,
  },
  monthlyBarContainer: { alignItems: 'center', flex: 1, gap: SPACING.xs },
  monthlyBarTrack: {
    flex: 1, width: 20, justifyContent: 'flex-end',
    borderRadius: BORDER_RADIUS.full, overflow: 'hidden',
    backgroundColor: c.surfaceLight,
  },
  monthlyBar: {
    backgroundColor: c.primary, borderRadius: BORDER_RADIUS.full, width: '100%',
  },
  monthlyLabel: { fontSize: FONT_SIZES.xs, color: c.textTertiary, fontWeight: '600' },
  monthlyValue: {
    fontSize: 10, color: c.textSecondary, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // -- Recent Activity --
  recentRunCard: { paddingVertical: SPACING.sm },
  recentRunCardBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  recentRunInner: { flexDirection: 'row', gap: SPACING.md },
  recentRunAccent: { width: 3, borderRadius: 2, alignSelf: 'stretch' },
  recentRunBody: { flex: 1, gap: 3 },
  recentRunHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  recentRunTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: c.text, flex: 1 },
  recentRunDate: {
    fontSize: FONT_SIZES.xs, fontWeight: '500', color: c.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  recentRunTimeLabel: { fontSize: FONT_SIZES.xs, color: c.textSecondary, fontWeight: '500' },
  recentRunStatsRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs, gap: SPACING.sm,
  },
  recentRunStatText: {
    fontSize: FONT_SIZES.sm, fontWeight: '700', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  recentRunDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.textTertiary },

  // -- Personal Records (2x2 tiles) --
  recordsRow: { flexDirection: 'row', gap: SPACING.sm },
  recordTile: {
    flex: 1, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, paddingHorizontal: SPACING.md,
    alignItems: 'center', gap: SPACING.xs,
  },
  recordIconBadge: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  recordTileValue: {
    fontSize: FONT_SIZES.lg, fontWeight: '900', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  recordTileLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: c.textSecondary },

  // -- Best Efforts --
  effortsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
  },
  effortItem: {
    width: '31%', borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center', gap: 3,
  },
  effortIconBadge: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  effortDistance: {
    fontSize: FONT_SIZES.xs, fontWeight: '800',
    letterSpacing: 0.5,
  },
  effortTime: {
    fontSize: FONT_SIZES.md, fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  effortPace: {
    fontSize: 10, fontWeight: '500', color: c.textTertiary,
    fontVariant: ['tabular-nums'],
  },

  // -- Course Stats --
  courseStatsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: SPACING.sm },
  courseStatItem: { alignItems: 'center', gap: SPACING.xs },
  courseStatValue: {
    fontSize: FONT_SIZES.xxl, fontWeight: '800', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  courseStatLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: c.textTertiary },
  courseStatItemHighlight: {
    alignItems: 'center', gap: SPACING.xs,
    backgroundColor: c.surfaceLight, paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg, borderRadius: BORDER_RADIUS.md,
  },
  courseStatValueAccent: {
    fontSize: FONT_SIZES.xxl, fontWeight: '900', color: c.accent,
    fontVariant: ['tabular-nums'],
  },
  courseStatLabelAccent: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: c.accent },

  // -- Section --
  section: { paddingHorizontal: SPACING.xxl, gap: SPACING.md },

  // -- Menu Buttons --
  menuButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.card, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xl,
    borderWidth: 1, borderColor: c.border,
  },
  menuButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  menuIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.surfaceLight, justifyContent: 'center', alignItems: 'center',
  },
  menuButtonTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: c.text },
  menuButtonDesc: { fontSize: FONT_SIZES.xs, color: c.textTertiary, marginTop: 2 },
});
