import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCourseStore } from '../../stores/courseStore';
import EmptyState from '../../components/common/EmptyState';
import DifficultyBadge from '../../components/course/DifficultyBadge';
import CourseThumbnailMap from '../../components/course/CourseThumbnailMap';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { CourseStackParamList } from '../../types/navigation';
import type { CourseListItem, NearbyCourse } from '../../types/api';
import { formatDistance, formatNumber } from '../../utils/format';
import {
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  type DifficultyLevel,
} from '../../utils/constants';

// ---- Types ----

type CourseNav = NativeStackNavigationProp<CourseStackParamList, 'CourseList'>;

// ---- Constants ----

const NEARBY_CARD_WIDTH = 160;
const NEARBY_THUMB_HEIGHT = 100;
const ROW_THUMB_SIZE = 72;
const PREVIEW_LIMIT = 3;

const DIFFICULTY_ACCENT_COLORS: Record<DifficultyLevel, string> = {
  easy: '#34C759',
  normal: '#007AFF',
  hard: '#FF9500',
  expert: '#FF3B30',
  legend: '#A78BFA',
};

const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.978;

// ---- Utilities ----

function inferDifficulty(distanceMeters: number, elevationGain: number): DifficultyLevel {
  const km = distanceMeters / 1000;
  if (km >= 15 || elevationGain >= 300) return 'expert';
  if (km >= 7 || elevationGain >= 150) return 'hard';
  if (km >= 3) return 'normal';
  return 'easy';
}

// ---- Main Screen ----

