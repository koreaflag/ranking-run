import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import type {
  CourseListResponse,
  CourseListParams,
  CourseReview,
  NearbyCourse,
  CourseMarker,
  CourseDetail,
  CourseDetailStats,
  CourseCreateRequest,
  CourseCreateResponse,
  MyCourse,
  MyBestRecord,
  FavoriteToggleResponse,
  FavoriteCourseItem,
  LikeToggleResponse,
  LikeStatusResponse,
} from '../types/api';
import { PAGINATION } from '../utils/constants';

// ---- Offline course cache (AsyncStorage, 7-day TTL) ----
const CACHE_PREFIX = 'course_detail_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function getCachedCourseDetail(courseId: string): Promise<CourseDetail | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${courseId}`);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL_MS) {
      AsyncStorage.removeItem(`${CACHE_PREFIX}${courseId}`);
      return null;
    }
    return data;
  } catch { return null; }
}

async function setCachedCourseDetail(courseId: string, data: CourseDetail): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${courseId}`, JSON.stringify({
      data, timestamp: Date.now(),
    }));
  } catch {}
}

function invalidateCourseCache(courseId: string): void {
  AsyncStorage.removeItem(`${CACHE_PREFIX}${courseId}`).catch(() => {});
}

/**
 * Build a query string from a params object, omitting undefined values.
 */
function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
  return `?${qs}`;
}

export const courseService = {
  /**
   * Fetch paginated course list with optional filters and sorting.
   */
  async getCourses(params?: CourseListParams): Promise<CourseListResponse> {
    const query = params ? toQuery(params as Record<string, string | number | boolean | undefined>) : '';
    return api.get<CourseListResponse>(`/courses${query}`);
  },

  /**
   * Fetch nearby courses for the home screen recommendations.
   */
  async getNearbyCourses(
    lat: number,
    lng: number,
    radius: number = 15000,
    limit: number = PAGINATION.HOME_NEARBY_LIMIT,
  ): Promise<NearbyCourse[]> {
    const query = toQuery({ lat, lng, radius, limit });
    return api.get<NearbyCourse[]>(`/courses/nearby${query}`);
  },

  /**
   * Fetch course markers within map bounds for the map view.
   */
  async getCourseBounds(
    swLat: number,
    swLng: number,
    neLat: number,
    neLng: number,
    limit: number = 500,
  ): Promise<CourseMarker[]> {
    const query = toQuery({
      sw_lat: swLat,
      sw_lng: swLng,
      ne_lat: neLat,
      ne_lng: neLng,
      limit,
    });
    return api.get<CourseMarker[]>(`/courses/bounds${query}`);
  },

  /**
   * Fetch full course detail including route geometry.
   */
  async getCourseDetail(courseId: string): Promise<CourseDetail> {
    try {
      const detail = await api.get<CourseDetail>(`/courses/${courseId}`);
      setCachedCourseDetail(courseId, detail); // fire-and-forget cache update
      return detail;
    } catch (error) {
      // Network failure — fall back to cached data
      const cached = await getCachedCourseDetail(courseId);
      if (cached) return cached;
      throw error;
    }
  },

  /**
   * Fetch course statistics (total runs, avg pace, etc.)
   */
  async getCourseStats(courseId: string): Promise<CourseDetailStats> {
    return api.get<CourseDetailStats>(`/courses/${courseId}/stats`);
  },

  /**
   * Fetch the current user's best record on a specific course.
   */
  async getMyBest(courseId: string): Promise<MyBestRecord | null> {
    return api.get<MyBestRecord | null>(`/courses/${courseId}/my-best`);
  },

  /**
   * Create a new course from a completed run record.
   */
  async createCourse(
    request: CourseCreateRequest,
  ): Promise<CourseCreateResponse> {
    return api.post<CourseCreateResponse>('/courses', request);
  },

  /**
   * Fetch courses created by the current user.
   */
  async getMyCourses(): Promise<MyCourse[]> {
    return api.get<MyCourse[]>('/users/me/courses');
  },

  /**
   * Update a course (title, description, visibility, tags, course_type, lap_count).
   */
  async updateCourse(
    courseId: string,
    data: {
      title?: string;
      description?: string;
      is_public?: boolean;
      tags?: string[];
      course_type?: string;
      lap_count?: number;
    },
  ): Promise<void> {
    await api.patch(`/courses/${courseId}`, data);
    invalidateCourseCache(courseId);
  },

  /**
   * Delete a course. Only the creator can delete.
   */
  async deleteCourse(courseId: string): Promise<void> {
    await api.delete(`/courses/${courseId}`);
    invalidateCourseCache(courseId);
  },

  /**
   * Toggle favorite status for a course.
   */
  async toggleFavorite(courseId: string): Promise<FavoriteToggleResponse> {
    return api.post<FavoriteToggleResponse>(`/favorites/courses/${courseId}`);
  },

  /**
   * Fetch all favorited courses for the current user.
   */
  async getFavoriteCourses(): Promise<FavoriteCourseItem[]> {
    return api.get<FavoriteCourseItem[]>('/favorites/courses');
  },

  /**
   * Check whether a specific course is favorited.
   */
  async checkFavoriteStatus(courseId: string): Promise<FavoriteToggleResponse> {
    return api.get<FavoriteToggleResponse>(`/favorites/courses/${courseId}/status`);
  },

  /**
   * Toggle like status for a course (like / unlike).
   */
  async toggleLike(courseId: string): Promise<LikeToggleResponse> {
    return api.post<LikeToggleResponse>(`/courses/${courseId}/like`);
  },

  /**
   * Fetch the current user's like status for a course.
   */
  async getLikeStatus(courseId: string): Promise<LikeStatusResponse> {
    return api.get<LikeStatusResponse>(`/courses/${courseId}/like/status`);
  },

  /**
   * Reply to a review as the course creator.
   */
  async replyToReview(courseId: string, reviewId: string, content: string): Promise<CourseReview> {
    return api.post<CourseReview>(`/courses/${courseId}/reviews/${reviewId}/reply`, { content });
  },
};
