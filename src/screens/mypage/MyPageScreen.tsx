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
  Switch,
  Image,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../stores/authStore';
import type { MyPageStackParamList } from '../../types/navigation';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTheme } from '../../hooks/useTheme';
import StatItem from '../../components/common/StatItem';
import EmptyState from '../../components/common/EmptyState';
import BlurredBackground from '../../components/common/BlurredBackground';
import type {
  UserStats,
  RunHistoryItem,
  StatsPeriod,
} from '../../types/api';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatNumber,
  formatRelativeTime,
  metersToKm,
} from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

const PERIOD_OPTIONS: Array<{ label: string; value: StatsPeriod }> = [
  { label: '이번 주', value: 'week' },
  { label: '이번 달', value: 'month' },
  { label: '올해', value: 'year' },
  { label: '전체', value: 'all' },
];

type Nav = NativeStackNavigationProp<MyPageStackParamList, 'MyPage'>;

export default function MyPageScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout } = useAuthStore();
  const colors = useTheme();
  const { darkMode, setDarkMode, voiceGuidance, setVoiceGuidance, backgroundImageUri, setBackgroundImageUri } = useSettingsStore();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunHistoryItem[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [socialCounts, setSocialCounts] = useState<{ followers: number; likes: number }>({ followers: 0, likes: 0 });

  const loadData = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [statsData, runsData, socialData] = await Promise.all([
        userService.getStats(selectedPeriod).catch(() => null),
        userService.getRunHistory(0, 5).catch(() => ({ data: [], total_count: 0, has_next: false })),
        userService.getSocialCounts().catch(() => ({ followers_count: 0, following_count: 0, total_likes_received: 0 })),
      ]);
      setStats(statsData);
      setRecentRuns(runsData.data);
      setSocialCounts({ followers: socialData.followers_count, likes: socialData.total_likes_received });
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

  const handleChangeAvatar = () => {
    Alert.alert('프로필 사진', '사진을 어디서 가져올까요?', [
      { text: '카메라', onPress: () => pickAvatarImage('camera') },
      { text: '앨범에서 선택', onPress: () => pickAvatarImage('library') },
      ...(user?.avatar_url ? [{ text: '기본 이미지로 변경', onPress: removeAvatar }] : []),
      { text: '취소', style: 'cancel' as const },
    ]);
  };

  const pickAvatarImage = async (source: 'camera' | 'library') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('권한 필요', '사진에 접근하려면 권한을 허용해 주세요.');
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
        Alert.alert('업로드 실패', '프로필 사진 변경에 실패했습니다.');
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
      Alert.alert('오류', '프로필 사진 제거에 실패했습니다.');
    }
  };

  const handlePickBackgroundImage = () => {
    Alert.alert('준비 중', '배경 이미지 선택은 네이티브 빌드 후 사용할 수 있습니다.');
  };

  const handleRemoveBackgroundImage = () => {
    Alert.alert('배경 이미지 제거', '기본 배경으로 되돌리시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '제거', style: 'destructive', onPress: () => setBackgroundImageUri(null) },
    ]);
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
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
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
        {/* Profile Header */}
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
          <Text style={styles.nickname}>{user?.nickname ?? '러너'}</Text>
          {user?.bio && (
            <Text style={styles.bioText}>{user.bio}</Text>
          )}
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
          <TouchableOpacity
            style={styles.editProfileButton}
            onPress={() => navigation.navigate('ProfileEdit')}
            activeOpacity={0.7}
          >
            <Text style={styles.editProfileText}>프로필 편집</Text>
          </TouchableOpacity>
        </View>

        {/* Dashboard stats card */}
        <View style={styles.dashboardCard}>
          <View style={styles.dashboardItem}>
            <Text style={styles.dashboardValue}>
              {formatDistance(user?.total_distance_meters ?? 0)}
            </Text>
            <Text style={styles.dashboardLabel}>총 거리</Text>
          </View>
          <View style={styles.dashboardDivider} />
          <View style={styles.dashboardItem}>
            <Text style={styles.dashboardValue}>
              {user?.total_runs ?? 0}
            </Text>
            <Text style={styles.dashboardLabel}>러닝</Text>
          </View>
          <View style={styles.dashboardDivider} />
          <View style={styles.dashboardItem}>
            <Text style={styles.dashboardValue}>
              {socialCounts.likes}
            </Text>
            <Text style={styles.dashboardLabel}>좋아요</Text>
          </View>
          <View style={styles.dashboardDivider} />
          <View style={styles.dashboardItem}>
            <Text style={styles.dashboardValue}>
              {socialCounts.followers}
            </Text>
            <Text style={styles.dashboardLabel}>팔로워</Text>
          </View>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {PERIOD_OPTIONS.map((option) => {
            const isActive = selectedPeriod === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.periodChip,
                  isActive && styles.periodChipActive,
                ]}
                onPress={() => handlePeriodChange(option.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.periodChipText,
                    isActive && styles.periodChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Stats Dashboard */}
        {stats && (
          <>
            {/* Main stats */}
            <View style={styles.card}>
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
            </View>

            {/* Detail stats */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>상세 기록</Text>
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
            </View>

            {/* Streaks */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>연속 기록</Text>
              <View style={styles.streakRow}>
                <View style={styles.streakItem}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <Text style={styles.streakValue}>
                    {stats.current_streak_days}
                    <Text style={styles.streakUnit}>일</Text>
                  </Text>
                  <Text style={styles.streakLabel}>현재 연속</Text>
                </View>
                <View style={styles.streakDivider} />
                <View style={styles.streakItem}>
                  <Text style={styles.streakEmoji}>⭐</Text>
                  <Text style={styles.streakValue}>
                    {stats.best_streak_days}
                    <Text style={styles.streakUnit}>일</Text>
                  </Text>
                  <Text style={styles.streakLabel}>최고 연속</Text>
                </View>
              </View>
            </View>

            {/* Course Stats */}
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('MyCourses')}
              activeOpacity={0.7}
            >
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>코스 현황</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </View>
              <View style={styles.courseStatsRow}>
                <View style={styles.courseStatItem}>
                  <Text style={styles.courseStatValue}>
                    {stats.courses_created}
                  </Text>
                  <Text style={styles.courseStatLabel}>등록</Text>
                </View>
                <View style={styles.courseStatItem}>
                  <Text style={styles.courseStatValue}>
                    {stats.courses_completed}
                  </Text>
                  <Text style={styles.courseStatLabel}>완주</Text>
                </View>
                <View style={styles.courseStatItemHighlight}>
                  <Text style={styles.courseStatValueAccent}>
                    {stats.ranking_top10_count}
                  </Text>
                  <Text style={styles.courseStatLabelAccent}>TOP 10</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Monthly Distance Chart */}
            {stats.monthly_distance.length > 0 && (
              <View style={styles.card}>
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
          </>
        )}

        {/* Recent Runs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>최근 러닝</Text>
          {recentRuns.length > 0 ? (
            recentRuns.map((run) => (
              <RunHistoryRow key={run.id} run={run} />
            ))
          ) : (
            <EmptyState
              title="아직 러닝 기록이 없습니다"
              description="첫 러닝을 시작해 보세요!"
            />
          )}
        </View>

        {/* Import & Integrations */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.importButton}
            onPress={() => navigation.navigate('ImportActivity')}
            activeOpacity={0.7}
          >
            <View style={styles.importButtonLeft}>
              <View style={styles.importIconCircle}>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.importButtonTitle}>기록 가져오기</Text>
                <Text style={styles.importButtonDesc}>GPX / FIT 파일로 외부 기록 import</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.importButton}
            onPress={() => navigation.navigate('StravaConnect')}
            activeOpacity={0.7}
          >
            <View style={styles.importButtonLeft}>
              <View style={[styles.importIconCircle, { backgroundColor: '#FC4C0220' }]}>
                <Text style={{ color: '#FC4C02', fontWeight: '900', fontSize: 10 }}>STR</Text>
              </View>
              <View>
                <Text style={styles.importButtonTitle}>Strava 연동</Text>
                <Text style={styles.importButtonDesc}>Strava 활동을 RunCrew로 가져오기</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Background Image Setting */}
        <View style={styles.bgImageSection}>
          <Text style={styles.sectionTitle}>배경 이미지</Text>
          <View style={styles.bgImageCard}>
            {backgroundImageUri ? (
              <View style={styles.bgImagePreviewRow}>
                <Image
                  source={{ uri: backgroundImageUri }}
                  style={styles.bgImagePreview}
                />
                <View style={styles.bgImageActions}>
                  <TouchableOpacity
                    style={styles.bgImageButton}
                    onPress={handlePickBackgroundImage}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="image-outline" size={18} color={colors.text} />
                    <Text style={styles.bgImageButtonText}>변경</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.bgImageButtonDanger}
                    onPress={handleRemoveBackgroundImage}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                    <Text style={styles.bgImageButtonDangerText}>제거</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.bgImagePlaceholder}
                onPress={handlePickBackgroundImage}
                activeOpacity={0.7}
              >
                <Ionicons name="image-outline" size={32} color={colors.textTertiary} />
                <Text style={styles.bgImagePlaceholderText}>
                  배경 이미지를 설정하면{'\n'}블러 효과가 적용됩니다
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Theme Toggle */}
        <View style={styles.themeToggleSection}>
          <View style={styles.themeToggleRow}>
            <View style={styles.themeToggleInfo}>
              <Text style={styles.themeToggleLabel}>다크 모드</Text>
              <Text style={styles.themeToggleDescription}>
                {darkMode ? '어두운 테마 사용 중' : '밝은 테마 사용 중'}
              </Text>
            </View>
            <Switch
              value={darkMode}
              onValueChange={(v) => { setTimeout(() => setDarkMode(v), 250); }}
              trackColor={{ false: '#D1D5DB', true: '#FF7A33' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.themeToggleRow}>
            <View style={styles.themeToggleInfo}>
              <Text style={styles.themeToggleLabel}>음성 안내</Text>
              <Text style={styles.themeToggleDescription}>
                {voiceGuidance ? '코스 런닝 중 음성 안내 활성화' : '음성 안내 비활성화'}
              </Text>
            </View>
            <Switch
              value={voiceGuidance}
              onValueChange={setVoiceGuidance}
              trackColor={{ false: '#D1D5DB', true: '#FF7A33' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Logout */}
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.5}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ---- Sub-component ----

function RunHistoryRow({ run }: { run: RunHistoryItem }) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.runRow}>
      <View style={styles.runRowLeft}>
        <Text style={styles.runTitle}>
          {run.course ? run.course.title : '자유 러닝'}
        </Text>
        <Text style={styles.runDate}>
          {formatRelativeTime(run.finished_at)}
        </Text>
      </View>
      <View style={styles.runRowRight}>
        <Text style={styles.runStatPrimary}>
          {formatDistance(run.distance_meters)}
        </Text>
        <Text style={styles.runStatSecondary}>
          {formatDuration(run.duration_seconds)}
        </Text>
        <Text style={styles.runStatSecondary}>
          {formatPace(run.avg_pace_seconds_per_km)}
        </Text>
      </View>
    </View>
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
  content: {
    paddingBottom: SPACING.xxxl + SPACING.xl,
    gap: SPACING.lg,
  },

  // ------------------------------------------------------------------
  // Profile
  // ------------------------------------------------------------------
  profileSection: {
    alignItems: 'center',
    paddingTop: SPACING.xxxl + SPACING.sm,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  avatarWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: c.border,
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  nickname: {
    fontSize: FONT_SIZES.title,
    fontWeight: '800',
    color: c.text,
    letterSpacing: -0.3,
  },
  editProfileButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  editProfileText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.textSecondary,
  },
  bioText: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  instagramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  instagramText: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    fontWeight: '500',
  },
  dashboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginHorizontal: SPACING.xxl,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  dashboardItem: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  dashboardValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  dashboardLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dashboardDivider: {
    width: 1,
    height: 36,
    backgroundColor: c.divider,
  },

  // ------------------------------------------------------------------
  // Period Selector
  // ------------------------------------------------------------------
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
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  periodChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  periodChipText: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    fontWeight: '600',
  },
  periodChipTextActive: {
    color: c.white,
    fontWeight: '700',
  },

  // ------------------------------------------------------------------
  // Cards (shared base)
  // ------------------------------------------------------------------
  card: {
    marginHorizontal: SPACING.xxl,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.sm,
  },

  // ------------------------------------------------------------------
  // Streaks
  // ------------------------------------------------------------------
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  streakItem: {
    alignItems: 'center',
    gap: SPACING.xs,
    flex: 1,
  },
  streakDivider: {
    width: 1,
    height: 52,
    backgroundColor: c.divider,
  },
  streakEmoji: {
    fontSize: 28,
  },
  streakValue: {
    fontSize: FONT_SIZES.title,
    fontWeight: '900',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  streakUnit: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textSecondary,
  },
  streakLabel: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    fontWeight: '600',
  },

  // ------------------------------------------------------------------
  // Course Stats
  // ------------------------------------------------------------------
  courseStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.sm,
  },
  courseStatItem: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  courseStatValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  courseStatLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.textTertiary,
  },
  courseStatItemHighlight: {
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: c.surfaceLight,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  courseStatValueAccent: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '900',
    color: c.accent,
    fontVariant: ['tabular-nums'],
  },
  courseStatLabelAccent: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.accent,
  },

  // ------------------------------------------------------------------
  // Monthly Chart
  // ------------------------------------------------------------------
  monthlyChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: SPACING.md,
  },
  monthlyBarContainer: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.xs,
  },
  monthlyBarTrack: {
    flex: 1,
    width: 20,
    justifyContent: 'flex-end',
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: c.surfaceLight,
  },
  monthlyBar: {
    backgroundColor: c.text,
    borderRadius: BORDER_RADIUS.sm,
    width: '100%',
  },
  monthlyLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontWeight: '600',
  },
  monthlyValue: {
    fontSize: 10,
    color: c.textSecondary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // ------------------------------------------------------------------
  // Section
  // ------------------------------------------------------------------
  section: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    letterSpacing: -0.2,
  },

  // ------------------------------------------------------------------
  // Run History
  // ------------------------------------------------------------------
  runRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderWidth: 1,
    borderColor: c.border,
  },
  runRowLeft: {
    flex: 1,
    gap: SPACING.xs,
  },
  runRowRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  runTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
  },
  runDate: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontWeight: '500',
  },
  runStatPrimary: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  runStatSecondary: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },

  // ------------------------------------------------------------------
  // Background Image Setting
  // ------------------------------------------------------------------
  bgImageSection: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  bgImageCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  bgImagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  bgImagePreview: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.md,
  },
  bgImageActions: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  bgImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: c.surfaceLight,
  },
  bgImageButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.text,
  },
  bgImageButtonDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: c.surfaceLight,
  },
  bgImageButtonDangerText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.error,
  },
  bgImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  bgImagePlaceholderText: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ------------------------------------------------------------------
  // Theme Toggle
  // ------------------------------------------------------------------
  themeToggleSection: {
    paddingHorizontal: SPACING.xxl,
  },
  themeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderWidth: 1,
    borderColor: c.border,
  },
  themeToggleInfo: {
    gap: SPACING.xs,
  },
  themeToggleLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
  },
  themeToggleDescription: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
  },

  // ------------------------------------------------------------------
  // Import Button
  // ------------------------------------------------------------------
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderWidth: 1,
    borderColor: c.border,
  },
  importButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  importIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  importButtonTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
  },
  importButtonDesc: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    marginTop: 2,
  },

  // ------------------------------------------------------------------
  // Footer
  // ------------------------------------------------------------------
  footerActions: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    alignItems: 'center',
  },
  logoutButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxxl,
  },
  logoutText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: c.textTertiary,
    textDecorationLine: 'underline',
    textDecorationColor: c.textTertiary,
  },
});
