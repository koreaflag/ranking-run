import React, { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput,
  Switch,
  Image,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCourseListStore } from '../../stores/courseListStore';
import { useCourseDetailStore } from '../../stores/courseDetailStore';
import { useRunningStore } from '../../stores/runningStore';
import StatItem from '../../components/common/StatItem';
import ScreenHeader from '../../components/common/ScreenHeader';
import RouteMapView from '../../components/map/RouteMapView';
import CourseCommentSection from '../../components/course/CourseCommentSection';
import DifficultyBadge from '../../components/course/DifficultyBadge';
import RunnerLevelBadge from '../../components/runner/RunnerLevelBadge';
import ElevationProfileChart from '../../components/charts/ElevationProfileChart';
import PodiumView from '../../components/ranking/PodiumView';
import FilterChipBar, { type FilterGroup } from '../../components/ranking/FilterChipBar';
import GpsVerifiedBadge from '../../components/ranking/GpsVerifiedBadge';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import type { CourseStackParamList } from '../../types/navigation';
import type { RankingEntry, RankingFilterParams, CourseCheckpoint, CrewCourseRankingEntry } from '../../types/api';
import { crewChallengeService } from '../../services/crewChallengeService';
import type { CheckpointMarkerData } from '../../components/map/RouteMapView';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatNumber,
  formatDate,
} from '../../utils/format';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS, inferDifficulty, type DifficultyLevel } from '../../utils/constants';
import { courseService } from '../../services/courseService';
import { useAuthStore } from '../../stores/authStore';
import CourseDetailSkeleton from '../../components/skeleton/CourseDetailSkeleton';

type DetailRoute = RouteProp<CourseStackParamList, 'CourseDetail'>;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const COURSE_START_MAX_DISTANCE_KM = 5;

