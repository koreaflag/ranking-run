import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  TextInput,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCourseStore } from '../../stores/courseStore';
import EmptyState from '../../components/common/EmptyState';
import DifficultyBadge from '../../components/course/DifficultyBadge';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { CourseStackParamList } from '../../types/navigation';
import type { CourseListItem, MyCourse, NearbyCourse } from '../../types/api';
import { formatDistance, formatPace, formatDuration, formatNumber } from '../../utils/format';
import { formatDate } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS, type DifficultyLevel } from '../../utils/constants';

type CourseNav = NativeStackNavigationProp<CourseStackParamList, 'CourseList'>;

type SortKey = 'recommended' | 'total_runs' | 'created_at' | 'distance_meters';

type SortOption = {
  label: string;
  key: SortKey;
  orderBy?: 'total_runs' | 'created_at' | 'distance_meters';
  order?: 'asc' | 'desc';
};

const SORT_OPTIONS: SortOption[] = [
  { label: '추천', key: 'recommended' },
  { label: '인기순', key: 'total_runs', orderBy: 'total_runs', order: 'desc' },
  { label: '최신순', key: 'created_at', orderBy: 'created_at', order: 'desc' },
  { label: '거리순', key: 'distance_meters', orderBy: 'distance_meters', order: 'asc' },
];

type CourseTab = 'all' | 'mine';

