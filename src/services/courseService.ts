import api from './api';
import type {
  CourseListResponse,
  CourseListParams,
  NearbyCourse,
  CourseMarker,
  CourseDetail,
  CourseDetailStats,
  CourseCreateRequest,
  CourseCreateResponse,
  MyCourse,
  MyBestRecord,
} from '../types/api';
import { PAGINATION } from '../utils/constants';

export const courseService = {
  /**
   * Fetch paginated course list with optional filters and sorting.
   */
  async getCourses(params?: CourseListParams): Promise<CourseListResponse> {
    const response = await api.get<CourseListResponse>('/courses', { params });
    return response.data;
  },

  /**
   * Fetch nearby courses for the home screen recommendations.
   */
  async getNearbyCourses(
    lat: number,
    lng: number,
    radius: number = 5000,
    limit: number = PAGINATION.HOME_NEARBY_LIMIT,
  ): Promise<NearbyCourse[]> {
    const response = await api.get<NearbyCourse[]>('/courses/nearby', {
      params: { lat, lng, radius, limit },
    });
    return response.data;
  },

  /**
   * Fetch course markers within map bounds for the map view.
   */
  async getCourseBounds(
    swLat: number,
    swLng: number,
    neLat: number,
    neLng: number,
    limit: number = 50,
  ): Promise<CourseMarker[]> {
    const response = await api.get<CourseMarker[]>('/courses/bounds', {
      params: { sw_lat: swLat, sw_lng: swLng, ne_lat: neLat, ne_lng: neLng, limit },
    });
    return response.data;
  },

  /**
   * Fetch full course detail including route geometry.
   */
  async getCourseDetail(courseId: string): Promise<CourseDetail> {
    const response = await api.get<CourseDetail>(`/courses/${courseId}`);
    return response.data;
  },

  /**
   * Fetch course statistics (total runs, avg pace, etc.)
   */
  async getCourseStats(courseId: string): Promise<CourseDetailStats> {
    const response = await api.get<CourseDetailStats>(
      `/courses/${courseId}/stats`,
    );
    return response.data;
  },

  /**
   * Fetch the current user's best record on a specific course.
   */
  async getMyBest(courseId: string): Promise<MyBestRecord | null> {
    const response = await api.get<MyBestRecord | null>(
      `/courses/${courseId}/my-best`,
    );
    return response.data;
  },

  /**
   * Create a new course from a completed run record.
   */
  async createCourse(
    request: CourseCreateRequest,
  ): Promise<CourseCreateResponse> {
    const response = await api.post<CourseCreateResponse>('/courses', request);
    return response.data;
  },

  /**
   * Fetch courses created by the current user.
   */
  async getMyCourses(): Promise<MyCourse[]> {
    const response = await api.get<MyCourse[]>('/users/me/courses');
    return response.data;
  },

  /**
   * Update a course (title, description, visibility, tags).
   */
  async updateCourse(
    courseId: string,
    data: {
      title?: string;
      description?: string;
      is_public?: boolean;
      tags?: string[];
    },
  ): Promise<void> {
    await api.patch(`/courses/${courseId}`, data);
  },

  /**
   * Delete a course. Only the creator can delete.
   */
  async deleteCourse(courseId: string): Promise<void> {
    await api.delete(`/courses/${courseId}`);
  },
};
