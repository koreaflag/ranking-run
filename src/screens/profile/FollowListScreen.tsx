import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { MyPageStackParamList } from '../../types/navigation';
import type { FollowListItem } from '../../types/api';
import { userService } from '../../services/userService';
import { useAuthStore } from '../../stores/authStore';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import { ListEndIndicator } from '../../components/common/Skeleton';

type Nav = NativeStackNavigationProp<MyPageStackParamList, 'FollowList'>;
type Route = RouteProp<MyPageStackParamList, 'FollowList'>;

const PAGE_SIZE = 20;

export default function FollowListScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useAuthStore((s) => s.user);

  const { userId, type } = route.params;
  const isFollowersTab = type === 'followers';

  const [items, setItems] = useState<FollowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [togglingFollow, setTogglingFollow] = useState<Set<string>>(new Set());

  const loadPage = useCallback(async (pageNum: number, reset: boolean) => {
    try {
      const res = isFollowersTab
        ? await userService.getFollowers(userId, pageNum, PAGE_SIZE)
        : await userService.getFollowing(userId, pageNum, PAGE_SIZE);

      if (reset) {
        setItems(res.data);
      } else {
        setItems((prev) => [...prev, ...res.data]);
      }
      setHasMore(res.data.length >= PAGE_SIZE);
    } catch {
      // silent
    }
  }, [userId, isFollowersTab]);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadPage(0, true);

      // Load current user's following to know who we already follow
      if (currentUser) {
        try {
          const myFollowing = await userService.getFollowing(currentUser.id, 0, 100);
          setFollowingSet(new Set(myFollowing.data.map((f) => f.user.id)));
        } catch {
          // ignore
        }
      }
      setLoading(false);
    })();
  }, [loadPage, currentUser]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    await loadPage(nextPage, false);
    setPage(nextPage);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, loadPage]);

  const handleToggleFollow = useCallback(async (targetUserId: string) => {
    if (togglingFollow.has(targetUserId)) return;
    setTogglingFollow((prev) => new Set(prev).add(targetUserId));
    try {
      if (followingSet.has(targetUserId)) {
        await userService.unfollowUser(targetUserId);
        setFollowingSet((prev) => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
      } else {
        await userService.followUser(targetUserId);
        setFollowingSet((prev) => new Set(prev).add(targetUserId));
      }
    } catch {
      // silent
    } finally {
      setTogglingFollow((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
    }
  }, [followingSet, togglingFollow]);

  const renderItem = useCallback(({ item }: { item: FollowListItem }) => {
    const isMe = currentUser?.id === item.user.id;
    const isFollowing = followingSet.has(item.user.id);
    const isToggling = togglingFollow.has(item.user.id);
    const initial = (item.user.nickname ?? '?').charAt(0).toUpperCase();

    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => navigation.navigate('UserProfile', { userId: item.user.id })}
        activeOpacity={0.7}
      >
        {item.user.avatar_url ? (
          <Image source={{ uri: item.user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.nickname} numberOfLines={1}>
            {item.user.nickname ?? t('profile.defaultNickname')}
          </Text>
        </View>
        {!isMe && (
          <TouchableOpacity
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
            onPress={() => handleToggleFollow(item.user.id)}
            activeOpacity={0.7}
            disabled={isToggling}
          >
            {isToggling ? (
              <ActivityIndicator size="small" color={isFollowing ? colors.textSecondary : '#FFFFFF'} />
            ) : (
              <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                {isFollowing ? t('profile.unfollow') : t('profile.follow')}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [currentUser, followingSet, togglingFollow, handleToggleFollow, navigation, styles, colors, t]);

  const headerTitle = isFollowersTab ? t('profile.followers') : t('profile.following');

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {isFollowersTab ? t('social.noFollowers') : t('social.noFollowing')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            extraData={followingSet}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : !hasMore && items.length > 0 ? (
                <ListEndIndicator text={t('common.endOfList')} />
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
    },

    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.md,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.textTertiary,
    },

    listContent: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: 40,
    },

    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      gap: SPACING.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },

    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    avatarPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitial: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.textSecondary,
    },

    userInfo: {
      flex: 1,
    },
    nickname: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },

    followBtn: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.primary,
    },
    followBtnActive: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    followBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    followBtnTextActive: {
      color: c.textSecondary,
    },

    footerLoader: {
      paddingVertical: SPACING.lg,
      alignItems: 'center',
    },
  });
