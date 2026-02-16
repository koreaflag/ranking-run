import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCourseStore } from '../../stores/courseStore';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import RouteMapView from '../../components/map/RouteMapView';
import type { CourseStackParamList } from '../../types/navigation';
import type { CourseListItem } from '../../types/api';
import { formatDistance, formatPace, formatNumber } from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type CourseNav = NativeStackNavigationProp<CourseStackParamList, 'CourseList'>;

type SortOption = {
  label: string;
  orderBy: 'total_runs' | 'created_at' | 'distance_meters';
  order: 'asc' | 'desc';
};

const SORT_OPTIONS: SortOption[] = [
  { label: '인기순', orderBy: 'total_runs', order: 'desc' },
  { label: '최신순', orderBy: 'created_at', order: 'desc' },
  { label: '거리순', orderBy: 'distance_meters', order: 'asc' },
];

export default function CourseListScreen() {
  const navigation = useNavigation<CourseNav>();
  const {
    courses,
    isLoading,
    isLoadingMore,
    hasNext,
    viewMode,
    filters,
    fetchCourses,
    fetchMoreCourses,
    setFilters,
    setViewMode,
  } = useCourseStore();

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleSortChange = useCallback(
    (option: SortOption) => {
      setFilters({ order_by: option.orderBy, order: option.order });
      fetchCourses({
        ...filters,
        order_by: option.orderBy,
        order: option.order,
      });
    },
    [filters, setFilters, fetchCourses],
  );

  const handleCoursePress = useCallback(
    (courseId: string) => {
      navigation.navigate('CourseDetail', { courseId });
    },
    [navigation],
  );

  const handleEndReached = useCallback(() => {
    if (hasNext && !isLoadingMore) {
      fetchMoreCourses();
    }
  }, [hasNext, isLoadingMore, fetchMoreCourses]);

  const renderCourseItem = useCallback(
    ({ item }: { item: CourseListItem }) => (
      <CourseListCard course={item} onPress={() => handleCoursePress(item.id)} />
    ),
    [handleCoursePress],
  );

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  };

  const activeSort =
    SORT_OPTIONS.find((opt) => opt.orderBy === filters.order_by) ??
    SORT_OPTIONS[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>코스 탐색</Text>
      </View>

      {/* View Mode Toggle + Sort */}
      <View style={styles.toolbar}>
        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.orderBy}
              style={[
                styles.sortChip,
                activeSort.orderBy === option.orderBy && styles.sortChipActive,
              ]}
              onPress={() => handleSortChange(option)}
            >
              <Text
                style={[
                  styles.sortChipText,
                  activeSort.orderBy === option.orderBy &&
                    styles.sortChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[
              styles.viewToggleBtn,
              viewMode === 'list' && styles.viewToggleBtnActive,
            ]}
            onPress={() => setViewMode('list')}
          >
            <Text style={styles.viewToggleText}>목록</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewToggleBtn,
              viewMode === 'map' && styles.viewToggleBtnActive,
            ]}
            onPress={() => setViewMode('map')}
          >
            <Text style={styles.viewToggleText}>지도</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {viewMode === 'map' ? (
        <RouteMapView style={styles.mapView} />
      ) : isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>코스를 불러오는 중...</Text>
        </View>
      ) : courses.length === 0 ? (
        <EmptyState
          icon="🗺"
          title="등록된 코스가 없습니다"
          description="직접 런닝하고 첫 코스를 등록해 보세요!"
        />
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(item) => item.id}
          renderItem={renderCourseItem}
          contentContainerStyle={styles.listContent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ---- Sub-component ----

function CourseListCard({
  course,
  onPress,
}: {
  course: CourseListItem;
  onPress: () => void;
}) {
  return (
    <Card style={styles.courseCard} onPress={onPress}>
      <View style={styles.cardThumbnail}>
        <Text style={styles.thumbnailEmoji}>🗺</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {course.title}
        </Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardDistance}>
            {formatDistance(course.distance_meters)}
          </Text>
          {course.elevation_gain_meters > 0 && (
            <Text style={styles.cardElevation}>
              +{Math.round(course.elevation_gain_meters)}m
            </Text>
          )}
        </View>
        <View style={styles.cardStatsRow}>
          <Text style={styles.cardStat}>
            {formatNumber(course.stats.total_runs)}회 달림
          </Text>
          <Text style={styles.cardStat}>
            {course.stats.avg_pace_seconds_per_km
              ? formatPace(course.stats.avg_pace_seconds_per_km)
              : '--'}
          </Text>
          <Text style={styles.cardStat}>
            {formatNumber(course.stats.unique_runners)}명
          </Text>
        </View>
        <View style={styles.cardCreator}>
          <Text style={styles.creatorText}>
            {course.creator.nickname}
          </Text>
        </View>
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
  header: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: FONT_SIZES.title,
    fontWeight: '800',
    color: COLORS.text,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.md,
  },
  sortRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  sortChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sortChipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: COLORS.white,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  viewToggleBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  viewToggleBtnActive: {
    backgroundColor: COLORS.surfaceLight,
  },
  viewToggleText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  mapView: {
    flex: 1,
    margin: SPACING.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  loadingFooter: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  courseCard: {
    flexDirection: 'row',
    padding: 0,
    overflow: 'hidden',
  },
  cardThumbnail: {
    width: 100,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailEmoji: {
    fontSize: 32,
  },
  cardBody: {
    flex: 1,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  cardTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardMetaRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  cardDistance: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary,
  },
  cardElevation: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  cardStatsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cardStat: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
  },
  cardCreator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  creatorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary,
  },
});
