import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCourseStore } from '../../stores/courseStore';
import StatItem from '../../components/common/StatItem';
import ScreenHeader from '../../components/common/ScreenHeader';
import RouteMapView from '../../components/map/RouteMapView';
import ReviewSection from '../../components/course/ReviewSection';
import DifficultyBadge from '../../components/course/DifficultyBadge';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { CourseStackParamList } from '../../types/navigation';
import type { RankingEntry } from '../../types/api';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatNumber,
  formatDate,
} from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS, type DifficultyLevel } from '../../utils/constants';
import { useAuthStore } from '../../stores/authStore';

type DetailRoute = RouteProp<CourseStackParamList, 'CourseDetail'>;

function inferDifficulty(distanceMeters: number, elevationGain: number): DifficultyLevel {
  const km = distanceMeters / 1000;
  if (km >= 15 || elevationGain >= 300) return 'expert';
  if (km >= 7 || elevationGain >= 150) return 'hard';
  if (km >= 3) return 'normal';
  return 'easy';
}

export default function CourseDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CourseStackParamList>>();
  const route = useRoute<DetailRoute>();
  const { courseId, openReview } = route.params;
  const scrollViewRef = useRef<ScrollView>(null);

  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useAuthStore((s) => s.user);

  const {
    selectedCourse,
    selectedCourseStats,
    selectedCourseRankings,
    selectedCourseMyBest,
    isLoadingDetail,
    error,
    fetchCourseDetail,
    clearDetail,
    favoriteIds,
    toggleFavorite,
    fetchFavoriteCourses,
    selectedCourseLikeCount,
    selectedCourseIsLiked,
    toggleLike,
    deleteMyCourse,
  } = useCourseStore();

  const isFavorited = favoriteIds.includes(courseId);

  // Tap animation scales
  const likeScale = useRef(new Animated.Value(1)).current;
  const favScale = useRef(new Animated.Value(1)).current;

  const animateButton = useCallback((scale: Animated.Value, callback: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 12 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
    ]).start();
    callback();
  }, []);

  useEffect(() => {
    fetchCourseDetail(courseId);
    fetchFavoriteCourses();
    return () => clearDetail();
  }, [courseId, fetchCourseDetail, fetchFavoriteCourses, clearDetail]);

  useEffect(() => {
    if (openReview && selectedCourse && !isLoadingDetail) {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [openReview, selectedCourse, isLoadingDetail]);

  // Detect if opened from WorldStack (sibling route 'World' exists)
  const isFromWorld = (navigation.getState().routeNames as string[]).includes('World');

  const handleRunThisCourse = () => {
    if (isFromWorld) {
      // Already in World tab — go straight to running
      navigation.getParent()?.navigate('RunningTab', {
        screen: 'RunningMain',
        params: { courseId },
      });
    } else {
      // From other tabs — navigate to World tab and focus on course
      useCourseStore.getState().setPendingFocusCourseId(courseId);
      navigation.getParent()?.navigate('WorldTab');
    }
  };

  const handleDeleteCourse = () => {
    Alert.alert(
      '코스 삭제',
      '이 코스를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMyCourse(courseId);
              navigation.goBack();
            } catch (err) {
              const msg = err instanceof Error ? err.message : '알 수 없는 오류';
              Alert.alert('앗...!', `코스 삭제에 실패했습니다.\n(${msg})`);
            }
          },
        },
      ],
    );
  };

  if (isLoadingDetail) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  if (!selectedCourse) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            {error || '코스 정보를 불러올 수 없습니다.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchCourseDetail(courseId)}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const course = selectedCourse;
  const stats = selectedCourseStats;

  // Convert GeoJSON coordinates to route points for map display
  const routePoints = course.route_geometry?.coordinates?.map(
    ([lng, lat]: [number, number, number]) => ({
      latitude: lat,
      longitude: lng,
    }),
  ) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Large map at top */}
        <View style={styles.mapWrapper}>
          <RouteMapView routePoints={routePoints} style={styles.mapPreview} />
        </View>

        {/* Course title + difficulty badge */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <Text style={styles.courseTitle} numberOfLines={2}>{course.title}</Text>
            <DifficultyBadge
              difficulty={inferDifficulty(course.distance_meters, course.elevation_gain_meters)}
              size="md"
            />
          </View>
          {course.description && (
            <Text style={styles.courseDescription}>{course.description}</Text>
          )}
          <View style={styles.creatorRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate('UserProfile', { userId: course.creator.id })}
              activeOpacity={0.7}
              style={styles.creatorTouchable}
            >
              <Text style={styles.creatorLabel}>by</Text>
              <Text style={styles.creatorName}>{course.creator.nickname}</Text>
            </TouchableOpacity>
            <Text style={styles.createdAt}>
              {formatDate(course.created_at)}
            </Text>
            <View style={styles.socialButtons}>
              <TouchableOpacity
                onPress={() => animateButton(likeScale, () => toggleLike(courseId))}
                activeOpacity={0.7}
                style={styles.likeButton}
              >
                <View style={styles.animIconBox}>
                  <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                    <Ionicons
                      name={selectedCourseIsLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                      size={22}
                      color={selectedCourseIsLiked ? colors.white : colors.textTertiary}
                    />
                  </Animated.View>
                </View>
                <Text style={[
                  styles.likeCount,
                  selectedCourseIsLiked && { color: colors.white },
                  selectedCourseLikeCount === 0 && { opacity: 0 },
                ]}>
                  {selectedCourseLikeCount || 0}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => animateButton(favScale, () => toggleFavorite(courseId))}
                activeOpacity={0.7}
                style={styles.favoriteButton}
              >
                <View style={styles.animIconBox}>
                  <Animated.View style={{ transform: [{ scale: favScale }] }}>
                    <Ionicons
                      name={isFavorited ? 'heart' : 'heart-outline'}
                      size={22}
                      color={isFavorited ? colors.error : colors.textTertiary}
                    />
                  </Animated.View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          {currentUser?.id === course.creator.id && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteCourse}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.deleteButtonText}>코스 삭제</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Dashboard stats: clean grid, black values, gray labels */}
        <View style={styles.dashboardCard}>
          <View style={styles.dashboardGrid}>
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardValue}>
                {formatDistance(course.distance_meters)}
              </Text>
              <Text style={styles.dashboardLabel}>거리</Text>
            </View>
            <View style={styles.dashboardDivider} />
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardValue}>
                {formatDuration(course.estimated_duration_seconds)}
              </Text>
              <Text style={styles.dashboardLabel}>예상 시간</Text>
            </View>
            <View style={styles.dashboardDivider} />
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardValue}>
                {Math.round(course.elevation_gain_meters)}m
              </Text>
              <Text style={styles.dashboardLabel}>고도 상승</Text>
            </View>
          </View>
        </View>

        {/* Course Stats */}
        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.sectionTitle}>코스 통계</Text>
            <View style={styles.dashboardGrid}>
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValue}>
                  {formatNumber(stats.total_runs)}
                </Text>
                <Text style={styles.dashboardLabel}>총 달린 횟수</Text>
              </View>
              <View style={styles.dashboardDivider} />
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValue}>
                  {formatNumber(stats.unique_runners)}
                </Text>
                <Text style={styles.dashboardLabel}>러너</Text>
              </View>
              <View style={styles.dashboardDivider} />
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValue}>
                  {Math.round(stats.completion_rate * 100)}%
                </Text>
                <Text style={styles.dashboardLabel}>완주율</Text>
              </View>
            </View>
            <View style={styles.statsRowDivider} />
            <View style={styles.dashboardGrid}>
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValue}>
                  {formatPace(stats.avg_pace_seconds_per_km)}
                </Text>
                <Text style={styles.dashboardLabel}>평균 페이스</Text>
              </View>
              <View style={styles.dashboardDivider} />
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValueHighlight}>
                  {formatPace(stats.best_pace_seconds_per_km)}
                </Text>
                <Text style={styles.dashboardLabel}>최고 페이스</Text>
              </View>
              <View style={styles.dashboardDivider} />
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValue}>
                  {formatDuration(stats.avg_duration_seconds)}
                </Text>
                <Text style={styles.dashboardLabel}>평균 시간</Text>
              </View>
            </View>
          </View>
        )}

        {/* My Best Record */}
        {selectedCourseMyBest && (
          <View style={styles.myBestCard}>
            <View style={styles.myBestHeader}>
              <Text style={styles.sectionTitle}>내 최고 기록</Text>
              <View style={styles.myBestBadge}>
                <Text style={styles.myBestBadgeText}>PB</Text>
              </View>
            </View>
            <View style={styles.dashboardGrid}>
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValue}>
                  {formatDuration(
                    selectedCourseMyBest.duration_seconds,
                  )}
                </Text>
                <Text style={styles.dashboardLabel}>시간</Text>
              </View>
              <View style={styles.dashboardDivider} />
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValue}>
                  {formatPace(
                    selectedCourseMyBest.avg_pace_seconds_per_km,
                  )}
                </Text>
                <Text style={styles.dashboardLabel}>페이스</Text>
              </View>
            </View>
          </View>
        )}

        {/* Leaderboard with rank badges */}
        {selectedCourseRankings.length > 0 && (
          <View style={styles.rankingSection}>
            <View style={styles.rankingHeader}>
              <Text style={styles.sectionTitle}>리더보드</Text>
              <Text style={styles.rankingCount}>
                TOP {selectedCourseRankings.length}
              </Text>
            </View>
            {selectedCourseRankings.map((entry: RankingEntry) => (
              <RankingRow
                key={`${entry.rank}-${entry.user.id}`}
                entry={entry}
                isMe={entry.user.id === currentUser?.id}
              />
            ))}
          </View>
        )}

        {/* Reviews */}
        <ReviewSection
          courseId={courseId}
          creatorId={course.creator.id}
          currentUserId={currentUser?.id}
          onInputFocus={() => {
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 300);
          }}
        />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom CTA: Competition challenge */}
      <View style={styles.bottomCta}>
        {/* Show gap to 1st place if user has a record */}
        {stats && selectedCourseMyBest && (
          <View style={styles.challengeInfo}>
            <Text style={styles.challengeLabel}>1위 기록</Text>
            <Text style={styles.challengeRecord}>
              {formatDuration(stats.best_duration_seconds)}
            </Text>
            <Text style={styles.challengeGap}>
              격차 {formatDuration(selectedCourseMyBest.duration_seconds - stats.best_duration_seconds)}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleRunThisCourse}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isFromWorld ? 'play' : 'globe-outline'}
            size={20}
            color={colors.white}
            style={{ marginRight: SPACING.sm }}
          />
          <Text style={styles.ctaButtonText}>
            {isFromWorld ? '도전하기' : '월드에서 보기'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---- Sub-component ----

const RankingRow = React.memo(function RankingRow({ entry, isMe = false }: { entry: RankingEntry; isMe?: boolean }) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<CourseStackParamList>>();

  const RANK_COLORS = [colors.gold, colors.silver, colors.bronze];
  const isTop3 = entry.rank <= 3;
  const rankColor = isTop3 ? RANK_COLORS[entry.rank - 1] : colors.surfaceLight;

  return (
    <View style={[styles.rankingRow, isMe && styles.rankingRowMe]}>
      {/* Rank badge: gold/silver/bronze circles for top3 */}
      <View
        style={[
          styles.rankBadge,
          { backgroundColor: rankColor },
        ]}
      >
        <Text
          style={[
            styles.rankNumber,
            isTop3 ? styles.rankNumberTop3 : styles.rankNumberDefault,
          ]}
        >
          {entry.rank}
        </Text>
      </View>

      {/* Runner info */}
      <View style={styles.rankInfo}>
        <TouchableOpacity
          onPress={() => navigation.navigate('UserProfile', { userId: entry.user.id })}
          activeOpacity={0.7}
        >
          <Text style={[styles.rankNickname, isMe && styles.rankNicknameMe]}>
            {entry.user.nickname}
            {isMe ? '  (ME)' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pace + Duration */}
      <View style={styles.rankStats}>
        <Text style={styles.rankPace}>
          {formatPace(entry.best_pace_seconds_per_km)}
        </Text>
        <Text style={styles.rankDuration}>
          {formatDuration(entry.best_duration_seconds)}
        </Text>
      </View>
    </View>
  );
});

