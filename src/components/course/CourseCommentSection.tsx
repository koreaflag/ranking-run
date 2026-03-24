import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '../../lib/icons';
import { useNavigation } from '@react-navigation/native';
import { courseService } from '../../services/courseService';
import api from '../../services/api';
import { formatRelativeTime } from '../../utils/format';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { CourseCommentItem } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COMMENT_IMAGE_SIZE = (SCREEN_WIDTH - SPACING.md * 2 - SPACING.sm * 2 - 48) / 3;
const REPLY_IMAGE_SIZE = (SCREEN_WIDTH - SPACING.md * 2 - 48 - SPACING.sm * 2 - 48) / 3;

interface CourseCommentSectionProps {
  courseId: string;
  scrollViewRef?: React.RefObject<ScrollView | null>;
}

type InputMode =
  | { type: 'new' }
  | { type: 'reply'; parentId: string; parentAuthor: string }
  | { type: 'edit'; commentId: string; parentId?: string };

export default function CourseCommentSection({ courseId, scrollViewRef }: CourseCommentSectionProps) {
  const navigation = useNavigation<any>();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useAuthStore((s) => s.user);
  const inputRef = useRef<TextInput>(null);
  const inputContainerRef = useRef<View>(null);

  const [comments, setComments] = useState<CourseCommentItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Input state
  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>({ type: 'new' });
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Expanded replies
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const PER_PAGE = 20;

  // Fetch comments
  const fetchComments = useCallback(async (p: number, refresh = false) => {
    try {
      const res = await courseService.getCourseComments(courseId, p, PER_PAGE);
      if (refresh) {
        setComments(res.data);
      } else {
        setComments((prev) => [...prev, ...res.data]);
      }
      setTotalCount(res.total_count);
      setHasMore(res.data.length >= PER_PAGE);
      setPage(p);
    } catch {
      // silent
    }
  }, [courseId]);

  useEffect(() => {
    fetchComments(0, true).finally(() => setIsLoading(false));
  }, [fetchComments]);

  const handleRefresh = useCallback(async () => {
    await fetchComments(0, true);
  }, [fetchComments]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchComments(page + 1, false);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, fetchComments]);

  // Pick images
  const handlePickImage = useCallback(async () => {
    if (selectedImages.length >= 3) {
      Alert.alert('', '최대 3장까지 첨부할 수 있습니다');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 3 - selectedImages.length,
    });
    if (!result.canceled && result.assets.length > 0) {
      setSelectedImages((prev) => [
        ...prev,
        ...result.assets.map((a) => a.uri),
      ].slice(0, 3));
    }
  }, [selectedImages.length]);

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Upload image helper
  const uploadImage = async (uri: string): Promise<string> => {
    // If already a remote URL, skip upload
    if (uri.startsWith('http')) return uri;
    const formData = new FormData();
    const filename = uri.split('/').pop() ?? 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    formData.append('file', { uri, name: filename, type } as unknown as Blob);
    const res = await api.post<{ url: string }>('/uploads/image', formData);
    return res.url;
  };

  // Reset input
  const resetInput = useCallback(() => {
    setContent('');
    setSelectedImages([]);
    setInputMode({ type: 'new' });
    Keyboard.dismiss();
  }, []);

  // Done button handler
  const handleDone = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  // Start reply
  const handleReply = useCallback((parentId: string, authorName: string) => {
    setInputMode({ type: 'reply', parentId, parentAuthor: authorName });
    setContent('');
    setSelectedImages([]);
    inputRef.current?.focus();
  }, []);

  // Start edit
  const handleStartEdit = useCallback((comment: CourseCommentItem) => {
    setInputMode({ type: 'edit', commentId: comment.id, parentId: comment.parent_id ?? undefined });
    setContent(comment.content);
    setSelectedImages(comment.image_urls ?? []);
    inputRef.current?.focus();
  }, []);

  // Toggle replies visibility
  const toggleReplies = useCallback((commentId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }, []);

  // Submit (new / reply / edit)
  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && selectedImages.length === 0) return;
    if (!currentUser) {
      Alert.alert('', '로그인이 필요합니다');
      return;
    }

    setIsSending(true);
    try {
      let imageUrls: string[] | undefined;
      if (selectedImages.length > 0) {
        imageUrls = await Promise.all(selectedImages.map(uploadImage));
      }

      if (inputMode.type === 'edit') {
        // Update existing comment
        const updated = await courseService.updateCourseComment(
          courseId,
          inputMode.commentId,
          trimmed || ' ',
          imageUrls,
        );
        if (inputMode.parentId) {
          // Editing a reply — update within parent's replies
          setComments((prev) => prev.map((c) => {
            if (c.id === inputMode.parentId) {
              return {
                ...c,
                replies: c.replies.map((r) => r.id === updated.id ? updated : r),
              };
            }
            return c;
          }));
        } else {
          // Editing a top-level comment
          setComments((prev) => prev.map((c) => c.id === updated.id ? { ...updated, replies: c.replies, reply_count: c.reply_count } : c));
        }
      } else if (inputMode.type === 'reply') {
        // Create reply
        const newReply = await courseService.createCourseComment(
          courseId,
          trimmed || ' ',
          imageUrls,
          inputMode.parentId,
        );
        setComments((prev) => prev.map((c) => {
          if (c.id === inputMode.parentId) {
            return {
              ...c,
              replies: [...c.replies, newReply],
              reply_count: c.reply_count + 1,
            };
          }
          return c;
        }));
        // Auto-expand replies
        setExpandedComments((prev) => new Set(prev).add(inputMode.parentId));
      } else {
        // Create new top-level comment
        const newComment = await courseService.createCourseComment(
          courseId,
          trimmed || ' ',
          imageUrls,
        );
        setComments((prev) => [newComment, ...prev]);
        setTotalCount((prev) => prev + 1);
      }

      resetInput();
    } catch {
      useToastStore.getState().showToast('error', '댓글 작성에 실패했습니다');
    } finally {
      setIsSending(false);
    }
  }, [content, selectedImages, courseId, currentUser, inputMode, resetInput]);

  // Delete comment
  const handleDelete = useCallback((commentId: string, parentId?: string | null) => {
    Alert.alert('댓글 삭제', '이 댓글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await courseService.deleteCourseComment(courseId, commentId);
            if (parentId) {
              // Delete reply
              setComments((prev) => prev.map((c) => {
                if (c.id === parentId) {
                  return {
                    ...c,
                    replies: c.replies.filter((r) => r.id !== commentId),
                    reply_count: c.reply_count - 1,
                  };
                }
                return c;
              }));
            } else {
              // Delete top-level
              setComments((prev) => prev.filter((c) => c.id !== commentId));
              setTotalCount((prev) => prev - 1);
            }
          } catch {
            useToastStore.getState().showToast('error', '삭제에 실패했습니다');
          }
        },
      },
    ]);
  }, [courseId]);

  // Navigate to profile
  const handleUserPress = useCallback((userId: string) => {
    navigation.navigate('UserProfile', { userId });
  }, [navigation]);

  // Render a single reply
  const renderReply = useCallback((reply: CourseCommentItem, parentId: string) => (
    <View key={reply.id} style={styles.replyCard}>
      <View style={styles.commentHeader}>
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => handleUserPress(reply.author.id)}
          activeOpacity={0.6}
        >
          {reply.author.profile_image_url ? (
            <Image source={{ uri: reply.author.profile_image_url }} style={styles.replyAvatar} />
          ) : (
            <View style={[styles.replyAvatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={12} color={colors.textSecondary} />
            </View>
          )}
          <Text style={styles.authorName}>{reply.author.nickname || '?'}</Text>
        </TouchableOpacity>
        <View style={styles.commentMeta}>
          <Text style={styles.timeText}>{formatRelativeTime(reply.created_at)}</Text>
          {currentUser?.id === reply.author.id && (
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => handleStartEdit(reply)} activeOpacity={0.6}>
                <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(reply.id, parentId)} activeOpacity={0.6}>
                <Ionicons name="trash-outline" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.replyContent}>{reply.content}</Text>
      {reply.image_urls && reply.image_urls.length > 0 && (
        <View style={styles.replyImageRow}>
          {reply.image_urls.map((url, i) => (
            <Image key={i} source={{ uri: url }} style={styles.replyImage} />
          ))}
        </View>
      )}
    </View>
  ), [styles, colors, currentUser, handleDelete, handleUserPress, handleStartEdit]);

  // Render single top-level comment
  const renderComment = useCallback((item: CourseCommentItem) => {
    const isExpanded = expandedComments.has(item.id);
    return (
      <View key={item.id} style={styles.commentCard}>
        <View style={styles.commentHeader}>
          <TouchableOpacity
            style={styles.authorRow}
            onPress={() => handleUserPress(item.author.id)}
            activeOpacity={0.6}
          >
            {item.author.profile_image_url ? (
              <Image source={{ uri: item.author.profile_image_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={16} color={colors.textSecondary} />
              </View>
            )}
            <Text style={styles.authorName}>{item.author.nickname || '?'}</Text>
          </TouchableOpacity>
          <View style={styles.commentMeta}>
            <Text style={styles.timeText}>{formatRelativeTime(item.created_at)}</Text>
            {currentUser?.id === item.author.id && (
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => handleStartEdit(item)} activeOpacity={0.6}>
                  <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} activeOpacity={0.6}>
                  <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.commentContent}>{item.content}</Text>
        {item.image_urls && item.image_urls.length > 0 && (
          <View style={styles.imageRow}>
            {item.image_urls.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.commentImage} />
            ))}
          </View>
        )}

        {/* Reply button + reply count */}
        <View style={styles.commentFooter}>
          {currentUser && (
            <TouchableOpacity
              style={styles.replyBtn}
              onPress={() => handleReply(item.id, item.author.nickname || '?')}
              activeOpacity={0.6}
            >
              <Ionicons name="return-down-forward-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.replyBtnText}>답글</Text>
            </TouchableOpacity>
          )}
          {item.reply_count > 0 && (
            <TouchableOpacity
              onPress={() => toggleReplies(item.id)}
              activeOpacity={0.6}
            >
              <Text style={styles.replyCountText}>
                {isExpanded ? '답글 숨기기' : `답글 ${item.reply_count}개 보기`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Replies */}
        {isExpanded && item.replies.length > 0 && (
          <View style={styles.repliesContainer}>
            {item.replies.map((r) => renderReply(r, item.id))}
          </View>
        )}
      </View>
    );
  }, [styles, colors, currentUser, handleDelete, handleUserPress, handleStartEdit, handleReply, expandedComments, toggleReplies, renderReply]);

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>댓글</Text>
        <ActivityIndicator color={colors.textSecondary} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>댓글</Text>
        <Text style={styles.countText}>{totalCount}</Text>
      </View>

      {/* Comment list */}
      {comments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>아직 댓글이 없습니다</Text>
          <Text style={styles.emptySubText}>첫 번째 댓글을 남겨보세요!</Text>
        </View>
      ) : (
        comments.map(renderComment)
      )}

      {/* Load more button */}
      {hasMore && comments.length > 0 && comments.length < totalCount && (
        <TouchableOpacity
          style={styles.loadMoreBtn}
          onPress={handleLoadMore}
          activeOpacity={0.7}
        >
          {loadingMore ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Text style={styles.loadMoreText}>댓글 더보기</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Input area */}
      {currentUser && (
        <View ref={inputContainerRef} style={styles.inputContainer}>
          {/* Reply / Edit indicator */}
          {inputMode.type !== 'new' && (
            <View style={styles.inputModeBar}>
              <Text style={styles.inputModeText}>
                {inputMode.type === 'reply'
                  ? `${inputMode.parentAuthor}에게 답글 작성 중`
                  : '댓글 수정 중'}
              </Text>
              <TouchableOpacity onPress={resetInput} activeOpacity={0.6}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          {/* Selected images preview */}
          {selectedImages.length > 0 && (
            <View style={styles.selectedImageRow}>
              {selectedImages.map((uri, i) => (
                <View key={i} style={styles.selectedImageWrapper}>
                  <Image source={{ uri }} style={styles.selectedImage} />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => handleRemoveImage(i)}
                  >
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.inputRow}>
            <TouchableOpacity onPress={handlePickImage} activeOpacity={0.6}>
              <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder={
                inputMode.type === 'reply'
                  ? '답글을 입력하세요...'
                  : inputMode.type === 'edit'
                  ? '수정할 내용을 입력하세요...'
                  : '댓글을 입력하세요...'
              }
              placeholderTextColor={colors.textSecondary}
              value={content}
              onChangeText={setContent}
              onFocus={() => {
                setIsInputFocused(true);
                // Scroll parent ScrollView to show input area above keyboard
                setTimeout(() => {
                  scrollViewRef?.current?.scrollToEnd({ animated: true });
                }, 300);
              }}
              onBlur={() => setIsInputFocused(false)}
              multiline
              maxLength={1000}
            />
            {isInputFocused ? (
              <TouchableOpacity onPress={handleDone} activeOpacity={0.6}>
                <Text style={styles.doneBtn}>완료</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSending || (!content.trim() && selectedImages.length === 0)}
              activeOpacity={0.6}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons
                  name={inputMode.type === 'edit' ? 'checkmark' : 'send'}
                  size={22}
                  color={
                    content.trim() || selectedImages.length > 0
                      ? COLORS.primary
                      : colors.textSecondary
                  }
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: colors.text,
    },
    countText: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
      marginLeft: SPACING.xs,
    },

    // Empty state
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: SPACING.xl,
    },
    emptyText: {
      fontSize: FONT_SIZES.md,
      color: colors.textSecondary,
    },
    emptySubText: {
      fontSize: FONT_SIZES.sm,
      color: colors.textSecondary,
      marginTop: 4,
    },

    // Comment card
    commentCard: {
      paddingVertical: SPACING.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    commentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    avatarPlaceholder: {
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    authorName: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: colors.text,
      marginLeft: SPACING.xs,
    },
    commentMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    timeText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textSecondary,
    },
    commentContent: {
      fontSize: FONT_SIZES.md,
      color: colors.text,
      marginTop: SPACING.xs,
      marginLeft: 40,
      lineHeight: 20,
    },
    imageRow: {
      flexDirection: 'row',
      marginTop: SPACING.xs,
      marginLeft: 40,
      gap: SPACING.xs,
    },
    commentImage: {
      width: COMMENT_IMAGE_SIZE,
      height: COMMENT_IMAGE_SIZE,
      borderRadius: BORDER_RADIUS.sm,
    },

    // Comment footer (reply button)
    commentFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.xs,
      marginLeft: 40,
      gap: SPACING.md,
    },
    replyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    replyBtnText: {
      fontSize: FONT_SIZES.xs,
      color: colors.textSecondary,
    },
    replyCountText: {
      fontSize: FONT_SIZES.xs,
      color: COLORS.primary,
      fontWeight: '600',
    },

    // Replies container
    repliesContainer: {
      marginLeft: 40,
      marginTop: SPACING.xs,
      borderLeftWidth: 2,
      borderLeftColor: colors.border,
      paddingLeft: SPACING.sm,
    },
    replyCard: {
      paddingVertical: SPACING.xs,
    },
    replyAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
    },
    replyContent: {
      fontSize: FONT_SIZES.sm,
      color: colors.text,
      marginTop: 2,
      marginLeft: 32,
      lineHeight: 18,
    },
    replyImageRow: {
      flexDirection: 'row',
      marginTop: SPACING.xs,
      marginLeft: 32,
      gap: SPACING.xs,
    },
    replyImage: {
      width: REPLY_IMAGE_SIZE,
      height: REPLY_IMAGE_SIZE,
      borderRadius: BORDER_RADIUS.sm,
    },

    // Load more
    loadMoreBtn: {
      alignSelf: 'center',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.sm,
    },
    loadMoreText: {
      fontSize: FONT_SIZES.sm,
      color: COLORS.primary,
      fontWeight: '600',
    },

    // Input area
    inputContainer: {
      marginTop: SPACING.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: SPACING.sm,
    },
    inputModeBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: SPACING.xs,
    },
    inputModeText: {
      fontSize: FONT_SIZES.xs,
      color: COLORS.primary,
      fontWeight: '600',
    },
    selectedImageRow: {
      flexDirection: 'row',
      gap: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    selectedImageWrapper: {
      position: 'relative',
    },
    selectedImage: {
      width: 64,
      height: 64,
      borderRadius: BORDER_RADIUS.sm,
    },
    removeImageBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    textInput: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      color: colors.text,
      backgroundColor: colors.card,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      maxHeight: 100,
    },
    doneBtn: {
      fontSize: FONT_SIZES.sm,
      color: COLORS.primary,
      fontWeight: '600',
    },
  });
}
