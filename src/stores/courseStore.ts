import { create } from 'zustand';
import type {
  CourseListItem,
  CourseDetail,
  CourseDetailStats,
  CourseListParams,
  NearbyCourse,
  CourseMarker,
  RankingEntry,
  MyBestRecord,
  CourseReview,
  MyCourse,
  FavoriteCourseItem,
} from '../types/api';
import { courseService } from '../services/courseService';
import { rankingService } from '../services/rankingService';
import { reviewService } from '../services/reviewService';

// DEV mode mock data for World screen
const DEV_MAP_MARKERS: CourseMarker[] = [
  { id: 'dev-c1', title: '한강 반포 코스', start_lat: 37.5085, start_lng: 126.9960, distance_meters: 5200, total_runs: 128, difficulty: 'easy', avg_rating: 4.3, elevation_gain_meters: 15 },
  { id: 'dev-c2', title: '올림픽공원 순환', start_lat: 37.5209, start_lng: 127.1215, distance_meters: 7800, total_runs: 89, difficulty: 'normal', avg_rating: 4.6, elevation_gain_meters: 42 },
  { id: 'dev-c3', title: '여의도 한강공원', start_lat: 37.5283, start_lng: 126.9328, distance_meters: 4100, total_runs: 215, difficulty: 'easy', avg_rating: 4.1, elevation_gain_meters: 8 },
  { id: 'dev-c4', title: '남산 순환 코스', start_lat: 37.5512, start_lng: 126.9882, distance_meters: 6300, total_runs: 67, difficulty: 'hard', avg_rating: 4.8, elevation_gain_meters: 185 },
  { id: 'dev-c5', title: '뚝섬 한강공원', start_lat: 37.5317, start_lng: 127.0660, distance_meters: 3500, total_runs: 156, difficulty: 'easy', avg_rating: 4.0, elevation_gain_meters: 5 },
  { id: 'dev-c6', title: '서울숲 코스', start_lat: 37.5443, start_lng: 127.0374, distance_meters: 4800, total_runs: 73, difficulty: 'easy', avg_rating: 4.4, elevation_gain_meters: 20 },
];

const DEV_NEARBY_COURSES: NearbyCourse[] = [
  { id: 'dev-c1', title: '한강 반포 코스', thumbnail_url: null, distance_meters: 5200, estimated_duration_seconds: 1800, total_runs: 128, avg_pace_seconds_per_km: 345, creator_nickname: '런크루장', distance_from_user_meters: 320, difficulty: 'easy', avg_rating: 4.3, active_runners: 3 },
  { id: 'dev-c3', title: '여의도 한강공원', thumbnail_url: null, distance_meters: 4100, estimated_duration_seconds: 1500, total_runs: 215, avg_pace_seconds_per_km: 366, creator_nickname: '달리는하마', distance_from_user_meters: 1200, difficulty: 'easy', avg_rating: 4.1, active_runners: 0 },
];

type ViewMode = 'list' | 'map';