export default function CourseListScreen() {
  const navigation = useNavigation<CourseNav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<CourseTab>('all');
  const [activeSortKey, setActiveSortKey] = useState<SortKey>('recommended');
  const [searchText, setSearchText] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    courses,
    myCourses,
    nearbyCourses,
    isLoading,
    isLoadingMore,
    isLoadingMyCourses,
    hasNext,
    filters,
    fetchCourses,
    fetchMoreCourses,
    fetchMyCourses,
    fetchNearbyCourses,
    setFilters,
  } = useCourseStore();

  useEffect(() => {
    fetchCourses();
    fetchNearbyCourses(37.5665, 126.978);
  }, [fetchCourses, fetchNearbyCourses]);

  useEffect(() => {
    if (tab === 'mine') {
      fetchMyCourses();
    }
  }, [tab, fetchMyCourses]);

  const handleSortChange = useCallback(
    (option: SortOption) => {
      setActiveSortKey(option.key);
      if (option.key === 'recommended') return; // Data already loaded
      setFilters({ order_by: option.orderBy!, order: option.order! });
      fetchCourses({
        ...filters,
        order_by: option.orderBy!,
        order: option.order!,
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

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchText(text);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = setTimeout(() => {
        const trimmed = text.trim();
        const searchParam = trimmed.length > 0 ? trimmed : undefined;
        setFilters({ ...filters, search: searchParam });
        fetchCourses({ ...filters, search: searchParam });
      }, 400);
    },
    [filters, setFilters, fetchCourses],
  );

  const handleClearSearch = useCallback(() => {
    setSearchText('');
    const { search: _, ...rest } = filters;
    setFilters(rest);
    fetchCourses(rest);
  }, [filters, setFilters, fetchCourses]);

  // Cleanup search debounce on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

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
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  };

  const activeSort =
    SORT_OPTIONS.find((opt) => opt.key === activeSortKey) ?? SORT_OPTIONS[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header + Tab */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>코스</Text>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'all' && styles.tabBtnActive]}
            onPress={() => setTab('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>
              전체
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]}
            onPress={() => setTab('mine')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>
              내 코스
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar (only for 'all' tab) */}
      {tab === 'all' && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="코스 이름으로 검색"
              placeholderTextColor={colors.textTertiary}
              value={searchText}
              onChangeText={handleSearchChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Sort Chips (only for 'all' tab) */}
      {tab === 'all' && (
        <View style={styles.toolbar}>
          <View style={styles.sortRow}>
            {SORT_OPTIONS.map((option) => {
              const isActive = activeSort.key === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.sortChip,
                    isActive && styles.sortChipActive,
                  ]}
                  onPress={() => handleSortChange(option)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      isActive && styles.sortChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Content */}
      {tab === 'mine' ? (
        isLoadingMyCourses ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : myCourses.length === 0 ? (
          <EmptyState
            icon="🏁"
            title="아직 만든 코스가 없습니다"
            description="런닝 후 나만의 코스를 등록해 보세요!"
          />
        ) : (
          <FlatList
            data={myCourses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MyCourseCard course={item} onPress={() => handleCoursePress(item.id)} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : activeSortKey === 'recommended' ? (
        nearbyCourses.length === 0 ? (
          <EmptyState
            icon="🏁"
            title="주변에 추천 코스가 없습니다"
            description="코스를 만들어 공유해 보세요!"
          />
        ) : (
          <FlatList
            data={nearbyCourses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <RecommendedCourseCard course={item} onPress={() => handleCoursePress(item.id)} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
          <Text style={styles.loadingText}>코스를 불러오는 중...</Text>
        </View>
      ) : courses.length === 0 ? (
        <EmptyState
          icon="🏁"
          title="아직 등록된 코스가 없습니다"
          description="첫 코스를 개척하세요!"
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

// ---- Sub-components ----

/** Infer difficulty from distance + elevation */
function inferDifficulty(distanceMeters: number, elevationGain: number): DifficultyLevel {
  const km = distanceMeters / 1000;
  if (km >= 15 || elevationGain >= 300) return 'expert';
  if (km >= 7 || elevationGain >= 150) return 'hard';
  if (km >= 3) return 'normal';
  return 'easy';
}

const CourseListCard = React.memo(function CourseListCard({
  course,
  onPress,
}: {
  course: CourseListItem;
  onPress: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const difficulty = inferDifficulty(course.distance_meters, course.elevation_gain_meters);

  return (
    <TouchableOpacity
      style={styles.courseCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Top row: title + difficulty badge */}
      <View style={styles.cardTopRow}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {course.title}
        </Text>
        <DifficultyBadge difficulty={difficulty} />
      </View>

      {/* Creator */}
      <Text style={styles.creatorText}>
        by {course.creator.nickname} · {formatDate(course.created_at)}
      </Text>

      {/* Distance + elevation row */}
      <View style={styles.cardDistanceRow}>
        <Text style={styles.cardDistance}>
          {formatDistance(course.distance_meters)}
        </Text>
        {course.elevation_gain_meters > 0 && (
          <Text style={styles.cardElevation}>
            +{Math.round(course.elevation_gain_meters)}m
          </Text>
        )}
      </View>

      {/* Competition stats: likes + challengers + runners + avg pace */}
      <View style={styles.cardStatsRow}>
        <View style={styles.statItem}>
          <View style={styles.statItemWithIcon}>
            <Ionicons name="thumbs-up-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.statItemValue}>
              {formatNumber(course.like_count ?? 0)}
            </Text>
          </View>
          <Text style={styles.statItemLabel}>좋아요</Text>
        </View>
        <View style={styles.statItemDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statItemValue}>
            {formatNumber(course.stats.total_runs)}
          </Text>
          <Text style={styles.statItemLabel}>도전</Text>
        </View>
        <View style={styles.statItemDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statItemValue}>
            {formatNumber(course.stats.unique_runners)}
          </Text>
          <Text style={styles.statItemLabel}>러너</Text>
        </View>
        <View style={styles.statItemDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statItemValue, { color: colors.secondary }]}>
            {course.stats.avg_pace_seconds_per_km
              ? formatPace(course.stats.avg_pace_seconds_per_km)
              : '--'}
          </Text>
          <Text style={styles.statItemLabel}>평균 페이스</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const MyCourseCard = React.memo(function MyCourseCard({
  course,
  onPress,
}: {
  course: MyCourse;
  onPress: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.courseCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardTopRow}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {course.title}
        </Text>
        <View
          style={[
            styles.myCourseBadge,
            course.is_public ? styles.badgePublic : styles.badgePrivate,
          ]}
        >
          <Text
            style={[
              styles.myCourseBadgeText,
              course.is_public ? styles.badgePublicText : styles.badgePrivateText,
            ]}
          >
            {course.is_public ? '공개' : '비공개'}
          </Text>
        </View>
      </View>

      <Text style={styles.myCourseDate}>
        {formatDate(course.created_at)}
      </Text>

      <View style={styles.cardDistanceRow}>
        <Text style={styles.cardDistance}>
          {formatDistance(course.distance_meters)}
        </Text>
      </View>

      <View style={styles.cardStatsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statItemValue}>
            {formatNumber(course.stats.total_runs)}
          </Text>
          <Text style={styles.statItemLabel}>도전</Text>
        </View>
        <View style={styles.statItemDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statItemValue}>
            {formatNumber(course.stats.unique_runners)}
          </Text>
          <Text style={styles.statItemLabel}>러너</Text>
        </View>
        <View style={styles.statItemDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statItemValue, { color: colors.secondary }]}>
            {course.stats.avg_pace_seconds_per_km
              ? formatPace(course.stats.avg_pace_seconds_per_km)
              : '--'}
          </Text>
          <Text style={styles.statItemLabel}>평균 페이스</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const RecommendedCourseCard = React.memo(function RecommendedCourseCard({
  course,
  onPress,
}: {
  course: NearbyCourse;
  onPress: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.courseCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Thumbnail */}
      {course.thumbnail_url ? (
        <Image
          source={{ uri: course.thumbnail_url }}
          style={styles.recommendedThumbnail}
        />
      ) : null}
      <View style={styles.cardTopRow}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {course.title}
        </Text>
        {course.difficulty && (
          <DifficultyBadge difficulty={course.difficulty as DifficultyLevel} />
        )}
      </View>

      {/* Creator */}
      <Text style={styles.creatorText}>
        by {course.creator_nickname}
      </Text>

      {/* Distance */}
      <View style={styles.cardDistanceRow}>
        <Text style={styles.cardDistance}>
          {formatDistance(course.distance_meters)}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.cardStatsRow}>
        <View style={styles.statItem}>
          <View style={styles.statItemWithIcon}>
            <Ionicons name="thumbs-up-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.statItemValue}>
              {formatNumber(course.like_count ?? 0)}
            </Text>
          </View>
          <Text style={styles.statItemLabel}>좋아요</Text>
        </View>
        <View style={styles.statItemDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statItemValue}>
            {formatNumber(course.total_runs)}
          </Text>
          <Text style={styles.statItemLabel}>도전</Text>
        </View>
        <View style={styles.statItemDivider} />
        <View style={styles.statItem}>
          <View style={styles.statItemWithIcon}>
            <Ionicons name="navigate-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.statItemValue}>
              {formatDistance(course.distance_from_user_meters)}
            </Text>
          </View>
          <Text style={styles.statItemLabel}>내 위치에서</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ---- Styles ----

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.huge,
    paddingBottom: SPACING.lg,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: c.text,
    letterSpacing: -1,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.full,
    padding: 2,
  },
  tabBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.full,
  },
  tabBtnActive: {
    backgroundColor: c.card,
    ...SHADOWS.sm,
  },
  tabText: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: c.text,
    fontWeight: '700',
  },

  // -- Search Bar --
  searchContainer: {
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: c.text,
    padding: 0,
  },

  // -- Toolbar: sort chips + view toggle --
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.lg,
  },
  sortRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  sortChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  sortChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  sortChipText: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: c.white,
    fontWeight: '700',
  },

  // -- List --
  listContent: {
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
  },
  loadingFooter: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },

  courseCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: c.text,
    marginRight: SPACING.sm,
  },
  creatorText: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontWeight: '500',
  },
  cardDistanceRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'baseline',
  },
  cardDistance: {
    fontSize: 32,
    fontWeight: '900',
    color: c.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  cardElevation: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    fontWeight: '500',
  },
  cardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statItemWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statItemDivider: {
    width: 1,
    height: 24,
    backgroundColor: c.divider,
  },
  statItemValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  statItemLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // -- My Course Card extras --
  myCourseBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  badgePublic: {
    backgroundColor: c.success + '18',
  },
  badgePrivate: {
    backgroundColor: c.textTertiary + '18',
  },
  myCourseBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  badgePublicText: {
    color: c.success,
  },
  badgePrivateText: {
    color: c.textTertiary,
  },
  myCourseDate: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: c.textTertiary,
  },

  // -- Recommended card thumbnail --
  recommendedThumbnail: {
    height: 120,
    borderRadius: BORDER_RADIUS.md,
    resizeMode: 'cover',
  },
});
