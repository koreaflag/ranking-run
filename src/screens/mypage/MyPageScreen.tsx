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
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../stores/authStore';
import type { MyPageStackParamList } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import StatItem from '../../components/common/StatItem';
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
  const { user } = useAuthStore();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [allRuns, setAllRuns] = useState<RunHistoryItem[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');
  const [refreshing, setRefreshing] = useState(false);
  const [socialCounts, setSocialCounts] = useState<{ followers: number; likes: number }>({ followers: 0, likes: 0 });

  const loadData = useCallback(async () => {
    try {
      const [statsData, runsData, socialData] = await Promise.all([
        userService.getStats(selectedPeriod).catch(() => null),
        userService.getRunHistory(0, 200).catch(() => ({ data: [], total_count: 0, has_next: false })),
        userService.getSocialCounts().catch(() => ({ followers_count: 0, following_count: 0, total_likes_received: 0 })),
      ]);
      setStats(statsData);
      setAllRuns(runsData.data);
      setSocialCounts({ followers: socialData.followers_count, likes: socialData.total_likes_received });
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
        Alert.alert('앗...!', '프로필 사진 변경에 실패했습니다.');
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
      Alert.alert('앗...!', '프로필 사진 제거에 실패했습니다.');
    }
  };

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
          <Text style={styles.headerEditText}>편집</Text>
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

          {/* Profile inline stats */}
          <View style={styles.profileStatsRow}>
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>
                {socialCounts.followers}
              </Text>
              <Text style={styles.profileStatLabel}>팔로워</Text>
            </View>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>
                {socialCounts.likes}
              </Text>
              <Text style={styles.profileStatLabel}>좋아요</Text>
            </View>
          </View>
        </View>

        {/* Recent Runs */}
        {allRuns.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>최근 러닝</Text>
            {allRuns.slice(0, 5).map(run => {
              const dateStr = run.finished_at.slice(0, 10);
              const [, mm, dd] = dateStr.split('-');
              return (
                <View key={run.id} style={styles.recentRunRow}>
                  <View style={styles.recentRunLeft}>
                    <View style={styles.recentRunDateBox}>
                      <Text style={styles.recentRunDateMonth}>{Number(mm)}/{Number(dd)}</Text>
                    </View>
                    <View style={styles.recentRunInfo}>
                      <Text style={styles.recentRunTitle} numberOfLines={1}>
                        {run.course ? run.course.title : run.device_model === 'Apple Watch' ? 'Watch 러닝' : '자유 러닝'}
                      </Text>
                      <Text style={styles.recentRunMeta}>
                        {formatDistance(run.distance_meters)} · {formatPace(run.avg_pace_seconds_per_km)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.recentRunDuration}>
                    {formatDuration(run.duration_seconds)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Stats Dashboard */}
        {stats && (
          <>
            {/* Main stats with period selector */}
            <View style={styles.card}>
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
              <View style={styles.statsGrid}>
                <StatItem
                  label="거리"
                  value={metersToKm(stats.total_distance_meters)}
                  unit="km"
                />
                <StatItem
                  label="시간"
                  value={formatDuration(stats.total_duration_seconds)}
                />
                <StatItem
                  label="평균 페이스"
                  value={formatPace(stats.avg_pace_seconds_per_km)}
                />
              </View>
              <View style={styles.statsGrid}>
                <StatItem
                  label="최고 페이스"
                  value={formatPace(stats.best_pace_seconds_per_km)}
                />
                <StatItem
                  label="평균 거리"
                  value={formatDistance(stats.avg_distance_per_run_meters)}
                />
                <StatItem
                  label="최장 거리"
                  value={formatDistance(stats.longest_run_meters)}
                />
              </View>
              <View style={styles.statsGrid}>
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
                <StatItem
                  label="러닝 횟수"
                  value={`${stats.total_runs ?? 0}`}
                  unit="회"
                />
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
                <View style={styles.monthlyChartHeader}>
                  <Text style={styles.cardTitle}>월별 러닝 거리</Text>
                  <Text style={styles.monthlyUnit}>km</Text>
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
          </>
        )}

        {/* Gear & Import */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.importButton}
            onPress={() => navigation.navigate('GearManage')}
            activeOpacity={0.7}
          >
            <View style={styles.importButtonLeft}>
              <View style={styles.importIconCircle}>
                <Ionicons name="footsteps-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.importButtonTitle}>내 기어</Text>
                <Text style={styles.importButtonDesc}>러닝화 등록 및 관리</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

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
                <Text style={styles.importButtonDesc}>Strava 활동을 RUNVS로 가져오기</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.importButton}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.7}
          >
            <View style={styles.importButtonLeft}>
              <View style={styles.importIconCircle}>
                <Ionicons name="settings-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.importButtonTitle}>설정</Text>
                <Text style={styles.importButtonDesc}>다크 모드, 음성 안내, 지도 설정</Text>
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
  // Header
  // ------------------------------------------------------------------
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  headerEditText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.primary,
  },

  // ------------------------------------------------------------------
  // Profile
  // ------------------------------------------------------------------
  profileSection: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
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
  profileStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  profileStatItem: {
    alignItems: 'center',
    gap: 2,
  },
  profileStatValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  profileStatLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textTertiary,
  },
  profileStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: c.divider,
  },

  // ------------------------------------------------------------------
  // Period Selector
  // ------------------------------------------------------------------
  periodSelector: {
    flexDirection: 'row',
    gap: SPACING.xs,
    backgroundColor: c.surfaceLight,
    borderRadius: BORDER_RADIUS.md,
    padding: 3,
  },
  periodChip: {
    flex: 1,
    paddingVertical: SPACING.sm - 2,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md - 2,
  },
  periodChipActive: {
    backgroundColor: c.primary,
  },
  periodChipText: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontWeight: '600',
  },
  periodChipTextActive: {
    color: c.white,
    fontWeight: '700',
  },

  // ------------------------------------------------------------------
  // Cards
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
  monthlyChartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthlyUnit: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textTertiary,
  },
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
  // Recent Runs
  // ------------------------------------------------------------------
  recentRunRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  recentRunLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  recentRunDateBox: {
    width: 40,
    alignItems: 'center',
  },
  recentRunDateMonth: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  recentRunInfo: {
    flex: 1,
    gap: 2,
  },
  recentRunTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
  recentRunMeta: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontWeight: '500',
  },
  recentRunDuration: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.text,
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
});