interface CourseState {
  // List
  courses: CourseListItem[];
  nearbyCourses: NearbyCourse[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasNext: boolean;
  totalCount: number;
  currentPage: number;
  error: string | null;

  // Filters
  filters: CourseListParams;
  viewMode: ViewMode;

  // Map markers
  mapMarkers: CourseMarker[];

  // My Courses
  myCourses: MyCourse[];
  isLoadingMyCourses: boolean;

  // Favorites
  favoriteCourses: FavoriteCourseItem[];
  favoriteIds: string[];
  isLoadingFavorites: boolean;

  // Detail
  selectedCourse: CourseDetail | null;
  selectedCourseStats: CourseDetailStats | null;
  selectedCourseRankings: RankingEntry[];
  selectedCourseMyBest: MyBestRecord | null;
  isLoadingDetail: boolean;

  // Reviews
  selectedCourseReviews: CourseReview[];
  selectedCourseAvgRating: number | null;
  selectedCourseReviewCount: number;
  selectedCourseMyReview: CourseReview | null;

  // Likes
  selectedCourseLikeCount: number;
  selectedCourseIsLiked: boolean;

  // World focus
  pendingFocusCourseId: string | null;

  // Actions
  setPendingFocusCourseId: (id: string | null) => void;
  fetchCourses: (params?: CourseListParams) => Promise<void>;
  fetchMoreCourses: () => Promise<void>;
  fetchNearbyCourses: (lat: number, lng: number) => Promise<void>;
  fetchCourseDetail: (courseId: string) => Promise<void>;
  fetchMapMarkers: (
    swLat: number,
    swLng: number,
    neLat: number,
    neLng: number,
  ) => Promise<void>;
  setFilters: (filters: Partial<CourseListParams>) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleLike: (courseId: string) => Promise<void>;
  submitReview: (courseId: string, content?: string) => Promise<void>;
  deleteReview: (reviewId: string, courseId: string) => Promise<void>;
  replyToReview: (courseId: string, reviewId: string, content: string) => Promise<void>;
  fetchFavoriteCourses: () => Promise<void>;
  toggleFavorite: (courseId: string) => Promise<void>;
  fetchMyCourses: () => Promise<void>;
  updateMyCourse: (courseId: string, data: { title?: string; description?: string; is_public?: boolean }) => Promise<void>;
  deleteMyCourse: (courseId: string) => Promise<void>;
  clearDetail: () => void;
  clearError: () => void;
}

export const useCourseStore = create<CourseState>((set, get) => ({
  courses: [],
  nearbyCourses: [],
  isLoading: false,
  isLoadingMore: false,
  hasNext: false,
  totalCount: 0,
  currentPage: 0,
  error: null,

  filters: {
    order_by: 'total_runs',
    order: 'desc',
    page: 0,
    per_page: 20,
  },
  viewMode: 'list',

  mapMarkers: [],

  pendingFocusCourseId: null,

  setPendingFocusCourseId: (id) => {
    set({ pendingFocusCourseId: id });
  },

  myCourses: [],
  isLoadingMyCourses: false,

  favoriteCourses: [],
  favoriteIds: [] as string[],
  isLoadingFavorites: false,

  selectedCourse: null,
  selectedCourseStats: null,
  selectedCourseRankings: [],
  selectedCourseMyBest: null,
  isLoadingDetail: false,

  selectedCourseReviews: [],
  selectedCourseAvgRating: null,
  selectedCourseReviewCount: 0,
  selectedCourseMyReview: null,

  selectedCourseLikeCount: 0,
  selectedCourseIsLiked: false,

  fetchCourses: async (params) => {
    const filters = params ?? get().filters;
    set({ isLoading: true, error: null, filters: { ...filters, page: 0 } });

    try {
      const response = await courseService.getCourses({ ...filters, page: 0 });
      set({
        courses: response.data,
        totalCount: response.total_count,
        hasNext: response.has_next,
        currentPage: 0,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '코스 목록을 불러올 수 없습니다.';
      set({ isLoading: false, error: message });
    }
  },

  fetchMoreCourses: async () => {
    const { hasNext, isLoadingMore, currentPage, filters } = get();
    if (!hasNext || isLoadingMore) return;

    set({ isLoadingMore: true });
    const nextPage = currentPage + 1;

    try {
      const response = await courseService.getCourses({
        ...filters,
        page: nextPage,
      });
      set((state) => ({
        courses: [...state.courses, ...response.data],
        hasNext: response.has_next,
        currentPage: nextPage,
        isLoadingMore: false,
      }));
    } catch {
      set({ isLoadingMore: false });
    }
  },

  fetchNearbyCourses: async (lat, lng) => {
    try {
      const courses = await courseService.getNearbyCourses(lat, lng);
      if (courses.length > 0) {
        set({ nearbyCourses: courses });
      } else if (__DEV__) {
        set({ nearbyCourses: DEV_NEARBY_COURSES });
      }
    } catch {
      // In DEV mode, show mock nearby courses
      if (__DEV__) {
        set({ nearbyCourses: DEV_NEARBY_COURSES });
      }
    }
  },

  fetchCourseDetail: async (courseId) => {
    set({ isLoadingDetail: true });
    try {
      const [detail, stats, rankings, myBest, reviewsResponse, myReview, likeStatus] = await Promise.all([
        courseService.getCourseDetail(courseId),
        courseService.getCourseStats(courseId),
        rankingService.getCourseRankings(courseId, 10),
        courseService.getMyBest(courseId).catch(() => null),
        reviewService.getCourseReviews(courseId).catch(() => ({ data: [], total_count: 0, avg_rating: null })),
        reviewService.getMyReview(courseId).catch(() => null),
        courseService.getLikeStatus(courseId).catch(() => ({ is_liked: false, like_count: 0 })),
      ]);
      set({
        selectedCourse: detail,
        selectedCourseStats: stats,
        selectedCourseRankings: rankings,
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
        error instanceof Error ? error.message : '코스 정보를 불러올 수 없습니다.';
      set({ isLoadingDetail: false, error: message });
    }
  },

  fetchMapMarkers: async (swLat, swLng, neLat, neLng) => {
    try {
      const markers = await courseService.getCourseBounds(
        swLat,
        swLng,
        neLat,
        neLng,
      );
      if (markers.length > 0) {
        set({ mapMarkers: markers });
      } else if (__DEV__) {
        set({ mapMarkers: DEV_MAP_MARKERS });
      }
    } catch {
      // In DEV mode, show mock map markers
      if (__DEV__) {
        set({ mapMarkers: DEV_MAP_MARKERS });
      }
    }
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
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
      set((state) => ({
        selectedCourseIsLiked: result.is_liked,
        selectedCourseLikeCount: result.like_count,
        // Sync like_count into list arrays so CourseListScreen reflects changes
        courses: state.courses.map((c) =>
          c.id === courseId ? { ...c, like_count: result.like_count } : c,
        ),
        nearbyCourses: state.nearbyCourses.map((c) =>
          c.id === courseId ? { ...c, like_count: result.like_count } : c,
        ),
      }));
    } catch {
      // Revert on failure
      set({
        selectedCourseIsLiked: wasLiked,
        selectedCourseLikeCount: prevCount,
      });
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
        error instanceof Error ? error.message : '답글 등록에 실패했습니다.';
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
        error instanceof Error ? error.message : '리뷰를 삭제할 수 없습니다.';
      set({ error: message });
    }
  },

  fetchFavoriteCourses: async () => {
    set({ isLoadingFavorites: true });
    try {
      const favorites = await courseService.getFavoriteCourses();
      set({
        favoriteCourses: favorites,
        favoriteIds: favorites.map((f) => f.id),
      });
    } catch {
      // silently fail
    } finally {
      set({ isLoadingFavorites: false });
    }
  },

  toggleFavorite: async (courseId: string) => {
    const prev = get().favoriteIds;
    // Optimistic update
    const optimistic = prev.includes(courseId)
      ? prev.filter((id) => id !== courseId)
      : [...prev, courseId];
    set({ favoriteIds: optimistic });

    try {
      const result = await courseService.toggleFavorite(courseId);
      // Sync with server response
      const current = get().favoriteIds;
      if (result.is_favorited && !current.includes(courseId)) {
        set({ favoriteIds: [...current, courseId] });
      } else if (!result.is_favorited && current.includes(courseId)) {
        set({ favoriteIds: current.filter((id) => id !== courseId) });
      }
      // Refresh full list
      get().fetchFavoriteCourses();
    } catch {
      // Revert on failure
      set({ favoriteIds: prev });
    }
  },

  fetchMyCourses: async () => {
    set({ isLoadingMyCourses: true });
    try {
      const courses = await courseService.getMyCourses();
      set({ myCourses: courses, isLoadingMyCourses: false });
    } catch {
      set({ isLoadingMyCourses: false });
    }
  },

  updateMyCourse: async (courseId, data) => {
    await courseService.updateCourse(courseId, data);
    set((state) => ({
      myCourses: state.myCourses.map((c) =>
        c.id === courseId ? { ...c, ...data } : c,
      ),
    }));
  },

  deleteMyCourse: async (courseId: string) => {
    await courseService.deleteCourse(courseId);
    set((state) => ({
      myCourses: state.myCourses.filter((c) => c.id !== courseId),
      courses: state.courses.filter((c) => c.id !== courseId),
    }));
  },

  clearDetail: () => {
    set({
      selectedCourse: null,
      selectedCourseStats: null,
      selectedCourseRankings: [],
      selectedCourseMyBest: null,
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
