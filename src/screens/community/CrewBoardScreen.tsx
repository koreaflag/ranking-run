import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { CommunityStackParamList } from '../../types/navigation';
import type { CommunityPostItem } from '../../types/api';
import { communityService } from '../../services/communityService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING } from '../../utils/constants';
import { ListEndIndicator } from '../../components/common/Skeleton';
import { formatRelativeTime } from '../../utils/format';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'CrewBoard'>;
type Route = RouteProp<CommunityStackParamList, 'CrewBoard'>;

const PER_PAGE = 20;
const AVATAR_SIZE = 36;

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
          activeOpacity={0.6}
        >
          {/* Author row */}
          <View style={styles.authorRow}>
            {post.author.avatar_url ? (
              <Image source={{ uri: post.author.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}
            <Text style={styles.nickname} numberOfLines={1}>
              {post.author.nickname ?? '?'}
            </Text>
            {post.author.crew_grade_level != null && post.author.crew_grade_level >= 2 && (
              <GradeBadge level={post.author.crew_grade_level} />
            )}
            <Text style={styles.dot}>&middot;</Text>
            <Text style={styles.timeText}>{formatRelativeTime(post.created_at)}</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.textTertiary} />
          </View>

          {/* Body text */}
          <Text style={styles.bodyText} numberOfLines={4}>
            {post.title ? (
              <>
                <Text style={styles.titleInline}>{post.title}  </Text>
                {post.content}
              </>
            ) : (
              post.content
            )}
          </Text>

          {/* Image preview */}
          {(post.image_urls?.length ?? 0) > 1 ? (
            <ImageCarousel imageUrls={post.image_urls!} imageStyle={styles.postImage} />
          ) : post.image_url ? (
            <Image
              source={{ uri: post.image_url }}
              style={styles.postImage}
              resizeMode="cover"
            />
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <View style={styles.actionItem}>
              <Ionicons
                name={post.is_liked ? 'heart' : 'heart-outline'}
                size={18}
                color={post.is_liked ? '#EF4444' : colors.textTertiary}
              />
              {post.like_count > 0 && (
                <Text style={[styles.actionText, post.is_liked && { color: '#EF4444' }]}>
                  {post.like_count}
                </Text>
              )}
            </View>
            <View style={styles.actionItem}>
              <Ionicons name="chatbubble-outline" size={16} color={colors.textTertiary} />
              {post.comment_count > 0 && (
                <Text style={styles.actionText}>{post.comment_count}</Text>
              )}
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

  const hasMorePosts = posts.length < totalCount;

  const ListFooter = useMemo(
    () =>
      loadingMore ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : !hasMorePosts && posts.length > 0 ? (
        <ListEndIndicator text={t('common.endOfList')} />
      ) : null,
    [loadingMore, hasMorePosts, posts.length, colors, styles, t],
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
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            initialNumToRender={10}
            windowSize={10}
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

// ---- Grade Badge ----

const GRADE_STYLES: Record<number, { bg: string; text: string; label: string }> = {
  5: { bg: '#FF7A33', text: '#FFFFFF', label: 'crew.gradeOwner' },
  4: { bg: '#3B82F6', text: '#FFFFFF', label: 'crew.gradeViceLeader' },
  3: { bg: '#10B981', text: '#FFFFFF', label: 'crew.gradeCoach' },
  2: { bg: '#6B7280', text: '#FFFFFF', label: 'crew.gradeRegular' },
};

function GradeBadge({ level }: { level: number }) {
  const { t } = useTranslation();
  const config = GRADE_STYLES[level];
  if (!config) return null;
  return (
    <View style={{ backgroundColor: config.bg + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: config.bg }}>
        {t(config.label)}
      </Text>
    </View>
  );
}

// ---- Image Carousel ----

const CARD_PADDING = SPACING.lg * 2; // left + right padding in postCard
const CARD_BORDER = 2; // borderWidth * 2
const CAROUSEL_WIDTH = Dimensions.get('window').width - SPACING.lg * 2 - CARD_PADDING - CARD_BORDER;

function ImageCarousel({ imageUrls, imageStyle }: { imageUrls: string[]; imageStyle: object }) {
  const colors = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_WIDTH);
          setActiveIndex(idx);
        }}
        style={{ width: CAROUSEL_WIDTH }}
      >
        {imageUrls.map((url, i) => (
          <Image
            key={i}
            source={{ uri: url }}
            style={[imageStyle, { width: CAROUSEL_WIDTH }]}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      {imageUrls.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: SPACING.xs }}>
          {imageUrls.map((_, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === activeIndex ? colors.primary : colors.textTertiary + '40',
              }}
            />
          ))}
        </View>
      )}
    </View>
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
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.sm,
    },

    // Card-style post
    postCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      gap: SPACING.sm,
    },

    // Author row
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
    },
    avatarPlaceholder: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '800',
      color: c.textSecondary,
    },
    nickname: {
      fontSize: FONT_SIZES.sm + 1,
      fontWeight: '700',
      color: c.text,
      flexShrink: 1,
    },
    dot: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
    },
    timeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    bodyText: {
      fontSize: FONT_SIZES.sm + 1,
      fontWeight: '400',
      color: c.text,
      lineHeight: 21,
    },
    titleInline: {
      fontWeight: '700',
    },

    postImage: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: 12,
      backgroundColor: c.surface,
    },

    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      paddingTop: 2,
    },
    actionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    actionText: {
      fontSize: FONT_SIZES.xs + 1,
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
      borderRadius: 20,
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
