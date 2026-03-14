import { create } from 'zustand';
import type {
  CourseListItem,
  CourseListParams,
  NearbyCourse,
  CourseMarker,
  MyCourse,
  FavoriteCourseItem,
} from '../types/api';
import { courseService } from '../services/courseService';
import { useToastStore } from './toastStore';
import i18n from '../i18n';

type ViewMode = 'list' | 'map';

interface CourseListState {
  // List
  courses: CourseListItem[];
  nearbyCourses: NearbyCourse[];
  popularCourses: CourseListItem[];
  newCourses: CourseListItem[];
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

  // World focus
  pendingFocusCourseId: string | null;

  // Raid course selection
  pendingSelectForRaid: string | null;

  // Auto-start course run from outside WorldScreen (e.g. crew raid)
  pendingStartCourseId: string | null;

  // Actions
  setPendingFocusCourseId: (id: string | null) => void;
  setPendingSelectForRaid: (crewId: string | null) => void;
  setPendingStartCourseId: (id: string | null) => void;
  fetchCourses: (params?: CourseListParams) => Promise<void>;
  fetchMoreCourses: () => Promise<void>;
  fetchNearbyCourses: (lat: number, lng: number) => Promise<void>;
  fetchPopularCourses: () => Promise<void>;
  fetchNewCourses: () => Promise<void>;
  fetchMapMarkers: (
    swLat: number,
    swLng: number,
    neLat: number,
    neLng: number,
  ) => Promise<void>;
  setFilters: (filters: Partial<CourseListParams>) => void;
  setViewMode: (mode: ViewMode) => void;
  fetchFavoriteCourses: () => Promise<void>;
  toggleFavorite: (courseId: string) => Promise<void>;
  fetchMyCourses: () => Promise<void>;
  updateMyCourse: (courseId: string, data: { title?: string; description?: string; is_public?: boolean; course_type?: 'normal' | 'loop'; lap_count?: number }) => Promise<void>;
  deleteMyCourse: (courseId: string) => Promise<void>;
  /** Sync like_count into list arrays (called by courseDetailStore after toggleLike) */
  syncLikeCount: (courseId: string, likeCount: number) => void;
  clearError: () => void;
}

export const useCourseListStore = create<CourseListState>((set, get) => ({
  courses: [],
  nearbyCourses: [],
  popularCourses: [],
  newCourses: [],
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
  pendingSelectForRaid: null,
  pendingStartCourseId: null,

  setPendingFocusCourseId: (id) => {
    set({ pendingFocusCourseId: id });
  },

  setPendingSelectForRaid: (crewId) => {
    set({ pendingSelectForRaid: crewId });
  },

  setPendingStartCourseId: (id) => {
    set({ pendingStartCourseId: id });
  },

  myCourses: [],
  isLoadingMyCourses: false,

  favoriteCourses: [],
  favoriteIds: [] as string[],
  isLoadingFavorites: false,

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
        error instanceof Error ? error.message : i18n.t('courses.loadError');
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
      useToastStore.getState().showToast('error', '추가 코스를 불러올 수 없습니다');
    }
  },

  fetchNearbyCourses: async (lat, lng) => {
    try {
      const courses = await courseService.getNearbyCourses(lat, lng);
      set({ nearbyCourses: courses });
    } catch {
      // background geo fetch — silent ok
    }
  },

  fetchPopularCourses: async () => {
    try {
      const response = await courseService.getCourses({
        order_by: 'total_runs',
        order: 'desc',
        page: 0,
        per_page: 5,
      });
      set({ popularCourses: response.data });
    } catch {
      // silently fail
    }
  },

  fetchNewCourses: async () => {
    try {
      const response = await courseService.getCourses({
        order_by: 'created_at',
        order: 'desc',
        page: 0,
        per_page: 5,
      });
      set({ newCourses: response.data });
    } catch {
      // silently fail
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
      set({ mapMarkers: markers });
    } catch {
      // silently fail — empty list stays
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
      // Keep optimistic state — server will sync later
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

  syncLikeCount: (courseId: string, likeCount: number) => {
    set((state) => ({
      courses: state.courses.map((c) =>
        c.id === courseId ? { ...c, like_count: likeCount } : c,
      ),
      nearbyCourses: state.nearbyCourses.map((c) =>
        c.id === courseId ? { ...c, like_count: likeCount } : c,
      ),
    }));
  },

  clearError: () => {
    set({ error: null });
  },
}));
