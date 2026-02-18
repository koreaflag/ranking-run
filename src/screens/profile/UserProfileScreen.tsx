import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { userService } from '../../services/userService';
import type { ThemeColors } from '../../utils/constants';
import type { CourseStackParamList } from '../../types/navigation';
import type { PublicProfile, PublicProfileCourse, PublicProfileRanking } from '../../types/api';
import { formatDistance, formatDuration, formatNumber } from '../../utils/format';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';

type ProfileRoute = RouteProp<CourseStackParamList, 'UserProfile'>;
type ProfileNavigation = NativeStackNavigationProp<CourseStackParamList>;

export default function UserProfileScreen() {
  const navigation = useNavigation<ProfileNavigation>();
  const route = useRoute<ProfileRoute>();
  const { userId } = route.params;

  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);

  const isOwnProfile = currentUser?.id === userId;

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : '프로필을 불러올 수 없습니다.';
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
      // Revert on failure
      setIsFollowing(wasFollowing);
      setFollowersCount(prevCount);
    }
  }, [profile, isFollowing, followersCount, userId]);

  const handleOpenInstagram = useCallback((username: string) => {
    Linking.openURL(`https://instagram.com/${username}`);
  }, []);

  const handleNavigateToCourse = useCallback((courseId: string) => {
    navigation.navigate('CourseDetail', { courseId });
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
            {error || '프로필 정보를 불러올 수 없습니다.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadProfile}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>다시 시도</Text>
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
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {/* Avatar */}
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitials}>
                {getInitials(profile.nickname)}
              </Text>
            </View>
          )}

          {/* Nickname */}
          <Text style={styles.nickname}>{profile.nickname ?? '러너'}</Text>

          {/* Bio */}
          {profile.bio && (
            <Text style={styles.bio}>{profile.bio}</Text>
          )}

          {/* Follower / Following counts */}
          <View style={styles.followStats}>
            <View style={styles.followStatItem}>
              <Text style={styles.followStatValue}>{formatNumber(followersCount)}</Text>
              <Text style={styles.followStatLabel}>팔로워</Text>
            </View>
            <View style={styles.followStatDivider} />
            <View style={styles.followStatItem}>
              <Text style={styles.followStatValue}>{formatNumber(profile.following_count)}</Text>
              <Text style={styles.followStatLabel}>팔로잉</Text>
            </View>
          </View>

          {/* Action buttons row */}
          <View style={styles.actionRow}>
            {/* Follow/Unfollow button (hidden for own profile) */}
            {!isOwnProfile && (
              <TouchableOpacity
                style={[
                  styles.followButton,
                  isFollowing && styles.followButtonActive,
                ]}
                onPress={handleToggleFollow}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.followButtonText,
                    isFollowing && styles.followButtonTextActive,
                  ]}
                >
                  {isFollowing ? '팔로잉' : '팔로우'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Instagram button */}
            {profile.instagram_username && (
              <TouchableOpacity
                style={styles.instagramButton}
                onPress={() => handleOpenInstagram(profile.instagram_username!)}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-instagram" size={20} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Running Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.statsGrid}>
            <View style={styles.statsCell}>
              <Text style={styles.statsValue}>
                {formatDistance(profile.total_distance_meters)}
              </Text>
              <Text style={styles.statsLabel}>총 거리</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsCell}>
              <Text style={styles.statsValue}>
                {formatNumber(profile.total_runs)}
              </Text>
              <Text style={styles.statsLabel}>총 런닝</Text>
            </View>
          </View>
        </View>

        {/* Courses Section */}
        {profile.courses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>이 러너의 코스</Text>
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
            <Text style={styles.sectionTitle}>TOP 기록</Text>
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
      {course.thumbnail_url ? (
        <Image source={{ uri: course.thumbnail_url }} style={styles.courseThumbnail} />
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

    // -- Profile Header --
    profileHeader: {
      alignItems: 'center',
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.lg,
      gap: SPACING.md,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
    },
    avatarFallback: {
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      fontSize: FONT_SIZES.display,
      fontWeight: '800',
      color: c.white,
    },
    nickname: {
      fontSize: FONT_SIZES.title,
      fontWeight: '900',
      color: c.text,
      letterSpacing: -0.5,
    },
    bio: {
      fontSize: FONT_SIZES.md,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: SPACING.lg,
    },

    // -- Follow stats --
    followStats: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xl,
      marginTop: SPACING.xs,
    },
    followStatItem: {
      alignItems: 'center',
      gap: 2,
    },
    followStatValue: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    followStatLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    followStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: c.divider,
    },

    // -- Action row --
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginTop: SPACING.sm,
    },
    followButton: {
      backgroundColor: c.primary,
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.xxl,
      borderRadius: BORDER_RADIUS.lg,
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
    instagramButton: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // -- Running Stats Card --
    statsCard: {
      marginHorizontal: SPACING.xxl,
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING.md,
    },
    statsGrid: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statsCell: {
      flex: 1,
      alignItems: 'center',
      gap: SPACING.xs,
    },
    statsDivider: {
      width: 1,
      height: 32,
      backgroundColor: c.divider,
    },
    statsValue: {
      fontSize: FONT_SIZES.xl,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    statsLabel: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
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
  });