// ---- Styles ----

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 120,
    gap: SPACING.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  retryButton: {
    backgroundColor: c.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.lg,
  },
  retryButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
  },

  // -- Large map at top --
  mapWrapper: {
    marginHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  mapPreview: {
    height: 260,
    borderRadius: BORDER_RADIUS.xl,
  },

  // -- Course title + difficulty --
  titleSection: {
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  courseTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -0.5,
  },
  courseDescription: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
    lineHeight: 22,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  creatorTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  creatorLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
  },
  creatorName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.text,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  deleteButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.error,
  },
  createdAt: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    marginLeft: 'auto',
  },
  socialButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    padding: SPACING.sm,
  },
  animIconBox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  likeCount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.textTertiary,
  },
  favoriteButton: {
    padding: SPACING.sm,
  },

  // -- Dashboard stats: clean grid --
  dashboardCard: {
    marginHorizontal: SPACING.xxl,
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  dashboardGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dashboardCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  dashboardDivider: {
    width: 1,
    height: 32,
    backgroundColor: c.divider,
  },
  dashboardValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  dashboardValueHighlight: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.primary,
    fontVariant: ['tabular-nums'],
  },
  dashboardLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // -- Stats card --
  statsCard: {
    marginHorizontal: SPACING.xxl,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  statsRowDivider: {
    height: 1,
    backgroundColor: c.divider,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    letterSpacing: -0.3,
  },

  // -- My Best Card --
  myBestCard: {
    marginHorizontal: SPACING.xxl,
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  myBestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  myBestBadge: {
    backgroundColor: c.accent,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
  },
  myBestBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: c.white,
    letterSpacing: 1,
  },

  // -- Leaderboard --
  rankingSection: {
    marginHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  rankingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  rankingCount: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    fontWeight: '700',
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
    gap: SPACING.md,
  },
  rankingRowMe: {
    backgroundColor: c.primary + '0D',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    marginHorizontal: -SPACING.sm,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
  },
  rankNumberTop3: {
    color: c.white,
  },
  rankNumberDefault: {
    color: c.textSecondary,
  },
  rankInfo: {
    flex: 1,
  },
  rankNickname: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
  },
  rankNicknameMe: {
    fontWeight: '800',
    color: c.primary,
  },
  rankStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rankPace: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  rankDuration: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    fontVariant: ['tabular-nums'],
  },

  // -- Bottom CTA: Competition challenge --
  bottomCta: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    backgroundColor: c.card,
    borderTopWidth: 1,
    borderTopColor: c.divider,
    gap: SPACING.sm,
  },
  challengeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  challengeLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: c.textTertiary,
  },
  challengeRecord: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: c.gold,
    fontVariant: ['tabular-nums'],
  },
  challengeGap: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: c.primary,
  },
  ctaButton: {
    flexDirection: 'row',
    backgroundColor: c.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg + 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  ctaButtonText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.white,
    letterSpacing: 0.5,
  },
});
