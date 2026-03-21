import { create } from 'zustand';
import type {
  CourseDetail,
  CourseDetailStats,
  RankingEntry,
  MyBestRecord,
  CourseReview,
  CrewCourseRankingEntry,
} from '../types/api';
import { courseService } from '../services/courseService';
import { crewChallengeService } from '../services/crewChallengeService';
import { rankingService } from '../services/rankingService';
import { reviewService } from '../services/reviewService';
import { useCourseListStore } from './courseListStore';
import { useToastStore } from './toastStore';
import i18n from '../i18n';

interface CourseDetailState {
  // Detail
  selectedCourse: CourseDetail | null;
  selectedCourseStats: CourseDetailStats | null;
  selectedCourseRankings: RankingEntry[];
  selectedCourseCrewRankings: CrewCourseRankingEntry[];
  selectedCourseMyCrewRankings: CrewCourseRankingEntry[];
  selectedCourseMyBest: MyBestRecord | null;
  isLoadingDetail: boolean;
  error: string | null;

  // Ranking filter
  rankingCountry: string | null;

  // Reviews
  selectedCourseReviews: CourseReview[];
  selectedCourseAvgRating: number | null;
  selectedCourseReviewCount: number;
  selectedCourseMyReview: CourseReview | null;

  // Likes
  selectedCourseLikeCount: number;
  selectedCourseIsLiked: boolean;

  // Actions
  fetchCourseDetail: (courseId: string) => Promise<void>;
  fetchRankingsWithCountry: (courseId: string, country: string | null) => Promise<void>;
  toggleLike: (courseId: string) => Promise<void>;
  submitReview: (courseId: string, content?: string) => Promise<void>;
  deleteReview: (reviewId: string, courseId: string) => Promise<void>;
  replyToReview: (courseId: string, reviewId: string, content: string) => Promise<void>;
  clearDetail: () => void;
  clearError: () => void;
}

export const useCourseDetailStore = create<CourseDetailState>((set, get) => ({
  selectedCourse: null,
  selectedCourseStats: null,
  selectedCourseRankings: [],
  selectedCourseCrewRankings: [],
  selectedCourseMyCrewRankings: [],
  selectedCourseMyBest: null,
  isLoadingDetail: false,
  error: null,

  rankingCountry: null,

  selectedCourseReviews: [],
  selectedCourseAvgRating: null,
  selectedCourseReviewCount: 0,
  selectedCourseMyReview: null,

  selectedCourseLikeCount: 0,
  selectedCourseIsLiked: false,

  fetchCourseDetail: async (courseId) => {
    set({ isLoadingDetail: true });
    try {
      const [detail, stats, rankings, crewRankingsRes, myBest, reviewsResponse, myReview, likeStatus] = await Promise.all([
        courseService.getCourseDetail(courseId),
        courseService.getCourseStats(courseId).catch(() => null),
        rankingService.getCourseRankings(courseId, 10).catch(() => []),
        crewChallengeService.getCourseCrewRankings(courseId, 0, 10).catch(() => ({ data: [], my_crews: [], total_crews: 0 })),
        courseService.getMyBest(courseId).catch(() => null),
        reviewService.getCourseReviews(courseId).catch(() => ({ data: [], total_count: 0, avg_rating: null })),
        reviewService.getMyReview(courseId).catch(() => null),
        courseService.getLikeStatus(courseId).catch(() => ({ is_liked: false, like_count: 0 })),
      ]);
      set({
        selectedCourse: detail,
        selectedCourseStats: stats,
        selectedCourseRankings: rankings,
        selectedCourseCrewRankings: crewRankingsRes.data,
        selectedCourseMyCrewRankings: crewRankingsRes.my_crews,
        selectedCourseMyBest: myBest,
        selectedCourseReviews: reviewsResponse.data,
        selectedCourseAvgRating: reviewsResponse.avg_rating,
        selectedCourseReviewCount: reviewsResponse.total_count,
        selectedCourseMyReview: myReview,
        selectedCourseLikeCount: likeStatus.like_count,
        selectedCourseIsLiked: likeStatus.is_liked,
        isLoadingDetail: false,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : i18n.t('courses.detailError');
      set({ isLoadingDetail: false, error: message });
    }
  },

  fetchRankingsWithCountry: async (courseId: string, country: string | null) => {
    set({ rankingCountry: country });
    try {
      const rankings = await rankingService.getCourseRankings(
        courseId,
        10,
        country || undefined,
      );
      set({ selectedCourseRankings: rankings });
    } catch {
      // Keep existing rankings on error
    }
  },

  toggleLike: async (courseId: string) => {
    // Optimistic update
    const wasLiked = get().selectedCourseIsLiked;
    const prevCount = get().selectedCourseLikeCount;
    set({
      selectedCourseIsLiked: !wasLiked,
      selectedCourseLikeCount: wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
    });
    try {
      const result = await courseService.toggleLike(courseId);
      set({
        selectedCourseIsLiked: result.is_liked,
        selectedCourseLikeCount: result.like_count,
      });
      // Sync like_count into list store arrays so CourseListScreen reflects changes
      useCourseListStore.getState().syncLikeCount(courseId, result.like_count);
    } catch {
      // Keep optimistic state — server will sync later
    }
  },

  submitReview: async (courseId, content) => {
    const myReview = get().selectedCourseMyReview;
    if (myReview) {
      await reviewService.updateReview(myReview.id, { content });
    } else {
      await reviewService.createReview(courseId, { content });
    }
    // Re-fetch from server to ensure state consistency (non-blocking)
    try {
      const [updatedMyReview, reviewsResponse] = await Promise.all([
        reviewService.getMyReview(courseId),
        reviewService.getCourseReviews(courseId),
      ]);
      set({
        selectedCourseMyReview: updatedMyReview,
        selectedCourseReviews: reviewsResponse.data,
        selectedCourseAvgRating: reviewsResponse.avg_rating,
        selectedCourseReviewCount: reviewsResponse.total_count,
      });
    } catch {
      // Re-fetch failed but the mutation itself succeeded
    }
  },

  replyToReview: async (courseId, reviewId, content) => {
    try {
      const updatedReview = await courseService.replyToReview(courseId, reviewId, content);
      set((state) => ({
        selectedCourseReviews: state.selectedCourseReviews.map((r) =>
          r.id === reviewId ? updatedReview : r,
        ),
        selectedCourseMyReview:
          state.selectedCourseMyReview?.id === reviewId
            ? updatedReview
            : state.selectedCourseMyReview,
      }));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : i18n.t('courses.replyError');
      set({ error: message });
      throw error;
    }
  },

  deleteReview: async (reviewId, courseId) => {
    try {
      await reviewService.deleteReview(reviewId);
      set({ selectedCourseMyReview: null });
      // Refresh the reviews list
      const reviewsResponse = await reviewService.getCourseReviews(courseId);
      set({
        selectedCourseReviews: reviewsResponse.data,
        selectedCourseAvgRating: reviewsResponse.avg_rating,
        selectedCourseReviewCount: reviewsResponse.total_count,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : i18n.t('courses.deleteReviewError');
      set({ error: message });
    }
  },

  clearDetail: () => {
    set({
      selectedCourse: null,
      selectedCourseStats: null,
      selectedCourseRankings: [],
      selectedCourseCrewRankings: [],
      selectedCourseMyCrewRankings: [],
      selectedCourseMyBest: null,
      rankingCountry: null,
      selectedCourseReviews: [],
      selectedCourseAvgRating: null,
      selectedCourseReviewCount: 0,
      selectedCourseMyReview: null,
      selectedCourseLikeCount: 0,
      selectedCourseIsLiked: false,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