export default function CourseDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<CourseStackParamList>>();
  const route = useRoute<DetailRoute>();
  const { courseId, openReview } = route.params;
  const scrollViewRef = useRef<ScrollView>(null);
  const lastScrollY = useRef(0);
  const bottomCtaTranslateY = useRef(new Animated.Value(0)).current;
  const bottomCtaVisible = useRef(true);

  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useAuthStore((s) => s.user);

  const selectedCourse = useCourseDetailStore(s => s.selectedCourse);
  const selectedCourseStats = useCourseDetailStore(s => s.selectedCourseStats);
  const selectedCourseRankings = useCourseDetailStore(s => s.selectedCourseRankings);
  const selectedCourseCrewRankings = useCourseDetailStore(s => s.selectedCourseCrewRankings);
  const selectedCourseMyCrewRankings = useCourseDetailStore(s => s.selectedCourseMyCrewRankings);
  const selectedCourseMyBest = useCourseDetailStore(s => s.selectedCourseMyBest);
  const isLoadingDetail = useCourseDetailStore(s => s.isLoadingDetail);
  const error = useCourseDetailStore(s => s.error);
  const fetchCourseDetail = useCourseDetailStore(s => s.fetchCourseDetail);
  const clearDetail = useCourseDetailStore(s => s.clearDetail);
  const favoriteIds = useCourseListStore(s => s.favoriteIds);
  const toggleFavorite = useCourseListStore(s => s.toggleFavorite);
  const fetchFavoriteCourses = useCourseListStore(s => s.fetchFavoriteCourses);
  const selectedCourseLikeCount = useCourseDetailStore(s => s.selectedCourseLikeCount);
  const selectedCourseIsLiked = useCourseDetailStore(s => s.selectedCourseIsLiked);
  const toggleLike = useCourseDetailStore(s => s.toggleLike);
  const deleteMyCourse = useCourseListStore(s => s.deleteMyCourse);
  const fetchRankingsWithFilters = useCourseDetailStore(s => s.fetchRankingsWithFilters);
  const rankingFilters = useCourseDetailStore(s => s.rankingFilters);
  const rankingTotalRunners = useCourseDetailStore(s => s.rankingTotalRunners);
  const courseDominion = useCourseDetailStore(s => s.selectedCourseDominion);

  // Ranking tab state: 'individual' or 'crew'
  const [rankingTab, setRankingTab] = useState<'individual' | 'crew'>('individual');

  // Filter handler: merges new filter key into existing filters
  const handleFilterChange = useCallback((key: keyof RankingFilterParams, value: string | null) => {
    const next = { ...rankingFilters, [key]: value ?? undefined };
    // Clear undefined keys
    Object.keys(next).forEach((k) => {
      if (next[k as keyof RankingFilterParams] === undefined) {
        delete next[k as keyof RankingFilterParams];
      }
    });
    fetchRankingsWithFilters(courseId, next);
  }, [rankingFilters, courseId, fetchRankingsWithFilters]);

  // Build filter groups for FilterChipBar
  const filterGroups: FilterGroup[] = useMemo(() => [
    {
      key: 'scope',
      chips: [
        { label: t('ranking.allTime'), value: null },
        { label: t('ranking.season'), value: 'season' },
      ],
      selected: rankingFilters.scope === 'season' ? 'season' : null,
      onSelect: (v) => handleFilterChange('scope', v === 'season' ? 'season' : null),
    },
    {
      key: 'gender',
      chips: [
        { label: t('ranking.allGenders'), value: null },
        { label: t('ranking.male'), value: 'male' },
        { label: t('ranking.female'), value: 'female' },
      ],
      selected: rankingFilters.gender ?? null,
      onSelect: (v) => handleFilterChange('gender', v),
    },
    {
      key: 'country',
      chips: [
        { label: t('ranking.allCountries'), value: null },
        { label: '🇰🇷 ' + t('ranking.southKorea'), value: 'KR' },
        { label: '🇯🇵 ' + t('ranking.japan'), value: 'JP' },
        { label: '🇺🇸 ' + t('ranking.usa'), value: 'US' },
      ],
      selected: rankingFilters.country ?? null,
      onSelect: (v) => handleFilterChange('country', v),
    },
  ], [t, rankingFilters, handleFilterChange]);

  // Top 3 entries for podium
  const podiumEntries = useMemo(
    () => selectedCourseRankings.slice(0, 3),
    [selectedCourseRankings],
  );

  // Remaining entries (after top 3)
  const remainingRankings = useMemo(
    () => selectedCourseRankings.slice(3),
    [selectedCourseRankings],
  );

  const pendingSelectForRaid = useCourseListStore((s) => s.pendingSelectForRaid);
  const [isStartingRaid, setIsStartingRaid] = useState(false);

  const isFavorited = useMemo(() => favoriteIds.includes(courseId), [favoriteIds, courseId]);

  // Distance to course start point (km). null = still loading.
  const [distanceToStart, setDistanceToStart] = useState<number | null>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(true);
  const [editCourseType, setEditCourseType] = useState<'normal' | 'loop'>('normal');
  const [editLapCount, setEditLapCount] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = useCallback(() => {
    if (!selectedCourse) return;
    setEditTitle(selectedCourse.title);
    setEditDescription(selectedCourse.description ?? '');
    setEditPublic(selectedCourse.is_public);
    setEditCourseType((selectedCourse as any).course_type === 'loop' ? 'loop' : 'normal');
    setEditLapCount((selectedCourse as any).lap_count ?? 1);
    setShowEditModal(true);
  }, [selectedCourse]);

  const BOTTOM_CTA_HEIGHT = 200; // approximate height of bottomCta (generous to ensure full hide)
  const handleScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;

    // Scrolling down & past initial area → hide
    if (dy > 8 && y > 100 && bottomCtaVisible.current) {
      bottomCtaVisible.current = false;
      Animated.timing(bottomCtaTranslateY, {
        toValue: BOTTOM_CTA_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
    // Scrolling up → show
    else if (dy < -8 && !bottomCtaVisible.current) {
      bottomCtaVisible.current = true;
      Animated.timing(bottomCtaTranslateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [bottomCtaTranslateY]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedCourse || editTitle.trim().length < 1) {
      Alert.alert(t('course.detail.titleCheck'), t('course.detail.enterTitle'));
      return;
    }
    setIsSaving(true);
    try {
      const isLoopCourse = (selectedCourse as any).course_type === 'loop';
      await courseService.updateCourse(selectedCourse.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        is_public: editPublic,
        ...(isLoopCourse ? {
          course_type: editCourseType,
          lap_count: editCourseType === 'loop' ? editLapCount : undefined,
        } : {}),
      });
      setShowEditModal(false);
      fetchCourseDetail(courseId);
    } catch {
      Alert.alert(t('common.error'), t('common.errorRetry'));
    } finally {
      setIsSaving(false);
    }
  }, [selectedCourse, editTitle, editDescription, editPublic, editCourseType, editLapCount, courseId, fetchCourseDetail, t]);

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

  // Measure distance from user to course start point
  useEffect(() => {
    if (!selectedCourse?.route_geometry?.coordinates?.length) return;
    const [startLng, startLat] = selectedCourse.route_geometry.coordinates[0];
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const dist = haversineKm(loc.coords.latitude, loc.coords.longitude, startLat, startLng);
        setDistanceToStart(dist);
      } catch {
        // Location unavailable — leave as null (button stays enabled)
      }
    })();

    return () => { cancelled = true; };
  }, [selectedCourse?.route_geometry]);

  const isWithinRange = distanceToStart === null || distanceToStart <= COURSE_START_MAX_DISTANCE_KM;

  // Convert course checkpoints to map marker data (must be before early returns)
  const checkpointMarkers: CheckpointMarkerData[] = useMemo(() => {
    if (!selectedCourse) return [];
    const cps = (selectedCourse as any).checkpoints as CourseCheckpoint[] | null | undefined;
    if (!cps || cps.length === 0) return [];
    return cps.map((cp) => ({
      id: cp.id,
      order: cp.order,
      lat: cp.lat,
      lng: cp.lng,
    }));
  }, [selectedCourse]);

  // Convert GeoJSON coordinates to route points for map display (must be before early returns)
  const routePoints = useMemo(() =>
    selectedCourse?.route_geometry?.coordinates?.map(
      ([lng, lat]: [number, number, number]) => ({
        latitude: lat,
        longitude: lng,
      }),
    ) ?? [],
    [selectedCourse?.route_geometry],
  );

  const handleRunThisCourse = useCallback(() => {
    // Block during an active run
    const { phase } = useRunningStore.getState();
    if (phase === 'running' || phase === 'paused' || phase === 'countdown') {
      Alert.alert(
        t('common.notification'),
        t('course.detail.cannotViewDuringRun'),
      );
      return;
    }
    // Set pending course so WorldScreen focuses on it with 3D preview
    useCourseListStore.getState().setPendingFocusCourseId(courseId);
    // navigate() automatically traverses up the hierarchy:
    // CourseStack (no 'WorldTab') → Tab navigator (has 'WorldTab') → switches tab
    (navigation as any).navigate('WorldTab', { screen: 'World' });
  }, [courseId, navigation, t]);

  const handleDeleteCourse = useCallback(() => {
    Alert.alert(
      t('course.detail.deleteTitle'),
      t('course.detail.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMyCourse(courseId);
              navigation.goBack();
            } catch (err) {
              const msg = err instanceof Error ? err.message : t('review.unknownError');
              Alert.alert(t('common.error'), `${msg}`);
            }
          },
        },
      ],
    );
  }, [courseId, deleteMyCourse, navigation, t]);

  const handleNavigateToCrewDetail = useCallback((crewId: string) => {
    navigation.navigate('CrewDetail', { crewId });
  }, [navigation]);

  const handleStartRaid = useCallback(async () => {
    if (!pendingSelectForRaid || isStartingRaid) return;
    setIsStartingRaid(true);
    try {
      const crewId = pendingSelectForRaid;
      await crewChallengeService.createChallenge(crewId, courseId);
      useCourseListStore.getState().setPendingSelectForRaid(null);
      Alert.alert(t('raid.raidStarted'), t('raid.raidStartedDesc'));
      // Navigate back to CrewDetail in HomeTab
      (navigation as any).navigate('HomeTab', { screen: 'CrewDetail', params: { crewId } });
    } catch {
      Alert.alert(t('common.errorTitle'), t('common.error'));
    } finally {
      setIsStartingRaid(false);
    }
  }, [pendingSelectForRaid, isStartingRaid, courseId, navigation, t]);

  if (isLoadingDetail) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <CourseDetailSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!selectedCourse) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            {error || t('course.detail.loadError')}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchCourseDetail(courseId)}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const course = selectedCourse;
  const stats = selectedCourseStats;

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
        keyboardDismissMode="interactive"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Large map at top */}
        <View style={styles.mapWrapper}>
          <RouteMapView routePoints={routePoints} checkpoints={checkpointMarkers} style={styles.mapPreview} />
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
            <View style={styles.ownerActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleOpenEdit}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil" size={14} color={colors.primary} />
                <Text style={styles.editButtonText}>{t('common.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDeleteCourse}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={14} color={colors.error} />
                <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Dashboard stats: clean grid, black values, gray labels */}
        <View style={styles.dashboardCard}>
          <View style={styles.dashboardGrid}>
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardValue}>
                {formatDistance(course.distance_meters)}
              </Text>
              <Text style={styles.dashboardLabel}>{t('course.detail.distance')}</Text>
            </View>
            <View style={styles.dashboardDivider} />
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardValue}>
                {formatDuration(course.estimated_duration_seconds)}
              </Text>
              <Text style={styles.dashboardLabel}>{t('course.detail.estimatedTime')}</Text>
            </View>
            <View style={styles.dashboardDivider} />
            <View style={styles.dashboardCell}>
              <Text style={styles.dashboardValue}>
                {Math.round(course.elevation_gain_meters)}m
              </Text>
              <Text style={styles.dashboardLabel}>{t('course.detail.elevationGain')}</Text>
            </View>
          </View>
        </View>

        {/* Elevation Profile Chart */}
        {course.elevation_profile && course.elevation_profile.length > 2 && (
          <View style={styles.statsCard}>
            <Text style={styles.sectionTitle}>{t('course.detail.elevationProfile')}</Text>
            <ElevationProfileChart
              elevationProfile={course.elevation_profile}
              width={Dimensions.get('window').width - 32}
              height={120}
            />
          </View>
        )}

        {/* Course Stats */}
        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.sectionTitle}>{t('course.detail.stats')}</Text>
            <View style={styles.statsRowList}>
              <View style={styles.statsRowItem}>
                <Text style={styles.statsRowLabel}>{t('course.detail.totalRuns')}</Text>
                <Text style={styles.statsRowValue}>{formatNumber(stats.total_runs)}회</Text>
              </View>
              <View style={styles.statsRowItem}>
                <Text style={styles.statsRowLabel}>{t('course.detail.runners')}</Text>
                <Text style={styles.statsRowValue}>{formatNumber(stats.unique_runners)}명</Text>
              </View>
              <View style={styles.statsRowItem}>
                <Text style={styles.statsRowLabel}>{t('course.detail.completionRate')}</Text>
                <Text style={styles.statsRowValue}>{Math.round(stats.completion_rate * 100)}%</Text>
              </View>
              <View style={styles.statsRowItem}>
                <Text style={styles.statsRowLabel}>{t('course.detail.avgPace')}</Text>
                <Text style={styles.statsRowValue}>{formatPace(stats.avg_pace_seconds_per_km)}</Text>
              </View>
              <View style={styles.statsRowItem}>
                <Text style={styles.statsRowLabel}>{t('course.detail.bestPace')}</Text>
                <Text style={[styles.statsRowValue, { color: colors.primary }]}>{formatPace(stats.best_pace_seconds_per_km)}</Text>
              </View>
              <View style={styles.statsRowItem}>
                <Text style={styles.statsRowLabel}>{t('course.detail.avgTime')}</Text>
                <Text style={styles.statsRowValue}>{formatDuration(stats.avg_duration_seconds)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* My Best Record */}
        {selectedCourseMyBest && (
          <View style={styles.myBestCard}>
            <View style={styles.myBestHeader}>
              <Text style={styles.sectionTitle}>{t('course.detail.myBest')}</Text>
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
                <Text style={styles.dashboardLabel}>{t('running.metrics.time')}</Text>
              </View>
              <View style={styles.dashboardDivider} />
              <View style={styles.dashboardCell}>
                <Text style={styles.dashboardValue}>
                  {formatPace(
                    selectedCourseMyBest.avg_pace_seconds_per_km,
                  )}
                </Text>
                <Text style={styles.dashboardLabel}>{t('running.metrics.pace')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Course Dominion Banner */}
        {courseDominion && (
          <TouchableOpacity
            style={[styles.dominionBanner, { borderColor: (courseDominion.crew_badge_color || colors.primary) + '44' }]}
            onPress={() => navigation.navigate('CrewDetail', { crewId: courseDominion.crew_id })}
            activeOpacity={0.7}
          >
            {courseDominion.crew_logo_url ? (
              <Image
                source={{ uri: courseDominion.crew_logo_url }}
                style={[styles.dominionLogo, { borderColor: courseDominion.crew_badge_color || colors.primary }]}
              />
            ) : (
              <View style={[styles.dominionIcon, { backgroundColor: (courseDominion.crew_badge_color || colors.primary) + '20' }]}>
                <Ionicons name="shield" size={20} color={courseDominion.crew_badge_color || colors.primary} />
              </View>
            )}
            <View style={styles.dominionInfo}>
              <Text style={styles.dominionLabel}>{t('dominion.dominatedBy')}</Text>
              <Text style={[styles.dominionCrewName, { color: courseDominion.crew_badge_color || colors.primary }]}>
                {courseDominion.crew_name}
              </Text>
              <Text style={styles.dominionAvgTime}>
                {t('dominion.avgTime')}: {formatDuration(courseDominion.avg_duration_seconds)}
              </Text>
            </View>
            <View style={styles.dominionMembers}>
              {courseDominion.top_members.slice(0, 3).map((m, i) => (
                m.avatar_url ? (
                  <Image
                    key={m.user_id}
                    source={{ uri: m.avatar_url }}
                    style={[styles.dominionAvatar, i > 0 && { marginLeft: -8 }]}
                  />
                ) : (
                  <View key={m.user_id} style={[styles.dominionAvatarPlaceholder, i > 0 && { marginLeft: -8 }]}>
                    <Ionicons name="person" size={10} color={colors.textTertiary} />
                  </View>
                )
              ))}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        {/* Leaderboard with Individual / Crew tabs */}
        <View style={styles.rankingSection}>
          <View style={styles.rankingHeader}>
            <Text style={styles.sectionTitle}>{t('course.detail.leaderboard')}</Text>
            <Text style={styles.rankingCount}>
              {rankingTab === 'individual'
                ? `${rankingTotalRunners} ${t('ranking.runners')}`
                : `${selectedCourseCrewRankings.length} ${t('ranking.crew')}`}
            </Text>
          </View>

          {/* Tab Selector */}
          <View style={styles.rankingTabRow}>
            <TouchableOpacity
              style={[styles.rankingTabBtn, rankingTab === 'individual' && styles.rankingTabBtnActive]}
              onPress={() => setRankingTab('individual')}
              activeOpacity={0.7}
            >
              <Text style={[styles.rankingTabText, rankingTab === 'individual' && styles.rankingTabTextActive]}>
                {t('ranking.individual')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rankingTabBtn, rankingTab === 'crew' && styles.rankingTabBtnActive]}
              onPress={() => setRankingTab('crew')}
              activeOpacity={0.7}
            >
              <Text style={[styles.rankingTabText, rankingTab === 'crew' && styles.rankingTabTextActive]}>
                {t('ranking.crew')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filter Chips (individual tab only) */}
          {rankingTab === 'individual' && (
            <FilterChipBar groups={filterGroups} />
          )}

          {/* Individual Rankings */}
          {rankingTab === 'individual' && (
            selectedCourseRankings.length > 0 ? (
              <>
                {/* Top 3 Podium */}
                {podiumEntries.length > 0 && (
                  <PodiumView
                    entries={podiumEntries}
                    onUserPress={(userId) => navigation.navigate('UserProfile', { userId })}
                  />
                )}

                {/* Remaining rankings */}
                {remainingRankings.map((entry: RankingEntry) => (
                  <RankingRow
                    key={`${entry.rank}-${entry.user.id}`}
                    entry={entry}
                    isMe={entry.user.id === currentUser?.id}
                  />
                ))}
              </>
            ) : (
              <View style={styles.groupRankEmpty}>
                <Ionicons name="trophy-outline" size={32} color={colors.textTertiary} />
                <Text style={styles.groupRankEmptyText}>{t('course.detail.noRankings')}</Text>
              </View>
            )
          )}

          {/* Crew Rankings */}
          {rankingTab === 'crew' && (
            <>
              {selectedCourseCrewRankings.length === 0 && selectedCourseMyCrewRankings.length === 0 ? (
                <View style={styles.groupRankEmpty}>
                  <Ionicons name="people-outline" size={32} color={colors.textTertiary} />
                  <Text style={styles.groupRankEmptyText}>{t('ranking.noCrewRankings')}</Text>
                </View>
              ) : (
                <>
                  {selectedCourseMyCrewRankings.map((entry) => (
                    <CrewRankingRow
                      key={`my-${entry.crew_id}`}
                      entry={entry}
                      isMyCrew
                      onPress={() => handleNavigateToCrewDetail(entry.crew_id)}
                    />
                  ))}
                  {selectedCourseCrewRankings.map((entry) => (
                    <CrewRankingRow
                      key={entry.crew_id}
                      entry={entry}
                      isMyCrew={false}
                      onPress={() => handleNavigateToCrewDetail(entry.crew_id)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </View>

        {/* Comments */}
        <CourseCommentSection courseId={courseId} scrollViewRef={scrollViewRef} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Edit Modal */}
      <Modal visible={showEditModal} animationType="slide">
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)} activeOpacity={0.7}>
              <Text style={styles.modalCancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('course.detail.editTitle')}</Text>
            <TouchableOpacity onPress={handleSaveEdit} disabled={isSaving} activeOpacity={0.7}>
              <Text style={[styles.modalSave, isSaving && { opacity: 0.4 }]}>
                {isSaving ? t('common.saving') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>{t('course.detail.fieldTitle')}</Text>
            <TextInput
              style={styles.fieldInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t('course.detail.fieldTitlePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              maxLength={50}
            />

            <Text style={styles.fieldLabel}>{t('course.detail.fieldDescription')}</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextArea]}
              value={editDescription}
              onChangeText={(v) => v.length <= 200 && setEditDescription(v)}
              placeholder={t('course.detail.fieldDescPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={200}
            />
            <Text style={styles.charCount}>{editDescription.length}/200</Text>

            {(selectedCourse as any)?.course_type === 'loop' && (
              <>
                <Text style={styles.fieldLabel}>{t('course.detail.courseType')}</Text>
                <View style={styles.courseTypeRow}>
                  <TouchableOpacity
                    style={[styles.courseTypeBtn, editCourseType === 'normal' && styles.courseTypeBtnActive]}
                    onPress={() => setEditCourseType('normal')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.courseTypeBtnText, editCourseType === 'normal' && styles.courseTypeBtnTextActive]}>{t('course.detail.oneWay')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.courseTypeBtn, editCourseType === 'loop' && styles.courseTypeBtnActive]}
                    onPress={() => setEditCourseType('loop')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.courseTypeBtnText, editCourseType === 'loop' && styles.courseTypeBtnTextActive]}>{t('course.detail.roundTrip')}</Text>
                  </TouchableOpacity>
                </View>

                {editCourseType === 'loop' && (
                  <View style={styles.lapCountRow}>
                    <Text style={styles.fieldLabel}>{t('course.detail.lapCount')}</Text>
                    <View style={styles.lapCountControls}>
                      <TouchableOpacity
                        style={styles.lapCountBtn}
                        onPress={() => setEditLapCount(Math.max(1, editLapCount - 1))}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="remove" size={18} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={styles.lapCountValue}>{editLapCount}</Text>
                      <TouchableOpacity
                        style={styles.lapCountBtn}
                        onPress={() => setEditLapCount(Math.min(10, editLapCount + 1))}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add" size={18} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={styles.publicRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('course.detail.publicLabel')}</Text>
                <Text style={styles.publicHint}>{t('course.detail.publicHint')}</Text>
              </View>
              <Switch
                value={editPublic}
                onValueChange={setEditPublic}
                trackColor={{ false: colors.surfaceLight, true: colors.primary }}
              />
            </View>

            {/* Route Correction */}
            <TouchableOpacity
              style={styles.routeCorrectBtn}
              onPress={() => {
                setShowEditModal(false);
                navigation.navigate('CourseRouteCorrect' as any, { courseId });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="map-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: SPACING.md }}>
                <Text style={styles.routeCorrectTitle}>{t('course.detail.routeCorrection')}</Text>
                <Text style={styles.routeCorrectHint}>{t('course.detail.routeCorrectionHint')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Bottom CTA: Raid or Competition challenge */}
      <Animated.View style={[styles.bottomCta, { paddingBottom: Math.max(insets.bottom, 4), transform: [{ translateY: bottomCtaTranslateY }] }]}>
        {pendingSelectForRaid ? (
          <TouchableOpacity
            style={styles.startRaidBtn}
            onPress={handleStartRaid}
            activeOpacity={0.8}
            disabled={isStartingRaid}
          >
            {isStartingRaid ? (
              <ActivityIndicator size="small" color={colors.white} style={{ marginRight: SPACING.sm }} />
            ) : (
              <Ionicons
                name="flash"
                size={20}
                color={colors.white}
                style={{ marginRight: SPACING.sm }}
              />
            )}
            <Text style={styles.startRaidBtnText}>
              {t('raid.startRaid')}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Show gap to 1st place if user has a record */}
            {stats && selectedCourseMyBest && (
              <View style={styles.challengeInfo}>
                <Text style={styles.challengeLabel}>{t('course.detail.firstRecord')}</Text>
                <Text style={styles.challengeRecord}>
                  {formatDuration(stats.best_duration_seconds)}
                </Text>
                <Text style={styles.challengeGap}>
                  {t('course.detail.gap', { gap: formatDuration(selectedCourseMyBest.duration_seconds - stats.best_duration_seconds) })}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleRunThisCourse}
              activeOpacity={0.8}
            >
              <Ionicons
                name="globe-outline"
                size={20}
                color={colors.white}
                style={{ marginRight: SPACING.sm }}
              />
              <Text style={styles.ctaButtonText}>
                {t('course.detail.viewInWorld')}
              </Text>
            </TouchableOpacity>
            {distanceToStart !== null && distanceToStart > 0 && (
              <View style={styles.tooFarBanner}>
                <Ionicons name="location-outline" size={16} color={isWithinRange ? colors.primary : '#FF9500'} />
                <Text style={[styles.tooFarText, isWithinRange && { color: colors.primary }]}>
                  {t('course.detail.distanceFromStart', { distance: distanceToStart.toFixed(1) })}
                </Text>
              </View>
            )}
          </>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

// ---- Sub-components ----

const CrewRankingRow = React.memo(function CrewRankingRow({
  entry,
  isMyCrew = false,
  onPress,
}: {
  entry: CrewCourseRankingEntry;
  isMyCrew?: boolean;
  onPress?: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const RANK_COLORS = [colors.gold, colors.silver, colors.bronze];
  const isTop3 = entry.rank <= 3;
  const rankColor = isTop3 ? RANK_COLORS[entry.rank - 1] : colors.surfaceLight;

  return (
    <TouchableOpacity
      style={[styles.rankingRow, isMyCrew && styles.rankingRowMe]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.rankNum, { color: isTop3 ? rankColor : colors.textSecondary }]}>
        {entry.rank}
      </Text>

      {/* Crew logo */}
      <View style={styles.groupAvatarStack}>
        {entry.crew_logo_url ? (
          <Image source={{ uri: entry.crew_logo_url }} style={styles.groupAvatarImg} />
        ) : (
          <View style={styles.groupAvatarCircle}>
            <Ionicons name="people" size={12} color={colors.textTertiary} />
          </View>
        )}
      </View>

      <View style={styles.rankInfo}>
        <Text style={[styles.rankNickname, isMyCrew && styles.rankNicknameMe]}>
          {entry.crew_name}
          {isMyCrew ? '  (ME)' : ''}
        </Text>
        <Text style={styles.rankCrewName}>
          {entry.completed_count}명 참여
        </Text>
      </View>

      <View style={styles.rankStats}>
        <Text style={styles.rankPace}>
          {formatDuration(entry.avg_duration_seconds)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const RankingRow = React.memo(function RankingRow({ entry, isMe = false }: { entry: RankingEntry; isMe?: boolean }) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<CourseStackParamList>>();

  const RANK_COLORS = [colors.gold, colors.silver, colors.bronze];
  const isTop3 = entry.rank <= 3;
  const rankColor = isTop3 ? RANK_COLORS[entry.rank - 1] : colors.surfaceLight;
  const avatarSize = isTop3 ? 40 : 34;
  const avatarRadius = avatarSize / 2;

  return (
    <TouchableOpacity
      style={[
        styles.rankingRow,
        isTop3 && { backgroundColor: rankColor + '0C', borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.sm, marginHorizontal: -SPACING.sm },
        isMe && styles.rankingRowMe,
      ]}
      onPress={() => navigation.navigate('UserProfile', { userId: entry.user.id })}
      activeOpacity={0.7}
    >
      {/* Rank badge */}
      {isTop3 ? (
        <View style={[styles.rankBadge, { backgroundColor: rankColor }]}>
          <Text style={styles.rankBadgeText}>{entry.rank}</Text>
        </View>
      ) : (
        <Text style={[styles.rankNum, { color: colors.textSecondary }]}>
          {entry.rank}
        </Text>
      )}

      {/* Avatar with rank ring */}
      {entry.user.avatar_url ? (
        <Image
          source={{ uri: entry.user.avatar_url }}
          style={[styles.rankAvatar, { width: avatarSize, height: avatarSize, borderRadius: avatarRadius }, isTop3 && { borderWidth: 2, borderColor: rankColor }]}
        />
      ) : (
        <View style={[styles.rankAvatar, styles.rankAvatarPlaceholder, { width: avatarSize, height: avatarSize, borderRadius: avatarRadius }, isTop3 && { borderWidth: 2, borderColor: rankColor }]}>
          <Ionicons name="person" size={isTop3 ? 18 : 14} color={colors.textTertiary} />
        </View>
      )}

      {/* Runner info */}
      <View style={styles.rankInfo}>
        <View style={styles.rankNameRow}>
          <Text style={[styles.rankNickname, isMe && styles.rankNicknameMe, isTop3 && { fontWeight: '800' }]} numberOfLines={1}>
            {entry.user.nickname}
          </Text>
          {entry.gps_verified && <GpsVerifiedBadge size={12} />}
          {(entry.user.runner_level ?? 0) > 1 && (
            <RunnerLevelBadge level={entry.user.runner_level} size="sm" />
          )}
          {isMe && (
            <View style={styles.rankMeBadge}>
              <Text style={styles.rankMeBadgeText}>ME</Text>
            </View>
          )}
        </View>
        <View style={styles.rankSubRow}>
          {entry.user.crew_name ? (
            <Text style={styles.rankCrewName}>{entry.user.crew_name}</Text>
          ) : null}
          {entry.user.country ? (
            <Text style={styles.rankCountry}>{entry.user.country}</Text>
          ) : null}
        </View>
      </View>

      {/* Time (primary) + Pace (secondary) */}
      <View style={styles.rankStats}>
        <Text style={[styles.rankPace, isTop3 && { fontWeight: '800' }]}>
          {formatDuration(entry.best_duration_seconds)}
        </Text>
        <Text style={styles.rankDuration}>
          {formatPace(entry.best_pace_seconds_per_km)}/km
        </Text>
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: Platform.OS === 'android' ? 180 : 120,
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
  statsRowList: {
    gap: 0,
  },
  statsRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.divider,
  },
  statsRowLabel: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
  },
  statsRowValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'] as any,
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
  // Dominion banner
  dominionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.xxl,
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    backgroundColor: c.card,
  },
  dominionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  dominionLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: SPACING.sm,
  },
  dominionInfo: {
    flex: 1,
  },
  dominionLabel: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    marginBottom: 1,
  },
  dominionCrewName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    marginBottom: 2,
  },
  dominionAvgTime: {
    fontSize: FONT_SIZES.xs,
    color: c.textSecondary,
  },
  dominionMembers: {
    flexDirection: 'row',
    marginRight: SPACING.xs,
  },
  dominionAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.card,
  },
  dominionAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: c.card,
  },

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
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.divider,
  },
  rankingRowMe: {
    backgroundColor: c.primary + '12',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    marginHorizontal: -SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: c.primary,
    borderBottomWidth: 0,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '900',
    color: c.white,
  },
  rankNum: {
    width: 26,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  rankAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  rankAvatarPlaceholder: {
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankInfo: {
    flex: 1,
    gap: 1,
  },
  rankNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  rankNickname: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.text,
    flexShrink: 1,
  },
  rankNicknameMe: {
    fontWeight: '800',
    color: c.primary,
  },
  rankMeBadge: {
    backgroundColor: c.primary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.xs,
  },
  rankMeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: c.white,
    letterSpacing: 0.5,
  },
  rankSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  rankCrewName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: c.textSecondary,
  },
  rankCountry: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
  },
  rankStats: {
    alignItems: 'flex-end',
    gap: 1,
  },
  rankPace: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  rankDuration: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    fontVariant: ['tabular-nums'],
  },

  // -- Ranking Tabs --
  rankingTabRow: {
    flexDirection: 'row',
    backgroundColor: c.surfaceLight,
    borderRadius: BORDER_RADIUS.md,
    padding: 2,
    marginBottom: SPACING.sm,
  },
  rankingTabBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },
  rankingTabBtnActive: {
    backgroundColor: c.card,
    ...SHADOWS.sm,
  },
  rankingTabText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.textSecondary,
  },
  rankingTabTextActive: {
    color: c.text,
    fontWeight: '700',
  },

  // -- Crew Rankings --
  groupRankEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  groupRankEmptyText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textSecondary,
  },
  groupAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  groupAvatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: c.card,
  },
  groupAvatarImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  groupAvatarMore: {
    fontSize: 8,
    fontWeight: '700',
    color: c.textSecondary,
  },
  startRaidBtn: {
    flexDirection: 'row',
    backgroundColor: c.accent,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg + 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  startRaidBtnText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.white,
    letterSpacing: 0.5,
  },

  // -- Bottom CTA: Competition challenge --
  bottomCta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    backgroundColor: c.card,
    borderTopWidth: 1,
    borderTopColor: c.divider,
    gap: SPACING.xs,
  },
  ctaButtonDisabled: {
    backgroundColor: c.surfaceLight,
  },
  ctaButtonTextDisabled: {
    color: c.textTertiary,
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
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  ctaButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.white,
    letterSpacing: 0.3,
  },
  tooFarBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500' + '12',
    borderWidth: 1,
    borderColor: '#FF9500' + '30',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  tooFarText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#FF9500',
    marginLeft: SPACING.sm,
  },

  // -- Owner actions --
  ownerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.xs,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  editButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.primary,
  },

  // -- Edit modal --
  modalContainer: {
    flex: 1,
    backgroundColor: c.card,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  modalCancel: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
  },
  modalSave: {
    fontSize: FONT_SIZES.md,
    color: c.primary,
    fontWeight: '700',
  },
  modalBody: {
    padding: SPACING.xl,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: c.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  fieldInput: {
    backgroundColor: c.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    fontSize: FONT_SIZES.md,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
  },
  fieldTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: SPACING.md,
  },
  charCount: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  courseTypeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  courseTypeBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
  },
  courseTypeBtnActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  courseTypeBtnText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: c.textSecondary,
  },
  courseTypeBtnTextActive: {
    color: c.white,
  },
  lapCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  lapCountControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  lapCountBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lapCountValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: c.text,
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  publicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  publicHint: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    marginTop: 2,
  },
  routeCorrectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  routeCorrectTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
  },
  routeCorrectHint: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
    marginTop: 2,
  },
});
