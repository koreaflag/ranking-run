import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { CommunityStackParamList } from '../../types/navigation';
import type { CommunityPostItem } from '../../types/api';
import { communityService } from '../../services/communityService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CrewBoard'>;
type Route = RouteProp<CommunityStackParamList, 'CrewBoard'>;

const PER_PAGE = 20;

function formatTimeAgo(dateStr: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('format.justNow');
  if (mins < 60) return t('format.minutesAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('format.hoursAgo', { count: hrs });
  return t('format.daysAgo', { count: Math.floor(hrs / 24) });
}

export default function CrewBoardScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { crewId, crewName } = route.params;

  const [posts, setPosts] = useState<CommunityPostItem[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPosts = useCallback(
    async (p: number, refresh = false) => {
      try {
        const res = await communityService.getPosts({
          crew_id: crewId,
          page: p,
          per_page: PER_PAGE,
        });
        const items = Array.isArray(res?.data) ? res.data : [];
        setPosts((prev) => (refresh ? items : [...prev, ...items]));
        setTotalCount(res?.total_count ?? 0);
        setPage(p);
      } catch {
        if (refresh) {
          setPosts([]);
          setTotalCount(0);
        }
      } finally {
        setIsLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [crewId],
  );

  useEffect(() => {
    setIsLoading(true);
    loadPosts(0, true);
  }, [loadPosts]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadPosts(0, true);
  }, [loadPosts]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || posts.length >= totalCount) return;
    setLoadingMore(true);
    loadPosts(page + 1);
  }, [loadingMore, posts.length, totalCount, page, loadPosts]);

  const renderItem = useCallback(
    ({ item: post }: { item: CommunityPostItem }) => {
      const initial = (post.author.nickname ?? '?').charAt(0).toUpperCase();
      return (
        <TouchableOpacity
          style={styles.postCard}
          onPress={() => navigation.navigate('CommunityPostDetail', { postId: post.id })}
          activeOpacity={0.7}
        >
          <View style={styles.postHeader}>
            {post.author.avatar_url ? (
              <Image source={{ uri: post.author.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}
            <View style={styles.postHeaderText}>
              <Text style={styles.nickname} numberOfLines={1}>
                {post.author.nickname ?? '?'}
              </Text>
              <Text style={styles.timeText}>{formatTimeAgo(post.created_at, t)}</Text>
            </View>
          </View>
          <Text style={styles.postTitle} numberOfLines={2}>
            {post.title}
          </Text>
          <Text style={styles.postContent} numberOfLines={3}>
            {post.content}
          </Text>
          {post.image_url && (
            <Image source={{ uri: post.image_url }} style={styles.postImage} />
          )}
          <View style={styles.postActions}>
            <View style={styles.actionItem}>
              <Ionicons
                name={post.is_liked ? 'heart' : 'heart-outline'}
                size={15}
                color={post.is_liked ? '#EF4444' : colors.textTertiary}
              />
              <Text style={[styles.actionText, post.is_liked && { color: '#EF4444' }]}>
                {post.like_count}
              </Text>
            </View>
            <View style={styles.actionItem}>
              <Ionicons name="chatbubble-outline" size={15} color={colors.textTertiary} />
              <Text style={styles.actionText}>{post.comment_count}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [colors, navigation, styles, t],
  );

  const keyExtractor = useCallback((item: CommunityPostItem) => item.id, []);

  const ListEmpty = useMemo(
    () =>
      !isLoading ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>{t('social.noCrewPosts')}</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('CommunityPostCreate', { crewId })}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyBtnText}>{t('social.writeFirstPost')}</Text>
          </TouchableOpacity>
        </View>
      ) : null,
    [isLoading, colors, styles, t, navigation, crewId],
  );

  const ListFooter = useMemo(
    () =>
      loadingMore ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null,
    [loadingMore, colors, styles],
  );

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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {crewName} {t('social.crewBoard')}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('CommunityPostCreate', { crewId })}
            activeOpacity={0.6}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={posts}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={ListEmpty}
            ListFooterComponent={ListFooter}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
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

    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
    },
    headerTitle: {
      flex: 1,
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
      marginHorizontal: SPACING.md,
    },

    listContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.md,
    },

    // Post card
    postCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      gap: SPACING.sm,
    },
    postHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    avatarPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '800',
      color: c.textSecondary,
    },
    postHeaderText: {
      flex: 1,
      gap: 1,
    },
    nickname: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
    },
    timeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    postTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    postContent: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
      lineHeight: 20,
    },
    postImage: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: c.surface,
    },
    postActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      paddingTop: SPACING.xs,
    },
    actionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    actionText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // Empty
    emptyContainer: {
      alignItems: 'center',
      paddingTop: 80,
      gap: SPACING.md,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textTertiary,
      textAlign: 'center',
    },
    emptyBtn: {
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.primary + '15',
      marginTop: SPACING.sm,
    },
    emptyBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
    },

    footerLoader: {
      paddingVertical: SPACING.xl,
      alignItems: 'center',
    },
  });
