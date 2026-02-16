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
} from '../types/api';
import { courseService } from '../services/courseService';
import { rankingService } from '../services/rankingService';

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

  // Detail
  selectedCourse: CourseDetail | null;
  selectedCourseStats: CourseDetailStats | null;
  selectedCourseRankings: RankingEntry[];
  selectedCourseMyBest: MyBestRecord | null;
  isLoadingDetail: boolean;

  // Actions
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

  selectedCourse: null,
  selectedCourseStats: null,
  selectedCourseRankings: [],
  selectedCourseMyBest: null,
  isLoadingDetail: false,

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
      set({ nearbyCourses: courses });
    } catch {
      // Silent fail for home screen recommendations
    }
  },

  fetchCourseDetail: async (courseId) => {
    set({ isLoadingDetail: true });
    try {
      const [detail, stats, rankings, myBest] = await Promise.all([
        courseService.getCourseDetail(courseId),
        courseService.getCourseStats(courseId),
        rankingService.getCourseRankings(courseId, 10),
        courseService.getMyBest(courseId).catch(() => null),
      ]);
      set({
        selectedCourse: detail,
        selectedCourseStats: stats,
        selectedCourseRankings: rankings,
        selectedCourseMyBest: myBest,
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
      set({ mapMarkers: markers });
    } catch {
      // Silent fail
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

  clearDetail: () => {
    set({
      selectedCourse: null,
      selectedCourseStats: null,
      selectedCourseRankings: [],
      selectedCourseMyBest: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