export default function CourseListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<CourseNav>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [userLat, setUserLat] = useState(DEFAULT_LAT);
  const [userLng, setUserLng] = useState(DEFAULT_LNG);

  const {
    nearbyCourses,
    popularCourses,
    newCourses,
    fetchNearbyCourses,
    fetchPopularCourses,
    fetchNewCourses,
  } = useCourseStore();

  const loadLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLat(loc.coords.latitude);
        setUserLng(loc.coords.longitude);
        fetchNearbyCourses(loc.coords.latitude, loc.coords.longitude);
      } else {
        fetchNearbyCourses(DEFAULT_LAT, DEFAULT_LNG);
      }
    } catch {
      fetchNearbyCourses(DEFAULT_LAT, DEFAULT_LNG);
    } finally {
      setLocationReady(true);
    }
  }, [fetchNearbyCourses]);

  useEffect(() => {
    fetchPopularCourses();
    fetchNewCourses();
    loadLocation();
  }, [fetchPopularCourses, fetchNewCourses, loadLocation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchPopularCourses(),
      fetchNewCourses(),
      fetchNearbyCourses(userLat, userLng),
    ]);
    setRefreshing(false);
  }, [fetchPopularCourses, fetchNewCourses, fetchNearbyCourses, userLat, userLng]);

  const handleCoursePress = useCallback(
    (courseId: string) => {
      navigation.navigate('CourseDetail', { courseId });
    },
    [navigation],
  );

  const allEmpty =
    locationReady &&
    nearbyCourses.length === 0 &&
    popularCourses.length === 0 &&
    newCourses.length === 0;

  if (allEmpty) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('course.discover')}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('CourseSearch')}
            style={styles.searchBtn}
          >
            <Ionicons name="search" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <EmptyState
          ionicon="walk-outline"
          title={t('course.emptyAll')}
          description={t('course.emptyAllMsg')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('course.discover')}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('CourseSearch')}
            style={styles.searchBtn}
          >
            <Ionicons name="search" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Section 1: Nearby */}
        <View style={styles.section}>
          <SectionHeader title={t('course.nearbySection')} ionicon="location" iconColor="#FF3B30" />
          {nearbyCourses.length === 0 ? (
            <View style={styles.nearbyEmptyContainer}>
              <Text style={styles.nearbyEmptyText}>{t('course.nearbyEmpty')}</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.nearbyScrollContent}
            >
              {nearbyCourses.map((course) => (
                <NearbyCard
                  key={course.id}
                  course={course}

                  onPress={() => handleCoursePress(course.id)}
                />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Section 2: Popular */}
        {popularCourses.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title={t('course.popularSection')}
              ionicon="flame"
              iconColor="#FF9500"
              onMore={() =>
                navigation.navigate('CourseSearch', { initialSort: 'total_runs' })
              }
            />
            <View style={styles.verticalList}>
              {popularCourses.slice(0, PREVIEW_LIMIT).map((course) => (
                <CourseRowCard
                  key={course.id}
                  course={course}

                  onPress={() => handleCoursePress(course.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Section 3: New */}
        {newCourses.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title={t('course.newSection')}
              ionicon="sparkles"
              iconColor="#34C759"
              onMore={() =>
                navigation.navigate('CourseSearch', { initialSort: 'created_at' })
              }
            />
            <View style={styles.verticalList}>
              {newCourses.slice(0, PREVIEW_LIMIT).map((course) => (
                <CourseRowCard
                  key={course.id}
                  course={course}

                  onPress={() => handleCoursePress(course.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Section Header ----

function SectionHeader({
  title,
  ionicon,
  iconColor,
  onMore,
}: {
  title: string;
  ionicon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onMore?: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {ionicon && (
          <View style={[styles.sectionIconBadge, { backgroundColor: (iconColor ?? colors.primary) + '18' }]}>
            <Ionicons name={ionicon} size={14} color={iconColor ?? colors.primary} />
          </View>
        )}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onMore && (
        <TouchableOpacity
          onPress={onMore}
          style={styles.seeMoreHeaderBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.seeMoreHeaderText}>{t('course.seeMore')}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---- Nearby Card (Horizontal Scroll) ----

const NearbyCard = React.memo(function NearbyCard({
  course,
  onPress,
}: {
  course: NearbyCourse;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const difficulty = (course.difficulty as DifficultyLevel) || inferDifficulty(course.distance_meters, 0);
  const accentColor = DIFFICULTY_ACCENT_COLORS[difficulty];

  return (
    <TouchableOpacity
      style={styles.nearbyCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Thumbnail */}
      <View style={styles.nearbyThumbContainer}>
        {course.route_preview && course.route_preview.length >= 2 ? (
          <CourseThumbnailMap
            routePreview={course.route_preview}
            width={NEARBY_CARD_WIDTH}
            height={NEARBY_THUMB_HEIGHT}
            borderRadius={0}
          />
        ) : (
          <View style={[styles.nearbyThumb, styles.nearbyThumbPlaceholder]}>
            <Ionicons name="map-outline" size={28} color={colors.textTertiary} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.nearbyInfo}>
        <Text style={styles.nearbyTitle} numberOfLines={1}>
          {course.title}
        </Text>
        <View style={styles.nearbyMetaRow}>
          <Text style={styles.nearbyDistance}>
            {formatDistance(course.distance_meters)}
          </Text>
          <View style={[styles.difficultyDot, { backgroundColor: accentColor }]} />
        </View>
        <Text style={styles.nearbyFromUser}>
          {t('course.nearbyDistance', {
            distance: formatDistance(course.distance_from_user_meters),
          })}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ---- Course Row Card (Vertical List) ----

const CourseRowCard = React.memo(function CourseRowCard({
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
      style={styles.rowCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Thumbnail */}
      {course.route_preview && course.route_preview.length >= 2 ? (
        <CourseThumbnailMap
          routePreview={course.route_preview}
          width={ROW_THUMB_SIZE}
          height={ROW_THUMB_SIZE}
          borderRadius={BORDER_RADIUS.sm}
        />
      ) : (
        <View style={[styles.rowThumb, styles.rowThumbPlaceholder]}>
          <Ionicons name="map-outline" size={24} color={colors.textTertiary} />
        </View>
      )}

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {course.title}
          </Text>
          <DifficultyBadge difficulty={difficulty} />
        </View>
        <View style={styles.rowBottomLine}>
          <Text style={styles.rowMeta}>
            {formatDistance(course.distance_meters)}
          </Text>
          <Text style={styles.rowMetaDivider}>{'·'}</Text>
          <Ionicons
            name="people-outline"
            size={12}
            color={colors.textTertiary}
          />
          <Text style={styles.rowMeta}>
            {formatNumber(course.stats.total_runs)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    scrollContent: {
      flexGrow: 1,
    },

    // -- Header --
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    headerTitle: {
      fontSize: 34,
      fontWeight: '900',
      color: c.text,
      letterSpacing: -1,
    },
    searchBtn: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // -- Section --
    section: {
      marginTop: SPACING.xl,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      marginBottom: SPACING.md,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    sectionIconBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    seeMoreHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    seeMoreHeaderText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // -- Nearby horizontal scroll --
    nearbyScrollContent: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.md,
    },
    nearbyEmptyContainer: {
      paddingHorizontal: SPACING.xxl,
      paddingVertical: SPACING.xl,
    },
    nearbyEmptyText: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      fontWeight: '500',
    },

    // -- Nearby Card --
    nearbyCard: {
      width: NEARBY_CARD_WIDTH,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
      ...SHADOWS.sm,
    },
    nearbyThumbContainer: {
      position: 'relative',
    },
    nearbyThumb: {
      width: NEARBY_CARD_WIDTH,
      height: NEARBY_THUMB_HEIGHT,
      resizeMode: 'cover',
    },
    nearbyThumbPlaceholder: {
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    nearbyThumbOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 36,
      backgroundColor: 'rgba(0, 0, 0, 0.15)',
    },
    nearbyInfo: {
      padding: SPACING.sm,
      paddingTop: SPACING.sm + 2,
      gap: 3,
    },
    nearbyTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
    },
    nearbyMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    nearbyDistance: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    difficultyDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    nearbyFromUser: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // -- Vertical list --
    verticalList: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.sm,
    },

    // -- Row Card --
    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
      ...SHADOWS.sm,
    },
    rowThumb: {
      width: ROW_THUMB_SIZE,
      height: ROW_THUMB_SIZE,
      borderRadius: BORDER_RADIUS.sm,
      resizeMode: 'cover',
    },
    rowThumbPlaceholder: {
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowContent: {
      flex: 1,
      justifyContent: 'center',
      gap: SPACING.xs,
    },
    rowTopLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    rowTitle: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    rowBottomLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    rowMeta: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    rowMetaDivider: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      marginHorizontal: 2,
    },

    // -- See More Button --
    seeMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.md,
      marginHorizontal: SPACING.xxl,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.surface,
      gap: 4,
    },
    seeMoreText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
    },

    // -- Bottom padding --
    bottomPadding: {
      height: SPACING.xxxl + SPACING.xl,
    },
  });
