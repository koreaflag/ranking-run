import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
  Linking,
  Modal,
  NativeModules,
  Platform,
  StatusBar,
  TextInput,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../stores/authStore';
import type { MyPageStackParamList } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import WeeklyGoalBar from '../../components/charts/WeeklyGoalBar';
import type {
  UserStats,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import RunnerLevelBadge from '../../components/runner/RunnerLevelBadge';
import MyPageSkeleton from '../../components/skeleton/MyPageSkeleton';
import { calcRunnerLevel, getRunnerTier, getRunnerXpProgress } from '../../utils/runnerLevelConfig';
import { getCache, setCache } from '../../utils/apiCache';

// Period option values (labels resolved via t() inside component)
const PERIOD_VALUES: StatsPeriod[] = ['week', 'month', 'year', 'all'];
const PERIOD_KEYS: Record<StatsPeriod, string> = {
  week: 'mypage.periodWeek',
  month: 'mypage.periodMonth',
  year: 'mypage.periodYear',
  all: 'mypage.periodAll',
};


type Nav = NativeStackNavigationProp<MyPageStackParamList, 'MyPage'>;

// Module-level cache: survives tab switches
let _cachedStats: UserStats | null = null;
let _cachedAnalytics: AnalyticsData | null = null;
let _cachedSocial = { following: 0, followers: 0, likes: 0 };
let _diskCacheLoaded = false;

export default function MyPageScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [stats, setStats] = useState<UserStats | null>(_cachedStats);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(_cachedAnalytics);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');
  const [refreshing, setRefreshing] = useState(false);
  const [socialCounts, setSocialCounts] = useState<{ following: number; followers: number; likes: number }>(_cachedSocial);
  const [checkedInToday, setCheckedInToday] = useState(true); // default hidden until we check
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState('');
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(_cachedStats === null);

  // Runner level info — compute from actual distance so the gauge stays accurate
  // even when the server-stored runner_level is stale / not yet synced.
  const totalDist = stats?.total_distance_meters ?? 0;
  const runnerLv = totalDist > 0 ? calcRunnerLevel(totalDist) : (user?.runner_level ?? 1);
  const runnerTier = getRunnerTier(runnerLv);
  const runnerXp = getRunnerXpProgress(runnerLv, totalDist);

  // Animated XP bar
  const xpAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(xpAnim, {
      toValue: runnerXp.ratio,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [runnerXp.ratio]);

  // Check if already checked in today (calendar day)
  useEffect(() => {
    (async () => {
      try {
        const lastDate = await AsyncStorage.getItem('lastCheckinDate');
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        setCheckedInToday(lastDate === today);
      } catch {
        setCheckedInToday(false);
      }
    })();
  }, []);

  const handleDailyCheckin = useCallback(async () => {
    if (checkedInToday || isCheckingIn) return;
    setIsCheckingIn(true);
    try {
      const res = await userService.dailyCheckin();
      const today = new Date().toISOString().slice(0, 10);
      await AsyncStorage.setItem('lastCheckinDate', today);
      setCheckedInToday(true);
      if (!res.already && res.points_earned > 0) {
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          useAuthStore.getState().setUser({ ...currentUser, total_points: res.total_points });
        }
        Alert.alert(t('mypage.checkinSuccess'), t('mypage.checkinPoints', { points: res.points_earned }));
      }
    } catch {
      // silent fail
    } finally {
      setIsCheckingIn(false);
    }
  }, [checkedInToday, isCheckingIn, t]);

  const handleOpenGoalModal = useCallback(() => {
    setCustomGoalInput('');
    setShowGoalModal(true);
  }, []);

  const handleSaveGoal = useCallback(async (goalKm: number) => {
    if (goalKm < 1 || goalKm > 500 || isSavingGoal) return;
    setIsSavingGoal(true);
    try {
      await userService.updateWeeklyGoal(goalKm);
      if (analytics) {
        const updated = { ...analytics, weekly_goal_km: goalKm };
        setAnalytics(updated);
        _cachedAnalytics = updated;
      }
      // Sync weekly goal to Apple Watch
      if (Platform.OS === 'ios' && NativeModules.WatchBridgeModule) {
        NativeModules.WatchBridgeModule.sendWeeklyGoalToWatch(goalKm).catch(() => {
          // Silently ignore — watch may be unreachable
        });
      }
      setShowGoalModal(false);
    } catch {
      Alert.alert(t('common.error'), t('common.errorRetry'));
    } finally {
      setIsSavingGoal(false);
    }
  }, [analytics, isSavingGoal, t]);

  // Restore disk cache on first mount (instant display before API)
  useEffect(() => {
    if (_diskCacheLoaded) return;
    _diskCacheLoaded = true;
    (async () => {
      const [cStats, cAnalytics, cSocial] = await Promise.all([
        getCache<UserStats>('mypage:stats'),
        getCache<AnalyticsData>('mypage:analytics'),
        getCache<{ following: number; followers: number; likes: number }>('mypage:social'),
      ]);
      if (cStats && !_cachedStats) { _cachedStats = cStats.data; setStats(cStats.data); }
      if (cAnalytics && !_cachedAnalytics) { _cachedAnalytics = cAnalytics.data; setAnalytics(cAnalytics.data); }
      if (cSocial) { _cachedSocial = cSocial.data; setSocialCounts(cSocial.data); }
      if (cStats) setIsInitialLoading(false);
    })();
  }, []);

  const loadData = useCallback(async () => {
    try {
      // Primary data: stats + social counts + profile (above the fold)
      const [statsData, socialData, profileData] = await Promise.all([
        userService.getStats(selectedPeriod).catch(() => null),
        userService.getSocialCounts().catch(() => ({ followers_count: 0, following_count: 0, total_likes_received: 0 })),
        authService.getProfile().catch(() => null),
      ]);
      setStats(statsData); _cachedStats = statsData;
      setCache('mypage:stats', statsData);
      const social = { following: socialData.following_count, followers: socialData.followers_count, likes: socialData.total_likes_received };
      setSocialCounts(social); _cachedSocial = social;
      setCache('mypage:social', social);
      if (profileData) {
        useAuthStore.getState().setUser(profileData);
      }
    } catch {
      // Partial failures are acceptable
    } finally {
      setIsInitialLoading(false);
    }

    // Secondary data: analytics (below the fold, deferred)
    try {
      const analyticsData = await userService.getAnalytics().catch(() => null);
      setAnalytics(analyticsData); _cachedAnalytics = analyticsData;
      setCache('mypage:analytics', analyticsData);
    } catch {
      // Secondary data failures are non-blocking
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
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Header — Instagram style */}
      <View style={styles.headerRow}>
        <Text style={styles.headerUsername} numberOfLines={1}>{user?.nickname ?? 'RUNVS'}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="settings-sharp" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {isInitialLoading ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <MyPageSkeleton />
        </ScrollView>
      ) : (
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
        {/* Player Card */}
        <View style={styles.playerCard}>
          <View style={styles.playerCardTop}>
            <View style={styles.avatarWrapper}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Ionicons name="person" size={24} color={colors.textTertiary} />
                </View>
              )}
            </View>
            <View style={styles.playerCardStatsRow}>
              <TouchableOpacity
                style={styles.profileStatItem}
                onPress={() => user?.id && navigation.navigate('FollowList', { userId: user.id, type: 'followers' })}
                activeOpacity={0.6}
              >
                <Text style={styles.profileStatValue}>{socialCounts.followers}</Text>
                <Text style={styles.profileStatLabel}>{t('mypage.followers')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.profileStatItem}
                onPress={() => user?.id && navigation.navigate('FollowList', { userId: user.id, type: 'following' })}
                activeOpacity={0.6}
              >
                <Text style={styles.profileStatValue}>{socialCounts.following}</Text>
                <Text style={styles.profileStatLabel}>{t('mypage.following')}</Text>
              </TouchableOpacity>
              <View style={styles.profileStatItem}>
                <Text style={styles.profileStatValue}>{socialCounts.likes}</Text>
                <Text style={styles.profileStatLabel}>{t('mypage.likes')}</Text>
              </View>
            </View>
          </View>
          {/* Identity + Meta */}
          <View style={styles.playerCardMeta}>
            <View style={styles.nameRow}>
              <Text style={styles.playerCardName} numberOfLines={1}>{user?.nickname ?? t('mypage.defaultNickname')}</Text>
              <RunnerLevelBadge level={runnerLv} size="sm" />
            </View>
            {user?.crew_name ? (
              <View style={styles.crewTag}>
                <Ionicons name="people" size={11} color={colors.primary} />
                <Text style={styles.crewTagText}>{user.crew_name}</Text>
              </View>
            ) : null}
            {user?.bio ? (
              <Text style={styles.playerCardBio} numberOfLines={2}>{user.bio}</Text>
            ) : null}
            {user?.instagram_username ? (
              <TouchableOpacity
                style={styles.instagramRow}
                onPress={() => Linking.openURL(`https://instagram.com/${user.instagram_username}`)}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-instagram" size={13} color={colors.textTertiary} />
                <Text style={styles.instagramText}>@{user.instagram_username}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {/* Edit Profile button — Instagram style */}
          <TouchableOpacity
            style={styles.editProfileButton}
            onPress={() => navigation.navigate('ProfileEdit')}
            activeOpacity={0.7}
          >
            <Text style={styles.editProfileButtonText}>{t('mypage.editProfile')}</Text>
          </TouchableOpacity>
        </View>

        {/* Runner Level Banner — separate section */}
        <View style={[styles.runnerBanner, { backgroundColor: runnerTier.bgColor, borderColor: runnerTier.color + '30' }]}>
          <View style={styles.runnerBannerText}>
            <View style={styles.runnerBannerTitleRow}>
              <Text style={[styles.runnerBannerTitle, { color: runnerTier.textColor }]}>{t(runnerTier.nameKey)}</Text>
              <Text style={[styles.runnerBannerLv, { color: runnerTier.color }]}>Lv.{runnerLv}</Text>
            </View>
            <View style={styles.xpBarRow}>
              <View style={[styles.xpBarTrack, { backgroundColor: runnerTier.color + '30' }]}>
                <Animated.View style={[styles.xpBarFill, {
                  width: xpAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  backgroundColor: runnerTier.color,
                }]} />
              </View>
              <Text style={[styles.xpBarLabel, { color: runnerTier.textColor }]}>
                {runnerXp.isMax ? 'MAX' : `${metersToKm(runnerXp.current, 1)} / ${metersToKm(runnerXp.next, 0)}km`}
              </Text>
            </View>
          </View>
        </View>

        {/* Daily Check-in Banner */}
        {!checkedInToday && (
          <TouchableOpacity
            style={[styles.checkinBanner, { borderColor: colors.primary + '30' }]}
            onPress={handleDailyCheckin}
            activeOpacity={0.7}
            disabled={isCheckingIn}
          >
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text style={styles.checkinText}>{t('mypage.dailyCheckin')}</Text>
            <View style={styles.checkinBadge}>
              <Text style={styles.checkinBadgeText}>+5P</Text>
            </View>
          </TouchableOpacity>
        )}

        {!stats && (
          <View style={styles.emptyStateCard}>
            <View style={styles.emptyStateIconCircle}>
              <Ionicons name="footsteps-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.emptyStateTitle}>{t('mypage.emptyStateTitle')}</Text>
            <Text style={styles.emptyStateDesc}>{t('mypage.emptyStateDesc')}</Text>
            <TouchableOpacity
              style={styles.emptyStateCta}
              onPress={() => navigation.getParent()?.navigate('WorldTab', { screen: 'RunningMain' })}
              activeOpacity={0.7}
            >
              <Ionicons name="play" size={16} color="#FFFFFF" />
              <Text style={styles.emptyStateCtaText}>{t('mypage.startRunning')}</Text>
            </TouchableOpacity>
          </View>
        )}

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
              {/* Hero distance centered — biggest visual weight */}
              <View style={styles.heroTop}>
                <View style={styles.heroDistanceRow}>
                  <Text style={styles.heroDistance}>
                    {metersToKm(stats.total_distance_meters, 1)}
                  </Text>
                  <Text style={styles.heroUnit}>km</Text>
                </View>
              </View>

              {/* Secondary stats — horizontal row */}
              <View style={styles.heroSecondary}>
                <View style={styles.heroSecondaryItem}>
                  <Text style={styles.heroSecondaryValue}>{stats.total_runs ?? 0}</Text>
                  <Text style={styles.heroSecondaryLabel}>{t('mypage.times')}</Text>
                </View>
                <View style={styles.heroSecondaryDivider} />
                <View style={styles.heroSecondaryItem}>
                  <Text style={styles.heroSecondaryValue}>{formatDuration(stats.total_duration_seconds)}</Text>
                  <Text style={styles.heroSecondaryLabel}>{t('running.metrics.time')}</Text>
                </View>
                <View style={styles.heroSecondaryDivider} />
                <TouchableOpacity style={styles.heroSecondaryItem} onPress={() => navigation.navigate('PointHistory')} activeOpacity={0.7}>
                  <Text style={[styles.heroSecondaryValue, { color: colors.primary }]}>
                    {(user?.total_points ?? 0).toLocaleString()}
                  </Text>
                  <View style={styles.heroPointLabel}>
                    <Text style={[styles.heroSecondaryLabel, { color: colors.primary }]}>P</Text>
                    <Ionicons name="chevron-forward" size={10} color={colors.primary} />
                  </View>
                </TouchableOpacity>
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
                  onGoalPress={handleOpenGoalModal}
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
                  {(() => {
                    const maxDist = Math.max(
                      ...stats.monthly_distance.map((m) => m.distance_meters),
                    );
                    return stats.monthly_distance.map((md) => {
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
                  });
                  })()}
                </View>
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
                <View style={[styles.recordTile, { backgroundColor: colors.primary + '15' }]}>
                  <View style={[styles.recordIconBadge, { backgroundColor: colors.primary + '22' }]}>
                    <Ionicons name="trophy" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.recordTileValue}>
                    {formatDistance(stats.longest_run_meters)}
                  </Text>
                  <Text style={styles.recordTileLabel}>{t('mypage.longestDistance')}</Text>
                </View>
                <View style={[styles.recordTile, { backgroundColor: colors.accent + '20' }]}>
                  <View style={[styles.recordIconBadge, { backgroundColor: colors.accent + '28' }]}>
                    <Ionicons name="flash" size={18} color={colors.accent} />
                  </View>
                  <Text style={styles.recordTileValue}>
                    {formatPace(stats.best_pace_seconds_per_km)}
                  </Text>
                  <Text style={styles.recordTileLabel}>{t('mypage.recordBestPace')}</Text>
                </View>
              </View>
              <View style={styles.recordsRow}>
                <View style={[styles.recordTile, { backgroundColor: colors.success + '18' }]}>
                  <View style={[styles.recordIconBadge, { backgroundColor: colors.success + '22' }]}>
                    <Ionicons name="flame" size={18} color={colors.success} />
                  </View>
                  <Text style={styles.recordTileValue}>{stats.best_streak_days}{t('mypage.daysUnit')}</Text>
                  <Text style={styles.recordTileLabel}>{t('mypage.longestStreak')}</Text>
                </View>
                <View style={[styles.recordTile, { backgroundColor: colors.secondary + '1A' }]}>
                  <View style={[styles.recordIconBadge, { backgroundColor: colors.secondary + '22' }]}>
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
                        backgroundColor: effort.best_time_seconds ? colors.primary + '15' : colors.surfaceLight,
                      }]}
                    >
                      <View style={[styles.effortIconBadge, {
                        backgroundColor: effort.best_time_seconds ? colors.primary + '22' : colors.surfaceLight,
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
                <View style={[styles.courseTile, { backgroundColor: colors.primary + '15' }]}>
                  <View style={[styles.courseTileIcon, { backgroundColor: colors.primary + '22' }]}>
                    <Ionicons name="add-circle" size={16} color={colors.primary} />
                  </View>
                  <Text style={styles.courseTileValue}>{stats.courses_created}</Text>
                  <Text style={styles.courseTileLabel}>{t('mypage.created')}</Text>
                </View>
                <View style={[styles.courseTile, { backgroundColor: colors.success + '15' }]}>
                  <View style={[styles.courseTileIcon, { backgroundColor: colors.success + '22' }]}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  </View>
                  <Text style={styles.courseTileValue}>{stats.courses_completed}</Text>
                  <Text style={styles.courseTileLabel}>{t('mypage.completed')}</Text>
                </View>
                <View style={[styles.courseTile, { backgroundColor: colors.accent + '18' }]}>
                  <View style={[styles.courseTileIcon, { backgroundColor: colors.accent + '28' }]}>
                    <Ionicons name="trophy" size={16} color={colors.accent} />
                  </View>
                  <Text style={[styles.courseTileValue, { color: colors.accent }]}>{stats.ranking_top10_count}</Text>
                  <Text style={[styles.courseTileLabel, { color: colors.accent }]}>TOP 10</Text>
                </View>
              </View>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
      )}
      {/* Weekly Goal Setting Modal */}
      <Modal
        visible={showGoalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoalModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowGoalModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('mypage.weeklyGoalTitle')}
            </Text>

            <View style={styles.goalPresets}>
              {[10, 20, 30, 50, 100].map((km) => (
                <TouchableOpacity
                  key={km}
                  style={[
                    styles.goalPresetBtn,
                    { backgroundColor: colors.surfaceLight, borderColor: colors.border },
                    analytics?.weekly_goal_km === km && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => handleSaveGoal(km)}
                  disabled={isSavingGoal}
                >
                  <Text style={[
                    styles.goalPresetText,
                    { color: colors.text },
                    analytics?.weekly_goal_km === km && { color: '#fff' },
                  ]}>
                    {km} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.customGoalLabel, { color: colors.textSecondary }]}>
              {t('mypage.customGoal')}
            </Text>
            <View style={styles.customGoalRow}>
              <TextInput
                style={[styles.customGoalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
                placeholder="km"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                value={customGoalInput}
                onChangeText={setCustomGoalInput}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.saveGoalBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const val = parseFloat(customGoalInput);
                  if (!isNaN(val) && val >= 1 && val <= 500) {
                    handleSaveGoal(val);
                  }
                }}
                disabled={isSavingGoal || !customGoalInput}
              >
                <Text style={styles.saveGoalText}>{t('mypage.saveGoal')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      </SafeAreaView>
    </BlurredBackground>
  );
}

// ============================================================
// Styles
// ============================================================

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: { flex: 1 },
  content: {
    paddingBottom: SPACING.xxxl + SPACING.xl,
    gap: SPACING.lg,
  },

  // -- Header (Instagram style) --
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.sm,
  },
  headerUsername: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
  },

  // -- Profile Section (flat — no card) --
  playerCard: {
    // Flat layout, no card container
  },
  playerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 28,
  },
  playerCardStatsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  playerCardName: {
    fontSize: 17, fontWeight: '700',
    color: c.text, letterSpacing: -0.3,
  },
  runnerBanner: {
    marginHorizontal: SPACING.xxl,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  runnerBannerText: {
    flex: 1, gap: 4,
  },
  runnerBannerTitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  runnerBannerTitle: {
    fontSize: 14, fontWeight: '800',
  },
  runnerBannerLv: {
    fontSize: 12, fontWeight: '900',
  },
  xpBarRow: {
    gap: 4, marginTop: 2,
  },
  xpBarTrack: {
    height: 6, borderRadius: 3, overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%', borderRadius: 3,
  },
  xpBarLabel: {
    fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] as const,
  },
  playerCardMeta: {
    paddingHorizontal: SPACING.xxl,
    paddingBottom: 0,
    gap: 4,
  },
  editProfileButton: {
    marginHorizontal: SPACING.xxl,
    marginTop: 12,
    marginBottom: 4,
    height: 34,
    backgroundColor: c.surfaceLight,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  playerCardBio: {
    fontSize: 14, color: c.text,
    lineHeight: 20,
  },
  playerCardDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: c.divider,
    marginHorizontal: SPACING.md,
  },
  playerCardStats: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  avatarWrapper: { width: 86, height: 86, borderRadius: 43 },
  avatarCircle: {
    width: 86, height: 86, borderRadius: 43,
    borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surfaceLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarImage: {
    width: 86, height: 86, borderRadius: 43,
  },
  avatarCameraBadge: {
    position: 'absolute', bottom: -1, right: -1,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: c.card,
  },
  instagramRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, marginTop: 2 },
  instagramText: { fontSize: 14, color: c.primary, fontWeight: '600' },
  profileStatItem: { alignItems: 'center', gap: 2, flex: 1 },
  profileStatValue: {
    fontSize: 17, fontWeight: '700', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  profileStatLabel: { fontSize: 13, fontWeight: '400', color: c.textSecondary },
  profileStatDivider: { width: 1, height: 20, backgroundColor: c.divider },
  crewTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    backgroundColor: c.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.xs,
  },
  crewTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.primary,
  },

  // -- Daily Check-in --
  checkinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.xxl,
    marginBottom: SPACING.lg,
    backgroundColor: c.primary + '0A',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
  },
  checkinText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.text,
  },
  checkinBadge: {
    backgroundColor: c.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.xs,
  },
  checkinBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // -- Empty State --
  emptyStateCard: {
    marginHorizontal: SPACING.xxl,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  emptyStateIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  emptyStateTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
  },
  emptyStateDesc: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyStateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: c.primary,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.sm,
  },
  emptyStateCtaText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
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
    alignItems: 'center',
  },
  heroDistance: {
    fontSize: 48, fontWeight: '900', color: c.text,
    fontVariant: ['tabular-nums'], letterSpacing: -2, lineHeight: 52,
  },
  heroDistanceRow: {
    flexDirection: 'row', alignItems: 'baseline',
  },
  heroUnit: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: c.textTertiary, marginLeft: 4 },
  heroSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.lg,
  },
  heroSecondaryItem: { alignItems: 'center', gap: 2 },
  heroSecondaryValue: {
    fontSize: FONT_SIZES.lg, fontWeight: '800', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  heroSecondaryLabel: { fontSize: FONT_SIZES.xs, fontWeight: '500', color: c.textTertiary },
  heroSecondaryDivider: {
    width: 1, height: 24, backgroundColor: c.divider,
  },
  heroPointLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  // 2x2 stat grid
  statGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderTopWidth: 1, borderTopColor: c.divider,
    paddingTop: SPACING.md,
  },
  statGridCell: {
    width: '50%', flexDirection: 'row', alignItems: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.xs + 1,
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

  // -- Course Stats (tile-based) --
  courseStatsRow: { flexDirection: 'row', gap: SPACING.sm },
  courseTile: {
    flex: 1, alignItems: 'center', gap: SPACING.xs,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
  },
  courseTileIcon: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
  },
  courseTileValue: {
    fontSize: FONT_SIZES.xl, fontWeight: '900', color: c.text,
    fontVariant: ['tabular-nums'],
  },
  courseTileLabel: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: c.textTertiary },

  // -- Section Divider --
  sectionDivider: {
    height: SPACING.sm,
    marginHorizontal: SPACING.xxxl + SPACING.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.divider,
  },

  // -- Menu Group (grouped card) --
  menuGroup: {
    marginHorizontal: SPACING.xxl,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  menuButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
  },
  menuButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  menuIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.surfaceLight, justifyContent: 'center', alignItems: 'center',
  },
  menuButtonTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: c.text },
  menuButtonDesc: { fontSize: FONT_SIZES.xs, color: c.textTertiary, marginTop: 1 },
  menuDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: c.divider,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    width: '100%',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    textAlign: 'center',
  },
  goalPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  goalPresetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  goalPresetText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  customGoalLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
  customGoalRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  customGoalInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 12,
    fontSize: FONT_SIZES.md,
    fontVariant: ['tabular-nums'] as const,
  },
  saveGoalBtn: {
    height: 42,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveGoalText: {
    color: '#fff',
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
});
