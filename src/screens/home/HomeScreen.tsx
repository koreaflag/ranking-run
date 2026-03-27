import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  Animated,
  Dimensions,
  NativeModules,
  Platform,
  Modal,
  BackHandler,
  RefreshControl,
  InteractionManager,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import type { HomeStackParamList } from '../../types/navigation';
import type { WeeklySummary, RecentRun, AnnouncementItem, FavoriteCourseItem, CrewChallengeItem, CrewItem, FriendRunning } from '../../types/api';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCourseListStore } from '../../stores/courseListStore';
import { userService } from '../../services/userService';
import { announcementService } from '../../services/announcementService';
import { crewChallengeService } from '../../services/crewChallengeService';
import { crewService } from '../../services/crewService';
import { notificationService } from '../../services/notificationService';
import BlurredBackground from '../../components/common/BlurredBackground';
import HomeSkeleton from '../../components/skeleton/HomeSkeleton';
import CourseThumbnailMap from '../../components/course/CourseThumbnailMap';
import RunningAvatarIndicator from '../../components/common/RunningAvatarIndicator';
import {
  formatDistance,
  formatDuration,
  formatPace,
  metersToKm,
} from '../../utils/format';
import {
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
  COLORS,
} from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import { useToastStore } from '../../stores/toastStore';
import CrewLevelBadge from '../../components/crew/CrewLevelBadge';
import { useWatchStandaloneStore } from '../../stores/watchStandaloneStore';
import { getCache, setCache } from '../../utils/apiCache';
import { useChallengeStore } from '../../stores/challengeStore';
import type { ChallengeListItem, GoalType } from '../../services/challengeService';
import { groupRunService } from '../../services/groupRunService';
import type { GroupRunItem } from '../../types/api';

const heroImage = require('../../assets/home-hero.jpg');

// Module-level cache: survives tab switches (cleared on app restart)
let _cachedWeekly: WeeklySummary | null = null;
let _cachedRuns: RecentRun[] = [];
let _cachedAnnouncements: AnnouncementItem[] = [];
let _cachedRaids: Array<{ crew: CrewItem; raid: CrewChallengeItem }> = [];
let _cachedFriendsRunning: FriendRunning[] = [];
let _diskCacheLoaded = false;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_ANDROID = Platform.OS === 'android';

// ---- Onboarding Guide ----

const GUIDE_STORAGE_KEY = '@runvs:hasSeenHomeGuide';
const GUIDE_CARD_PADDING = SPACING.xxl * 2;
const GUIDE_PAGE_WIDTH = SCREEN_WIDTH - GUIDE_CARD_PADDING;

const GUIDE_STEPS = [
  {
    icon: 'map' as keyof typeof Ionicons.glyphMap,
    iconColor: '#FF7A33',
    iconBg: 'rgba(255,122,51,0.15)',
    titleKey: 'guide.step1Title',
    descKey: 'guide.step1Desc',
  },
  {
    icon: 'earth' as keyof typeof Ionicons.glyphMap,
    iconColor: '#10B981',
    iconBg: 'rgba(16,185,129,0.15)',
    titleKey: 'guide.step2Title',
    descKey: 'guide.step2Desc',
  },
  {
    icon: 'trophy' as keyof typeof Ionicons.glyphMap,
    iconColor: '#FFD166',
    iconBg: 'rgba(255,209,102,0.15)',
    titleKey: 'guide.step3Title',
    descKey: 'guide.step3Desc',
  },
] as const;

const STEP_COUNT = GUIDE_STEPS.length;

const WEEKDAY_KEYS = [
  'mypage.days.sun', 'mypage.days.mon', 'mypage.days.tue', 'mypage.days.wed',
  'mypage.days.thu', 'mypage.days.fri', 'mypage.days.sat',
];

function getTimeOfDay(iso: string, t: (key: string) => string): string {
  const h = new Date(iso).getHours();
  if (h < 6) return t('mypage.timeOfDay.dawn');
  if (h < 12) return t('mypage.timeOfDay.morning');
  if (h < 18) return t('mypage.timeOfDay.afternoon');
  return t('mypage.timeOfDay.evening');
}

const GOAL_TYPE_ICONS: Record<GoalType, keyof typeof Ionicons.glyphMap> = {
  total_distance: 'navigate',
  total_runs: 'flag',
  total_duration: 'time',
  streak_days: 'flame',
};

