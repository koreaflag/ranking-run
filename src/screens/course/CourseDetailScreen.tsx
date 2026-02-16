import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useCourseStore } from '../../stores/courseStore';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import StatItem from '../../components/common/StatItem';
import ScreenHeader from '../../components/common/ScreenHeader';
import RouteMapView from '../../components/map/RouteMapView';
import type { CourseStackParamList } from '../../types/navigation';
import type { RankingEntry } from '../../types/api';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatNumber,
  formatDate,
} from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type DetailRoute = RouteProp<CourseStackParamList, 'CourseDetail'>;

export default function CourseDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<DetailRoute>();
  const { courseId } = route.params;

  const {
    selectedCourse,
    selectedCourseStats,
    selectedCourseRankings,
    selectedCourseMyBest,
    isLoadingDetail,
    fetchCourseDetail,
    clearDetail,
  } = useCourseStore();

  useEffect(() => {
    fetchCourseDetail(courseId);
    return () => clearDetail();
  }, [courseId, fetchCourseDetail, clearDetail]);

  const handleRunThisCourse = () => {
    // Navigate to RunningTab with the courseId
    navigation.getParent()?.getParent()?.navigate('RunningTab', {
      screen: 'RunningMain',
      params: { courseId },
    });
  };

  if (isLoadingDetail || !selectedCourse) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="코스 상세" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const course = selectedCourse;
  const stats = selectedCourseStats;

  // Convert GeoJSON coordinates to route points for map display
  const routePoints = course.route_geometry.coordinates.map(
    ([lng, lat]: [number, number, number]) => ({
      latitude: lat,
      longitude: lng,
    }),
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title={course.title} onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Map Preview */}
        <RouteMapView routePoints={routePoints} style={styles.mapPreview} />

        {/* Course Info */}
        <Card style={styles.infoCard}>
          <Text style={styles.courseTitle}>{course.title}</Text>
          {course.description && (
            <Text style={styles.courseDescription}>{course.description}</Text>
          )}
          <View style={styles.statsGrid}>
            <StatItem
              label="거리"
              value={formatDistance(course.distance_meters)}
            />
            <StatItem
              label="예상 시간"
              value={formatDuration(course.estimated_duration_seconds)}
            />
            <StatItem
              label="고도 상승"
              value={`${Math.round(course.elevation_gain_meters)}m`}
            />
          </View>
          <View style={styles.creatorRow}>
            <Text style={styles.creatorLabel}>등록자</Text>
            <Text style={styles.creatorName}>{course.creator.nickname}</Text>
            <Text style={styles.createdAt}>
              {formatDate(course.created_at)}
            </Text>
          </View>
        </Card>

        {/* Course Stats */}
        {stats && (
          <Card style={styles.statsCard}>
            <Text style={styles.sectionTitle}>코스 통계</Text>
            <View style={styles.statsGrid}>
              <StatItem
                label="총 달린 횟수"
                value={formatNumber(stats.total_runs)}
              />
              <StatItem
                label="참여 러너"
                value={formatNumber(stats.unique_runners)}
              />
              <StatItem
                label="완주율"
                value={`${Math.round(stats.completion_rate * 100)}%`}
              />
            </View>
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
                label="평균 시간"
                value={formatDuration(stats.avg_duration_seconds)}
              />
            </View>
          </Card>
        )}

        {/* My Best Record */}
        {selectedCourseMyBest && (
          <Card style={styles.myBestCard}>
            <Text style={styles.sectionTitle}>내 최고 기록</Text>
            <View style={styles.statsGrid}>
              <StatItem
                label="시간"
                value={formatDuration(
                  selectedCourseMyBest.duration_seconds,
                )}
              />
              <StatItem
                label="페이스"
                value={formatPace(
                  selectedCourseMyBest.avg_pace_seconds_per_km,
                )}
              />
            </View>
          </Card>
        )}

        {/* Rankings */}
        {selectedCourseRankings.length > 0 && (
          <Card style={styles.rankingCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>랭킹</Text>
              <Text style={styles.rankingCount}>
                TOP {selectedCourseRankings.length}
              </Text>
            </View>
            {selectedCourseRankings.map((entry: RankingEntry) => (
              <RankingRow key={`${entry.rank}-${entry.user.id}`} entry={entry} />
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomCta}>
        <Button
          title="이 코스 달리기"
          onPress={handleRunThisCourse}
          fullWidth
          size="lg"
        />
      </View>
    </SafeAreaView>
  );
}

// ---- Sub-component ----

function RankingRow({ entry }: { entry: RankingEntry }) {
  const isTop3 = entry.rank <= 3;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <View style={styles.rankingRow}>
      <View style={styles.rankBadge}>
        {isTop3 ? (
          <Text style={styles.medalEmoji}>{medals[entry.rank - 1]}</Text>
        ) : (
          <Text style={styles.rankNumber}>{entry.rank}</Text>
        )}
      </View>
      <View style={styles.rankInfo}>
        <Text style={styles.rankNickname}>{entry.user.nickname}</Text>
      </View>
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
    paddingHorizontal: SPACING.xxl,
    paddingBottom: 100,
    gap: SPACING.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPreview: {
    height: 220,
    borderRadius: BORDER_RADIUS.lg,
  },
  infoCard: {
    gap: SPACING.md,
  },
  courseTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.text,
  },
  courseDescription: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.sm,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  creatorLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
  },
  creatorName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  createdAt: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
    marginLeft: 'auto',
  },
  statsCard: {
    gap: SPACING.md,
  },
  myBestCard: {
    gap: SPACING.md,
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  rankingCard: {
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rankingCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    gap: SPACING.md,
  },
  rankBadge: {
    width: 32,
    alignItems: 'center',
  },
  medalEmoji: {
    fontSize: 20,
  },
  rankNumber: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  rankInfo: {
    flex: 1,
  },
  rankNickname: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  rankStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rankPace: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  rankDuration: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  bottomCta: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
