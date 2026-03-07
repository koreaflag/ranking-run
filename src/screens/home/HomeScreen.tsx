import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ImageBackground,
  Animated,
  Dimensions,
  NativeModules,
  Platform,
  Modal,
  RefreshControl,
  InteractionManager,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StatusBar,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import type { HomeStackParamList } from '../../types/navigation';
import type { WeeklySummary, RecentRun, AnnouncementItem, FavoriteCourseItem, CrewChallengeItem, CrewItem } from '../../types/api';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCourseStore } from '../../stores/courseStore';
import { userService } from '../../services/userService';
import { announcementService } from '../../services/announcementService';
import { crewChallengeService } from '../../services/crewChallengeService';
import { crewService } from '../../services/crewService';
import BlurredBackground from '../../components/common/BlurredBackground';
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

const heroImage = require('../../assets/home-hero.jpg');

// Module-level cache: survives tab switches (cleared on app restart)
let _cachedWeekly: WeeklySummary | null = null;
let _cachedRuns: RecentRun[] = [];
let _cachedAnnouncements: AnnouncementItem[] = [];
let _cachedRaids: Array<{ crew: CrewItem; raid: CrewChallengeItem }> = [];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [refreshing, setRefreshing] = useState(false);
  const favoriteCourses = useCourseStore((s) => s.favoriteCourses);
  const fetchFavoriteCourses = useCourseStore((s) => s.fetchFavoriteCourses);

  // Primary data: loads immediately (above the fold)
  const loadPrimaryData = useCallback(async () => {
    try {
      const [weekly, runs] = await Promise.all([
        userService.getWeeklySummary().catch(() => null),
        userService.getRecentRuns(3).catch(() => []),
        fetchFavoriteCourses().catch(() => {}),
      ]);
      setWeeklySummary(weekly); _cachedWeekly = weekly;
      setRecentRuns(runs); _cachedRuns = runs;
    } catch {
      // partial failures ok
    }
  }, [fetchFavoriteCourses]);

  // Secondary data: deferred (below the fold)
  const loadSecondaryData = useCallback(async () => {
    try {
      const [annRes, crews] = await Promise.all([
        announcementService.getAnnouncements(10).catch(() => ({ data: [] })),
        crewService.getMyCrews().catch((): CrewItem[] => []),
      ]);
      const ann = annRes.data ?? [];
      setAnnouncements(ann); _cachedAnnouncements = ann;
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPrimaryData(), loadSecondaryData()]);
    setRefreshing(false);
  }, [loadPrimaryData, loadSecondaryData]);

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
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoText}>RUNVS</Text>
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
          {/* Greeting */}
          <View style={styles.greetingSection}>
            <Text style={styles.greetingText}>
              {t('home.greeting', { name: nickname })}
            </Text>
            <Text style={styles.greetingSubText}>
              {todayDateLabel}
            </Text>
          </View>

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
                  onPress={() => navigation.navigate('CourseList')}
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
                    {course.thumbnail_url ? (
                      <Image source={{ uri: course.thumbnail_url }} style={styles.favThumbnail} />
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
                      <Text style={styles.raidCardCrewName} numberOfLines={1}>{crew.name}</Text>
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
                const runTitle = run.course?.title || t('home.freeRunning');

                return (
                  <TouchableOpacity
                    key={run.id}
                    style={[styles.recentRunCard, idx > 0 && styles.recentRunCardBorder]}
                    activeOpacity={0.7}
                  >
                    <View style={styles.recentRunInner}>
                      <View style={[styles.recentRunAccent, { backgroundColor: colors.primary }]} />
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

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>

      {/* Onboarding Guide */}
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
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingBottom: SPACING.xxxl,
    },

    // Header
    header: {
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
    recentRunInner: { flexDirection: 'row', gap: SPACING.md },
    recentRunAccent: { width: 3, borderRadius: 2, alignSelf: 'stretch' },
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

    bottomSpacer: {
      height: SPACING.xxl,
    },
  });
