import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCourseStore } from '../../stores/courseStore';
import { formatRelativeTime } from '../../utils/format';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import {
  COLORS,
  FONT_SIZES,
  SPACING,
  BORDER_RADIUS,
} from '../../utils/constants';
import type { CourseReview } from '../../types/api';

interface ReviewSectionProps {
  courseId: string;
  creatorId?: string;
  currentUserId?: string;
}

export default function ReviewSection({ courseId, creatorId, currentUserId }: ReviewSectionProps) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    selectedCourseReviews,
    selectedCourseReviewCount,
    selectedCourseMyReview,
    submitReview,
    deleteReview,
    replyToReview,
  } = useCourseStore();

  const isCreator = Boolean(creatorId && currentUserId && creatorId === currentUserId);

  const handleReply = useCallback(
    async (cId: string, reviewId: string, content: string) => {
      await replyToReview(cId, reviewId, content);
    },
    [replyToReview],
  );

  return (
    <View style={styles.section}>
      {/* Section Header */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>리뷰</Text>
        <Text style={styles.reviewCount}>
          {selectedCourseReviewCount}개
        </Text>
      </View>

      {/* My Review: form or card */}
      {selectedCourseMyReview ? (
        <MyReviewCard
          review={selectedCourseMyReview}
          courseId={courseId}
          onUpdate={submitReview}
          onDelete={deleteReview}
        />
      ) : (
        <ReviewForm courseId={courseId} onSubmit={submitReview} />
      )}

      {/* Review List */}
      {selectedCourseReviews.length > 0 && (
        <View style={styles.listContainer}>
          {selectedCourseReviews
            .filter((r) => r.id !== selectedCourseMyReview?.id)
            .map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                courseId={courseId}
                isCreator={isCreator}
                onReply={handleReply}
              />
            ))}
        </View>
      )}
    </View>
  );
}

// ---- Reply Form (creator reply to a review) ----

function ReplyForm({
  courseId,
  reviewId,
  onSubmit,
}: {
  courseId: string;
  reviewId: string;
  onSubmit: (courseId: string, reviewId: string, content: string) => Promise<void>;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(courseId, reviewId, content.trim());
      setContent('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      Alert.alert('오류', `답글 등록에 실패했습니다.\n(${msg})`);
    } finally {
      setIsSubmitting(false);
    }
  }, [courseId, reviewId, content, onSubmit]);

  return (
    <View style={styles.replyFormContainer}>
      <TextInput
        style={styles.replyTextInput}
        placeholder="답글을 입력하세요"
        placeholderTextColor={colors.textTertiary}
        value={content}
        onChangeText={setContent}
        multiline
        maxLength={300}
        textAlignVertical="top"
      />
      <View style={styles.replyFormActions}>
        <Text style={styles.replyCharCount}>{content.length}/300</Text>
        <TouchableOpacity
          style={[
            styles.replySubmitButton,
            (isSubmitting || !content.trim()) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || !content.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.replySubmitButtonText}>등록</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---- Review Form (create new) ----

function ReviewForm({
  courseId,
  onSubmit,
  initialContent,
  onCancel,
}: {
  courseId: string;
  onSubmit: (courseId: string, content?: string) => Promise<void>;
  initialContent?: string;
  onCancel?: () => void;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [content, setContent] = useState(initialContent ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(courseId, content.trim() || undefined);
      if (!initialContent) {
        setContent('');
      }
      onCancel?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      Alert.alert('오류', `리뷰 저장에 실패했습니다.\n(${msg})`);
    } finally {
      setIsSubmitting(false);
    }
  }, [courseId, content, onSubmit, initialContent, onCancel]);

  return (
    <View style={styles.formCard}>
      <TextInput
        style={styles.textInput}
        placeholder="코스에 대한 의견을 남겨주세요"
        placeholderTextColor={colors.textTertiary}
        value={content}
        onChangeText={setContent}
        multiline
        maxLength={500}
        textAlignVertical="top"
      />
      <View style={styles.formActions}>
        {onCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>취소</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.submitButton, (isSubmitting || !content.trim()) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting || !content.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.submitButtonText}>
            {initialContent ? '수정' : '등록'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---- My Review Card (with edit/delete) ----

function MyReviewCard({
  review,
  courseId,
  onUpdate,
  onDelete,
}: {
  review: CourseReview;
  courseId: string;
  onUpdate: (courseId: string, content?: string) => Promise<void>;
  onDelete: (reviewId: string, courseId: string) => Promise<void>;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [isEditing, setIsEditing] = useState(false);

  const handleDelete = useCallback(() => {
    Alert.alert(
      '리뷰 삭제',
      '정말 이 리뷰를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => onDelete(review.id, courseId),
        },
      ],
    );
  }, [review.id, courseId, onDelete]);

  if (isEditing) {
    return (
      <ReviewForm
        courseId={courseId}
        onSubmit={onUpdate}
        initialContent={review.content ?? ''}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <View style={styles.myReviewCard}>
      <View style={styles.myReviewHeader}>
        <Text style={styles.myReviewBadge}>내 리뷰</Text>
        <View style={styles.myReviewActions}>
          <TouchableOpacity onPress={() => setIsEditing(true)} activeOpacity={0.7}>
            <Text style={styles.actionText}>수정</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} activeOpacity={0.7}>
            <Text style={[styles.actionText, styles.deleteText]}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
      {review.content && (
        <Text style={styles.reviewContent}>{review.content}</Text>
      )}
      <Text style={styles.reviewDate}>
        {formatRelativeTime(review.updated_at)}
      </Text>
      {/* Creator reply on my review */}
      {review.creator_reply && (
        <CreatorReplyBlock reply={review.creator_reply} />
      )}
    </View>
  );
}

// ---- Creator Reply Display Block ----

function CreatorReplyBlock({ reply }: { reply: string }) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.replyContainer}>
      <View style={styles.replyHeader}>
        <Ionicons name="return-down-forward" size={14} color={colors.primary} />
        <Text style={styles.replyBadge}>코스 제작자</Text>
      </View>
      <Text style={styles.replyContent}>{reply}</Text>
    </View>
  );
}

