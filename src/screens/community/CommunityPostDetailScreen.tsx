import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActionSheetIOS,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type {
  CommunityPostItem,
  CommunityCommentItem,
} from '../../types/api';
import { communityService } from '../../services/communityService';
import { crewService } from '../../services/crewService';
import { useAuthStore } from '../../stores/authStore';
import { FONT_SIZES, SPACING } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';
import { useToastStore } from '../../stores/toastStore';
import { formatRelativeTime } from '../../utils/format';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CommunityPostDetail'>;
type Route = RouteProp<HomeStackParamList, 'CommunityPostDetail'>;

const AVATAR_SIZE = 40;
const COMMENT_AVATAR_SIZE = 32;

const COMMENTS_PAGE_SIZE = 20;

export default function CommunityPostDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { postId } = route.params;
  const currentUser = useAuthStore((s) => s.user);

  const [post, setPost] = useState<CommunityPostItem | null>(null);
  const [comments, setComments] = useState<CommunityCommentItem[]>([]);
  const [commentPage, setCommentPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [totalComments, setTotalComments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const [crewRole, setCrewRole] = useState<string | null>(null);

  const isMine = !!currentUser && !!post && currentUser.id === post.author.id;
  const isCrewAdmin = crewRole === 'owner' || crewRole === 'admin';
  const canEdit = isMine;
  const canDelete = isMine || (!!post?.crew_id && isCrewAdmin);
  const showMenu = canEdit || canDelete;

  const fetchPost = useCallback(async () => {
    try {
      const data = await communityService.getPost(postId);
      setPost(data);
    } catch {
      // silent
    }
  }, [postId]);

  const fetchComments = useCallback(
    async (pageNum: number, reset: boolean) => {
      try {
        const res = await communityService.getComments(postId, {
          page: pageNum,
          per_page: COMMENTS_PAGE_SIZE,
        });
        if (reset) {
          setComments(res.data);
        } else {
          setComments((prev) => [...prev, ...res.data]);
        }
        setTotalComments(res.total_count);
        setHasMoreComments(res.data.length >= COMMENTS_PAGE_SIZE);
      } catch {
        // silent
      }
    },
    [postId],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchPost(), fetchComments(0, true)]);
      setLoading(false);
    })();
  }, [fetchPost, fetchComments]);

  useEffect(() => {
    if (!post?.crew_id || !currentUser) return;
    crewService
      .getCrew(post.crew_id)
      .then((crew) => setCrewRole(crew.my_role))
      .catch((err) => {
        console.warn('[CommunityPostDetail] 크루 정보 조회 실패:', err);
      });
  }, [post?.crew_id, currentUser]);

  const handleToggleLike = useCallback(async () => {
    if (!post) return;
    try {
      const res = await communityService.toggleLike(postId);
      setPost((prev) =>
        prev
          ? { ...prev, is_liked: res.is_liked, like_count: res.like_count }
          : prev,
      );
    } catch {
      useToastStore.getState().showToast('error', '좋아요 처리에 실패했습니다');
    }
  }, [post, postId]);

  const handleAddComment = useCallback(async () => {
    const trimmed = commentText.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const newComment = await communityService.createComment(postId, trimmed);
      setComments((prev) => [newComment, ...prev]);
      setTotalComments((prev) => prev + 1);
      setPost((prev) =>
        prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev,
      );
      setCommentText('');
      Keyboard.dismiss();
    } catch {
      useToastStore.getState().showToast('error', '댓글 작성에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  }, [commentText, submitting, postId]);

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      Alert.alert(t('community.deleteComment'), t('community.deleteCommentMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await communityService.deleteComment(postId, commentId);
              setComments((prev) => prev.filter((c) => c.id !== commentId));
              setTotalComments((prev) => Math.max(0, prev - 1));
              setPost((prev) =>
                prev
                  ? { ...prev, comment_count: Math.max(0, prev.comment_count - 1) }
                  : prev,
              );
            } catch {
              // silent
            }
          },
        },
      ]);
    },
    [postId, t],
  );

  const handleDeletePost = useCallback(async () => {
    if (!post) return;
    Alert.alert(t('community.deletePost'), t('community.deletePostMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await communityService.deletePost(post.id);
            navigation.goBack();
          } catch {
            Alert.alert(t('common.errorTitle'), t('community.deleteFailed'));
          }
        },
      },
    ]);
  }, [post, navigation, t]);

  const handleEditPost = useCallback(() => {
    if (!post) return;
    navigation.navigate('CommunityPostEdit', {
      postId: post.id,
      title: post.title ?? undefined,
      content: post.content,
      imageUrl: post.image_url ?? undefined,
      postType: post.post_type,
    });
  }, [post, navigation]);

  const handleMoreMenu = useCallback(() => {
    if (!post) return;

    const options: string[] = [];
    const actions: (() => void)[] = [];

    if (canEdit) {
      options.push(t('community.editPost'));
      actions.push(handleEditPost);
    }
    if (canDelete) {
      options.push(t('community.deletePost'));
      actions.push(handleDeletePost);
    }
    options.push(t('common.cancel'));

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: canDelete ? (canEdit ? 1 : 0) : undefined,
        },
        (idx) => {
          if (idx < actions.length) actions[idx]();
        },
      );
    } else {
      Alert.alert(
        undefined as unknown as string,
        undefined,
        [
          ...(canEdit ? [{ text: t('community.editPost'), onPress: handleEditPost }] : []),
          ...(canDelete ? [{ text: t('community.deletePost'), style: 'destructive' as const, onPress: handleDeletePost }] : []),
          { text: t('common.cancel'), style: 'cancel' as const },
        ],
      );
    }
  }, [post, canEdit, canDelete, handleEditPost, handleDeletePost, t]);

  const handleLoadMoreComments = useCallback(async () => {
    if (loadingMore || !hasMoreComments) return;
    setLoadingMore(true);
    const nextPage = commentPage + 1;
    await fetchComments(nextPage, false);
    setCommentPage(nextPage);
    setLoadingMore(false);
  }, [loadingMore, hasMoreComments, commentPage, fetchComments]);

  if (loading) {
    return (
      <BlurredBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('community.post')}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      </BlurredBackground>
    );
  }

  if (!post) {
    return (
      <BlurredBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('community.post')}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.centerLoader}>
            <Text style={styles.errorText}>{t('community.postNotFound')}</Text>
          </View>
        </SafeAreaView>
      </BlurredBackground>
    );
  }

  const authorInitial = (post.author.nickname ?? '?').charAt(0).toUpperCase();

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('community.post')}</Text>
            {showMenu ? (
              <TouchableOpacity
                onPress={handleMoreMenu}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 24 }} />
            )}
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Post card */}
            <View style={styles.postCard}>
              {/* Author row */}
              <View style={styles.authorRow}>
                {post.author.avatar_url ? (
                  <Image source={{ uri: post.author.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>{authorInitial}</Text>
                  </View>
                )}
                <View style={styles.authorInfo}>
                  <View style={styles.topRow}>
                    <Text style={styles.authorNickname} numberOfLines={1}>
                      {post.author.nickname ?? t('common.anonymous')}
                    </Text>
                    {post.author.crew_name && (
                      <View style={styles.crewTag}>
                        <Text style={styles.crewTagText}>{post.author.crew_name}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.timeText}>{formatRelativeTime(post.created_at)}</Text>
                </View>
              </View>

              {/* Title */}
              {!!post.title && (
                <Text style={styles.postTitle}>{post.title}</Text>
              )}

              {/* Content */}
              <Text style={styles.postContent}>{post.content}</Text>

              {/* Images */}
              {(post.image_urls?.length ?? 0) > 1 ? (
                <PostImageCarousel imageUrls={post.image_urls!} />
              ) : post.image_url ? (
                <Image
                  source={{ uri: post.image_url }}
                  style={styles.postImage}
                  resizeMode="contain"
                />
              ) : null}

              {/* Crew promo card */}
              {post.post_type === 'crew_promo' && post.event_title && (
                <View style={styles.crewPromoCard}>
                  <View style={styles.crewPromoLeft}>
                    <Ionicons name="people" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.crewPromoInfo}>
                    <Text style={styles.crewPromoTitle}>{post.event_title}</Text>
                    <Text style={styles.crewPromoSub}>{t('community.crewPromoPost')}</Text>
                  </View>
                  {post.event_id && (
                    <TouchableOpacity
                      style={styles.crewPromoBtn}
                      onPress={() => {
                        if (post.event_id) {
                          navigation.navigate('CrewDetail', { crewId: post.event_id });
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.crewPromoBtnText}>{t('community.viewCrew')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Actions: like + comment */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={handleToggleLike}
                  activeOpacity={0.6}
                >
                  <Ionicons
                    name={post.is_liked ? 'heart' : 'heart-outline'}
                    size={20}
                    color={post.is_liked ? '#EF4444' : colors.textTertiary}
                  />
                  {post.like_count > 0 && (
                    <Text style={[styles.actionText, post.is_liked && { color: '#EF4444' }]}>
                      {post.like_count}
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={styles.actionItem}>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.textTertiary} />
                  {post.comment_count > 0 && (
                    <Text style={styles.actionText}>{post.comment_count}</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Comments */}
            <View style={styles.commentsSection}>
              {comments.length === 0 ? (
                <View style={styles.noComments}>
                  <Text style={styles.noCommentsText}>{t('community.noComments')}</Text>
                </View>
              ) : (
                <>
                  {comments.map((comment, idx) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      canDelete={currentUser?.id === comment.author.id || isCrewAdmin}
                      onDelete={() => handleDeleteComment(comment.id)}
                      isLast={idx === comments.length - 1}
                    />
                  ))}
                  {hasMoreComments && (
                    <TouchableOpacity
                      style={styles.loadMoreBtn}
                      onPress={handleLoadMoreComments}
                      activeOpacity={0.6}
                    >
                      {loadingMore ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.loadMoreText}>{t('common.seeMore')}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </ScrollView>

          {/* Comment input */}
          <View style={styles.inputBar}>
            <TextInput
              ref={inputRef}
              style={styles.commentInput}
              placeholder={t('community.commentPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                !commentText.trim() && styles.sendButtonDisabled,
              ]}
              onPress={handleAddComment}
              activeOpacity={0.7}
              disabled={!commentText.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ---- Image carousel ----

const DETAIL_IMAGE_WIDTH = Dimensions.get('window').width - SPACING.xl * 2;

function PostImageCarousel({ imageUrls }: { imageUrls: string[] }) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / DETAIL_IMAGE_WIDTH);
          setActiveIndex(idx);
        }}
        style={{ width: DETAIL_IMAGE_WIDTH }}
      >
        {imageUrls.map((url, i) => (
          <Image
            key={i}
            source={{ uri: url }}
            style={[styles.postImage, { width: DETAIL_IMAGE_WIDTH }]}
            resizeMode="contain"
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

// ---- Comment sub-component ----

function CommentRow({
  comment,
  canDelete,
  onDelete,
}: {
  comment: CommunityCommentItem;
  canDelete: boolean;
  onDelete: () => void;
  isLast: boolean;
}) {
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const initial = (comment.author.nickname ?? '?').charAt(0).toUpperCase();

  return (
    <View style={styles.commentRow}>
      {comment.author.avatar_url ? (
        <Image source={{ uri: comment.author.avatar_url }} style={styles.commentAvatar} />
      ) : (
        <View style={styles.commentAvatarPlaceholder}>
          <Text style={styles.commentAvatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={styles.commentBody}>
        <View style={styles.commentHeaderRow}>
          <Text style={styles.commentNickname} numberOfLines={1}>
            {comment.author.nickname ?? t('common.anonymous')}
          </Text>
          <Text style={styles.commentDot}>&middot;</Text>
          <Text style={styles.commentTime}>{formatRelativeTime(comment.created_at)}</Text>
          {canDelete && (
            <TouchableOpacity
              onPress={onDelete}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.commentDeleteBtn}
            >
              <Ionicons name="trash-outline" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.commentContent}>{comment.content}</Text>
      </View>
    </View>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: SPACING.xxl },

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

    centerLoader: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '600',
      color: c.textSecondary,
    },

    // Post card layout
    postCard: {
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      gap: SPACING.sm,
    },
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
    avatarInitial: {
      fontSize: FONT_SIZES.md,
      fontWeight: '800',
      color: c.textSecondary,
    },
    authorInfo: {
      flex: 1,
      gap: 2,
    },

    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      flexWrap: 'wrap',
    },
    authorNickname: {
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

    postTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    postContent: {
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.text,
      lineHeight: 22,
    },
    postImage: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: 12,
      backgroundColor: c.surface,
    },

    // Crew promo
    crewPromoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      padding: SPACING.md,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    crewPromoLeft: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.primary + '14',
      justifyContent: 'center',
      alignItems: 'center',
    },
    crewPromoInfo: {
      flex: 1,
      gap: 2,
    },
    crewPromoTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    crewPromoSub: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    crewPromoBtn: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: 20,
      backgroundColor: c.primary,
    },
    crewPromoBtnText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Actions
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
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // Divider
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginHorizontal: SPACING.xl,
    },

    // Comments
    commentsSection: {
      paddingTop: SPACING.xs,
    },
    noComments: {
      paddingVertical: SPACING.xxl,
      alignItems: 'center',
    },
    noCommentsText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Comment row
    commentRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    commentAvatar: {
      width: COMMENT_AVATAR_SIZE,
      height: COMMENT_AVATAR_SIZE,
      borderRadius: COMMENT_AVATAR_SIZE / 2,
    },
    commentAvatarPlaceholder: {
      width: COMMENT_AVATAR_SIZE,
      height: COMMENT_AVATAR_SIZE,
      borderRadius: COMMENT_AVATAR_SIZE / 2,
      backgroundColor: c.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    commentAvatarInitial: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '800',
      color: c.textSecondary,
    },
    commentBody: {
      flex: 1,
      gap: 4,
    },
    commentHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    commentNickname: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
      flexShrink: 1,
    },
    commentDot: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
    },
    commentTime: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },
    commentDeleteBtn: {
      marginLeft: 'auto',
    },
    commentContent: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.text,
      lineHeight: 19,
    },

    // Load more
    loadMoreBtn: {
      alignItems: 'center',
      paddingVertical: SPACING.md,
    },
    loadMoreText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.primary,
    },

    // Crew tag
    crewTag: {
      backgroundColor: c.primary + '15',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    crewTagText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.primary,
    },

    // Input bar
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: SPACING.xxl,
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    commentInput: {
      flex: 1,
      minHeight: 36,
      maxHeight: 100,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: 18,
      backgroundColor: c.surface,
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.text,
    },
    sendButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },
  });
