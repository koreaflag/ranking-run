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
  ScrollView,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useCourseStore } from '../../stores/courseStore';
import EmptyState from '../../components/common/EmptyState';
import DifficultyBadge from '../../components/course/DifficultyBadge';
import CourseThumbnailMap from '../../components/course/CourseThumbnailMap';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { CourseStackParamList } from '../../types/navigation';
import type { CourseListItem } from '../../types/api';
import type { DifficultyLevel } from '../../utils/constants';
import { formatDistance, formatNumber } from '../../utils/format';
import {
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '../../utils/constants';

// ---- Navigation types ----

type SearchNav = NativeStackNavigationProp<CourseStackParamList, 'CourseSearch'>;
type SearchRoute = RouteProp<CourseStackParamList, 'CourseSearch'>;

// ---- Sort key type (no 'recommended' in search) ----

type SortKey = 'total_runs' | 'created_at' | 'distance_meters';

type SortOption = {
  labelKey: string;
  key: SortKey;
  orderBy: 'total_runs' | 'created_at' | 'distance_meters';
  order: 'asc' | 'desc';
};

const SORT_OPTIONS: SortOption[] = [
  { labelKey: 'course.sortPopular', key: 'total_runs', orderBy: 'total_runs', order: 'desc' },
  { labelKey: 'course.sortNewest', key: 'created_at', orderBy: 'created_at', order: 'desc' },
  { labelKey: 'course.sortDistance', key: 'distance_meters', orderBy: 'distance_meters', order: 'asc' },
];

// ---- Distance filter ----

type DistanceFilterKey = 'all' | '3k' | '5k' | '10k' | 'half';

interface DistanceFilterOption {
  key: DistanceFilterKey;
  labelKey: string;
  min?: number;
  max?: number;
}

const DISTANCE_FILTERS: DistanceFilterOption[] = [
  { key: 'all', labelKey: 'course.tabAll' },
  { key: '3k', labelKey: 'course.filter3k', max: 3000 },
  { key: '5k', labelKey: 'course.filter5k', min: 3000, max: 7000 },
  { key: '10k', labelKey: 'course.filter10k', min: 7000, max: 15000 },
  { key: 'half', labelKey: 'course.filterHalf', min: 15000 },
];

// ---- Helpers ----

function inferDifficulty(distanceMeters: number, elevationGain: number): DifficultyLevel {
  const km = distanceMeters / 1000;
  if (km >= 15 || elevationGain >= 300) return 'expert';
  if (km >= 7 || elevationGain >= 150) return 'hard';
  if (km >= 3) return 'normal';
  return 'easy';
}

// ---- Thumbnail size ----

const THUMBNAIL_SIZE = 72;

// ---- CourseRowCard ----

const CourseRowCard = React.memo(function CourseRowCard({
  course,
  onPress,
  colors,
  styles,
}: {
  course: CourseListItem;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const difficulty = inferDifficulty(course.distance_meters, course.elevation_gain_meters);

  return (
    <TouchableOpacity
      style={styles.rowCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Thumbnail */}
      {course.route_preview && course.route_preview.length >= 2 ? (
        <CourseThumbnailMap
          routePreview={course.route_preview}
          width={THUMBNAIL_SIZE}
          height={THUMBNAIL_SIZE}
          borderRadius={BORDER_RADIUS.sm}
        />
      ) : (
        <View style={[styles.rowThumbnail, styles.rowThumbnailPlaceholder]}>
          <Ionicons name="map-outline" size={28} color={colors.textTertiary} />
        </View>
      )}

      {/* Info */}
      <View style={styles.rowInfo}>
        {/* Title + difficulty badge */}
        <View style={styles.rowTitleRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {course.title}
          </Text>
          <DifficultyBadge difficulty={difficulty} />
        </View>

        {/* Distance + total runs */}
        <View style={styles.rowMetaRow}>
          <Text style={styles.rowDistance}>
            {formatDistance(course.distance_meters)}
          </Text>
          <Text style={styles.rowMetaDot}>{'\u00B7'}</Text>
          <Ionicons name="people-outline" size={13} color={colors.textTertiary} />
          <Text style={styles.rowRuns}>
            {formatNumber(course.stats.total_runs)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ---- Main Screen ----

export default function CourseSearchScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<SearchNav>();
  const route = useRoute<SearchRoute>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialSort = route.params?.initialSort;

  const [activeSortKey, setActiveSortKey] = useState<SortKey>(
    initialSort && SORT_OPTIONS.some((o) => o.key === initialSort)
      ? initialSort
      : 'total_runs',
  );
  const [activeDistanceFilter, setActiveDistanceFilter] = useState<DistanceFilterKey>('all');
  const [searchText, setSearchText] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const {
    courses,
    isLoading,
    isLoadingMore,
    hasNext,
    filters,
    fetchCourses,
    fetchMoreCourses,
    setFilters,
  } = useCourseStore();

  // Initial fetch on mount
  useEffect(() => {
    const sort = SORT_OPTIONS.find((o) => o.key === activeSortKey) ?? SORT_OPTIONS[0];
    const params = {
      order_by: sort.orderBy,
      order: sort.order,
    };
    setFilters(params);
    fetchCourses(params);
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus the search input only when navigating directly (not from "더보기")
  useEffect(() => {
    if (initialSort) return; // Skip auto-focus when entering from "See More"
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [initialSort]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleSortChange = useCallback(
    (option: SortOption) => {
      setActiveSortKey(option.key);
      const newFilters = {
        ...filters,
        order_by: option.orderBy,
        order: option.order,
      };
      setFilters(newFilters);
      fetchCourses(newFilters);
    },
    [filters, setFilters, fetchCourses],
  );

  const handleDistanceFilterChange = useCallback(
    (option: DistanceFilterOption) => {
      setActiveDistanceFilter(option.key);
      const distanceParams: { min_distance?: number; max_distance?: number } = {};
      if (option.min !== undefined) distanceParams.min_distance = option.min;
      if (option.max !== undefined) distanceParams.max_distance = option.max;

      // Remove old distance filters, apply new ones
      const { min_distance: _min, max_distance: _max, ...rest } = filters;
      const newFilters = { ...rest, ...distanceParams };
      setFilters(newFilters);
      fetchCourses(newFilters);
    },
    [filters, setFilters, fetchCourses],
  );

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchText(text);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = setTimeout(() => {
        const trimmed = text.trim();
        const searchParam = trimmed.length > 0 ? trimmed : undefined;
        const newFilters = { ...filters, search: searchParam };
        setFilters(newFilters);
        fetchCourses(newFilters);
      }, 400);
    },
    [filters, setFilters, fetchCourses],
  );

  const handleClearSearch = useCallback(() => {
    setSearchText('');
    const { search: _, ...rest } = filters;
    setFilters(rest);
    fetchCourses(rest);
    searchInputRef.current?.focus();
  }, [filters, setFilters, fetchCourses]);

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

  const handleRefresh = useCallback(() => {
    fetchCourses(filters);
  }, [filters, fetchCourses]);

  const renderItem = useCallback(
    ({ item }: { item: CourseListItem }) => (
      <CourseRowCard
        course={item}
        onPress={() => handleCoursePress(item.id)}
        colors={colors}
        styles={styles}
      />
    ),
    [handleCoursePress, colors, styles],
  );

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }, [isLoadingMore, styles, colors]);

  const keyExtractor = useCallback((item: CourseListItem) => item.id, []);

  const activeSort = SORT_OPTIONS.find((o) => o.key === activeSortKey) ?? SORT_OPTIONS[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header: back button + search bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleGoBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={t('course.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={searchText}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Distance filter chips */}
      <View style={styles.distanceFilterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.distanceFilterContent}
        >
          {DISTANCE_FILTERS.map((option) => {
            const isActive = activeDistanceFilter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.distanceChip,
                  isActive && styles.distanceChipActive,
                ]}
                onPress={() => handleDistanceFilterChange(option)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.distanceChipText,
                    isActive && styles.distanceChipTextActive,
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Sort chips */}
      <View style={styles.sortContainer}>
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
                  {t(option.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : courses.length === 0 ? (
        <EmptyState
          ionicon="search-outline"
          title={t('course.emptyAll')}
          description={t('course.emptyAllMsg')}
        />
      ) : (
        <FlatList
          data={courses}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
          onRefresh={handleRefresh}
          refreshing={isLoading}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </SafeAreaView>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },

    // -- Header --
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      gap: SPACING.sm,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchBar: {
      flex: 1,
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

    // -- Distance filter chips --
    distanceFilterContainer: {
      paddingBottom: SPACING.sm,
    },
    distanceFilterContent: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.sm,
    },
    distanceChip: {
      paddingVertical: SPACING.xs + 2,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.surface,
    },
    distanceChipActive: {
      backgroundColor: c.primary + '14',
      borderColor: c.primary,
    },
    distanceChipText: {
      fontSize: FONT_SIZES.xs,
      color: c.textSecondary,
      fontWeight: '600',
    },
    distanceChipTextActive: {
      color: c.primary,
      fontWeight: '700',
    },

    // -- Sort chips --
    sortContainer: {
      flexDirection: 'row',
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
      gap: SPACING.sm,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingFooter: {
      paddingVertical: SPACING.xl,
      alignItems: 'center',
    },

    // -- CourseRowCard --
    rowCard: {
      flexDirection: 'row',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
      ...SHADOWS.sm,
    },
    rowThumbnail: {
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      borderRadius: BORDER_RADIUS.sm,
    },
    rowThumbnailPlaceholder: {
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowInfo: {
      flex: 1,
      justifyContent: 'center',
      gap: SPACING.xs,
    },
    rowTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    rowTitle: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    rowMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    rowDistance: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    rowMetaDot: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
    },
    rowRuns: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
  });