// ---- Individual Review Card ----

const ReviewCard = React.memo(function ReviewCard({
  review,
  courseId,
  isCreator,
  onReply,
}: {
  review: CourseReview;
  courseId: string;
  isCreator: boolean;
  onReply: (courseId: string, reviewId: string, content: string) => Promise<void>;
}) {
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [showReplyForm, setShowReplyForm] = useState(false);

  const handleReplySubmit = useCallback(
    async (cId: string, reviewId: string, content: string) => {
      await onReply(cId, reviewId, content);
      setShowReplyForm(false);
    },
    [onReply],
  );

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        {/* Avatar placeholder */}
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {(review.author.nickname ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.reviewHeaderInfo}>
          <Text style={styles.reviewNickname}>
            {review.author.nickname ?? '익명'}
          </Text>
        </View>
        <Text style={styles.reviewDate}>
          {formatRelativeTime(review.created_at)}
        </Text>
      </View>
      {review.content && (
        <Text style={styles.reviewContent}>{review.content}</Text>
      )}
      {/* Creator reply */}
      {review.creator_reply && (
        <CreatorReplyBlock reply={review.creator_reply} />
      )}
      {/* Reply button for creator when no reply exists */}
      {isCreator && !review.creator_reply && !showReplyForm && (
        <TouchableOpacity
          style={styles.replyButton}
          onPress={() => setShowReplyForm(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
          <Text style={styles.replyButtonText}>답글</Text>
        </TouchableOpacity>
      )}
      {/* Inline reply form */}
      {showReplyForm && (
        <ReplyForm
          courseId={courseId}
          reviewId={review.id}
          onSubmit={handleReplySubmit}
        />
      )}
    </View>
  );
});

// ---- Styles ----

const createStyles = (c: ThemeColors) => StyleSheet.create({
  section: {
    marginHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: c.text,
    letterSpacing: -0.3,
  },
  reviewCount: {
    fontSize: FONT_SIZES.sm,
    color: c.textTertiary,
    fontWeight: '600',
  },

  // Form card
  formCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  formLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
  },
  textInput: {
    fontSize: FONT_SIZES.md,
    color: c.text,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: SPACING.md,
    minHeight: 60,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  cancelButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: c.border,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.textSecondary,
  },
  submitButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },

  // My review card
  myReviewCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  myReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  myReviewBadge: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    color: COLORS.white,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
  },
  myReviewActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  actionText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.textSecondary,
  },
  deleteText: {
    color: COLORS.error,
  },

  // Review list
  listContainer: {
    gap: SPACING.sm,
  },

  // Individual review card
  reviewCard: {
    backgroundColor: c.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '800',
    color: c.textSecondary,
  },
  reviewHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  reviewNickname: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: c.text,
  },
  reviewContent: {
    fontSize: FONT_SIZES.md,
    color: c.textSecondary,
    lineHeight: 22,
  },
  reviewDate: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
  },

  // Creator reply
  replyContainer: {
    marginLeft: SPACING.xl,
    paddingLeft: SPACING.lg,
    borderLeftWidth: 2,
    borderLeftColor: c.primary,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  replyBadge: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: c.primary,
  },
  replyContent: {
    fontSize: FONT_SIZES.sm,
    color: c.textSecondary,
    lineHeight: 20,
  },

  // Reply button
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    paddingVertical: SPACING.xs,
    marginTop: SPACING.xs,
  },
  replyButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: c.primary,
  },

  // Reply form (inline)
  replyFormContainer: {
    marginLeft: SPACING.xl,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  replyTextInput: {
    fontSize: FONT_SIZES.sm,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    minHeight: 48,
  },
  replyFormActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  replyCharCount: {
    fontSize: FONT_SIZES.xs,
    color: c.textTertiary,
  },
  replySubmitButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  replySubmitButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
});
