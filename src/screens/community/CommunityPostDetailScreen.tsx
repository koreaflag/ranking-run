import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { HomeStackParamList } from '../../types/navigation';
import type {
  CommunityPostItem,
  CommunityCommentItem,
  CommunityPostType,
} from '../../types/api';
import { communityService } from '../../services/communityService';
import { crewService } from '../../services/crewService';
import { useAuthStore } from '../../stores/authStore';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';
import { useTheme } from '../../hooks/useTheme';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'CommunityPostDetail'>;
type Route = RouteProp<HomeStackParamList, 'CommunityPostDetail'>;

// ---- Helpers ----

function timeAgo(dateStr: string, t: TFunction): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t('format.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('format.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('format.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('format.daysAgo', { count: days });
}

function postTypeBadge(
  postType: CommunityPostType,
  t: TFunction,
): { label: string; color: string } {
  switch (postType) {
    case 'crew_promo':
      return { label: t('community.categoryCrewPromo'), color: '#FF7A33' };
    case 'question':
      return { label: t('community.categoryQuestion'), color: '#3B82F6' };
    case 'general':
    default:
      return { label: t('community.categoryGeneral'), color: '#9CA3AF' };
  }
}

const COMMENTS_PAGE_SIZE = 20;

// ---- Main Screen ----

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
  const [commentPage, setCommentPage] = useState(1);
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

  // Fetch post
  const fetchPost = useCallback(async () => {
    try {
      const data = await communityService.getPost(postId);
      setPost(data);
    } catch {
      // silent
    }
  }, [postId]);

  // Fetch comments
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
      await Promise.all([fetchPost(), fetchComments(1, true)]);
      setLoading(false);
    })();
  }, [fetchPost, fetchComments]);

  // Fetch crew role if post belongs to a crew
  useEffect(() => {
    if (!post?.crew_id || !currentUser) return;
    crewService
      .getCrew(post.crew_id)
      .then((crew) => setCrewRole(crew.my_role))
      .catch(() => {});
  }, [post?.crew_id, currentUser]);

  // Like toggle
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
      // silent
    }
  }, [post, postId]);

  // Add comment
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
      // silent
    } finally {
      setSubmitting(false);
    }
  }, [commentText, submitting, postId]);

  // Delete comment
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
    [postId],
  );

  // Delete post
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

  // Edit post
  const handleEditPost = useCallback(() => {
    if (!post) return;
    navigation.navigate('CommunityPostEdit', {
      postId: post.id,
      title: post.title,
      content: post.content,
      imageUrl: post.image_url ?? undefined,
      postType: post.post_type,
    });
  }, [post, navigation]);

  // More menu (ActionSheet)
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
      // Android: use Alert as fallback
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

  // Load more comments
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

  const badge = postTypeBadge(post.post_type, t);
  const authorInitial = (post.author.nickname ?? '?').charAt(0).toUpperCase();

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
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

          {/* Scrollable content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Post section */}
            <View style={styles.postSection}>
              {/* Author */}
              <View style={styles.authorRow}>
                {post.author.avatar_url ? (
                  <Image
                    source={{ uri: post.author.avatar_url }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>{authorInitial}</Text>
                  </View>
                )}
                <View style={styles.authorInfo}>
                  <View style={styles.authorNameRow}>
                    <Text style={styles.authorNickname}>
                      {post.author.nickname ?? t('common.anonymous')}
                    </Text>
                    {post.author.crew_name && (
                      <View style={styles.crewTag}>
                        <Text style={styles.crewTagText}>{post.author.crew_name}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.authorTime}>
                    {timeAgo(post.created_at, t)}
                  </Text>
                </View>
              </View>

              {/* Badge */}
              <View style={styles.badgeRow}>
                <View
                  style={[styles.typeBadge, { backgroundColor: badge.color + '18' }]}
                >
                  <Text style={[styles.typeBadgeText, { color: badge.color }]}>
                    {badge.label}
                  </Text>
                </View>
              </View>

              {/* Title */}
              <Text style={styles.postTitle}>{post.title}</Text>

              {/* Content */}
              <Text style={styles.postContent}>{post.content}</Text>

              {/* Post image */}
              {post.image_url && (
                <Image
                  source={{ uri: post.image_url }}
                  style={styles.postImage}
                  resizeMode="cover"
                />
              )}

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

              {/* Like button */}
              <TouchableOpacity
                style={styles.likeRow}
                onPress={handleToggleLike}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={post.is_liked ? 'heart' : 'heart-outline'}
                  size={20}
                  color={post.is_liked ? colors.error : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.likeText,
                    post.is_liked && { color: colors.error },
                  ]}
                >
                  {post.like_count}
                </Text>
                <Text
                  style={[
                    styles.likeLabel,
                    post.is_liked && { color: colors.error },
                  ]}
                >
                  {t('community.like')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Comments section */}
            <View style={styles.commentsSection}>
              <Text style={styles.commentsHeader}>
                {t('community.comments')} {totalComments}
              </Text>

              {comments.length === 0 ? (
                <View style={styles.noComments}>
                  <Text style={styles.noCommentsText}>
                    {t('community.noComments')}
                  </Text>
                </View>
              ) : (
                <>
                  {comments.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      isMine={currentUser?.id === comment.author.id}
                      onDelete={() => handleDeleteComment(comment.id)}
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

          {/* Comment input bar */}
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

// ---- Sub-components ----

function CommentRow({
  comment,
  isMine,
  onDelete,
}: {
  comment: CommunityCommentItem;
  isMine: boolean;
  onDelete: () => void;
}) {
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const initial = (comment.author.nickname ?? '?').charAt(0).toUpperCase();

  return (
    <View style={styles.commentRow}>
      {comment.author.avatar_url ? (
        <Image
          source={{ uri: comment.author.avatar_url }}
          style={styles.commentAvatar}
        />
      ) : (
        <View style={styles.commentAvatarPlaceholder}>
          <Text style={styles.commentAvatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={styles.commentBody}>
        <View style={styles.commentHeaderRow}>
          <Text style={styles.commentNickname}>
            {comment.author.nickname ?? t('common.anonymous')}
          </Text>
          {comment.author.crew_name && (
            <View style={styles.crewTag}>
              <Text style={styles.crewTagText}>{comment.author.crew_name}</Text>
            </View>
          )}
          <Text style={styles.commentTime}>{timeAgo(comment.created_at, t)}</Text>
          {isMine && (
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

    // Header
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

    // Post section
    postSection: {
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.md,
      gap: SPACING.md,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    avatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
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
      gap: 1,
    },
    authorNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    authorNickname: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    authorTime: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Badge
    badgeRow: {
      flexDirection: 'row',
    },
    typeBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    typeBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
    },

    // Post content
    postTitle: {
      fontSize: FONT_SIZES.xl,
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
      height: 240,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: c.surface,
    },

    // Crew promo
    crewPromoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
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
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: c.primary,
    },
    crewPromoBtnText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Like row
    likeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.sm,
    },
    likeText: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.textTertiary,
    },
    likeLabel: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // Divider
    divider: {
      height: 8,
      backgroundColor: c.divider,
      marginTop: SPACING.md,
    },

    // Comments section
    commentsSection: {
      paddingHorizontal: SPACING.xxl,
      paddingTop: SPACING.lg,
      gap: SPACING.md,
    },
    commentsHeader: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
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
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    commentAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    commentAvatarPlaceholder: {
      width: 32,
      height: 32,
      borderRadius: 16,
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
      gap: SPACING.sm,
    },
    commentNickname: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.text,
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
      lineHeight: 18,
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

    // Input bar
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: SPACING.xxl,
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.card,
    },
    commentInput: {
      flex: 1,
      minHeight: 36,
      maxHeight: 100,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
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
  });