type HomeNav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAuthStore((s) => s.user);
  const hapticEnabled = useSettingsStore((s) => s.hapticFeedback);

  // --- Data (initialized from module cache for instant display on tab switch) ---
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(_cachedWeekly);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>(_cachedRuns);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>(_cachedAnnouncements);
  const [myCrewRaids, setMyCrewRaids] = useState<Array<{ crew: CrewItem; raid: CrewChallengeItem }>>(_cachedRaids);
  const [friendsRunning, setFriendsRunning] = useState<FriendRunning[]>(_cachedFriendsRunning);
  const [loading, setLoading] = useState(!_cachedWeekly && _cachedRuns.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const favoriteCourses = useCourseListStore((s) => s.favoriteCourses);
  const fetchFavoriteCourses = useCourseListStore((s) => s.fetchFavoriteCourses);
  const watchStandalone = useWatchStandaloneStore();

  // Challenges
  const challenges = useChallengeStore((s) => s.challenges);
  const fetchChallenges = useChallengeStore((s) => s.fetchChallenges);

  // Group Runs (local state since store may not exist yet)
  const [groupRuns, setGroupRuns] = useState<GroupRunItem[]>([]);

  // Auto-clear stale watch standalone status (no update in 15s → watch disconnected)
  useEffect(() => {
    if (!watchStandalone.isActive) return;
    const interval = setInterval(() => {
      const { lastUpdateAt, isActive, clear } = useWatchStandaloneStore.getState();
      if (isActive && Date.now() - lastUpdateAt > 15_000) {
        clear();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [watchStandalone.isActive]);

  // Restore disk cache on first mount (instant display before API)
  useEffect(() => {
    if (_diskCacheLoaded) return;
    _diskCacheLoaded = true;
    (async () => {
      const [cWeekly, cRuns, cAnn] = await Promise.all([
        getCache<WeeklySummary>('home:weekly'),
        getCache<RecentRun[]>('home:runs'),
        getCache<AnnouncementItem[]>('home:announcements'),
      ]);
      if (cWeekly && !_cachedWeekly) { _cachedWeekly = cWeekly.data; setWeeklySummary(cWeekly.data); }
      if (cRuns && _cachedRuns.length === 0) { _cachedRuns = cRuns.data; setRecentRuns(cRuns.data); }
      if (cAnn && _cachedAnnouncements.length === 0) { _cachedAnnouncements = cAnn.data; setAnnouncements(cAnn.data); }
      if (cWeekly || cRuns) setLoading(false);
    })();
  }, []);

  // Primary data: loads immediately (above the fold)
  const loadPrimaryData = useCallback(async () => {
    try {
      const [weekly, runs] = await Promise.all([
        userService.getWeeklySummary().catch(() => null),
        userService.getRecentRuns(3).catch(() => []),
        fetchFavoriteCourses().catch((err) => {
          console.warn('[Home] 즐겨찾기 코스 조회 실패:', err);
        }),
        notificationService.getUnreadCount()
          .then((r) => setUnreadCount(r.count))
          .catch((err) => {
            console.warn('[Home] 알림 카운트 조회 실패:', err);
          }),
      ]);
      setWeeklySummary(weekly); _cachedWeekly = weekly;
      setRecentRuns(runs); _cachedRuns = runs;
      // Persist to disk for next app launch
      setCache('home:weekly', weekly);
      setCache('home:runs', runs);
    } catch {
      useToastStore.getState().showToast('error', '홈 데이터를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [fetchFavoriteCourses]);

  // Secondary data: deferred (below the fold)
  const loadSecondaryData = useCallback(async () => {
    try {
      const [annRes, crews, friendsRes] = await Promise.all([
        announcementService.getAnnouncements(10).catch(() => ({ data: [] })),
        crewService.getMyCrews().catch((): CrewItem[] => []),
        userService.getFriendsRunning().catch((): FriendRunning[] => []),
        fetchChallenges().catch(() => {}),
        groupRunService.getMyGroupRuns().then((res) => {
          const items = Array.isArray(res?.data) ? res.data : [];
          const active = items.filter((g) => g.status === 'active').slice(0, 3);
          setGroupRuns(active);
        }).catch(() => {}),
      ]);
      setFriendsRunning(friendsRes); _cachedFriendsRunning = friendsRes;
      const ann = annRes.data ?? [];
      setAnnouncements(ann); _cachedAnnouncements = ann;
      setCache('home:announcements', ann);
      if (crews.length > 0) {
        const raidResults = await Promise.all(
          crews.map(async (crew: CrewItem) => {
            try {
              const raid = await crewChallengeService.getActiveChallenge(crew.id);
              if (raid) return { crew, raid };
            } catch { /* ignore */ }
            return null;
          }),
        );
        const raids = raidResults.filter((r): r is { crew: CrewItem; raid: CrewChallengeItem } => r !== null);
        setMyCrewRaids(raids); _cachedRaids = raids;
      } else {
        setMyCrewRaids([]); _cachedRaids = [];
      }
    } catch {
      // partial failures ok
    }
  }, []);

  const loadData = useCallback(async () => {
    await loadPrimaryData();
    // Defer secondary data until animations/interactions settle
    InteractionManager.runAfterInteractions(() => {
      loadSecondaryData();
    });
  }, [loadPrimaryData, loadSecondaryData]);

  // Refetch on initial mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refetch primary data (courses, runs) when tab regains focus
  useFocusEffect(
    useCallback(() => {
      // Skip the initial mount (already handled above)
      if (loading) return;
      loadPrimaryData();
    }, [loading, loadPrimaryData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPrimaryData(), loadSecondaryData()]);
    setRefreshing(false);
  }, [loadPrimaryData, loadSecondaryData]);

  // --- Poll friends running every 30s when there are active runners ---
  const hasFriendsRunning = friendsRunning.length > 0;
  useEffect(() => {
    if (!hasFriendsRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await userService.getFriendsRunning();
        setFriendsRunning(res); _cachedFriendsRunning = res;
      } catch { /* ignore */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [hasFriendsRunning]);

  // --- Pulsing dot animation for friends running banner ---
  const friendsDotOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (friendsRunning.length === 0) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(friendsDotOpacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(friendsDotOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [friendsRunning.length, friendsDotOpacity]);

  // --- Location permission ---
  useEffect(() => {
    if (Platform.OS === 'ios' && NativeModules.GPSTrackerModule) {
      NativeModules.GPSTrackerModule.requestLocationPermission?.();
    }
  }, []);

  // --- Onboarding guide ---
  const [guideVisible, setGuideVisible] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const guideScrollRef = useRef<ScrollView>(null);
  const guideOpacity = useRef(new Animated.Value(0)).current;
  const guideStyles = useMemo(() => createGuideStyles(), []);

  useEffect(() => {
    AsyncStorage.getItem(GUIDE_STORAGE_KEY).then((value) => {
      if (!value) {
        setGuideVisible(true);
        Animated.timing(guideOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [guideOpacity]);

  const dismissGuide = useCallback(async () => {
    Animated.timing(guideOpacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setGuideVisible(false));
    await AsyncStorage.setItem(GUIDE_STORAGE_KEY, 'true');
  }, [guideOpacity]);

  // Android back button handler for guide modal
  useEffect(() => {
    if (!IS_ANDROID || !guideVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissGuide();
      return true;
    });
    return () => sub.remove();
  }, [guideVisible, dismissGuide]);

  const handleGuideNext = useCallback(() => {
    const next = guideStep + 1;
    if (next >= STEP_COUNT) {
      if (hapticEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dismissGuide();
      return;
    }
    if (hapticEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGuideStep(next);
    guideScrollRef.current?.scrollTo({ x: next * GUIDE_PAGE_WIDTH, animated: true });
  }, [guideStep, dismissGuide, hapticEnabled]);

  const handleGuideScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / GUIDE_PAGE_WIDTH);
      setGuideStep(page);
    },
    [],
  );

  // --- Derived data (memoized) ---
  const weeklyDerived = useMemo(() => {
    const km = weeklySummary ? metersToKm(weeklySummary.total_distance_meters, 1) : '0';
    const change = weeklySummary?.compared_to_last_week_percent ?? 0;
    const changeSign = change > 0 ? '+' : '';
    const changeColor = change > 0 ? colors.success : change < 0 ? colors.error : colors.textTertiary;
    return { km, change, changeSign, changeColor };
  }, [weeklySummary, colors.success, colors.error, colors.textTertiary]);

  const nickname = useMemo(() => user?.nickname || t('mypage.defaultNickname'), [user?.nickname, t]);

  const todayDateLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // static for the lifetime of the screen mount
  );

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoText}>RUNVS</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => navigation.navigate('ActivityFeed')}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="people-outline" size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('NotificationInbox')}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="notifications-outline" size={24} color={colors.text} />
              {unreadCount > 0 && <View style={styles.unreadBadge} />}
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
            <HomeSkeleton />
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
          {/* Greeting */}
          <View style={styles.greetingSection}>
            <Text style={styles.greetingText}>
              {t('home.greeting', { name: nickname })}
            </Text>
            <Text style={styles.greetingSubText}>
              {todayDateLabel}
            </Text>
          </View>

          {/* Watch Standalone Run Banner */}
          {watchStandalone.isActive && (
            <View style={styles.watchBanner}>
              <View style={styles.watchBannerLeft}>
                <Ionicons name="watch-outline" size={18} color="#FF7A33" />
                <Text style={styles.watchBannerLabel}>
                  {t('home.watchRunning')}
                </Text>
              </View>
              <View style={styles.watchBannerStats}>
                <Text style={styles.watchBannerValue}>
                  {(watchStandalone.distanceMeters / 1000).toFixed(2)} km
                </Text>
                <Text style={styles.watchBannerSep}>·</Text>
                <Text style={styles.watchBannerValue}>
                  {formatDuration(watchStandalone.durationSeconds)}
                </Text>
                {watchStandalone.avgPace > 0 && watchStandalone.avgPace < 3600 && (
                  <>
                    <Text style={styles.watchBannerSep}>·</Text>
                    <Text style={styles.watchBannerValue}>
                      {formatPace(watchStandalone.avgPace)}
                    </Text>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Weekly Summary Card with background image */}
          <View style={styles.weeklyCardWrapper}>
            <ImageBackground
              source={heroImage}
              style={styles.weeklyCardBg}
              imageStyle={styles.weeklyCardBgImage}
              resizeMode="cover"
            >
              <View style={styles.weeklyCardOverlay}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.cardTitleWithIcon}>
                    <Ionicons name="calendar" size={14} color="#FFFFFF" />
                    <Text style={styles.weeklyCardTitle}>{t('home.weeklySummary')}</Text>
                  </View>
                  {weeklyDerived.change !== 0 && (
                    <Text style={[styles.weeklyChangeText, { color: weeklyDerived.change > 0 ? '#34D399' : '#F87171' }]}>
                      {weeklyDerived.changeSign}{Math.round(weeklyDerived.change)}%
                    </Text>
                  )}
                </View>

                {/* Big distance */}
                <View style={styles.heroDistanceRow}>
                  <Text style={styles.weeklyHeroDistance}>{weeklyDerived.km}</Text>
                  <Text style={styles.weeklyHeroUnit}>km</Text>
                </View>

                {/* Mini stats */}
                <View style={styles.weeklyMiniStatsRow}>
                  <View style={styles.weeklyMiniStatItem}>
                    <Ionicons name="flag-outline" size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.weeklyMiniStatValue}>{weeklySummary?.run_count ?? 0}</Text>
                    <Text style={styles.weeklyMiniStatLabel}>{t('home.runCount', { count: weeklySummary?.run_count ?? 0 })}</Text>
                  </View>
                  <View style={styles.weeklyMiniStatDivider} />
                  <View style={styles.weeklyMiniStatItem}>
                    <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.weeklyMiniStatValue}>{formatDuration(weeklySummary?.total_duration_seconds ?? 0)}</Text>
                    <Text style={styles.weeklyMiniStatLabel}>{t('home.totalTime')}</Text>
                  </View>
                  <View style={styles.weeklyMiniStatDivider} />
                  <View style={styles.weeklyMiniStatItem}>
                    <Ionicons name="speedometer-outline" size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.weeklyMiniStatValue}>{formatPace(weeklySummary?.avg_pace_seconds_per_km ?? null)}</Text>
                    <Text style={styles.weeklyMiniStatLabel}>{t('home.avgPace')}</Text>
                  </View>
                </View>
              </View>
            </ImageBackground>
          </View>

          {/* Start Running CTA */}
          <TouchableOpacity
            style={styles.ctaButton}
            activeOpacity={0.85}
            onPress={() => navigation.getParent()?.navigate('WorldTab')}
          >
            <Ionicons name="play" size={18} color="#FFFFFF" />
            <Text style={styles.ctaButtonText}>{t('home.startRunning')}</Text>
          </TouchableOpacity>

          {/* Announcements / Events */}
          {announcements.length > 0 && (
            <View style={styles.announcementsSection}>
              <View style={styles.announcementsHeader}>
                <Ionicons name="megaphone" size={14} color={colors.primary} />
                <Text style={styles.announcementsTitle}>{t('home.announcements')}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.announcementsScroll}
              >
                {announcements.map((ann) => {
                  const hasImage = !!ann.image_url;
                  const typeBadge =
                    ann.link_type === 'event' ? t('home.event') :
                    ann.link_type === 'url' ? t('home.link') :
                    ann.link_type === 'crew' ? t('home.crew') : null;

                  return (
                    <TouchableOpacity
                      key={ann.id}
                      style={styles.announcementCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (ann.link_type === 'url' && ann.link_value) {
                          // Could open URL via Linking
                        } else if (ann.link_type === 'crew' && ann.link_value) {
                          navigation.navigate('CrewDetail', { crewId: ann.link_value });
                        } else if (ann.link_type === 'event' && ann.link_value) {
                          // Could navigate to event detail
                        }
                      }}
                    >
                      {hasImage ? (
                        <ImageBackground
                          source={{ uri: ann.image_url! }}
                          style={styles.announcementImage}
                          imageStyle={styles.announcementImageStyle}
                        >
                          <View style={styles.announcementImageOverlay}>
                            {typeBadge && (
                              <View style={styles.announcementTypeBadge}>
                                <Text style={styles.announcementTypeBadgeText}>{typeBadge}</Text>
                              </View>
                            )}
                            <Text style={styles.announcementTitleOnImage} numberOfLines={2}>
                              {ann.title}
                            </Text>
                          </View>
                        </ImageBackground>
                      ) : (
                        <View style={styles.announcementNoImage}>
                          {typeBadge && (
                            <View style={styles.announcementTypeBadge}>
                              <Text style={styles.announcementTypeBadgeText}>{typeBadge}</Text>
                            </View>
                          )}
                          <Text style={styles.announcementTitleNoImage} numberOfLines={2}>
                            {ann.title}
                          </Text>
                          {ann.content && (
                            <Text style={styles.announcementContent} numberOfLines={1}>
                              {ann.content}
                            </Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Favorite Courses */}
          {favoriteCourses.length > 0 && (
            <View style={styles.favSection}>
              <View style={styles.favHeader}>
                <View style={styles.cardTitleWithIcon}>
                  <Ionicons name="heart" size={14} color={colors.primary} />
                  <Text style={styles.favTitle}>{t('home.favoriteCourses')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.getParent()?.navigate('CourseTab')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.seeAllText}>{t('home.viewAll')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.favScroll}
              >
                {favoriteCourses.map((course: FavoriteCourseItem) => (
                  <TouchableOpacity
                    key={course.id}
                    style={styles.favCard}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('CourseDetail', { courseId: course.id })}
                  >
                    {course.route_preview && course.route_preview.length >= 2 ? (
                      <CourseThumbnailMap routePreview={course.route_preview} width={160} height={90} />
                    ) : (
                      <View style={[styles.favThumbnail, styles.favThumbnailPlaceholder]}>
                        <Ionicons name="map-outline" size={24} color={colors.textTertiary} />
                      </View>
                    )}
                    <View style={styles.favInfo}>
                      <Text style={styles.favName} numberOfLines={1}>{course.title}</Text>
                      <Text style={styles.favMeta}>
                        {formatDistance(course.distance_meters)} · {course.creator_nickname}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Active Challenges */}
          {challenges.length > 0 && (
            <View style={styles.favSection}>
              <View style={styles.favHeader}>
                <View style={styles.cardTitleWithIcon}>
                  <Ionicons name="trophy" size={14} color={colors.primary} />
                  <Text style={styles.favTitle}>{t('home.activeChallenges')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('ChallengeList')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.seeAllText}>{t('home.viewAllSection')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.favScroll}
              >
                {challenges.slice(0, 3).map((challenge: ChallengeListItem) => {
                  const endDate = new Date(challenge.end_date);
                  const now = new Date();
                  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                  const goalIcon = GOAL_TYPE_ICONS[challenge.goal_type] || 'flag';

                  return (
                    <TouchableOpacity
                      key={challenge.id}
                      style={styles.challengeCard}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('ChallengeDetail', { challengeId: challenge.id })}
                    >
                      <View style={styles.challengeCardTop}>
                        <View style={styles.challengeIconCircle}>
                          <Ionicons name={goalIcon} size={16} color={colors.primary} />
                        </View>
                        {challenge.is_joined && (
                          <View style={styles.challengeJoinedBadge}>
                            <Text style={styles.challengeJoinedText}>{t('challenge.joined')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.challengeCardTitle} numberOfLines={2}>
                        {challenge.title}
                      </Text>
                      <View style={styles.challengeCardMeta}>
                        <Text style={styles.challengeCardMetaText}>
                          {t('challenge.daysLeft', { count: daysLeft })}
                        </Text>
                        <View style={styles.recentRunDot} />
                        <Text style={styles.challengeCardMetaText}>
                          {t('challenge.participants', { count: challenge.participant_count })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Live Group Runs */}
          {groupRuns.length > 0 && (
            <View style={styles.favSection}>
              <View style={styles.favHeader}>
                <View style={styles.cardTitleWithIcon}>
                  <Ionicons name="people" size={14} color={colors.primary} />
                  <Text style={styles.favTitle}>{t('home.liveGroupRuns')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.getParent()?.navigate('CourseTab')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.seeAllText}>{t('home.viewAllSection')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.favScroll}
              >
                {groupRuns.slice(0, 3).map((group: GroupRunItem) => {
                  const completedCount = (group.members ?? []).filter((m) => m.status === 'completed').length;

                  return (
                    <TouchableOpacity
                      key={group.id}
                      style={styles.groupRunCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (group.course_id) {
                          navigation.navigate('CourseDetail', { courseId: group.course_id });
                        }
                      }}
                    >
                      {group.course_name && (
                        <Text style={styles.groupRunCourseName} numberOfLines={1}>
                          {group.course_name}
                        </Text>
                      )}
                      <Text style={styles.groupRunTitle} numberOfLines={1}>
                        {group.name}
                      </Text>
                      <View style={styles.groupRunMeta}>
                        <View style={styles.groupRunStatusBadge}>
                          <View style={styles.groupRunStatusDot} />
                          <Text style={styles.groupRunStatusText}>
                            {t('home.ongoing')}
                          </Text>
                        </View>
                        <Text style={styles.groupRunMemberText}>
                          {t('groupRun.completedCount', { count: completedCount, total: group.member_count })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* My Crew Raids */}
          {myCrewRaids.length > 0 && (
            <View style={styles.favSection}>
              <View style={styles.favHeader}>
                <View style={styles.cardTitleWithIcon}>
                  <Ionicons name="flash" size={14} color={colors.primary} />
                  <Text style={styles.favTitle}>{t('home.myCrewRaids')}</Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.favScroll}
              >
                {myCrewRaids.map(({ crew, raid }) => {
                  const progress = raid.total_participants > 0
                    ? Math.min(100, (raid.completed_count / raid.total_participants) * 100)
                    : 0;
                  return (
                    <TouchableOpacity
                      key={crew.id}
                      style={styles.raidCard}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('CrewDetail', { crewId: crew.id })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CrewLevelBadge level={crew.level} size="sm" />
                        <Text style={[styles.raidCardCrewName, { flex: 1 }]} numberOfLines={1}>{crew.name}</Text>
                      </View>
                      {raid.course_name && (
                        <Text style={styles.raidCardCourseName} numberOfLines={1}>
                          {raid.course_name}
                        </Text>
                      )}
                      <View style={styles.raidCardProgressBg}>
                        <View style={[styles.raidCardProgressFill, { width: `${progress}%` }]} />
                      </View>
                      <Text style={styles.raidCardProgressText}>
                        {raid.completed_count}/{raid.total_participants}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Recent Runs */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardTitleWithIcon}>
                <Ionicons name="time" size={14} color={colors.primary} />
                <Text style={styles.cardTitle}>{t('home.recentRuns')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('RunHistory')}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.seeAllText}>{t('home.viewAll')}</Text>
              </TouchableOpacity>
            </View>

            {recentRuns.length > 0 ? (
              recentRuns.map((run, idx) => {
                const d = new Date(run.finished_at);
                const dayLabel = t(WEEKDAY_KEYS[d.getDay()]);
                const timeLabel = `${dayLabel} ${getTimeOfDay(run.finished_at, t)}`;
                const goalLabel = run.goal_data?.type
                  ? run.goal_data.type === 'interval'
                    ? `인터벌 ${Math.floor((run.goal_data.intervalRunSeconds ?? 0) / 60)}분/${Math.floor((run.goal_data.intervalWalkSeconds ?? 0) / 60)}분 ×${run.goal_data.intervalSets ?? 0}`
                    : run.goal_data.type === 'program'
                      ? `목표 러닝 ${((run.goal_data.value ?? 0) / 1000).toFixed(1)}km`
                      : run.goal_data.type === 'distance'
                        ? `거리 목표 ${((run.goal_data.value ?? 0) / 1000).toFixed(1)}km`
                        : run.goal_data.type === 'time'
                          ? `시간 목표 ${formatDuration(run.goal_data.value ?? 0)}`
                          : null
                  : null;
                const runTitle = run.course?.title || goalLabel || t('home.freeRunning');

                return (
                  <TouchableOpacity
                    key={run.id}
                    style={[styles.recentRunCard, idx > 0 && styles.recentRunCardBorder]}
                    onPress={() => navigation.navigate('RunDetail', { runId: run.id })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.recentRunInner}>
                      {run.route_preview && run.route_preview.length >= 2 ? (
                        <CourseThumbnailMap routePreview={run.route_preview} width={56} height={56} borderRadius={8} />
                      ) : (
                        <View style={styles.recentRunIconPlaceholder}>
                          <Ionicons name="footsteps" size={20} color={colors.textTertiary} />
                        </View>
                      )}
                      <View style={styles.recentRunBody}>
                        <View style={styles.recentRunHeader}>
                          <Text style={styles.recentRunTitle} numberOfLines={1}>
                            {runTitle}
                          </Text>
                          <Text style={styles.recentRunDate}>
                            {(d.getMonth() + 1)}/{d.getDate()}
                          </Text>
                        </View>
                        <Text style={styles.recentRunTimeLabel}>{timeLabel}</Text>
                        <View style={styles.recentRunStatsRow}>
                          <Text style={styles.recentRunStatText}>
                            {formatDistance(run.distance_meters)}
                          </Text>
                          <View style={styles.recentRunDot} />
                          <Text style={styles.recentRunStatText}>
                            {formatPace(run.avg_pace_seconds_per_km)}
                          </Text>
                          <View style={styles.recentRunDot} />
                          <Text style={styles.recentRunStatText}>
                            {formatDuration(run.duration_seconds)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="footsteps-outline" size={32} color={colors.textTertiary} />
                <Text style={styles.emptyText}>{t('home.noRecentRuns')}</Text>
                <Text style={styles.emptySubText}>{t('home.startRunning')}</Text>
              </View>
            )}
          </View>

          {/* Friends Running Banner */}
          <View style={styles.friendsRunningCard}>
            <View style={styles.friendsRunningHeader}>
              {friendsRunning.length > 0 ? (
                <Animated.View style={[styles.friendsRunningDot, { opacity: friendsDotOpacity }]} />
              ) : (
                <Ionicons name="people" size={14} color={colors.textTertiary} />
              )}
              <Text style={styles.friendsRunningTitle}>{t('home.friendsRunning')}</Text>
            </View>
            {friendsRunning.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.friendsRunningScroll}
              >
                {friendsRunning.map((friend) => (
                  <TouchableOpacity
                    key={friend.user_id}
                    style={styles.friendsRunningChip}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('UserProfile', { userId: friend.user_id })}
                  >
                    <View>
                      <RunningAvatarIndicator
                        avatarUrl={friend.avatar_url}
                        nickname={friend.nickname}
                        size={36}
                        isRunning
                      />
                      {friend.course_id ? (
                        <View style={styles.friendsRunningBadge}>
                          <Ionicons name="map-outline" size={10} color="#FFF" />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.friendsRunningName} numberOfLines={1}>
                      {friend.nickname}
                    </Text>
                    {friend.course_title ? (
                      <Text style={styles.friendsRunningCourse} numberOfLines={1}>
                        {friend.course_title}
                      </Text>
                    ) : (
                      <Text style={styles.friendsRunningFree} numberOfLines={1}>
                        {t('home.freeRunning', { defaultValue: '자유 러닝' })}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.friendsRunningEmpty}>
                <Ionicons name="people-outline" size={20} color={colors.textTertiary} />
                <Text style={styles.friendsRunningEmptyText}>
                  {t('home.noFriendsRunning', { defaultValue: '지금 달리는 친구가 없어요' })}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
        )}
      </SafeAreaView>

      {/* Onboarding Guide */}
      {/* Android: absolute overlay (no Dialog window = no touch desync) */}
      {/* iOS: native Modal (proper UIViewController presentation) */}
      {IS_ANDROID ? (
        guideVisible ? (
          <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 }}>
            <Animated.View style={[guideStyles.root, { opacity: guideOpacity }]}>
              <View style={guideStyles.card}>
                <TouchableOpacity style={guideStyles.skipBtn} onPress={dismissGuide} activeOpacity={0.7}>
                  <Text style={guideStyles.skipText}>{t('guide.skip', { defaultValue: '건너뛰기' })}</Text>
                </TouchableOpacity>

                <ScrollView
                  ref={guideScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={handleGuideScrollEnd}
                  style={guideStyles.pager}
                >
                  {GUIDE_STEPS.map((step, idx) => (
                    <View key={idx} style={guideStyles.page}>
                      <View style={[guideStyles.iconCircle, { backgroundColor: step.iconBg }]}>
                        <Ionicons name={step.icon} size={56} color={step.iconColor} />
                      </View>
                      <Text style={guideStyles.stepLabel}>{`${idx + 1} / ${STEP_COUNT}`}</Text>
                      <Text style={guideStyles.stepTitle}>
                        {t(step.titleKey, { defaultValue: '' })}
                      </Text>
                      <Text style={guideStyles.stepDesc}>
                        {t(step.descKey, { defaultValue: '' })}
                      </Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={guideStyles.dots}>
                  {GUIDE_STEPS.map((_, idx) => (
                    <View
                      key={idx}
                      style={[
                        guideStyles.dot,
                        idx === guideStep ? guideStyles.dotActive : guideStyles.dotInactive,
                      ]}
                    />
                  ))}
                </View>

                <TouchableOpacity style={guideStyles.ctaBtn} onPress={handleGuideNext} activeOpacity={0.85}>
                  <Text style={guideStyles.ctaText}>
                    {guideStep === STEP_COUNT - 1
                      ? t('guide.start', { defaultValue: '시작하기' })
                      : t('guide.next', { defaultValue: '다음' })}
                  </Text>
                  {guideStep < STEP_COUNT - 1 && (
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        ) : null
      ) : (
        <Modal visible={guideVisible} transparent animationType="none" statusBarTranslucent>
          <Animated.View style={[guideStyles.root, { opacity: guideOpacity }]}>
            <View style={guideStyles.card}>
              <TouchableOpacity style={guideStyles.skipBtn} onPress={dismissGuide} activeOpacity={0.7}>
                <Text style={guideStyles.skipText}>{t('guide.skip', { defaultValue: '건너뛰기' })}</Text>
              </TouchableOpacity>

              <ScrollView
                ref={guideScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onMomentumScrollEnd={handleGuideScrollEnd}
                style={guideStyles.pager}
              >
                {GUIDE_STEPS.map((step, idx) => (
                  <View key={idx} style={guideStyles.page}>
                    <View style={[guideStyles.iconCircle, { backgroundColor: step.iconBg }]}>
                      <Ionicons name={step.icon} size={56} color={step.iconColor} />
                    </View>
                    <Text style={guideStyles.stepLabel}>{`${idx + 1} / ${STEP_COUNT}`}</Text>
                    <Text style={guideStyles.stepTitle}>
                      {t(step.titleKey, { defaultValue: '' })}
                    </Text>
                    <Text style={guideStyles.stepDesc}>
                      {t(step.descKey, { defaultValue: '' })}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <View style={guideStyles.dots}>
                {GUIDE_STEPS.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      guideStyles.dot,
                      idx === guideStep ? guideStyles.dotActive : guideStyles.dotInactive,
                    ]}
                  />
                ))}
              </View>

              <TouchableOpacity style={guideStyles.ctaBtn} onPress={handleGuideNext} activeOpacity={0.85}>
                <Text style={guideStyles.ctaText}>
                  {guideStep === STEP_COUNT - 1
                    ? t('guide.start', { defaultValue: '시작하기' })
                    : t('guide.next', { defaultValue: '다음' })}
                </Text>
                {guideStep < STEP_COUNT - 1 && (
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Modal>
      )}
    </BlurredBackground>
  );
}

// ---- Guide Styles ----

const createGuideStyles = () =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
    },
    card: {
      width: '100%',
      backgroundColor: '#0E0E0E',
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: 'rgba(255,122,51,0.12)',
      overflow: 'hidden',
      paddingTop: SPACING.xxl,
      paddingBottom: SPACING.xxl,
    },
    skipBtn: {
      position: 'absolute',
      top: SPACING.lg,
      right: SPACING.lg,
      zIndex: 10,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    skipText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.4)',
    },
    pager: {
      width: GUIDE_PAGE_WIDTH,
    },
    page: {
      width: GUIDE_PAGE_WIDTH,
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.xxxl,
      paddingBottom: SPACING.xxl,
    },
    iconCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.xxl,
    },
    stepLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.3)',
      letterSpacing: 1,
      marginBottom: SPACING.md,
    },
    stepTitle: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: '#FFFFFF',
      textAlign: 'center',
      marginBottom: SPACING.md,
      letterSpacing: -0.3,
    },
    stepDesc: {
      fontSize: FONT_SIZES.md,
      fontWeight: '400',
      color: 'rgba(255,255,255,0.55)',
      textAlign: 'center',
      lineHeight: 22,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
      marginBottom: SPACING.xl,
    },
    dot: {
      height: 6,
      borderRadius: 3,
    },
    dotActive: {
      width: 24,
      backgroundColor: COLORS.primary,
    },
    dotInactive: {
      width: 6,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    ctaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: SPACING.xxl,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: COLORS.primary,
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    ctaText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
  });

// ---- Main Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingBottom: SPACING.xxxl,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
    },
    logoText: {
      fontSize: FONT_SIZES.title,
      fontWeight: '900',
      color: c.text,
      letterSpacing: 1.5,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    unreadBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 9,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: COLORS.primary,
    },

    // Greeting
    greetingSection: {
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.lg,
    },
    greetingText: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    greetingSubText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
      marginTop: 4,
    },

    // Watch standalone banner
    watchBanner: {
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.md,
      backgroundColor: 'rgba(255,122,51,0.08)',
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderWidth: 1,
      borderColor: 'rgba(255,122,51,0.2)',
    },
    watchBannerLeft: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginBottom: 4,
    },
    watchBannerLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: COLORS.primary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    watchBannerStats: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    watchBannerValue: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.text,
    },
    watchBannerSep: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
    },

    // Card (shared)
    card: {
      marginHorizontal: SPACING.xxl,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.xl,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: SPACING.md,
    },
    cardTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitleWithIcon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    cardTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    // Weekly card with background image
    weeklyCardWrapper: {
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    weeklyCardBg: {
      width: '100%',
    },
    weeklyCardBgImage: {
      borderRadius: BORDER_RADIUS.lg,
    },
    weeklyCardOverlay: {
      padding: SPACING.xl,
      gap: SPACING.md,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    weeklyCardTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    weeklyChangeText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    heroDistanceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    weeklyHeroDistance: {
      fontSize: 48,
      fontWeight: '900',
      color: '#FFFFFF',
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    weeklyHeroUnit: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.7)',
    },
    weeklyMiniStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    weeklyMiniStatItem: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    weeklyMiniStatValue: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: '#FFFFFF',
      fontVariant: ['tabular-nums'],
    },
    weeklyMiniStatLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: 'rgba(255,255,255,0.6)',
    },
    weeklyMiniStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },

    // Announcements
    announcementsSection: {
      marginBottom: SPACING.md,
    },
    announcementsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.xxl,
      marginBottom: SPACING.sm,
    },
    announcementsTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    announcementsScroll: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.sm,
    },
    announcementCard: {
      width: 200,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    announcementImage: {
      width: 200,
      height: 120,
    },
    announcementImageStyle: {
      borderRadius: BORDER_RADIUS.lg - 1,
    },
    announcementImageOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: SPACING.md,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    announcementTypeBadge: {
      alignSelf: 'flex-start',
      backgroundColor: c.primary,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 4,
    },
    announcementTypeBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#FFF',
    },
    announcementTitleOnImage: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: '#FFFFFF',
      lineHeight: 18,
    },
    announcementNoImage: {
      padding: SPACING.lg,
      height: 120,
      justifyContent: 'center',
      gap: 4,
    },
    announcementTitleNoImage: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: c.text,
      lineHeight: 18,
    },
    announcementContent: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textSecondary,
    },

    // Favorite courses
    favSection: {
      marginBottom: SPACING.md,
    },
    favHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      marginBottom: SPACING.sm,
    },
    favTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    favScroll: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.sm,
    },
    favCard: {
      width: 160,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    favThumbnail: {
      width: 160,
      height: 90,
    },
    favThumbnailPlaceholder: {
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    favInfo: {
      padding: SPACING.sm + 2,
      gap: 2,
    },
    favName: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
    },
    favMeta: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Crew raid cards
    raidCard: {
      width: 170,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.md,
      gap: SPACING.xs,
    },
    raidCardCrewName: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: c.text,
    },
    raidCardCourseName: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    raidCardProgressBg: {
      height: 6,
      backgroundColor: c.surface,
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: SPACING.xs,
    },
    raidCardProgressFill: {
      height: '100%',
      backgroundColor: c.primary,
      borderRadius: 3,
    },
    raidCardProgressText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textSecondary,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },

    // See all link
    seeAllText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.primary,
    },

    // Recent run cards
    recentRunCard: { paddingVertical: SPACING.sm },
    recentRunCardBorder: { borderTopWidth: 1, borderTopColor: c.divider },
    recentRunInner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    recentRunIconPlaceholder: {
      width: 56, height: 56, borderRadius: 8,
      backgroundColor: c.surface,
      justifyContent: 'center', alignItems: 'center',
    },
    recentRunBody: { flex: 1, gap: 3 },
    recentRunHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    recentRunTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: c.text, flex: 1 },
    recentRunDate: {
      fontSize: FONT_SIZES.xs, fontWeight: '500', color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    recentRunTimeLabel: { fontSize: FONT_SIZES.xs, color: c.textSecondary, fontWeight: '500' },
    recentRunStatsRow: {
      flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs, gap: SPACING.sm,
    },
    recentRunStatText: {
      fontSize: FONT_SIZES.sm, fontWeight: '700', color: c.text,
      fontVariant: ['tabular-nums'],
    },
    recentRunDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.textTertiary },

    // Empty state
    emptyState: {
      alignItems: 'center',
      paddingVertical: SPACING.xxl,
      gap: SPACING.sm,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textSecondary,
    },
    emptySubText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '400',
      color: c.textTertiary,
    },

    // CTA Button
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginHorizontal: SPACING.xxl,
      marginBottom: SPACING.md,
      paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: c.primary,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
    ctaButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },

    // Friends running banner
    friendsRunningCard: {
      marginHorizontal: SPACING.xxl,
      marginTop: SPACING.lg,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: SPACING.md,
    },
    friendsRunningHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
    },
    friendsRunningDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#34C759',
    },
    friendsRunningTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
    },
    friendsRunningScroll: {
      paddingHorizontal: SPACING.md,
      gap: SPACING.md,
    },
    friendsRunningChip: {
      alignItems: 'center',
      width: 56,
    },
    friendsRunningName: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text,
      marginTop: 4,
      textAlign: 'center',
      width: 56,
    },
    friendsRunningCourse: {
      fontSize: 10,
      fontWeight: '500',
      color: COLORS.primary,
      marginTop: 1,
      textAlign: 'center',
      width: 56,
    },
    friendsRunningFree: {
      fontSize: 10,
      fontWeight: '500',
      color: c.textTertiary,
      marginTop: 1,
      textAlign: 'center',
      width: 56,
    },
    friendsRunningEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
    },
    friendsRunningEmptyText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },
    friendsRunningBadge: {
      position: 'absolute',
      bottom: -2,
      left: -2,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: COLORS.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: '#FFF',
    },

    // Challenge cards
    challengeCard: {
      width: 170,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.md,
      gap: SPACING.xs,
    },
    challengeCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    challengeIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${COLORS.primary}18`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    challengeJoinedBadge: {
      backgroundColor: `${COLORS.primary}20`,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    challengeJoinedText: {
      fontSize: 10,
      fontWeight: '700',
      color: COLORS.primary,
    },
    challengeCardTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
      marginTop: SPACING.xs,
      lineHeight: 18,
    },
    challengeCardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.xs,
    },
    challengeCardMetaText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Group Run cards
    groupRunCard: {
      width: 190,
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.md,
      gap: SPACING.xs,
    },
    groupRunCourseName: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: COLORS.primary,
    },
    groupRunTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
    },
    groupRunMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.xs,
    },
    groupRunStatusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(52,199,89,0.12)',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    groupRunStatusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#34C759',
    },
    groupRunStatusText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#34C759',
    },
    groupRunMemberText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    bottomSpacer: {
      height: SPACING.xxl,
    },
  });
