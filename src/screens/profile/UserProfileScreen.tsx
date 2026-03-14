import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Image,
  Linking,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../../components/common/ScreenHeader';
import CourseThumbnailMap from '../../components/course/CourseThumbnailMap';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { userService } from '../../services/userService';
import { friendService } from '../../services/friendService';
import type { ThemeColors } from '../../utils/constants';
import type { CourseStackParamList } from '../../types/navigation';
import type { PublicProfile, PublicProfileCourse, PublicProfileRanking, GearItem, FriendshipStatusResponse } from '../../types/api';
import { formatDistance, formatDuration, formatNumber, metersToKm } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import RunnerLevelBadge from '../../components/runner/RunnerLevelBadge';
import { getRunnerTier, getRunnerXpProgress } from '../../utils/runnerLevelConfig';

type ProfileRoute = RouteProp<CourseStackParamList, 'UserProfile'>;
type ProfileNavigation = NativeStackNavigationProp<CourseStackParamList>;

export default function UserProfileScreen() {
  const navigation = useNavigation<ProfileNavigation>();
  const route = useRoute<ProfileRoute>();
  const { userId } = route.params;

  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatusResponse | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  const isOwnProfile = currentUser?.id === userId;
  const followScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await userService.getPublicProfile(userId);
      setProfile(data);
      setIsFollowing(data.is_following);
      setFollowersCount(data.followers_count);
      // Load friendship status
      if (currentUser?.id && currentUser.id !== userId) {
        try {
          const fs = await friendService.getFriendshipStatus(userId);
          setFriendshipStatus(fs);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('profile.loadError');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleFollow = useCallback(async () => {
    if (!profile) return;

    // Optimistic update
    const wasFollowing = isFollowing;
    const prevCount = followersCount;
    setIsFollowing(!wasFollowing);
    setFollowersCount(wasFollowing ? Math.max(0, prevCount - 1) : prevCount + 1);

    try {
      if (wasFollowing) {
        await userService.unfollowUser(userId);
      } else {
        await userService.followUser(userId);
      }
    } catch {
      // Keep optimistic state — server will sync later
    }
  }, [profile, isFollowing, followersCount, userId]);

  const handleFriendAction = useCallback(async () => {
    if (!friendshipStatus || friendActionLoading) return;
    setFriendActionLoading(true);
    try {
      if (friendshipStatus.request_status === null || friendshipStatus.request_status === undefined) {
        // Send friend request
        await friendService.sendRequest(userId);
        setFriendshipStatus({ ...friendshipStatus, request_status: 'pending_sent' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (friendshipStatus.request_status === 'pending_received') {
        // Accept the request — need to find the request ID
        const received = await friendService.getReceivedRequests(0, 50);
        const req = received.data.find((r) => r.requester.id === userId);
        if (req) {
          await friendService.acceptRequest(req.id);
          setFriendshipStatus({ ...friendshipStatus, is_friend: true, request_status: 'accepted' });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch {
      // ignore
    } finally {
      setFriendActionLoading(false);
    }
  }, [friendshipStatus, friendActionLoading, userId]);

  const handleOpenInstagram = useCallback((username: string) => {
    Linking.openURL(`https://instagram.com/${username}`);
  }, []);

  const handleNavigateToCourse = useCallback((courseId: string) => {
    navigation.push('CourseDetail', { courseId });
  }, [navigation]);

  const getInitials = (nickname: string | null): string => {
    if (!nickname) return '?';
    return nickname.charAt(0).toUpperCase();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile || error) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            {error || t('profile.loadDetailError')}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadProfile}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Player Card — Hero Style */}
        {(() => {
          const lv = profile.runner_level ?? 1;
          const tier = getRunnerTier(lv);
          const xp = getRunnerXpProgress(lv, profile.total_distance_meters ?? 0);
          return (
        <>
        <View style={[styles.playerCard, { borderColor: tier.color + '30' }]}>
          {/* Tier accent stripe at top */}
          <View style={[styles.tierStripe, { backgroundColor: tier.color }]} />

          {/* Profile header — Instagram style */}
          <View style={styles.playerCardTop}>
            {/* Avatar with tier-colored ring */}
            <View style={[styles.avatarRing, { borderColor: tier.color + '60' }]}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarCircle, { backgroundColor: tier.color + '20', borderColor: tier.color + '40' }]}>
                  <Text style={[styles.avatarInitials, { color: tier.color }]}>
                    {getInitials(profile.nickname)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.playerCardStatsRow}>
              <View style={styles.profileStatItem}>
                <Text style={styles.profileStatValue}>{formatNumber(followersCount)}</Text>
                <Text style={styles.profileStatLabel}>{t('profile.followers')}</Text>
              </View>
              <View style={styles.profileStatItem}>
                <Text style={styles.profileStatValue}>{formatNumber(profile.following_count)}</Text>
                <Text style={styles.profileStatLabel}>{t('profile.following')}</Text>
              </View>
              <View style={styles.profileStatItem}>
                <Text style={styles.profileStatValue}>{formatNumber(profile.total_likes_received ?? 0)}</Text>
                <Text style={styles.profileStatLabel}>{t('profile.likes')}</Text>
              </View>
            </View>
          </View>
          {/* Identity + Meta */}
          <View style={styles.playerCardMeta}>
            <View style={styles.nameRow}>
              <Text style={styles.playerCardName}>{profile.nickname ?? t('profile.defaultNickname')}</Text>
              <RunnerLevelBadge level={profile.runner_level} size="sm" />
            </View>
            {profile.crew_name ? (
              <View style={styles.crewTag}>
                <Ionicons name="people" size={11} color={colors.primary} />
                <Text style={styles.crewTagText}>{profile.crew_name}</Text>
              </View>
            ) : null}
            {profile.bio ? (
              <Text style={styles.playerCardBio} numberOfLines={2}>{profile.bio}</Text>
            ) : null}
            {profile.instagram_username ? (
              <TouchableOpacity
                style={styles.instagramRow}
                onPress={() => handleOpenInstagram(profile.instagram_username!)}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-instagram" size={13} color={colors.textTertiary} />
                <Text style={styles.instagramText}>@{profile.instagram_username}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Action Buttons — Instagram style (inside card) */}
          {!isOwnProfile && (
            <View style={styles.cardActionRow}>
              <Animated.View style={[{ flex: 1 }, { transform: [{ scale: followScale }] }]}>
                <TouchableOpacity
                  style={[
                    styles.cardActionButton,
                    !isFollowing && styles.cardActionButtonPrimary,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Animated.sequence([
                      Animated.spring(followScale, { toValue: 0.9, useNativeDriver: true, speed: 50 }),
                      Animated.spring(followScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
                    ]).start();
                    handleToggleFollow();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cardActionButtonText, !isFollowing && styles.cardActionButtonTextPrimary]}>
                    {isFollowing ? t('profile.unfollow') : t('profile.follow')}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
              {friendshipStatus && (
                <TouchableOpacity
                  style={[
                    styles.cardActionButton,
                    friendshipStatus.is_friend && styles.cardActionButtonSuccess,
                    (friendshipStatus.request_status === null || friendshipStatus.request_status === undefined) && styles.cardActionButtonPrimary,
                  ]}
                  onPress={handleFriendAction}
                  activeOpacity={0.7}
                  disabled={
                    friendActionLoading ||
                    friendshipStatus.is_friend ||
                    friendshipStatus.request_status === 'pending_sent'
                  }
                >
                  {friendActionLoading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={[
                      styles.cardActionButtonText,
                      (friendshipStatus.request_status === null || friendshipStatus.request_status === undefined) && styles.cardActionButtonTextPrimary,
                      friendshipStatus.is_friend && { color: colors.success },
                    ]}>
                      {friendshipStatus.is_friend
                        ? t('friend.friends')
                        : friendshipStatus.request_status === 'pending_sent'
                        ? t('friend.requested')
                        : friendshipStatus.request_status === 'pending_received'
                        ? t('friend.acceptRequest')
                        : t('friend.addFriend')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

        </View>

        {/* Runner Level Banner — matches MyPage style */}
        <View style={[styles.runnerBanner, { backgroundColor: tier.bgColor, borderColor: tier.color + '30' }]}>
          <View style={styles.runnerBannerText}>
            <View style={styles.runnerBannerTitleRow}>
              <Text style={[styles.runnerBannerTitle, { color: tier.textColor }]}>{t(tier.nameKey)}</Text>
              <Text style={[styles.runnerBannerLv, { color: tier.color }]}>Lv.{lv}</Text>
            </View>
            <View style={styles.xpBarRow}>
              <View style={[styles.xpBarTrack, { backgroundColor: tier.color + '30' }]}>
                <View style={[styles.xpBarFill, { width: `${Math.round(xp.ratio * 100)}%`, backgroundColor: tier.color }]} />
              </View>
              <Text style={[styles.xpBarLabel, { color: tier.textColor }]}>
                {xp.isMax ? 'MAX' : `${metersToKm(xp.current, 1)} / ${metersToKm(xp.next, 0)}km`}
              </Text>
            </View>
          </View>
        </View>

        {/* Activity stats */}
        <View style={styles.activityRow}>
          <View style={styles.activityItem}>
            <Ionicons name="walk-outline" size={14} color={tier.color} />
            <Text style={styles.activityValue}>{formatDistance(profile.total_distance_meters)}</Text>
          </View>
          <View style={styles.activityDot} />
          <View style={styles.activityItem}>
            <Ionicons name="fitness-outline" size={14} color={tier.color} />
            <Text style={styles.activityValue}>{formatNumber(profile.total_runs)}</Text>
            <Text style={styles.activityLabel}>{t('profile.totalRuns')}</Text>
          </View>
        </View>
        </>
          );
        })()}

        {/* Gear Section */}
        {(profile.primary_gear || (profile.gear_items && profile.gear_items.length > 0)) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.gear')}</Text>
            <View style={styles.gearList}>
              {/* Primary gear (featured) */}
              {profile.primary_gear && (
                <GearCard key={profile.primary_gear.id} gear={profile.primary_gear} colors={colors} featured />
              )}
              {/* Other gear */}
              {(profile.gear_items ?? [])
                .filter((g) => !g.is_primary)
                .map((gear) => (
                  <GearCard key={gear.id} gear={gear} colors={colors} />
                ))}
            </View>
          </View>
        )}

        {/* Courses Section */}
        {profile.courses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.courses')}</Text>
            <View style={styles.courseList}>
              {profile.courses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  colors={colors}
                  onPress={() => handleNavigateToCourse(course.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Top Rankings Section */}
        {profile.top_rankings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.rankings')}</Text>
            <View style={styles.rankingList}>
              {profile.top_rankings.map((ranking) => (
                <RankingCard
                  key={`${ranking.course_id}-${ranking.rank}`}
                  ranking={ranking}
                  colors={colors}
                  onPress={() => handleNavigateToCourse(ranking.course_id)}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Sub-components ----

const CourseCard = React.memo(function CourseCard({
  course,
  colors,
  onPress,
}: {
  course: PublicProfileCourse;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.courseCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {course.route_preview && course.route_preview.length >= 2 ? (
        <CourseThumbnailMap routePreview={course.route_preview} width={56} height={56} borderRadius={8} />
      ) : (
        <View style={[styles.courseThumbnail, styles.courseThumbnailFallback]}>
          <Ionicons name="map-outline" size={24} color={colors.textTertiary} />
        </View>
      )}
      <View style={styles.courseInfo}>
        <Text style={styles.courseTitle} numberOfLines={1}>{course.title}</Text>
        <Text style={styles.courseDistance}>{formatDistance(course.distance_meters)}</Text>
        <View style={styles.courseMeta}>
          <View style={styles.courseMetaItem}>
            <Ionicons name="walk-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.courseMetaText}>{formatNumber(course.total_runs)}</Text>
          </View>
          <View style={styles.courseMetaItem}>
            <Ionicons name="thumbs-up-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.courseMetaText}>{formatNumber(course.like_count)}</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
});

const RankingCard = React.memo(function RankingCard({
  ranking,
  colors,
  onPress,
}: {
  ranking: PublicProfileRanking;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const RANK_COLORS = [colors.gold, colors.silver, colors.bronze];
  const isTop3 = ranking.rank <= 3;
  const badgeColor = isTop3 ? RANK_COLORS[ranking.rank - 1] : colors.surfaceLight;

  return (
    <TouchableOpacity
      style={styles.rankingCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rankBadge, { backgroundColor: badgeColor }]}>
        <Text style={[styles.rankNumber, isTop3 ? styles.rankNumberTop3 : styles.rankNumberDefault]}>
          {ranking.rank}
        </Text>
      </View>
      <View style={styles.rankingInfo}>
        <Text style={styles.rankingCourseTitle} numberOfLines={1}>
          {ranking.course_title}
        </Text>
        <Text style={styles.rankingTime}>
          {formatDuration(ranking.best_duration_seconds)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
});

const GearCard = React.memo(function GearCard({
  gear,
  colors,
  featured = false,
}: {
  gear: GearItem;
  colors: ThemeColors;
  featured?: boolean;
}) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (featured) {
    return (
      <View style={styles.gearCardFeatured}>
        <View style={styles.gearIconCircle}>
          <Ionicons name="footsteps-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.gearInfoFeatured}>
          <View style={styles.gearNameRow}>
            <Text style={styles.gearBrandFeatured}>{gear.brand}</Text>
            <View style={styles.primaryBadge}>
              <Text style={styles.primaryBadgeText}>{t('profile.primaryGear')}</Text>
            </View>
          </View>
          <Text style={styles.gearModelFeatured}>{gear.model_name}</Text>
          <Text style={styles.gearDistanceFeatured}>
            {formatDistance(gear.total_distance_meters)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.gearCardCompact}>
      <Ionicons name="footsteps-outline" size={16} color={colors.textTertiary} />
      <Text style={styles.gearBrandCompact}>{gear.brand}</Text>
      <Text style={styles.gearModelCompact} numberOfLines={1}>
        {gear.model_name}
      </Text>
      <Text style={styles.gearDistanceCompact}>
        {formatDistance(gear.total_distance_meters)}
      </Text>
    </View>
  );
});

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingBottom: SPACING.xxxl,
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

    // -- Profile Section (flat — no card, Instagram style) --
    playerCard: {
      // Flat layout, no card container
    },
    tierStripe: {
      height: 3,
      width: '100%',
      marginBottom: 4,
    },
    playerCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 12,
      gap: 28,
    },
    playerCardStatsRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    nameRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    playerCardName: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      letterSpacing: -0.3,
    },
    avatarRing: {
      width: 92,
      height: 92,
      borderRadius: 46,
      borderWidth: 3,
      padding: 3,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarImage: {
      width: 80,
      height: 80,
      borderRadius: 40,
    },
    avatarInitials: {
      fontSize: FONT_SIZES.xxl,
      fontWeight: '800',
    },
    runnerBanner: {
      marginHorizontal: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    runnerBannerText: {
      flex: 1, gap: 4,
    },
    runnerBannerTitleRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    runnerBannerTitle: {
      fontSize: 14, fontWeight: '800',
    },
    runnerBannerLv: {
      fontSize: 12, fontWeight: '900',
    },
    xpBarRow: {
      gap: 4, marginTop: 2,
    },
    xpBarTrack: {
      height: 6, borderRadius: 3, overflow: 'hidden' as const,
    },
    xpBarFill: {
      height: '100%' as any, borderRadius: 3,
    },
    xpBarLabel: {
      fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] as const,
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.md,
      paddingHorizontal: 16,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
    },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    activityValue: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'] as const,
    },
    activityLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    activityDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: c.textTertiary,
    },
    playerCardMeta: {
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: 0,
      gap: 4,
    },
    cardActionRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    cardActionButton: {
      flex: 1,
      height: 34,
      backgroundColor: c.surfaceLight,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardActionButtonPrimary: {
      backgroundColor: c.primary,
    },
    cardActionButtonSuccess: {
      backgroundColor: c.surfaceLight,
    },
    cardActionButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    cardActionButtonTextPrimary: {
      color: c.white,
    },
    playerCardBio: {
      fontSize: 14,
      color: c.text,
      lineHeight: 20,
    },
    profileStatItem: {
      alignItems: 'center',
      gap: 2,
      flex: 1,
    },
    profileStatValue: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    profileStatLabel: {
      fontSize: 13,
      fontWeight: '400',
      color: c.textSecondary,
    },
    instagramRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      marginTop: 2,
    },
    instagramText: {
      fontSize: 14,
      color: c.primary,
      fontWeight: '600',
    },
    crewTag: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 3,
      backgroundColor: c.primary + '15',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    crewTagText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
    },

    // -- Action row --
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginHorizontal: SPACING.xxl,
    },
    followButton: {
      backgroundColor: c.primary,
      paddingVertical: SPACING.sm + 2,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center',
    },
    followButtonActive: {
      backgroundColor: c.transparent,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    followButtonText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.white,
    },
    followButtonTextActive: {
      color: c.textSecondary,
    },
    friendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: c.primary,
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.lg,
      borderRadius: BORDER_RADIUS.lg,
    },
    friendButtonActive: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    friendButtonPending: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    friendButtonText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.white,
    },

    // -- Section --
    section: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.md,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },

    // -- Course list --
    courseList: {
      gap: SPACING.sm,
    },
    courseCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    courseThumbnail: {
      width: 56,
      height: 56,
      borderRadius: BORDER_RADIUS.sm,
    },
    courseThumbnailFallback: {
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    courseInfo: {
      flex: 1,
      gap: 2,
    },
    courseTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    courseDistance: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.primary,
    },
    courseMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginTop: 2,
    },
    courseMetaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    courseMetaText: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },

    // -- Ranking list --
    rankingList: {
      gap: SPACING.sm,
    },
    rankingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
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
    rankingInfo: {
      flex: 1,
      gap: 2,
    },
    rankingCourseTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    rankingTime: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.primary,
      fontVariant: ['tabular-nums'],
    },

    // -- Gear --
    gearList: {
      gap: SPACING.sm,
    },
    gearCardFeatured: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.lg,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    gearIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gearInfoFeatured: {
      flex: 1,
      gap: 2,
    },
    gearNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    gearBrandFeatured: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    primaryBadge: {
      backgroundColor: c.primary,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    primaryBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: c.white,
      letterSpacing: 0.5,
    },
    gearModelFeatured: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.text,
    },
    gearDistanceFeatured: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    gearCardCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      gap: SPACING.sm,
    },
    gearBrandCompact: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },
    gearModelCompact: {
      flex: 1,
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.text,
    },
    gearDistanceCompact: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
      fontVariant: ['tabular-nums'],
    },
  });
